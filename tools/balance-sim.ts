// Headless-Balancing: Ein Bot spielt Rückenwind nach Amortisationszeit und misst das Pacing.
// Aufruf: npm run balance -- --hours 12 --seed 42 --cps 3 --active 30 [--verbose]

import { RESEARCH } from '../src/data/research';
import { SITE_LIST, SITES } from '../src/data/sites';
import { duration, money, power } from '../src/sim/format';
import { createInitialState, Game } from '../src/sim/game';
import { demandKW, slotCapacity } from '../src/sim/site';
import { PART_IDS, SLOT_IDS, type PartId, type SiteId, type SiteState, type SlotId } from '../src/sim/types';
import { expectedYield } from '../src/sim/yield';

const args = process.argv.slice(2);
const arg = (name: string, def: number) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : def;
};
const HOURS = arg('hours', 12);
const SEED = arg('seed', 42);
const CPS = arg('cps', 3);
const ACTIVE_MIN = arg('active', 30);
const VERBOSE = args.includes('--verbose');
const DT = 0.2;

const game = new Game(createInitialState(SEED));
const st = () => game.state;
const rows: Array<{ label: string; t: number; income: number; installed: number }> = [];
const mark = (label: string, income = game.incomePerSec) => {
  rows.push({ label, t: st().realSeconds, income, installed: game.installedKW() });
  if (VERBOSE) console.log(`${duration(st().realSeconds).padEnd(12)} ${label}`);
};

// ---------- Modell für Kaufentscheidungen ----------

const PRICE_CT: Record<SiteId, number> = { garten: 43, hof: 12, deich: 9, geest: 8, nordsee: 8 };
type Chain = SiteState['chain'];

function valuePerKW(id: SiteId): number {
  const def = SITES[id];
  const m = game.mods(id);
  return 0.1 * PRICE_CT[id] * m.revenueMult * (1 - def.maintenance * m.maintMult);
}

function capKW(id: SiteId, chain: Chain, customers: number): number {
  const def = SITES[id];
  let cap = Infinity;
  for (const slot of SLOT_IDS) if (def.chain[slot]) cap = Math.min(cap, slotCapacity(def.chain[slot], chain[slot]));
  cap *= 0.6; // Mittelwert vs. Spitze
  if (def.demand) cap = Math.min(cap, 0.85 * demandKW(def, { ...st().sites[id], customers }));
  return cap;
}

function siteIncome(id: SiteId, o: { parts?: Record<PartId, number>; count?: number; chain?: Chain; customers?: number } = {}): number {
  const def = SITES[id];
  const s = st().sites[id];
  const m = game.mods(id);
  const y = expectedYield(def, o.parts ?? s.parts, m.cpMult, m.outputMult, def.protection[s.protection].mode === 'regulator');
  const p = y.avgKW * (o.count ?? s.count) * (1 - def.wakeLoss * m.wakeMult);
  return Math.min(p, capKW(id, o.chain ?? s.chain, o.customers ?? s.customers)) * valuePerKW(id);
}

interface Option {
  label: string;
  cost: number;
  gain: number; // €/s
  buy: () => boolean;
}

const totalIncome = () => SITE_LIST.reduce((a, d) => a + (st().sites[d.id].count > 0 ? siteIncome(d.id) : 0), 0);
const fresh = (tier: number) => ({ tier, level: 0, temp: 0, aging: 0 });

