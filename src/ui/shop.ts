// Shop: Anlagen, Bauteile, Netz, Markt & Speicher, Forschung – für den gewählten Standort.

import { BRANCH_NAMES, RESEARCH, type Branch } from '../data/research';
import { MARKET_INFO, SITE_LIST, SITES } from '../data/sites';
import { ct, duration, money, percent, power } from '../sim/format';
import { PART_NAMES, type Game } from '../sim/game';
import { designCheck, slotCapacity, storageSpec } from '../sim/site';
import { PART_IDS, type MarketId, type PartId, type SiteId, type SlotId } from '../sim/types';
import { boersePriceHourly, frontFactor } from '../sim/weather';
import { expectedYield, strongWindAt } from '../sim/yield';
import { esc } from './dom';

export type ShopTab = 'anlagen' | 'bauteile' | 'netz' | 'markt' | 'forschung';
export const SHOP_TABS: Array<[ShopTab, string]> = [
  ['anlagen', 'Anlagen'],
  ['bauteile', 'Bauteile'],
  ['netz', 'Netz'],
  ['markt', 'Markt'],
  ['forschung', 'Forschung'],
];

export const SLOT_NAMES: Record<SlotId, string> = { cable: 'Leitung', trafo: 'Trafo', grid: 'Netzanschluss' };

interface Btn {
  action: string;
  label: string;
  cost?: number;
  lock?: string;
  primary?: boolean;
}

interface Card {
  title: string;
  tag?: string;
  sub?: string;
  why?: string;
  meta?: string;
  warn?: string;
  buttons?: Btn[];
  cls?: string;
}

function card(c: Card): string {
  const buttons = (c.buttons ?? [])
    .map((b) => {
      const cost =
        b.cost !== undefined ? `<span class="cost">${b.cost > 0 || !b.action.startsWith('turbineMax') ? money(b.cost) : '–'}${b.lock ? ` · ${esc(b.lock)}` : ''}</span>` : '';
      const lock = b.lock ? ` data-lock="${esc(b.lock)}" title="${esc(b.lock)}"` : '';
      const dc = b.cost !== undefined ? ` data-cost="${b.cost}"` : '';
      return `<button class="buy${b.primary ? ' primary' : ''}" data-action="${esc(b.action)}"${dc}${lock}><span class="lbl">${esc(b.label)}</span>${cost}</button>`;
    })
    .join('');
  return `<article class="card ${c.cls ?? ''}">
    <header><h3>${esc(c.title)}</h3>${c.tag ? `<span class="tag">${esc(c.tag)}</span>` : ''}</header>
    ${c.sub ? `<p class="sub">${c.sub}</p>` : ''}
    ${c.why ? `<p class="why"><b>Warum?</b> ${esc(c.why)}</p>` : ''}
    ${c.meta ? `<p class="meta">${c.meta}</p>` : ''}
    ${c.warn ? `<p class="warnline">${c.warn}</p>` : ''}
    ${buttons ? `<div class="btns">${buttons}</div>` : ''}
  </article>`;
}

const pct = (a: number, b: number) => (b > 0 ? `${a >= b ? '+' : ''}${Math.round((a / b - 1) * 100)} %` : 'neu');

export class Shop {
  tab: ShopTab = 'anlagen';
  private sig = '';

  constructor(
    private root: HTMLElement,
    private game: () => Game,
    private site: () => SiteId,
  ) {}

  invalidate() {
    this.sig = '';
  }

  private signature(): string {
    const g = this.game();
    const st = g.state;
    const id = this.site();
    const s = st.sites[id];
    return JSON.stringify([
      this.tab,
      id,
      s.count,
      s.parts,
      Object.values(s.chain).map((c) => [c.tier, c.level, c.aging > 0]),
      s.protection,
      s.storage.tier,
      s.storage.level,
      s.customers,
      s.market,
      s.permitLeft > 0,
      st.research.length,
      SITE_LIST.map((d) => st.sites[d.id].unlocked),
      g.epoch,
      st.knowhow,
      this.tab === 'markt' ? Math.floor(st.gameHours) : 0,
      this.tab === 'anlagen' && s.permitLeft > 0 ? Math.ceil(s.permitLeft) : 0,
    ]);
  }

