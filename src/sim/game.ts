// Spiellogik: Zustand, Tick, Käufe, Ereignisse, Hinweise, Erfolge, Offline-Fortschritt.

import { ACHIEVEMENTS } from '../data/achievements';
import { RESEARCH, RESEARCH_BY_ID, type ResearchDef } from '../data/research';
import { SITE_LIST, SITES } from '../data/sites';
import { HINTS } from '../data/texts';
import { mulberry32 } from './rng';
import {
  DEFAULT_MODS,
  emptyFlow,
  slotCapacity,
  tickSite,
  type Modifiers,
  type SiteFlow,
  type SiteSignals,
} from './site';
import {
  PART_IDS,
  SITE_IDS,
  type GameState,
  type LogEntry,
  type MarketId,
  type PartId,
  type SiteDef,
  type SiteId,
  type SiteState,
  type SlotId,
  type WeatherEvent,
} from './types';
import { dayIndex, GAME_FACTOR, GAME_HOURS_PER_SECOND, neighbourPrice, winterness } from './weather';

export const SAVE_VERSION = 1;
/** Energie pro Kurbel-Klick: 100 W Muskelkraft bei 5 Klicks/s im Zeitraffer. */
export const CLICK_KWH = 0.002;

export function createSiteState(def: SiteDef): SiteState {
  return {
    unlocked: def.id === 'garten',
    permitLeft: 0,
    count: 0,
    parts: { rotor: 0, tower: 0, foundation: 0, generator: 0, control: 0 },
    chain: {
      cable: { tier: 0, level: 0, temp: 0, aging: 0 },
      trafo: { tier: 0, level: 0, temp: 0, aging: 0 },
      grid: { tier: 0, level: 0, temp: 0, aging: 0 },
    },
    genTemp: 0,
    protection: 0,
    tripped: false,
    damage: [],
    storage: { tier: -1, level: 0, soc: 0, chargeBelow: 5, dischargeAbove: 11 },
    market: def.markets[0],
    customers: 0,
    energyKWh: 0,
    revenue: 0,
    curtailedKWh: 0,
  };
}

export function createInitialState(seed = Math.floor(Math.random() * 2 ** 31)): GameState {
  const sites = Object.fromEntries(SITE_LIST.map((d) => [d.id, createSiteState(d)])) as Record<SiteId, SiteState>;
  return {
    version: SAVE_VERSION,
    seed,
    money: 0,
    totalEarned: 0,
    energyTotalKWh: 0,
    lifetimeEnergyKWh: 0,
    // Start an einem Montag im April, 9 Uhr
    gameHours: 7 * 24 * 14 + 9,
    realSeconds: 0,
    clicks: 0,
    clickEnergyKWh: 0,
    sites,
    research: [],
    lexicon: ['spielgeld'],
    achievements: [],
    seenHints: [],
    events: [],
    nextEventCheck: 0,
    knowhow: 0,
    prestigeCount: 0,
    lastSaved: Date.now(),
    log: [],
    settings: { sound: false, reducedMotion: false },
    peakKW: 0,
    stats: { overloadFreeHours: 0, maxWind: 0, stormsSurvived: 0, negativeSeen: 0, damages: 0, lastDay: -1 },
  };
}

export interface Toast {
  text: string;
  kind: 'success' | 'warn' | 'info' | 'damage';
}

export interface OfflineReport {
  seconds: number;
  kwh: number;
  euro: number;
}

const PART_NAMES: Record<PartId, string> = {
  rotor: 'Rotor',
  tower: 'Turm',
  foundation: 'Fundament',
  generator: 'Generator',
  control: 'Regelung',
};

export class Game {
  state: GameState;
  flows: Record<SiteId, SiteFlow>;
  toasts: Toast[] = [];
  incomePerSec = 0;
  outputKW = 0;
  private achCheckTimer = 0;
  private hourAcc = 0;
  private overloadThisHour = false;
  /** Schon im Log gemeldete Überlast pro Standort (gegen Spam). */
  private overloadWarned = new Set<string>();

  constructor(state: GameState) {
    this.state = state;
    this.flows = Object.fromEntries(SITE_IDS.map((id) => [id, emptyFlow()])) as Record<SiteId, SiteFlow>;
    if (!state.seenHints.includes('start')) this.hint('start');
  }

  // ---------- Abgeleitete Werte ----------