function options(): Option[] {
  const o: Option[] = [];
  const total = Math.max(totalIncome(), 0.01);
  for (const def of SITE_LIST) {
    const id = def.id;
    const s = st().sites[id];
    if (!s.unlocked || s.permitLeft > 0) continue;
    const base = siteIncome(id);
    if (s.count < def.turbine.maxCount) {
      o.push({ label: `${id} Anlage`, cost: game.turbineCost(id), gain: siteIncome(id, { count: s.count + 1 }) - base, buy: () => game.buyTurbine(id) });
    }
    if (s.count === 0) continue;
    for (const p of PART_IDS) {
      if (p === 'foundation') continue;
      const n = game.partNext(id, p);
      if (!n) continue;
      const gain = siteIncome(id, { parts: { ...s.parts, [p]: n.tier } }) - base;
      if (n.blocked) {
        const f = game.partNext(id, 'foundation');
        if (f && !f.blocked) o.push({ label: `${id} foundation`, cost: f.cost + n.cost, gain, buy: () => game.buyPart(id, 'foundation') });
        continue;
      }
      o.push({ label: `${id} ${p}`, cost: n.cost, gain, buy: () => game.buyPart(id, p) });
    }
    for (const slot of SLOT_IDS) {
      if (!def.chain[slot]) continue;
      const lvl = { ...s.chain, [slot]: { ...s.chain[slot], level: s.chain[slot].level + 1 } };
      o.push({ label: `${id} ${slot}+`, cost: game.slotLevelCost(id, slot), gain: siteIncome(id, { chain: lvl }) - base, buy: () => game.buySlotLevel(id, slot) });
      const tn = game.slotTierNext(id, slot);
      if (tn && !tn.blocked) {
        o.push({ label: `${id} ${slot} Stufe ${tn.tier}`, cost: tn.cost, gain: siteIncome(id, { chain: { ...s.chain, [slot]: fresh(tn.tier) } }) - base, buy: () => game.buySlotTier(id, slot) });
      } else if (tn && tn.blocked) {
        const req = def.chain[slot]![tn.tier].requires!;
        const rn = game.slotTierNext(id, req.slot);
        if (rn && !rn.blocked) {
          const both = { ...s.chain, [req.slot]: fresh(rn.tier), [slot]: fresh(tn.tier) };
          o.push({ label: `${id} ${req.slot} Stufe ${rn.tier} (für ${slot})`, cost: rn.cost + tn.cost, gain: siteIncome(id, { chain: both }) - base, buy: () => game.buySlotTier(id, req.slot as SlotId) });
        }
      }
    }
    const c = game.customerNext(id);
    if (c) o.push({ label: `${id} Kunde`, cost: c.cost, gain: siteIncome(id, { customers: s.customers + 1 }) - base, buy: () => game.buyCustomer(id) });
    const pn = game.protectionNext(id);
    if (pn) o.push({ label: `${id} Schutz`, cost: pn.cost, gain: base * (def.protection[s.protection].mode === 'none' ? 0.3 : 0.08), buy: () => game.buyProtection(id) });
  }
  for (const r of RESEARCH) {
    if (!game.researchAvailable(r).ok) continue;
    let gain = total * 0.01;
    const active = st().realSeconds < ACTIVE_MIN * 60;
    for (const e of r.effects) {
      if (e.type === 'revenueMult') gain = (e.value - 1) * (e.site ? siteIncome(e.site) : total);
      if (e.type === 'cpMult' || e.type === 'outputMult') gain = (e.value - 1) * total * 1.5;
      if (e.type === 'clickMult') gain = active ? CPS * game.clickValue().euro * (e.value - 1) : 0;
      if (e.type === 'clickPct') gain = active ? CPS * e.value * total : 0;
      if (e.type === 'maintMult') gain = total * 0.03 * (1 - e.value);
      if (e.type === 'wakeMult') gain = total * 0.08 * (1 - e.value);
      if (e.type === 'autoRepair' || e.type === 'negCurtail') gain = total * 0.03;
    }
    o.push({ label: `F ${r.id}`, cost: r.cost, gain, buy: () => game.buyResearch(r.id) });
  }
  return o.filter((x) => x.gain > 1e-9 && Number.isFinite(x.cost));
}

function nextLockedSite(): SiteId | null {
  for (const d of SITE_LIST) if (!st().sites[d.id].unlocked) return d.id;
  return null;
}

// ---------- Simulation ----------

let decide = 0;
let clickAcc = 0;
let lastEpoch = -1;
let nextReport = 600;
let lastEarned = 0;
let lastT = 0;
const endT = HOURS * 3600;
const marketSet = new Set<string>();