  /** Neu aufbauen, wenn sich die Struktur geändert hat; sonst nur Bezahlbarkeit aktualisieren. */
  update() {
    const sig = this.signature();
    if (sig !== this.sig) {
      this.sig = sig;
      this.root.innerHTML = this.build();
    }
    const cash = this.game().state.money;
    this.root.querySelectorAll<HTMLButtonElement>('button[data-action]').forEach((b) => {
      const cost = b.dataset.cost !== undefined ? Number(b.dataset.cost) : 0;
      const locked = b.dataset.lock !== undefined;
      const dis = locked || cost > cash;
      if (b.disabled !== dis) b.disabled = dis;
      b.classList.toggle('affordable', !dis && cost > 0);
    });
    // „Max“-Knopf dynamisch
    const maxBtn = this.root.querySelector<HTMLButtonElement>('button[data-action^="turbineMax:"]');
    if (maxBtn) {
      const g = this.game();
      const id = this.site();
      const n = g.maxBuyable(id);
      const lbl = maxBtn.querySelector('.lbl')!;
      const text = `Max (${n})`;
      if (lbl.textContent !== text) lbl.textContent = text;
      maxBtn.disabled = n === 0 || maxBtn.dataset.lock !== undefined;
      const c = maxBtn.querySelector('.cost')!;
      const ctext = n > 0 ? money(g.turbineCost(id, n)) : '–';
      if (c.textContent !== ctext) c.textContent = ctext;
    }
  }

  private build(): string {
    switch (this.tab) {
      case 'anlagen':
        return this.buildAnlagen();
      case 'bauteile':
        return this.buildBauteile();
      case 'netz':
        return this.buildNetz();
      case 'markt':
        return this.buildMarkt();
      case 'forschung':
        return this.buildForschung();
    }
  }

  private yieldOf(id: SiteId, parts?: Record<PartId, number>) {
    const g = this.game();
    const def = SITES[id];
    const s = g.state.sites[id];
    const m = g.mods(id);
    return expectedYield(def, parts ?? s.parts, m.cpMult, m.outputMult, def.protection[s.protection].mode === 'regulator');
  }

  private buildAnlagen(): string {
    const g = this.game();
    const id = this.site();
    const def = SITES[id];
    const s = g.state.sites[id];
    const out: string[] = [];
    if (!s.unlocked) return this.unlockCard(id);
    if (s.permitLeft > 0) {
      out.push(card({ title: def.name, tag: 'Genehmigung', sub: `Genehmigungsverfahren läuft noch ${duration(s.permitLeft)}.`, why: def.unlockText }));
      return out.join('');
    }
    const y = this.yieldOf(id);
    const gen = def.parts.generator[s.parts.generator];
    out.push(
      card({
        title: def.turbine.name,
        tag: `${s.count} / ${def.turbine.maxCount}`,
        sub: `${esc(def.place)} · Nennleistung ${power(gen.ratedKW)} je Anlage`,
        meta: `Ø Wind an der Nabe ${y.meanWind.toFixed(1).replace('.', ',')} m/s · Ø Leistung je Anlage <b>${power(y.avgKW)}</b> · Kapazitätsfaktor ${percent(y.cf)}`,
        why:
          s.count === 0 && id === 'garten'
            ? 'Ein Windrad dreht auch, wenn du nicht kurbelst. Leistung im Wind wächst mit der Rotorfläche und mit v³.'
            : undefined,
        buttons:
          s.count >= def.turbine.maxCount
            ? [{ action: 'noop', label: 'Standort voll', lock: 'Kein Platz mehr' }]
            : [
                { action: `turbine:${id}:1`, label: 'Bauen', cost: g.turbineCost(id, 1), primary: true },
                ...(def.turbine.maxCount - s.count >= 10 ? [{ action: `turbine:${id}:10`, label: '×10', cost: g.turbineCost(id, 10) }] : []),
                { action: `turbineMax:${id}`, label: 'Max', cost: 0 },
              ],
      }),
    );
    // Kunden (Nachbarschaft)
    const c = g.customerNext(id);
    if (def.demand) {
      const total = def.demand.baseKW + def.demand.customers.slice(0, s.customers).reduce((a, x) => a + x.addKW, 0);
      out.push(
        card({
          title: c ? `Neuer Kunde: ${c.name}` : 'Alle Kunden gewonnen',
          tag: 'Nachfrage',
          sub: `Bisher: ${esc(def.demand.baseName)}${s.customers ? ` + ${s.customers} weitere` : ''} · Ø Bedarf ${power(total)} (abends fast doppelt so viel)`,
          why: c?.why,
          meta: c ? `+${power(c.addKW)} mittlere Nachfrage` : undefined,
          buttons: c ? [{ action: `customer:${id}`, label: 'Werben', cost: c.cost }] : [],
        }),
      );
    }
    // Nächster Standort
    const idx = SITE_LIST.findIndex((d) => d.id === id);
    const next = SITE_LIST.slice(idx + 1).find((d) => !g.state.sites[d.id].unlocked);
    if (next && SITE_LIST.indexOf(next) === idx + 1) out.push(this.unlockCard(next.id));
    if (id === 'nordsee' && g.prestigeAvailable()) {
      out.push(
        card({
          title: 'Repowering',
          tag: 'Prestige',
          sub: `Alles abbauen und neu beginnen. Du erhältst ${g.knowhowTotal()} Know-how-Punkte (+${g.knowhowTotal() * 2} % auf alle Einnahmen).`,
          why: 'Echte Windparks werden nach 20–25 Jahren repowert: alte Anlagen raus, neue rein.',
          buttons: [{ action: 'prestige', label: 'Repowering starten' }],
          cls: 'highlight',
        }),
      );
    }
    return out.join('');
  }