  get epoch(): number {
    let e = this.state.sites.garten.count > 0 ? 1 : 0;
    for (const d of SITE_LIST) if (this.state.sites[d.id].unlocked && d.epoch > e && d.id !== 'garten') e = d.epoch;
    return e;
  }

  has(id: string): boolean {
    return this.state.research.includes(id);
  }

  private effects() {
    const list: ResearchDef['effects'] = [];
    for (const id of this.state.research) {
      const r = RESEARCH_BY_ID[id];
      if (r) list.push(...r.effects);
    }
    return list;
  }

  mods(site?: SiteId): Modifiers {
    const m: Modifiers = { ...DEFAULT_MODS };
    m.revenueMult = 1 + 0.02 * this.state.knowhow;
    for (const e of this.effects()) {
      switch (e.type) {
        case 'cpMult':
          m.cpMult *= e.value;
          break;
        case 'outputMult':
          m.outputMult *= e.value;
          break;
        case 'cableLossMult':
          m.cableLossMult *= e.value;
          break;
        case 'trafoHeatMult':
          m.trafoHeatMult *= e.value;
          break;
        case 'wakeMult':
          m.wakeMult *= e.value;
          break;
        case 'maintMult':
          m.maintMult *= e.value;
          break;
        case 'revenueMult':
          if (!e.site || e.site === site) m.revenueMult *= e.value;
          break;
        case 'negCurtail':
          m.negCurtail = true;
          break;
        case 'deicing':
          m.deicing = true;
          break;
      }
    }
    return m;
  }

  private effectNumber(type: 'clickMult' | 'repairSpeed' | 'permitSpeed', start = 1): number {
    let v = start;
    for (const e of this.effects()) if (e.type === type) v *= (e as { value: number }).value;
    return v;
  }

  get clickMult(): number {
    return this.effectNumber('clickMult');
  }
  get clickPct(): number {
    let v = 0;
    for (const e of this.effects()) if (e.type === 'clickPct') v += e.value;
    return v;
  }
  get repairSpeed(): number {
    return this.effectNumber('repairSpeed');
  }
  get offlineHours(): number {
    let h = 12;
    for (const e of this.effects()) if (e.type === 'offlineHours') h = Math.max(h, e.value);
    return h;
  }
  hasEffect(type: string): boolean {
    return this.effects().some((e) => e.type === type);
  }
  marketUnlocked(m: MarketId): boolean {
    if (m === 'nachbarn' || m === 'verguetung') return true;
    if (m === 'boerse' && this.state.sites.geest.unlocked) return true; // ab der Geest Pflicht
    return this.effects().some((e) => e.type === 'unlockMarket' && e.market === m);
  }

  installedKW(site?: SiteId): number {
    const ids = site ? [site] : SITE_IDS;
    let kw = 0;
    for (const id of ids) {
      const s = this.state.sites[id];
      kw += s.count * SITES[id].parts.generator[s.parts.generator].ratedKW;
    }
    return kw;
  }

  clickValue(): { kwh: number; euro: number } {
    const kwh = CLICK_KWH * this.clickMult;
    const price = neighbourPrice(this.state.gameHours);
    const euro = ((kwh * price) / 100) * GAME_FACTOR * (1 + 0.02 * this.state.knowhow) + this.clickPct * this.incomePerSec;
    return { kwh, euro };
  }

  // ---------- Log & Hinweise ----------

  log(text: string, kind: LogEntry['kind'] = 'info') {
    this.state.log.unshift({ t: this.state.gameHours, text, kind });
    if (this.state.log.length > 80) this.state.log.length = 80;
  }

  toast(text: string, kind: Toast['kind'] = 'info') {
    this.toasts.push({ text, kind });
  }

  hint(key: string): boolean {
    if (this.state.seenHints.includes(key)) return false;
    this.state.seenHints.push(key);
    const text = HINTS[key];
    if (text) this.log(text, 'opa');
    return true;
  }

  unlockLexicon(id?: string) {
    if (!id || this.state.lexicon.includes(id)) return;
    this.state.lexicon.push(id);
    this.toast('Neue Lexikon-Karte', 'info');
  }

  // ---------- Tick ----------

  click(): number {
    const { kwh, euro } = this.clickValue();
    this.state.clicks++;
    this.state.clickEnergyKWh += kwh;
    this.state.energyTotalKWh += kwh;
    this.state.lifetimeEnergyKWh += kwh;
    this.earn(euro);
    // Klicken hilft bei laufenden Reparaturen
    for (const id of SITE_IDS) {
      for (const d of this.state.sites[id].damage) if (d.remaining > 0) d.remaining = Math.max(0.01, d.remaining - 0.4);
    }
    return euro;
  }