while (st().realSeconds < endT) {
  if (st().realSeconds < ACTIVE_MIN * 60) {
    clickAcc += CPS * DT;
    while (clickAcc >= 1) {
      game.click();
      clickAcc--;
    }
  }
  game.tick(DT);

  if (st().realSeconds >= nextReport) {
    nextReport += st().realSeconds < 3600 ? 600 : 1800;
    const avg = (st().totalEarned - lastEarned) / (st().realSeconds - lastT);
    lastEarned = st().totalEarned;
    lastT = st().realSeconds;
    mark('· Ø Einnahmen im Intervall', avg);
  }

  decide += DT;
  if (decide < 1) continue;
  decide = 0;

  for (const def of SITE_LIST) {
    const s = st().sites[def.id];
    if (s.tripped) game.resetTrip(def.id);
    for (let i = 0; i < s.damage.length; i++) game.orderRepair(def.id, i);
    if (s.unlocked && s.permitLeft <= 0 && !marketSet.has(def.id)) {
      marketSet.add(def.id);
      if (def.id === 'geest' || def.id === 'nordsee') game.setMarket(def.id, 'boerse');
    }
  }
  if (game.epoch !== lastEpoch) {
    lastEpoch = game.epoch;
    mark(`Epoche ${game.epoch}`);
  }

  const income = Math.max(game.incomePerSec, totalIncome(), 0.05);
  const opts = options().sort((a, b) => a.cost / a.gain - b.cost / b.gain);
  const locked = nextLockedSite();
  if (locked && game.siteUnlockable(locked).ok) {
    const cost = SITES[locked].unlockCost;
    if (st().money >= cost) {
      game.unlockSite(locked);
      mark(`Freigeschaltet: ${SITES[locked].name}`);
      continue;
    }
    // Sparen, wenn das Tor in ~10 Minuten erreichbar ist und nichts mehr schnell zurückzahlt
    const bestPayback = opts.length ? opts[0].cost / opts[0].gain : Infinity;
    if (cost <= income * 600 && bestPayback > 240) continue;
  }
  if (opts.length === 0) continue;
  const best = opts[0];
  if (best.cost <= st().money) {
    if (best.buy() && VERBOSE && best.cost > income * 20) {
      console.log(`${duration(st().realSeconds).padEnd(12)}   kauft ${best.label} für ${money(best.cost)} (+${money(best.gain)}/s)`);
    }
  } else if (best.cost > income * 180) {
    const aff = opts.find((x) => x.cost <= st().money);
    if (aff && aff.cost / aff.gain < 900) aff.buy();
  }
}

mark('Ende');

console.log(`\nRückenwind – Balancing (Seed ${SEED}, ${HOURS} h, ${CPS} Klicks/s in den ersten ${ACTIVE_MIN} min)\n`);
console.log('Zeit         Meilenstein                         Einnahmen/s       Installiert');
for (const m of rows) {
  console.log(`${duration(m.t).padEnd(12)} ${m.label.padEnd(35)} ${money(m.income).padStart(14)}/s ${power(m.installed).padStart(14)}`);
}
console.log('\nStandorte am Ende:');
for (const def of SITE_LIST) {
  const s = st().sites[def.id];
  if (!s.unlocked) continue;
  const f = game.flows[def.id];
  console.log(
    `  ${def.name.padEnd(22)} ${String(s.count).padStart(4)} Anlagen, Teile ${PART_IDS.map((p) => s.parts[p]).join('/')}, ` +
      `Kette ${SLOT_IDS.map((x) => `${s.chain[x].tier}.${s.chain[x].level}`).join(' ')}, Schutz ${s.protection}, ` +
      `Erlös ${money(s.revenue)}, Energie ${(s.energyKWh / 1000).toFixed(1)} MWh, abgeregelt ${(s.curtailedKWh / 1000).toFixed(1)} MWh, jetzt ${f.status}`,
  );
}
console.log(`\nSchäden: ${st().stats.damages}, Erfolge: ${st().achievements.length}, Lexikon: ${st().lexicon.length}, Forschung: ${st().research.length}`);
console.log(`Geld: ${money(st().money)}, verdient: ${money(st().totalEarned)}`);