  private unlockCard(id: SiteId): string {
    const g = this.game();
    const def = SITES[id];
    const ok = g.siteUnlockable(id);
    return card({
      title: `Nächster Schritt: ${def.name}`,
      tag: `Epoche ${def.epoch}`,
      sub: esc(def.place),
      why: def.unlockText,
      meta: `Typische Anlage: ${esc(def.turbine.name)}, ${power(def.parts.generator[0].ratedKW)} · Genehmigung ${duration(def.permitSeconds)}`,
      buttons: [{ action: `unlock:${id}`, label: 'Freischalten', cost: def.unlockCost, lock: ok.ok ? undefined : ok.reason, primary: true }],
      cls: 'highlight',
    });
  }

  private buildBauteile(): string {
    const g = this.game();
    const id = this.site();
    const def = SITES[id];
    const s = g.state.sites[id];
    if (!s.unlocked || s.permitLeft > 0) return `<p class="empty">Erst den Standort freischalten.</p>`;
    const out: string[] = [];
    out.push(`<p class="hint">Bauteile gelten für alle ${esc(def.turbine.name)}-Anlagen am Standort. Passen müssen sie zueinander: Ein großer Rotor überfordert einen kleinen Generator.</p>`);
    const cur = this.yieldOf(id);
    for (const p of PART_IDS) {
      const tiers = def.parts[p];
      const now = tiers[s.parts[p]];
      const next = g.partNext(id, p);
      let meta = '';
      let warn = '';
      if (next) {
        const parts = { ...s.parts, [p]: next.tier };
        if (p !== 'foundation') {
          const ny = this.yieldOf(id, parts);
          meta = `Ø je Anlage: ${power(cur.avgKW)} → <b>${power(ny.avgKW)}</b> (${pct(ny.avgKW, cur.avgKW)})`;
          const vs = strongWindAt(def, def.parts.tower[parts.tower].height);
          const check = designCheck(def, { ...s, parts }, g.mods(id), vs);
          const genLoad = check[0].load;
          const vtxt = vs.toFixed(0);
          if (genLoad > 1.02) warn = `Bei Starkwind (${vtxt} m/s): Generator ${percent(genLoad)} – Überlast droht! (${percent(ny.overloadShare)} der Zeit)`;
          else {
            const chainWorst = check.slice(1).sort((a, b) => b.load - a.load)[0];
            if (chainWorst && chainWorst.load > 1.02) warn = `Bei Starkwind (${vtxt} m/s): ${chainWorst.name} ${percent(chainWorst.load)} – die Kette muss mitwachsen.`;
          }
        } else {
          meta = 'Ermöglicht höhere Türme.';
        }
      }
      out.push(
        card({
          title: PART_NAMES[p],
          tag: `Stufe ${s.parts[p] + 1}/${tiers.length}`,
          sub: `Jetzt: <b>${esc(now.name)}</b>${this.partDetail(id, p, s.parts[p])}`,
          why: next ? tiers[next.tier].why : undefined,
          meta: next ? `Nächste Stufe: <b>${esc(tiers[next.tier].name)}</b>${this.partDetail(id, p, next.tier)}<br>${meta}` : 'Höchste Stufe erreicht.',
          warn,
          buttons: next ? [{ action: `part:${id}:${p}`, label: 'Einbauen', cost: next.cost, lock: next.blocked }] : [],
        }),
      );
    }
    return out.join('');
  }