  private earn(euro: number) {
    this.state.money += euro;
    if (euro > 0) this.state.totalEarned += euro;
  }

  tick(dt: number) {
    const st = this.state;
    st.realSeconds += dt;
    st.gameHours += dt * GAME_HOURS_PER_SECOND;
    this.updateEvents();

    let income = 0;
    let output = 0;
    let anyOverload = false;
    for (const def of SITE_LIST) {
      const s = st.sites[def.id];
      const flow = this.flows[def.id];
      const sig = tickSite(def, s, { gh: st.gameHours, dt, seed: st.seed, events: st.events, mods: this.mods(def.id), offline: false }, flow);
      this.handleSignals(def, s, sig);
      if (s.count > 0 && flow.v > st.stats.maxWind) st.stats.maxWind = flow.v;
      if (sig.overload.size > 0) anyOverload = true;
      income += flow.incomePerSec;
      output += flow.soldKW;
      const prodKWh = flow.soldKW * dt * GAME_HOURS_PER_SECOND;
      st.energyTotalKWh += prodKWh;
      st.lifetimeEnergyKWh += prodKWh;
      // Automatische Reparatur (SCADA)
      if (this.hasEffect('autoRepair')) {
        for (let i = 0; i < s.damage.length; i++) if (s.damage[i].remaining < 0) this.orderRepair(def.id, i, true);
      }
    }
    this.earn(income * dt);
    this.incomePerSec = income;
    this.outputKW = output;
    if (output > st.peakKW) {
      const before = st.peakKW;
      st.peakKW = output;
      if (before < 1 && output >= 1) this.hint('firstKW');
      if (before < 1000 && output >= 1000) this.hint('firstMW');
      if (before < 1e6 && output >= 1e6) this.hint('firstGW');
    }

    // Überlastfreie Stunden zählen
    if (anyOverload) this.overloadThisHour = true;
    this.hourAcc += dt * GAME_HOURS_PER_SECOND;
    if (this.hourAcc >= 1) {
      this.hourAcc -= 1;
      const active = SITE_IDS.some((id) => st.sites[id].count > 0);
      st.stats.overloadFreeHours = active && !this.overloadThisHour ? st.stats.overloadFreeHours + 1 : 0;
      this.overloadThisHour = false;
    }

    this.achCheckTimer += dt;
    if (this.achCheckTimer >= 1) {
      this.achCheckTimer = 0;
      this.checkAchievements();
    }
  }

