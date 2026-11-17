// Energiekette eines Standorts: Wind → Rotor → Generator → Leitung → Trafo → Speicher → Netz → Markt.

import { heat, THERMAL, turbinePower, type TurbineMode } from './physics';
import type { ChainTier, MarketId, SiteDef, SiteState, SlotId, WeatherEvent } from './types';
import {
  boersePriceHourly,
  demandShape,
  GAME_FACTOR,
  GAME_HOURS_PER_SECOND,
  neighbourPrice,
  windAt,
} from './weather';

export interface Modifiers {
  cpMult: number;
  outputMult: number;
  cableLossMult: number;
  trafoHeatMult: number;
  wakeMult: number;
  maintMult: number;
  revenueMult: number;
  negCurtail: boolean;
  deicing: boolean;
}

export const DEFAULT_MODS: Modifiers = {
  cpMult: 1,
  outputMult: 1,
  cableLossMult: 1,
  trafoHeatMult: 1,
  wakeMult: 1,
  maintMult: 1,
  revenueMult: 1,
  negCurtail: false,
  deicing: false,
};

export interface LinkFlow {
  id: 'wind' | 'generator' | SlotId | 'storage' | 'demand';
  name: string;
  capKW: number;
  inKW: number;
  outKW: number;
  load: number;
  lossKW: number;
  temp: number;
  damaged: boolean;
}

export interface SiteFlow {
  active: boolean;
  v: number;
  mode: TurbineMode;
  perTurbineKW: number;
  genLoad: number;
  links: LinkFlow[];
  storageKW: number; // + laden, − entladen
  soldKW: number;
  curtailedKW: number;
  priceCt: number;
  incomePerSec: number;
  bottleneck: LinkFlow | null;
  status: 'leer' | 'genehmigung' | 'ok' | 'ausgelöst' | 'defekt' | 'abgeregelt';
  notes: string[];
}

export function emptyFlow(): SiteFlow {
  return {
    active: false,
    v: 0,
    mode: 'still',
    perTurbineKW: 0,
    genLoad: 0,
    links: [],
    storageKW: 0,
    soldKW: 0,
    curtailedKW: 0,
    priceCt: 0,
    incomePerSec: 0,
    bottleneck: null,
    status: 'leer',
    notes: [],
  };
}

export function slotCapacity(tiers: ChainTier[] | undefined, st: { tier: number; level: number; aging: number }): number {
  if (!tiers) return Infinity;
  const t = tiers[st.tier];
  return t.capacityKW * 2 ** st.level * (1 - st.aging);
}

export function storageSpec(def: SiteDef, s: SiteState) {
  if (s.storage.tier < 0) return null;
  const t = def.storage[s.storage.tier];
  const f = 2 ** s.storage.level;
  return { capKWh: t.capacityKWh * f, powerKW: t.powerKW * f, eff: t.eff, name: t.name };
}

export function demandKW(def: SiteDef, s: SiteState): number {
  if (!def.demand) return Infinity;
  let kw = def.demand.baseKW;
  for (let i = 0; i < s.customers; i++) kw += def.demand.customers[i].addKW;
  return kw;
}

export function marketPrice(def: SiteDef, market: MarketId, gh: number, seed: number, events: WeatherEvent[]): number {
  switch (market) {
    case 'nachbarn':
      return neighbourPrice(gh);
    case 'verguetung':
      return def.feedInCt ?? 9;
    case 'boerse':
      return boersePriceHourly(gh, seed, events);
    case 'ppa':
      return 8.5;
  }
}

const SITE_SEEDS: Record<string, number> = { garten: 101, hof: 202, deich: 303, geest: 404, nordsee: 505 };

export interface TickContext {
  gh: number;
  dt: number; // Echtsekunden
  seed: number;
  events: WeatherEvent[];
  mods: Modifiers;
  offline: boolean;
}

/** Signale, die das Spiel (Log, Hinweise, Erfolge) auswertet. */
export interface SiteSignals {
  overload: Set<'generator' | SlotId>;
  damaged: Array<'generator' | 'rotor' | SlotId>;
  tripped: boolean;
  trafoProtect: boolean;
  demandFull: boolean;
  gridCurtail: boolean;
  negativePrice: boolean;
  redispatchKWh: number;
}

