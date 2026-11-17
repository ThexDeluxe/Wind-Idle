// Erfolge: Meilensteine, Merksätze, Kuriositäten.

import type { GameState } from '../sim/types';

export interface AchievementView {
  state: GameState;
  installedKW: number;
  outputKW: number;
  epoch: number;
}

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  check: (g: AchievementView) => boolean;
}

const seen = (g: AchievementView, k: string) => g.state.seenHints.includes(k);

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'kurbel100', name: 'Muskelkater', desc: '100-mal gekurbelt.', check: (g) => g.state.clicks >= 100 },
  { id: 'kurbel1000', name: 'Kurbelkönig', desc: '1.000-mal gekurbelt.', check: (g) => g.state.clicks >= 1000 },
  { id: 'kurbel10000', name: 'Dynamo-Dauerläufer', desc: '10.000-mal gekurbelt.', check: (g) => g.state.clicks >= 10000 },
  { id: 'windrad', name: 'Marke Eigenbau', desc: 'Das erste Holzwindrad steht.', check: (g) => g.state.sites.garten.count >= 1 },
  { id: 'strom_faul', name: 'Strom is faul', desc: 'Die erste Leitung ist durchgebrannt. Lehrgeld bezahlt.', check: (g) => seen(g, 'damageCable') },
  { id: 'sicherung', name: 'Schwächstes Glied', desc: 'Eine Sicherung hat dein Kabel gerettet.', check: (g) => seen(g, 'trip') },
  { id: 'dritte_potenz', name: 'Dritte Potenz', desc: 'Über 15 m/s Wind an einer deiner Anlagen.', check: (g) => g.state.stats.maxWind > 15 },
  { id: 'kw1', name: 'Wasserkocher', desc: '1 kW Einspeiseleistung gleichzeitig.', check: (g) => g.state.peakKW >= 1 },
  { id: 'mw1', name: 'Dorfversorger', desc: '1 MW Einspeiseleistung gleichzeitig.', check: (g) => g.state.peakKW >= 1000 },
  { id: 'gw1', name: 'Kraftwerk ohne Schornstein', desc: '1 GW Einspeiseleistung gleichzeitig.', check: (g) => g.state.peakKW >= 1e6 },
  { id: 'hof', name: 'Ab ins Netz', desc: 'Erste Netzeinspeisung am Bauernhof.', check: (g) => g.state.sites.hof.unlocked },
  { id: 'deich', name: 'Bürgerenergie', desc: 'Der Bürgerwindpark am Deich ist genehmigt.', check: (g) => g.state.sites.deich.unlocked },
  { id: 'geest', name: 'Windparkbetreiber', desc: 'Der Windpark auf der Geest ist genehmigt.', check: (g) => g.state.sites.geest.unlocked },
  { id: 'nordsee', name: 'Leinen los', desc: 'Offshore in der Nordsee.', check: (g) => g.state.sites.nordsee.unlocked },
  { id: 'betz', name: 'Betz-Grenze', desc: 'Ein Rotor mit Leistungsbeiwert 0,45 – drei Viertel des theoretischen Maximums.', check: (g) => g.state.sites.deich.parts.rotor >= 2 || g.state.sites.geest.count > 0 },
  { id: 'sturm', name: 'Sturmerprobt', desc: 'Einen Sturm mit laufenden Anlagen überstanden.', check: (g) => g.state.stats.stormsSurvived >= 1 },
  { id: 'negativ', name: 'Minus mal Minus', desc: 'Einen negativen Strompreis erlebt.', check: (g) => g.state.stats.negativeSeen >= 1 },
  { id: 'sauber', name: 'Sauber ausgelegt', desc: 'Einen ganzen Spieltag lang keine Überlast.', check: (g) => g.state.stats.overloadFreeHours >= 24 },
  { id: 'speicher', name: 'Für den Abend', desc: 'Den ersten Speicher gebaut.', check: (g) => Object.values(g.state.sites).some((s) => s.storage.tier >= 0) },
  { id: 'lex10', name: 'Wissbegierig', desc: '10 Lexikon-Karten gesammelt.', check: (g) => g.state.lexicon.length >= 10 },
  { id: 'lex30', name: 'Ingenieurin/Ingenieur', desc: '30 Lexikon-Karten gesammelt.', check: (g) => g.state.lexicon.length >= 30 },
  { id: 'million', name: 'Erste Million', desc: '1 Mio. € verdient.', check: (g) => g.state.totalEarned >= 1e6 },
  { id: 'milliarde', name: 'Milliarde', desc: '1 Mrd. € verdient.', check: (g) => g.state.totalEarned >= 1e9 },
  { id: 'gwh', name: 'Gigawattstunde', desc: '1 GWh Strom geliefert.', check: (g) => g.state.lifetimeEnergyKWh >= 1e6 },
  { id: 'twh', name: 'Terawattstunde', desc: '1 TWh Strom geliefert.', check: (g) => g.state.lifetimeEnergyKWh >= 1e9 },
  { id: 'repowering', name: 'Repowering', desc: 'Alles abgebaut und neu angefangen – mit mehr Know-how.', check: (g) => g.state.prestigeCount >= 1 },
];