  private handleSignals(def: SiteDef, s: SiteState, sig: SiteSignals) {
    const where = def.name;
    for (const part of sig.overload) {
      const key = def.id + part;
      if (part === 'cable') this.hint('overloadCable');
      if (part === 'generator') this.hint('overloadGenerator');
      if (part === 'trafo') this.hint('overloadTrafo');
      if (!this.overloadWarned.has(key)) {
        this.overloadWarned.add(key);
        const name = part === 'generator' ? 'Generator' : part === 'cable' ? 'Leitung' : part === 'trafo' ? 'Trafo' : 'Netz';
        this.log(`${where}: ${name} überlastet!`, 'warn');
      }
    }
    if (sig.overload.size === 0) {
      for (const k of [...this.overloadWarned]) if (k.startsWith(def.id)) this.overloadWarned.delete(k);
    }
    for (const part of sig.damaged) {
      this.state.stats.damages++;
      const flow = this.flows[def.id];
      if (part === 'cable') {
        const cap = slotCapacity(def.chain.cable, s.chain.cable);
        const tier = def.chain.cable[s.chain.cable.tier];
        const volt = parseFloat(tier.voltage.replace(/[^\d,.]/g, '').replace(',', '.')) || 12;
        const factor = tier.voltage.includes('kV') ? 1000 : 1;
        const ampsCap = (cap * 1000) / (volt * factor);
        const ampsNow = (flow.links.find((l) => l.id === 'cable')?.inKW ?? cap) * 1000 / (volt * factor);
        this.log(
          `${where}: Leitung durchgeschmort! Ausgelegt für ${Math.round(ampsCap)} A, geflossen sind ${Math.round(Math.max(ampsNow, ampsCap * 1.1))} A. Die Wärme wächst mit dem Quadrat des Stroms.`,
          'damage',
        );
        this.hint('damageCable');
        this.unlockLexicon('leitung-verluste');
      } else if (part === 'generator') {
        this.log(`${where}: Generator überhitzt – Wicklung beschädigt. Der Rotor liefert mehr, als der Generator verkraftet.`, 'damage');
        this.hint('damageGenerator');
      } else if (part === 'rotor') {
        this.log(`${where}: Sturmschaden! Der ungeregelte Rotor ist bei ${flow.v.toFixed(0)} m/s zerbrochen.`, 'damage');
        this.hint('damageRotor');
        this.unlockLexicon('seitenfahne');
      }
      this.toast(`${where}: Schaden! Reparatur nötig.`, 'damage');
      if (!this.hasEffect('autoRepair')) this.hint('repair');
    }
    if (sig.tripped) {
      const prot = def.protection[s.protection];
      this.log(`${where}: ${prot.mode === 'fuse' ? 'Sicherung durchgebrannt' : 'Schutzschalter ausgelöst'} – Überlast abgefangen.`, 'warn');
      this.hint('trip');
      this.unlockLexicon(prot.mode === 'fuse' ? 'sicherung' : 'schutzschalter');
    }
    if (sig.trafoProtect) {
      this.log(`${where}: Trafo-Temperaturschutz hat abgeschaltet. Kapazität dauerhaft −5 %, bis du ihn überholst.`, 'warn');
      this.hint('trafoProtect');
      this.unlockLexicon('trafo');
    }
    if (sig.demandFull && s.count > 0) {
      this.hint('demandFull');
    }
    if (sig.gridCurtail) {
      if (this.hint('gridCurtail')) this.unlockLexicon('einspeiseregler');
    }
    if (sig.negativePrice && s.count > 0) {
      if (this.hint('negativePrice')) {
        this.unlockLexicon('negativpreis');
        this.unlockLexicon('merit-order');
      }
      const day = dayIndex(this.state.gameHours);
      if (this.state.stats.lastDay !== day) {
        this.state.stats.lastDay = day;
        this.state.stats.negativeSeen++;
      }
    }
    if (sig.redispatchKWh > 0) this.unlockLexicon('redispatch');
  }

  private checkAchievements() {
    const view = { state: this.state, installedKW: this.installedKW(), outputKW: this.outputKW, epoch: this.epoch };
    for (const a of ACHIEVEMENTS) {
      if (this.state.achievements.includes(a.id)) continue;
      if (a.check(view)) {
        this.state.achievements.push(a.id);
        this.log(`Erfolg: ${a.name} – ${a.desc}`, 'success');
        this.toast(`Erfolg: ${a.name}`, 'success');
      }
    }
  }

  // ---------- Ereignisse ----------

  private updateEvents() {
    const st = this.state;
    const gh = st.gameHours;
    // Abgelaufene Ereignisse auswerten
    for (const e of st.events) {
      if (e.end < gh && e.kind === 'sturm' && e.announced) {
        const running = SITE_IDS.some((id) => st.sites[id].count > 0);
        if (running) st.stats.stormsSurvived++;
        e.announced = false;
      }
    }
    st.events = st.events.filter((e) => e.end > gh - 1);

    // Einmal pro Spieltag würfeln
    const day = dayIndex(gh);
    if (day < st.nextEventCheck) {
      this.announceEvents();
      return;
    }
    st.nextEventCheck = day + 1;
    const rnd = mulberry32(st.seed ^ (day * 7919 + 13));
    const ep = this.epoch;
    if (ep < 1) return;
    const w = winterness(gh);
    const add = (kind: WeatherEvent['kind'], startIn: number, dur: number, strength: number) => {
      if (st.events.some((e) => e.kind === kind && e.end > gh)) return;
      st.events.push({ kind, start: gh + startIn, end: gh + startIn + dur, strength, announced: false });
    };
    if (rnd() < 0.05 * (1 + 0.6 * w)) add('sturm', 20 + rnd() * 10, 8 + rnd() * 14, 0.8 + rnd() * 0.6);
    if (ep >= 2 && rnd() < 0.04) add('flaute', 2 + rnd() * 20, 24 + rnd() * 36, 0.25);
    if (ep >= 3 && rnd() < 0.06) add('preisspitze', 2 + rnd() * 20, 3 + rnd() * 5, 2 + rnd());
    if (ep >= 3 && rnd() < 0.06) add('netzengpass', 2 + rnd() * 20, 6 + rnd() * 10, 0.4);
    if (ep >= 3 && w > 0.5 && rnd() < 0.15) add('vereisung', 2 + rnd() * 10, 10 + rnd() * 20, 1);
    if (ep >= 2 && w < -0.3 && rnd() < 0.12) add('gewitter', 2 + rnd() * 20, 2 + rnd() * 3, 1);
    this.announceEvents();
  }