  private partDetail(id: SiteId, p: PartId, tier: number): string {
    const def = SITES[id];
    switch (p) {
      case 'rotor': {
        const r = def.parts.rotor[tier];
        return ` · ${Math.round(Math.PI * (r.diameter / 2) ** 2).toLocaleString('de-DE')} m² · c<sub>p</sub> ${r.cp.toFixed(2).replace('.', ',')}`;
      }
      case 'tower':
        return '';
      case 'generator': {
        const gt = def.parts.generator[tier];
        return ` · Wirkungsgrad ${percent(gt.eff)}`;
      }
      case 'control': {
        const c = def.parts.control[tier];
        if (c.kind === 'none') return ` · bricht ab ${c.breakAt} m/s`;
        if (c.kind === 'furl') return ` · klappt weg ab ${c.furlAt} m/s`;
        if (c.kind === 'stall') return ` · Strömungsabriss ab ~${c.stallAt} m/s`;
        return ` · Abschaltung ab ${c.cutOut} m/s`;
      }
      default:
        return '';
    }
  }

  private buildNetz(): string {
    const g = this.game();
    const id = this.site();
    const def = SITES[id];
    const s = g.state.sites[id];
    if (!s.unlocked || s.permitLeft > 0) return `<p class="empty">Erst den Standort freischalten.</p>`;
    const flow = g.flows[id];
    const out: string[] = [];
    out.push(`<p class="hint">Alle Anlagen des Standorts teilen sich Leitung, Trafo und Netzanschluss. Hier entstehen die typischen Engpässe.</p>`);
    for (const slot of ['cable', 'trafo', 'grid'] as SlotId[]) {
      const tiers = def.chain[slot];
      if (!tiers) continue;
      const st = s.chain[slot];
      const t = tiers[st.tier];
      const cap = slotCapacity(tiers, st);
      const link = flow.links.find((l) => l.id === slot);
      const load = link ? link.load : 0;
      const next = g.slotTierNext(id, slot);
      const btns: Btn[] = [{ action: `slotLevel:${id}:${slot}`, label: `${t.levelName} (×2)`, cost: g.slotLevelCost(id, slot) }];
      if (next) btns.push({ action: `slotTier:${id}:${slot}`, label: `→ ${tiers[next.tier].name}`, cost: next.cost, lock: next.blocked });
      if (slot === 'trafo' && st.aging > 0) btns.push({ action: `overhaul:${id}`, label: 'Trafo überholen', cost: g.overhaulCost(id) });
      out.push(
        card({
          title: SLOT_NAMES[slot],
          tag: t.voltage,
          sub: `<b>${esc(t.name)}</b>${st.level ? ` · ${st.level}× verdoppelt` : ''} · Kapazität <b>${power(cap)}</b> · jetzt ${percent(load)}${st.aging > 0 ? ` · gealtert −${percent(st.aging)}` : ''}`,
          why: next ? tiers[next.tier].why : t.why,
          meta: slot === 'cable' ? `Verluste bei Volllast ${percent(t.lossAtRated)} – bei halber Last nur die Hälfte (I² · R).` : undefined,
          buttons: btns,
          cls: load > 1 ? 'alarm' : load > 0.9 ? 'attention' : '',
        }),
      );
    }
    const prot = def.protection[s.protection];
    const pn = g.protectionNext(id);
    out.push(
      card({
        title: 'Schutz',
        tag: prot.mode === 'none' ? 'kein' : prot.name,
        sub: `Jetzt: <b>${esc(prot.name)}</b>`,
        why: pn ? def.protection[pn.tier].why : prot.why,
        meta: pn ? `Nächste Stufe: <b>${esc(def.protection[pn.tier].name)}</b>` : 'Bester Schutz verbaut.',
        buttons: pn ? [{ action: `prot:${id}`, label: 'Einbauen', cost: pn.cost }] : [],
      }),
    );
    return out.join('');
  }