export function tickSite(def: SiteDef, s: SiteState, ctx: TickContext, flow: SiteFlow): SiteSignals {
  const sig: SiteSignals = {
    overload: new Set(),
    damaged: [],
    tripped: false,
    trafoProtect: false,
    demandFull: false,
    gridCurtail: false,
    negativePrice: false,
    redispatchKWh: 0,
  };
  const { dt, gh, mods } = ctx;
  const dtH = dt * GAME_HOURS_PER_SECOND;
  flow.notes = [];

  // Reparaturen laufen weiter, auch wenn die Anlage steht.
  for (const d of s.damage) if (d.remaining > 0) d.remaining = Math.max(0, d.remaining - dt);
  s.damage = s.damage.filter((d) => d.remaining !== 0);

  if (!s.unlocked) {
    Object.assign(flow, emptyFlow());
    return sig;
  }
  if (s.permitLeft > 0) {
    s.permitLeft = Math.max(0, s.permitLeft - dt);
    Object.assign(flow, emptyFlow(), { status: 'genehmigung' });
    return sig;
  }

  const rotor = def.parts.rotor[s.parts.rotor];
  const tower = def.parts.tower[s.parts.tower];
  const gen = def.parts.generator[s.parts.generator];
  const control = def.parts.control[s.parts.control];
  const prot = def.protection[s.protection];
  const regulator = prot.mode === 'regulator' || ctx.offline;

  const v = windAt(gh, ctx.seed, SITE_SEEDS[def.id], def.wind, tower.height, ctx.events);
  flow.v = v;
  flow.active = s.count > 0;

  const has = (p: string) => s.damage.some((d) => d.part === p);
  const rotorBroken = has('rotor');
  const genBroken = has('generator');
  const chainBroken = has('cable') || has('trafo');
  const disconnected = s.tripped || chainBroken;

  // ---- Anlage ----
  const tr = turbinePower(rotor, gen, control, def.turbine.cutIn, v, mods.cpMult);
  let mech = rotorBroken ? 0 : tr.mechKW * mods.outputMult;
  flow.mode = rotorBroken || genBroken ? 'kaputt' : tr.mode;
  let curtailed = 0;

  if (tr.rotorBreak && !rotorBroken && s.count > 0 && !ctx.offline) {
    s.damage.push({ part: 'rotor', remaining: -1, cost: repairCost(def, 'rotor') });
    sig.damaged.push('rotor');
    mech = 0;
  }

  if (disconnected) mech = 0;
  let genLoad = mech / gen.ratedKW;
  if (regulator && genLoad > 1) {
    curtailed += (mech - gen.ratedKW) * gen.eff * s.count;
    mech = gen.ratedKW;
    genLoad = 1;
  }
  if (genBroken) {
    mech = 0;
    genLoad = 0;
  }
  s.genTemp = heat(s.genTemp, s.count > 0 ? genLoad : 0, dt, THERMAL.generator.a, THERMAL.generator.b);
  if (genLoad > 1 && s.count > 0) sig.overload.add('generator');

  flow.perTurbineKW = mech * gen.eff;
  flow.genLoad = genLoad;

  // Vereisung (Ereignis) an Land
  let iceFactor = 1;
  if (!mods.deicing && (def.id === 'deich' || def.id === 'geest')) {
    for (const e of ctx.events) if (e.kind === 'vereisung' && gh >= e.start && gh <= e.end) iceFactor = 0.7;
    if (iceFactor < 1) flow.notes.push('Vereisung: Blätter vereist, −30 %');
  }

  const wake = def.wakeLoss * mods.wakeMult;
  let p = mech * gen.eff * s.count * (1 - wake) * iceFactor;
  const genOut = p;

  // ---- Kette ----
  const capCable = slotCapacity(def.chain.cable, s.chain.cable);
  const capTrafo = slotCapacity(def.chain.trafo, s.chain.trafo);
  let capGrid = slotCapacity(def.chain.grid, s.chain.grid);
  let redispatch = false;
  for (const e of ctx.events) {
    if (e.kind === 'netzengpass' && gh >= e.start && gh <= e.end && def.epoch >= 3) {
      capGrid *= 1 - e.strength;
      redispatch = true;
    }
  }
  if (redispatch) flow.notes.push('Netzengpass: Netzbetreiber regelt ab (Redispatch, wird entschädigt)');

  if (regulator) {
    const lim = Math.min(capCable, capTrafo);
    if (p > lim) {
      curtailed += p - lim;
      p = lim;
    }
  }
  if (disconnected) p = 0;

  // Leitung
  const cableTier = def.chain.cable[s.chain.cable.tier];
  const cableLoad = p / capCable;
  const cableLoss = Math.min(p * 0.5, p * cableTier.lossAtRated * cableLoad * mods.cableLossMult);
  s.chain.cable.temp = heat(s.chain.cable.temp, cableLoad, dt, THERMAL.cable.a, THERMAL.cable.b);
  if (cableLoad > 1) sig.overload.add('cable');
  const afterCable = p - cableLoss;

  // Trafo
  let afterTrafo = afterCable;
  let trafoLoad = 0;
  let trafoLoss = 0;
  if (def.chain.trafo) {
    const t = def.chain.trafo[s.chain.trafo.tier];
    trafoLoad = afterCable / capTrafo;
    trafoLoss = afterCable * t.lossAtRated * Math.max(0.3, trafoLoad);
    afterTrafo = afterCable - trafoLoss;
    s.chain.trafo.temp = heat(s.chain.trafo.temp, trafoLoad, dt, THERMAL.trafo.a * mods.trafoHeatMult, THERMAL.trafo.b);
    if (trafoLoad > 1) sig.overload.add('trafo');
  }

  // ---- Markt & Speicher ----
  const market = s.market;
  const price = marketPrice(def, market, gh, ctx.seed, ctx.events);
  flow.priceCt = price;
  const demand = market === 'nachbarn' ? demandKW(def, s) * demandShape(gh) : Infinity;
  const sellCap = Math.min(capGrid, demand);
  const negBlock = market === 'boerse' && price < 0 && mods.negCurtail;
  if (market === 'boerse' && price < 0) sig.negativePrice = true;

  const st = storageSpec(def, s);
  let charge = 0;
  let discharge = 0;
  const avail = afterTrafo;
  let surplus = Math.max(0, avail - (negBlock ? 0 : sellCap));
  if (st && !ctx.offline) {
    const room = Math.max(0, (st.capKWh - s.storage.soc) / dtH);
    const ein = Math.sqrt(st.eff);
    // 1) Überschuss einlagern
    charge = Math.min(st.powerKW, surplus, room / ein);
    // 2) Bei niedrigem Preis zusätzlich einlagern (Arbitrage)
    if (market !== 'nachbarn' && price < s.storage.chargeBelow) {
      const extra = Math.min(st.powerKW - charge, Math.max(0, avail - surplus), room / ein - charge);
      if (extra > 0) charge += extra;
    }
    surplus -= Math.min(surplus, charge);
    // 3) Entladen: Nachbarschaft füllt Lücken, sonst bei hohem Preis
    const fromProd = Math.min(avail - charge, sellCap);
    const gap = Math.max(0, sellCap - fromProd);
    const wantDischarge = market === 'nachbarn' ? true : price >= s.storage.dischargeAbove && !negBlock;
    if (charge === 0 && wantDischarge && gap > 0) {
      discharge = Math.min(st.powerKW, gap, (s.storage.soc * ein) / dtH);
    }
    s.storage.soc = Math.min(st.capKWh, Math.max(0, s.storage.soc + charge * dtH * ein - (discharge * dtH) / ein));
  } else if (st && ctx.offline) {
    // offline: Speicher ruht
  }

  const fromProduction = negBlock ? 0 : Math.max(0, Math.min(avail - charge, sellCap));
  const sold = fromProduction + discharge;
  const lost = Math.max(0, avail - charge - fromProduction);
  curtailed += lost;

  if (market === 'nachbarn' && avail - charge > demand * 0.98 && avail > 0) sig.demandFull = true;
  if (market !== 'nachbarn' && avail - charge > capGrid * 0.999 && avail > 0) sig.gridCurtail = true;

  // Erlös
  let revenueCt = 0;
  if (market === 'verguetung' && def.selfUse) {
    const self = Math.min(sold, def.selfUse.kW);
    revenueCt = self * def.selfUse.priceCt + (sold - self) * price;
  } else {
    revenueCt = sold * price;
  }
  // Redispatch: abgeregelte Energie wird zu 95 % entschädigt
  if (redispatch) {
    const comp = Math.max(0, Math.min(lost, avail - capGrid));
    revenueCt += comp * Math.max(0, price) * 0.95;
    sig.redispatchKWh = comp * dtH;
  }
  const maint = 1 - def.maintenance * mods.maintMult;
  const euroPerHour = (revenueCt / 100) * GAME_FACTOR * mods.revenueMult * maint;
  const income = euroPerHour * GAME_HOURS_PER_SECOND; // € pro Echtsekunde
  s.revenue += income * dt;
  s.energyKWh += sold * dtH;
  s.curtailedKWh += curtailed * dtH;

  // ---- Schutz & Schäden ----
  const temps: Array<['generator' | SlotId, number]> = [
    ['generator', s.genTemp],
    ['cable', s.chain.cable.temp],
  ];
  if (def.chain.trafo) temps.push(['trafo', s.chain.trafo.temp]);
  const maxTemp = Math.max(...temps.map((t) => t[1]));

  if (ctx.offline) {
    s.genTemp = Math.min(s.genTemp, 0.6);
    s.chain.cable.temp = Math.min(s.chain.cable.temp, 0.6);
    if (def.chain.trafo) s.chain.trafo.temp = Math.min(s.chain.trafo.temp, 0.6);
  } else {
    // Trafo hat eigenen Temperaturschutz: Abschaltung + Alterung statt Totalschaden.
    if (def.chain.trafo && s.chain.trafo.temp >= 1 && !has('trafo')) {
      s.chain.trafo.aging = Math.min(0.3, s.chain.trafo.aging + 0.05);
      s.chain.trafo.temp = 0.95;
      s.tripped = true;
      sig.trafoProtect = true;
    }
    if (prot.mode === 'fuse' || prot.mode === 'breaker') {
      if (maxTemp >= 0.92 && !s.tripped) {
        s.tripped = true;
        sig.tripped = true;
      }
      if (prot.mode === 'breaker' && s.tripped && maxTemp < 0.35) s.tripped = false;
    } else if (prot.mode === 'none') {
      for (const [part, t] of temps) {
        if (t >= 1 && !has(part) && part !== 'trafo') {
          s.damage.push({ part, remaining: -1, cost: repairCost(def, part) });
          sig.damaged.push(part);
          if (part === 'generator') s.genTemp = 0.5;
          else s.chain[part].temp = 0.5;
        }
      }
    }
    // Ohne Schutz löst der Trafo selbst wieder ein, sobald er abgekühlt ist
    if (prot.mode === 'none' && s.tripped && maxTemp < 0.35) s.tripped = false;
  }

  // ---- Anzeige ----
  const links: LinkFlow[] = [];
  links.push({
    id: 'generator',
    name: 'Generator',
    capKW: gen.ratedKW * s.count,
    inKW: mech * s.count,
    outKW: genOut,
    load: genLoad,
    lossKW: mech * s.count * (1 - gen.eff),
    temp: s.genTemp,
    damaged: genBroken,
  });
  links.push({
    id: 'cable',
    name: 'Leitung',
    capKW: capCable,
    inKW: p,
    outKW: afterCable,
    load: cableLoad,
    lossKW: cableLoss,
    temp: s.chain.cable.temp,
    damaged: has('cable'),
  });
  if (def.chain.trafo) {
    links.push({
      id: 'trafo',
      name: 'Trafo',
      capKW: capTrafo,
      inKW: afterCable,
      outKW: afterTrafo,
      load: trafoLoad,
      lossKW: trafoLoss,
      temp: s.chain.trafo.temp,
      damaged: has('trafo'),
    });
  }
  if (st) {
    links.push({
      id: 'storage',
      name: 'Speicher',
      capKW: st.powerKW,
      inKW: charge,
      outKW: discharge,
      load: Math.abs(charge - discharge) / st.powerKW,
      lossKW: 0,
      temp: s.storage.soc / st.capKWh,
      damaged: false,
    });
  }
  if (def.chain.grid) {
    links.push({
      id: 'grid',
      name: 'Netzanschluss',
      capKW: capGrid,
      inKW: Math.max(0, avail - charge) + discharge,
      outKW: sold,
      load: (Math.max(0, avail - charge) + discharge) / capGrid,
      lossKW: 0,
      temp: 0,
      damaged: false,
    });
  }
  if (market === 'nachbarn') {
    links.push({
      id: 'demand',
      name: 'Nachfrage',
      capKW: demand,
      inKW: Math.max(0, avail - charge) + discharge,
      outKW: sold,
      load: (Math.max(0, avail - charge) + discharge) / Math.max(1e-9, demand),
      lossKW: 0,
      temp: 0,
      damaged: false,
    });
  }

  let bottleneck: LinkFlow | null = null;
  for (const l of links) {
    if (l.id === 'storage') continue;
    if (!bottleneck || l.load > bottleneck.load) bottleneck = l;
  }
  flow.links = links;
  flow.bottleneck = bottleneck && bottleneck.load > 0.9 ? bottleneck : null;
  flow.storageKW = charge - discharge;
  flow.soldKW = sold;
  flow.curtailedKW = curtailed;
  flow.incomePerSec = income;
  flow.status =
    s.count === 0
      ? 'leer'
      : s.damage.length > 0
        ? 'defekt'
        : s.tripped
          ? 'ausgelöst'
          : curtailed > 0.02 * Math.max(1e-9, genOut)
            ? 'abgeregelt'
            : 'ok';
  return sig;
}