  private announceEvents() {
    const gh = this.state.gameHours;
    for (const e of this.state.events) {
      if (e.announced) {
        if (e.kind === 'gewitter' && gh >= e.start && gh <= e.end) this.lightning(e);
        continue;
      }
      const warnAhead = e.kind === 'sturm' ? 24 : 0;
      if (gh < e.start - warnAhead) continue;
      e.announced = true;
      switch (e.kind) {
        case 'sturm':
          this.log('Wetterwarnung: Morgen Sturm! Ungeregelte Rotoren sind in Gefahr.', 'event');
          this.toast('Sturmwarnung für morgen!', 'warn');
          this.hint('storm');
          this.unlockLexicon('leistungskurve');
          break;
        case 'flaute':
          this.log('Wetter: Hochdruck, Flaute für ein bis zwei Tage.', 'event');
          this.hint('flaute');
          break;
        case 'preisspitze':
          this.log('Börse: Kraftwerksausfall – Preisspitze für einige Stunden!', 'event');
          this.hint('preisspitze');
          break;
        case 'netzengpass':
          this.log('Netzbetreiber: Engpass im Übertragungsnetz, Einspeisung wird begrenzt.', 'event');
          this.hint('netzengpass');
          break;
        case 'vereisung':
          this.log('Wetter: Frost und Nebel – Eisansatz an den Rotorblättern.', 'event');
          this.hint('vereisung');
          this.unlockLexicon('vereisung');
          break;
        case 'gewitter':
          this.log('Wetter: Gewitterfront zieht über das Land.', 'event');
          this.hint('gewitter');
          break;
      }
    }
  }

  private lightningHour = -1;
  private lightning(e: WeatherEvent) {
    const hour = Math.floor(this.state.gameHours);
    if (hour === this.lightningHour) return;
    this.lightningHour = hour;
    if (this.hasEffect('lightning')) return;
    const rnd = mulberry32(this.state.seed ^ (hour * 104729));
    for (const def of SITE_LIST) {
      const s = this.state.sites[def.id];
      if (def.epoch < 2 || s.count === 0 || s.damage.some((d) => d.part === 'rotor')) continue;
      if (rnd() < 0.12 * e.strength) {
        s.damage.push({ part: 'rotor', remaining: -1, cost: def.turbine.baseCost * 0.5 });
        this.log(`${def.name}: Blitzeinschlag in ein Rotorblatt! Ohne Blitzschutz ist das Blatt gerissen.`, 'damage');
        this.toast(`${def.name}: Blitzeinschlag!`, 'damage');
        this.unlockLexicon('blitzschutz');
      }
    }
  }

  // ---------- Kosten ----------

  turbineCost(id: SiteId, n = 1): number {
    const def = SITES[id];
    const c = this.state.sites[id].count;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += def.turbine.baseCost * def.turbine.growth ** (c + i);
    return sum;
  }

  maxBuyable(id: SiteId): number {
    const def = SITES[id];
    const s = this.state.sites[id];
    let n = 0;
    let cost = 0;
    while (s.count + n < def.turbine.maxCount) {
      const next = def.turbine.baseCost * def.turbine.growth ** (s.count + n);
      if (cost + next > this.state.money) break;
      cost += next;
      n++;
    }
    return n;
  }

  canBuild(id: SiteId): boolean {
    const s = this.state.sites[id];
    return s.unlocked && s.permitLeft <= 0;
  }

  buyTurbine(id: SiteId, n = 1): boolean {
    const def = SITES[id];
    const s = this.state.sites[id];
    if (!this.canBuild(id)) return false;
    n = Math.min(n, def.turbine.maxCount - s.count);
    if (n <= 0) return false;
    const cost = this.turbineCost(id, n);
    if (cost > this.state.money) return false;
    this.state.money -= cost;
    const before = s.count;
    s.count += n;
    if (id === 'garten' && before === 0) {
      this.hint('firstWindmill');
      this.unlockLexicon('holzwindrad');
      this.unlockLexicon('v3');
      this.unlockLexicon('kw-kwh');
    }
    if (id === 'garten' && before < 2 && s.count >= 2) this.hint('secondWindmill');
    if (s.count >= 10) this.unlockLexicon('kapazitaetsfaktor');
    if (id === 'deich' || id === 'geest' || id === 'nordsee') this.unlockLexicon('nachlauf');
    return true;
  }