  private buildMarkt(): string {
    const g = this.game();
    const id = this.site();
    const def = SITES[id];
    const s = g.state.sites[id];
    if (!s.unlocked || s.permitLeft > 0) return `<p class="empty">Erst den Standort freischalten.</p>`;
    const out: string[] = [];
    // Märkte
    const choices = def.markets
      .map((m) => {
        const unlocked = g.marketUnlocked(m);
        const sel = s.market === m;
        return `<button class="market${sel ? ' selected' : ''}" data-action="market:${id}:${m}" ${unlocked ? '' : 'disabled data-lock="1"'} title="${esc(MARKET_INFO[m].why)}">
          <b>${esc(MARKET_INFO[m].name)}</b><small>${unlocked ? esc(MARKET_INFO[m].why) : 'Noch nicht freigeschaltet (Forschung „Markt“)'}</small></button>`;
      })
      .join('');
    out.push(`<article class="card"><header><h3>Wohin mit dem Strom?</h3><span class="tag">${ct(g.flows[id].priceCt)}</span></header><div class="markets">${choices}</div></article>`);
    if (def.selfUse && s.market === 'verguetung') {
      out.push(`<p class="hint">Die ersten ${power(def.selfUse.kW)} verbraucht der Hof selbst – das spart ${def.selfUse.priceCt} ct/kWh Strombezug. Der Rest geht für ${def.feedInCt} ct ins Netz.</p>`);
    }
    // Prognose
    if (g.hasEffect('forecast') || s.market === 'boerse') out.push(this.forecast(g));
    // Speicher
    const spec = storageSpec(def, s);
    const sn = g.storageNext(id);
    const btns: Btn[] = [];
    if (sn) btns.push({ action: `storage:${id}`, label: spec ? `→ ${def.storage[sn.tier].name}` : `${def.storage[sn.tier].name} bauen`, cost: sn.cost });
    if (spec) btns.push({ action: `storageLevel:${id}`, label: 'Kapazität ×2', cost: g.storageLevelCost(id) });
    out.push(
      card({
        title: 'Speicher',
        tag: spec ? `${Math.round((s.storage.soc / spec.capKWh) * 100)} % voll` : 'keiner',
        sub: spec ? `<b>${esc(spec.name)}</b> · ${energyStr(spec.capKWh)} · ${power(spec.powerKW)} · Wirkungsgrad ${percent(spec.eff)}` : 'Noch kein Speicher.',
        why: sn ? def.storage[sn.tier].why : spec ? def.storage[s.storage.tier].why : undefined,
        meta: spec
          ? s.market === 'nachbarn'
            ? 'Lädt Überschuss, liefert, sobald die Nachbarn mehr brauchen als der Wind gerade bringt.'
            : 'Lädt immer, was das Netz nicht abnimmt. Zusätzlich nach Preis:'
          : undefined,
        buttons: btns,
      }),
    );
    if (spec && s.market !== 'nachbarn') {
      out.push(`<article class="card rules">
        <label>Laden unter <output>${ct(s.storage.chargeBelow)}</output>
          <input type="range" min="-5" max="20" step="0.5" value="${s.storage.chargeBelow}" data-rule="charge:${id}"></label>
        <label>Verkaufen über <output>${ct(s.storage.dischargeAbove)}</output>
          <input type="range" min="0" max="40" step="0.5" value="${s.storage.dischargeAbove}" data-rule="discharge:${id}"></label>
      </article>`);
    }
    return out.join('');
  }

