// Energiefluss-Leiste: Wind → Anlagen → Generator → Leitung → Trafo → Speicher → Netz → Markt.

import { MARKET_INFO, SITES } from '../data/sites';
import { ct, money, percent, power } from '../sim/format';
import type { Game } from '../sim/game';
import type { LinkFlow } from '../sim/site';
import type { SiteId } from '../sim/types';
import { esc, loadClass } from './dom';

const MODE_TEXT: Record<string, string> = {
  still: 'steht (zu wenig Wind)',
  teillast: 'Teillast',
  nennlast: 'Nennlast',
  gerefft: 'aus dem Wind gedreht',
  abgeschaltet: 'Sturmabschaltung',
  kaputt: 'beschädigt',
};

const PART_TEXT: Record<string, string> = {
  rotor: 'Rotor',
  generator: 'Generator',
  cable: 'Leitung',
  trafo: 'Trafo',
  grid: 'Netzanschluss',
};

function bar(value: number, cls: string): string {
  const w = Math.max(0, Math.min(100, value * 100));
  return `<div class="bar ${cls}"><span style="width:${w.toFixed(1)}%"></span>${value > 1 ? '<i class="over"></i>' : ''}</div>`;
}

function node(title: string, value: string, sub: string, load: number | null, extra = '', cls = '', tip = ''): string {
  const lc = load === null ? 'neutral' : loadClass(load);
  return `<div class="node ${lc} ${cls}" ${tip ? `title="${esc(tip)}"` : ''}>
    <div class="nt">${title}</div>
    <div class="nv">${value}</div>
    ${load !== null ? bar(load, lc) : ''}
    <div class="ns">${sub}</div>${extra}
  </div>`;
}

function temp(t: number): string {
  if (t < 0.05) return '';
  const cls = t >= 0.9 ? 'bad' : t >= 0.5 ? 'warn' : 'ok';
  return `<div class="thermo ${cls}" title="Temperatur: ab 100 % nimmt das Bauteil Schaden"><span style="width:${Math.min(100, t * 100).toFixed(0)}%"></span></div>`;
}