  partNext(id: SiteId, part: PartId): { tier: number; cost: number; blocked?: string } | null {
    const def = SITES[id];
    const s = this.state.sites[id];
    const tiers = def.parts[part];
    const next = s.parts[part] + 1;
    if (next >= tiers.length) return null;
    const t = tiers[next];
    let blocked: string | undefined;
    if (part === 'tower') {
      const need = (t as { needsFoundation: number }).needsFoundation;
      if (s.parts.foundation < need) blocked = `Braucht Fundament: ${def.parts.foundation[need].name}`;
    }
    return { tier: next, cost: t.cost, blocked };
  }

  buyPart(id: SiteId, part: PartId): boolean {
    const n = this.partNext(id, part);
    if (!n || n.blocked || n.cost > this.state.money) return false;
    const def = SITES[id];
    const s = this.state.sites[id];
    this.state.money -= n.cost;
    s.parts[part] = n.tier;
    const tier = def.parts[part][n.tier];
    this.unlockLexicon(tier.lexicon);
    if (part === 'rotor') this.unlockLexicon('rotorflaeche');
    if (part === 'tower') this.unlockLexicon('windprofil');
    if (part === 'generator') {
      s.damage = s.damage.filter((d) => d.part !== 'generator');
      s.genTemp = 0;
    }
    if (part === 'rotor') s.damage = s.damage.filter((d) => d.part !== 'rotor');
    this.log(`${def.name}: ${PART_NAMES[part]} → ${tier.name}`, 'info');
    return true;
  }

  slotTierNext(id: SiteId, slot: SlotId): { tier: number; cost: number; blocked?: string } | null {
    const def = SITES[id];
    const tiers = def.chain[slot];
    if (!tiers) return null;
    const s = this.state.sites[id];
    const next = s.chain[slot].tier + 1;
    if (next >= tiers.length) return null;
    const t = tiers[next];
    let blocked: string | undefined;
    if (t.requires && s.chain[t.requires.slot].tier < t.requires.tier) {
      const req = def.chain[t.requires.slot]![t.requires.tier];
      blocked = `Braucht zuerst: ${req.name}`;
    }
    return { tier: next, cost: t.cost, blocked };
  }

  buySlotTier(id: SiteId, slot: SlotId): boolean {
    const n = this.slotTierNext(id, slot);
    if (!n || n.blocked || n.cost > this.state.money) return false;
    const def = SITES[id];
    const s = this.state.sites[id];
    this.state.money -= n.cost;
    s.chain[slot] = { tier: n.tier, level: 0, temp: 0, aging: 0 };
    s.damage = s.damage.filter((d) => d.part !== slot);
    const tier = def.chain[slot]![n.tier];
    this.unlockLexicon(tier.lexicon);
    if (slot === 'cable' && n.tier >= 1) this.unlockLexicon('querschnitt');
    this.log(`${def.name}: neu verbaut – ${tier.name}`, 'info');
    return true;
  }

  slotLevelCost(id: SiteId, slot: SlotId): number {
    const def = SITES[id];
    const s = this.state.sites[id];
    const t = def.chain[slot]![s.chain[slot].tier];
    return t.levelCost * 2.5 ** s.chain[slot].level;
  }

  buySlotLevel(id: SiteId, slot: SlotId): boolean {
    const def = SITES[id];
    if (!def.chain[slot]) return false;
    const cost = this.slotLevelCost(id, slot);
    if (cost > this.state.money) return false;
    this.state.money -= cost;
    this.state.sites[id].chain[slot].level++;
    if (slot === 'cable') this.unlockLexicon('querschnitt');
    return true;
  }

  overhaulCost(id: SiteId): number {
    const def = SITES[id];
    const s = this.state.sites[id];
    if (!def.chain.trafo) return 0;
    return def.chain.trafo[s.chain.trafo.tier].levelCost * 0.4;
  }

  overhaulTrafo(id: SiteId): boolean {
    const s = this.state.sites[id];
    const cost = this.overhaulCost(id);
    if (s.chain.trafo.aging <= 0 || cost > this.state.money) return false;
    this.state.money -= cost;
    s.chain.trafo.aging = 0;
    return true;
  }