  private forecast(g: Game): string {
    const gh = Math.floor(g.state.gameHours);
    const n = 24;
    const prices: number[] = [];
    const winds: number[] = [];
    for (let i = 0; i < n; i++) {
      prices.push(boersePriceHourly(gh + i, g.state.seed, g.state.events));
      winds.push(frontFactor(gh + i + 0.5, g.state.seed));
    }
    const W = 300;
    const H = 90;
    const pmin = Math.min(0, ...prices);
    const pmax = Math.max(15, ...prices);
    const y = (p: number) => H - 14 - ((p - pmin) / (pmax - pmin)) * (H - 24);
    const bars = prices
      .map((p, i) => {
        const x = 4 + (i * (W - 8)) / n;
        const y0 = y(Math.max(0, p));
        const y1 = y(Math.min(0, p));
        return `<rect x="${x.toFixed(1)}" y="${y0.toFixed(1)}" width="${((W - 8) / n - 2).toFixed(1)}" height="${Math.max(1, y1 - y0).toFixed(1)}" class="${p < 0 ? 'neg' : p > 11 ? 'hi' : ''}"><title>${(gh + i) % 24}:00 – ${ct(p)}</title></rect>`;
      })
      .join('');
    const wline = winds
      .map((w, i) => `${i === 0 ? 'M' : 'L'}${(4 + ((i + 0.5) * (W - 8)) / n).toFixed(1)} ${(H - 14 - Math.min(1, w / 2.2) * (H - 24)).toFixed(1)}`)
      .join('');
    const labels = [0, 6, 12, 18].map((k) => `<text x="${4 + (k * (W - 8)) / n}" y="${H - 2}">${String((gh + k) % 24).padStart(2, '0')} h</text>`).join('');
    return `<article class="card"><header><h3>Prognose: nächste 24 Spielstunden</h3><span class="tag">Börse</span></header>
      <svg class="forecast" viewBox="0 0 ${W} ${H}" role="img" aria-label="Prognose Börsenpreis und Wind">
        <line x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}" class="zero"/>${bars}<path d="${wline}" class="wind"/>${labels}
      </svg>
      <p class="meta"><span class="key bar"></span> Börsenpreis (ct/kWh) <span class="key wind"></span> Wind (regional) – viel Wind drückt den Preis.</p></article>`;
  }

  private buildForschung(): string {
    const g = this.game();
    const list = g.visibleResearch();
    if (list.length === 0) return `<p class="empty">Gerade nichts zu erforschen. Wachse weiter!</p>`;
    const groups = new Map<Branch, typeof list>();
    for (const r of list) {
      if (!groups.has(r.branch)) groups.set(r.branch, []);
      groups.get(r.branch)!.push(r);
    }
    const out: string[] = [];
    const done = g.state.research.length;
    out.push(`<p class="hint">${done} von ${RESEARCH.length} Forschungen abgeschlossen.</p>`);
    for (const [branch, rs] of groups) {
      out.push(`<h4 class="group">${esc(BRANCH_NAMES[branch])}</h4>`);
      for (const r of rs.sort((a, b) => a.cost - b.cost)) {
        const av = g.researchAvailable(r);
        out.push(card({ title: r.name, why: r.why, buttons: [{ action: `research:${r.id}`, label: 'Erforschen', cost: r.cost, lock: av.ok ? undefined : av.reason }] }));
      }
    }
    return out.join('');
  }

  /** Klick-Aktionen. Gibt true zurück, wenn etwas gekauft wurde. */
  handle(action: string): boolean {
    const g = this.game();
    const [kind, a, b] = action.split(':');
    const id = a as SiteId;
    let ok = false;
    switch (kind) {
      case 'turbine':
        ok = g.buyTurbine(id, Number(b));
        break;
      case 'turbineMax':
        ok = g.buyTurbine(id, g.maxBuyable(id));
        break;
      case 'part':
        ok = g.buyPart(id, b as PartId);
        break;
      case 'slotTier':
        ok = g.buySlotTier(id, b as SlotId);
        break;
      case 'slotLevel':
        ok = g.buySlotLevel(id, b as SlotId);
        break;
      case 'overhaul':
        ok = g.overhaulTrafo(id);
        break;
      case 'prot':
        ok = g.buyProtection(id);
        break;
      case 'storage':
        ok = g.buyStorage(id);
        break;
      case 'storageLevel':
        ok = g.buyStorageLevel(id);
        break;
      case 'customer':
        ok = g.buyCustomer(id);
        break;
      case 'unlock':
        ok = g.unlockSite(id);
        break;
      case 'market':
        ok = g.setMarket(id, b as MarketId);
        break;
      case 'research':
        ok = g.buyResearch(a);
        break;
    }
    if (ok) this.invalidate();
    return ok;
  }
}

function energyStr(kwh: number): string {
  if (kwh >= 1e6) return `${(kwh / 1e6).toLocaleString('de-DE', { maximumFractionDigits: 1 })} GWh`;
  if (kwh >= 1e3) return `${(kwh / 1e3).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MWh`;
  return `${kwh.toLocaleString('de-DE', { maximumFractionDigits: 1 })} kWh`;
}