export function renderFlow(game: Game, id: SiteId): string {
  const def = SITES[id];
  const s = game.state.sites[id];
  const f = game.flows[id];
  if (!s.unlocked) return `<p class="flow-empty">${esc(def.name)} ist noch nicht freigeschaltet.</p>`;
  if (s.permitLeft > 0) return `<p class="flow-empty">Genehmigungsverfahren läuft – noch ${Math.ceil(s.permitLeft)} s.</p>`;
  if (s.count === 0)
    return `<p class="flow-empty">Noch keine Anlage gebaut. ${id === 'garten' ? 'Kurbel, bis du dir das erste Holzwindrad leisten kannst!' : 'Bau die erste Anlage im Shop.'}</p>`;

  const parts: string[] = [];
  const arrow = (kw: number | null) => `<div class="arrow"><span>${kw === null ? '' : power(kw)}</span></div>`;
  parts.push(node('Wind', `${f.v.toFixed(1).replace('.', ',')} m/s`, 'an der Nabe', null, '', 'wind', 'Leistung im Wind wächst mit v³'));
  parts.push(arrow(null));
  const gen = f.links.find((l) => l.id === 'generator')!;
  parts.push(
    node(
      `${s.count}× Anlage`,
      `${power(f.perTurbineKW)} je Anlage`,
      MODE_TEXT[f.mode] ?? f.mode,
      null,
      '',
      'turbines',
    ),
  );
  parts.push(arrow(gen.inKW));
  const linkNode = (l: LinkFlow) => {
    const isBott = f.bottleneck?.id === l.id;
    const tip =
      l.id === 'cable'
        ? 'Leitungsverluste wachsen mit dem Quadrat des Stroms'
        : l.id === 'trafo'
          ? 'Trafos dürfen kurz überlastet werden, aber nicht lange'
          : l.id === 'grid'
            ? 'Mehr nimmt der Netzanschluss nicht ab – der Rest wird abgeregelt'
            : '';
    if (l.id === 'storage') {
      const flowTxt = l.inKW > 0.0001 ? `lädt ${power(l.inKW)}` : l.outKW > 0.0001 ? `liefert ${power(l.outKW)}` : 'wartet';
      return node('Speicher', `${percent(l.temp)} voll`, flowTxt, null, bar(l.temp, 'soc'), 'storage');
    }
    if (l.id === 'demand') {
      return node('Nachfrage', `${power(l.outKW)} / ${power(l.capKW)}`, l.load >= 0.98 ? 'Nachbarn sind versorgt' : 'Nachbarn wollen mehr', Math.min(l.load, 1.0), '', isBott ? 'bottleneck' : '', 'Die Nachbarn kaufen nur, was sie gerade brauchen – abends am meisten.');
    }
    const lossTxt = l.lossKW > 0 ? ` · Verlust ${power(l.lossKW)}` : '';
    return node(
      l.name,
      `${power(l.inKW)} / ${power(l.capKW)}`,
      `${percent(l.load)}${lossTxt}${l.damaged ? ' · <b>DEFEKT</b>' : ''}`,
      l.damaged ? 2 : l.load,
      temp(l.temp),
      `${isBott ? 'bottleneck' : ''} ${l.damaged ? 'broken' : ''}`,
      tip,
    );
  };
  // Generator als eigenes Glied (Auslastung je Anlage)
  parts.push(
    node(
      'Generator',
      `${percent(f.genLoad)} Last`,
      `${power(def.parts.generator[s.parts.generator].ratedKW)} Nenn${s.damage.some((d) => d.part === 'generator') ? ' · <b>DEFEKT</b>' : ''}`,
      s.damage.some((d) => d.part === 'generator') ? 2 : f.genLoad,
      temp(s.genTemp),
      f.bottleneck?.id === 'generator' ? 'bottleneck' : '',
      'Bekommt der Generator mehr Leistung als vorgesehen, wird er heiß.',
    ),
  );
  for (const l of f.links) {
    if (l.id === 'generator') continue;
    parts.push(arrow(l.inKW));
    parts.push(linkNode(l));
  }
  parts.push(arrow(f.soldKW));
  parts.push(
    node(MARKET_INFO[s.market].name, ct(f.priceCt), `${money(f.incomePerSec)}/s`, null, '', `market ${f.priceCt < 0 ? 'negative' : ''}`, MARKET_INFO[s.market].why),
  );

  // Statuszeile
  const status: string[] = [];
  if (s.tripped) {
    const prot = def.protection[s.protection];
    status.push(
      `<span class="st bad">${prot.mode === 'fuse' ? 'Sicherung durchgebrannt' : 'Schutz hat ausgelöst'}${prot.mode === 'breaker' ? ' – schaltet nach dem Abkühlen wieder ein' : ''}</span>` +
        (prot.mode !== 'breaker' ? `<button class="act" data-action="reset:${id}">Wieder einschalten</button>` : ''),
    );
  }
  s.damage.forEach((d, i) => {
    if (d.remaining < 0) {
      status.push(`<span class="st bad">${PART_TEXT[d.part]} beschädigt</span><button class="act" data-action="repair:${id}:${i}" data-cost="${d.cost}">Reparieren · ${money(d.cost)}</button>`);
    } else {
      status.push(`<span class="st warn">${PART_TEXT[d.part]}: Reparatur läuft, noch ${Math.ceil(d.remaining)} s (Kurbeln hilft!)</span>`);
    }
  });
  if (f.bottleneck && !s.tripped && s.damage.length === 0) {
    const b = f.bottleneck;
    const name = b.id === 'generator' ? 'Generator' : b.name;
    if (b.load > 1.0001) status.push(`<span class="st bad">Engpass: ${name} ${percent(b.load)}</span>`);
    else status.push(`<span class="st warn">Am Limit: ${name} ${percent(b.load)}</span>`);
  }
  if (f.curtailedKW > 0.0001 && f.status === 'abgeregelt') status.push(`<span class="st info">abgeregelt: ${power(f.curtailedKW)}</span>`);
  for (const n of f.notes) status.push(`<span class="st info">${esc(n)}</span>`);
  if (status.length === 0) status.push('<span class="st ok">Alles im grünen Bereich</span>');

  return `<div class="chain">${parts.join('')}</div><div class="status">${status.join('')}</div>`;
}