  protectionNext(id: SiteId): { tier: number; cost: number } | null {
    const def = SITES[id];
    const s = this.state.sites[id];
    const next = s.protection + 1;
    if (next >= def.protection.length) return null;
    return { tier: next, cost: def.protection[next].cost };
  }

  buyProtection(id: SiteId): boolean {
    const n = this.protectionNext(id);
    if (!n || n.cost > this.state.money) return false;
    const def = SITES[id];
    this.state.money -= n.cost;
    this.state.sites[id].protection = n.tier;
    this.state.sites[id].tripped = false;
    this.unlockLexicon(def.protection[n.tier].lexicon);
    return true;
  }

  storageNext(id: SiteId): { tier: number; cost: number } | null {
    const def = SITES[id];
    const s = this.state.sites[id];
    const next = s.storage.tier + 1;
    if (next >= def.storage.length) return null;
    return { tier: next, cost: def.storage[next].cost };
  }

  buyStorage(id: SiteId): boolean {
    const n = this.storageNext(id);
    if (!n || n.cost > this.state.money) return false;
    const def = SITES[id];
    const s = this.state.sites[id];
    this.state.money -= n.cost;
    s.storage.tier = n.tier;
    s.storage.level = 0;
    this.unlockLexicon(def.storage[n.tier].lexicon);
    this.hint('storage');
    return true;
  }

  storageLevelCost(id: SiteId): number {
    const def = SITES[id];
    const s = this.state.sites[id];
    if (s.storage.tier < 0) return Infinity;
    return def.storage[s.storage.tier].levelCost * 2.5 ** s.storage.level;
  }

  buyStorageLevel(id: SiteId): boolean {
    const cost = this.storageLevelCost(id);
    if (cost > this.state.money) return false;
    this.state.money -= cost;
    this.state.sites[id].storage.level++;
    return true;
  }

  customerNext(id: SiteId) {
    const def = SITES[id];
    const s = this.state.sites[id];
    if (!def.demand || s.customers >= def.demand.customers.length) return null;
    return def.demand.customers[s.customers];
  }

  buyCustomer(id: SiteId): boolean {
    const c = this.customerNext(id);
    if (!c || c.cost > this.state.money) return false;
    this.state.money -= c.cost;
    this.state.sites[id].customers++;
    this.log(`Neuer Kunde: ${c.name}`, 'success');
    return true;
  }

  setMarket(id: SiteId, m: MarketId): boolean {
    const def = SITES[id];
    if (!def.markets.includes(m) || !this.marketUnlocked(m)) return false;
    this.state.sites[id].market = m;
    if (m === 'boerse') {
      this.hint('boerse');
      this.unlockLexicon('boerse');
      this.unlockLexicon('merit-order');
    }
    if (m === 'ppa') this.unlockLexicon('ppa');
    return true;
  }

  siteUnlockable(id: SiteId): { ok: boolean; reason?: string } {
    const def = SITES[id];
    const idx = SITE_LIST.indexOf(def);
    if (idx <= 0) return { ok: false };
    const prev = SITE_LIST[idx - 1];
    const ps = this.state.sites[prev.id];
    if (!ps.unlocked || ps.count < 1) return { ok: false, reason: `Erst ${prev.name} aufbauen` };
    return { ok: true };
  }

  unlockSite(id: SiteId): boolean {
    const def = SITES[id];
    const s = this.state.sites[id];
    if (s.unlocked || !this.siteUnlockable(id).ok || def.unlockCost > this.state.money) return false;
    this.state.money -= def.unlockCost;
    s.unlocked = true;
    s.permitLeft = def.permitSeconds / this.effectNumber('permitSpeed');
    s.market = def.markets[0];
    this.log(def.unlockText, 'success');
    this.toast(`${def.name} freigeschaltet! Genehmigung läuft …`, 'success');
    this.hint(id);
    if (id === 'hof') {
      this.unlockLexicon('einspeiseverguetung');
      this.unlockLexicon('wechselstrom');
    }
    if (id === 'deich') this.unlockLexicon('umspannwerk');
    if (id === 'nordsee') {
      this.unlockLexicon('hgue');
      this.unlockLexicon('offshore-wartung');
    }
    return true;
  }