/** Reparaturkosten: 25 % des Werts des betroffenen Bauteils (mind. Basispreis-Anteil). */
export function repairCost(def: SiteDef, part: 'generator' | 'rotor' | SlotId): number {
  const base = def.turbine.baseCost;
  switch (part) {
    case 'rotor':
      return Math.max(base * 0.5, 2);
    case 'generator':
      return Math.max(base * 0.4, 2);
    case 'cable':
      return Math.max(base * 0.2, 1);
    case 'trafo':
      return Math.max(base * 0.6, 5);
    case 'grid':
      return base;
  }
}

/** Auslegungs-Check: Lasten bei Starkwind (13 m/s an der Nabe) für eine hypothetische Konfiguration. */
export function designCheck(def: SiteDef, s: SiteState, mods: Modifiers, vTest = 13): Array<{ name: string; load: number }> {
  const rotor = def.parts.rotor[s.parts.rotor];
  const gen = def.parts.generator[s.parts.generator];
  const control = def.parts.control[s.parts.control];
  const n = Math.max(1, s.count);
  const tr = turbinePower(rotor, gen, control, def.turbine.cutIn, vTest, mods.cpMult);
  const mech = tr.mechKW * mods.outputMult;
  const out: Array<{ name: string; load: number }> = [{ name: 'Generator', load: mech / gen.ratedKW }];
  const p = Math.min(mech, gen.ratedKW * 1.5) * gen.eff * n * (1 - def.wakeLoss * mods.wakeMult);
  out.push({ name: 'Leitung', load: p / slotCapacity(def.chain.cable, s.chain.cable) });
  if (def.chain.trafo) out.push({ name: 'Trafo', load: p / slotCapacity(def.chain.trafo, s.chain.trafo) });
  if (def.chain.grid) out.push({ name: 'Netzanschluss', load: p / slotCapacity(def.chain.grid, s.chain.grid) });
  return out;
}