  researchAvailable(r: ResearchDef): { ok: boolean; reason?: string } {
    if (this.has(r.id)) return { ok: false, reason: 'erforscht' };
    if (this.epoch < r.epoch) return { ok: false, reason: `ab Epoche ${r.epoch}` };
    if (r.requires && !r.requires.every((x) => this.has(x))) {
      const miss = r.requires.find((x) => !this.has(x))!;
      return { ok: false, reason: `braucht „${RESEARCH_BY_ID[miss].name}“` };
    }
    if (r.requireCount && this.state.sites[r.requireCount.site].count < r.requireCount.count) {
      return { ok: false, reason: `ab ${r.requireCount.count} Anlagen (${SITES[r.requireCount.site].name})` };
    }
    return { ok: true };
  }

  visibleResearch(): ResearchDef[] {
    return RESEARCH.filter((r) => {
      if (this.has(r.id)) return false;
      if (this.epoch < r.epoch) return false;
      if (r.requireCount && this.state.sites[r.requireCount.site].count < r.requireCount.count * 0.6) return false;
      return true;
    });
  }

  buyResearch(id: string): boolean {
    const r = RESEARCH_BY_ID[id];
    if (!r || !this.researchAvailable(r).ok || r.cost > this.state.money) return false;
    this.state.money -= r.cost;
    this.state.research.push(id);
    this.unlockLexicon(r.lexicon);
    this.log(`Erforscht: ${r.name}`, 'success');
    return true;
  }

  orderRepair(id: SiteId, idx: number, auto = false): boolean {
    const def = SITES[id];
    const d = this.state.sites[id].damage[idx];
    if (!d || d.remaining >= 0 || d.cost > this.state.money) return false;
    this.state.money -= d.cost;
    d.remaining = def.repairSeconds / this.repairSpeed;
    if (!auto) this.log(`${def.name}: Reparatur beauftragt.`, 'info');
    return true;
  }

  resetTrip(id: SiteId): boolean {
    const s = this.state.sites[id];
    if (!s.tripped) return false;
    s.tripped = false;
    return true;
  }

  // ---------- Prestige ----------

  knowhowTotal(): number {
    return Math.floor(Math.sqrt(this.state.lifetimeEnergyKWh / 1e6));
  }

  prestigeAvailable(): boolean {
    return this.installedKW('nordsee') >= 1e6;
  }

  prestige(): boolean {
    if (!this.prestigeAvailable()) return false;
    const old = this.state;
    const fresh = createInitialState(old.seed + 1);
    fresh.knowhow = this.knowhowTotal();
    fresh.prestigeCount = old.prestigeCount + 1;
    fresh.lifetimeEnergyKWh = old.lifetimeEnergyKWh;
    fresh.totalEarned = old.totalEarned;
    fresh.lexicon = old.lexicon;
    fresh.achievements = old.achievements;
    fresh.seenHints = old.seenHints.filter((h) => h !== 'start');
    fresh.settings = old.settings;
    fresh.clicks = old.clicks;
    fresh.peakKW = 0;
    fresh.gameHours = old.gameHours;
    this.state = fresh;
    this.unlockLexicon('repowering');
    this.log(HINTS.prestige, 'opa');
    this.log(`Repowering abgeschlossen: ${fresh.knowhow} Know-how-Punkte = +${fresh.knowhow * 2} % auf alle Einnahmen.`, 'success');
    return true;
  }

  // ---------- Offline ----------

  simulateOffline(seconds: number): OfflineReport {
    const capped = Math.min(seconds, this.offlineHours * 3600);
    const st = this.state;
    let euro = 0;
    let kwh = 0;
    const step = 10;
    let left = capped;
    while (left > 0) {
      const dt = Math.min(step, left);
      left -= dt;
      st.gameHours += dt * GAME_HOURS_PER_SECOND;
      st.realSeconds += dt;
      for (const def of SITE_LIST) {
        const s = st.sites[def.id];
        const flow = this.flows[def.id];
        tickSite(def, s, { gh: st.gameHours, dt, seed: st.seed, events: [], mods: this.mods(def.id), offline: true }, flow);
        euro += flow.incomePerSec * dt;
        kwh += flow.soldKW * dt * GAME_HOURS_PER_SECOND;
      }
    }
    // Wetter-Ereignisse, die während der Abwesenheit lagen, verfallen
    st.events = st.events.filter((e) => e.end > st.gameHours);
    st.nextEventCheck = dayIndex(st.gameHours) + 1;
    this.earn(euro);
    st.energyTotalKWh += kwh;
    st.lifetimeEnergyKWh += kwh;
    return { seconds: capped, kwh, euro };
  }
}

export { PART_IDS, PART_NAMES };
