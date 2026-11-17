// Forschung, Kurbel-Upgrades und Meilensteine.

import type { MarketId, SiteId } from '../sim/types';

export type Effect =
  | { type: 'clickMult'; value: number }
  | { type: 'clickPct'; value: number }
  | { type: 'revenueMult'; value: number; site?: SiteId }
  | { type: 'cpMult'; value: number }
  | { type: 'outputMult'; value: number }
  | { type: 'cableLossMult'; value: number }
  | { type: 'trafoHeatMult'; value: number }
  | { type: 'autoRepair' }
  | { type: 'repairSpeed'; value: number }
  | { type: 'maintMult'; value: number }
  | { type: 'wakeMult'; value: number }
  | { type: 'offlineHours'; value: number }
  | { type: 'unlockMarket'; market: MarketId }
  | { type: 'negCurtail' }
  | { type: 'forecast' }
  | { type: 'lightning' }
  | { type: 'deicing' }
  | { type: 'permitSpeed'; value: number };

export type Branch = 'kurbel' | 'aerodynamik' | 'regelung' | 'elektrik' | 'betrieb' | 'markt' | 'schutz' | 'meilenstein';

export interface ResearchDef {
  id: string;
  name: string;
  branch: Branch;
  cost: number;
  epoch: number;
  requires?: string[];
  requireCount?: { site: SiteId; count: number };
  effects: Effect[];
  why: string;
  lexicon?: string;
}

export const BRANCH_NAMES: Record<Branch, string> = {
  kurbel: 'Kurbel',
  aerodynamik: 'Aerodynamik',
  regelung: 'Regelung',
  elektrik: 'Elektrik',
  betrieb: 'Betrieb',
  markt: 'Markt',
  schutz: 'Schutz',
  meilenstein: 'Meilensteine',
};

export const RESEARCH: ResearchDef[] = [
  // ---- Kurbel ----
  { id: 'k_griff', name: 'Gummierter Griff', branch: 'kurbel', cost: 2, epoch: 0, effects: [{ type: 'clickMult', value: 1.5 }], why: 'Besserer Griff, mehr Kraft pro Umdrehung: +50 % pro Klick.', lexicon: 'kurbel' },
  { id: 'k_uebersetzung', name: 'Übersetzung 1:4', branch: 'kurbel', cost: 12, epoch: 0, requires: ['k_griff'], effects: [{ type: 'clickMult', value: 2 }], why: 'Der Dynamo dreht viermal so schnell wie deine Hand. Generatoren mögen Tempo: ×2 pro Klick.' },
  { id: 'k_schwungrad', name: 'Schwungrad', branch: 'kurbel', cost: 90, epoch: 1, requires: ['k_uebersetzung'], effects: [{ type: 'clickMult', value: 2 }], why: 'Speichert Drehbewegung und glättet deine Kraft: ×2 pro Klick.' },
  { id: 'k_nabendynamo', name: 'Nabendynamo statt Seitenläufer', branch: 'kurbel', cost: 500, epoch: 1, requires: ['k_schwungrad'], effects: [{ type: 'clickMult', value: 2 }], why: 'Weniger Reibung: Mehr von deiner Kraft wird zu Strom. ×2 pro Klick.', lexicon: 'generator-prinzip' },
  { id: 'k_pct1', name: 'Kurbel am Hauptschalter', branch: 'kurbel', cost: 4000, epoch: 2, requires: ['k_nabendynamo'], effects: [{ type: 'clickPct', value: 0.01 }], why: 'Jeder Klick bringt zusätzlich 1 % deiner Einnahmen pro Sekunde.' },
  { id: 'k_pct2', name: 'Schwarzstart-Kurbel', branch: 'kurbel', cost: 3e6, epoch: 4, requires: ['k_pct1'], effects: [{ type: 'clickPct', value: 0.02 }], why: 'Nach einem Blackout kurbelst du den Park wieder an. +2 % der Einnahmen pro Klick.', lexicon: 'schwarzstart' },
  { id: 'k_pct3', name: 'Goldene Kurbel', branch: 'kurbel', cost: 8e8, epoch: 5, requires: ['k_pct2'], effects: [{ type: 'clickPct', value: 0.03 }], why: 'Opa Hinnerks Ehrenpreis. +3 % der Einnahmen pro Klick.' },

  // ---- Aerodynamik ----
  { id: 'a_profil', name: 'Profilierte Hinterkanten', branch: 'aerodynamik', cost: 6000, epoch: 2, effects: [{ type: 'cpMult', value: 1.04 }], why: 'Sägezahn-Kanten machen die Blätter leiser und effizienter: +4 % Leistungsbeiwert überall.', lexicon: 'betz' },
  { id: 'a_vortex', name: 'Vortex-Generatoren', branch: 'aerodynamik', cost: 3e6, epoch: 3, effects: [{ type: 'cpMult', value: 1.03 }], why: 'Kleine Finnen halten die Strömung länger am Blatt: +3 % Leistungsbeiwert.' },
  { id: 'a_erosion', name: 'Erosionsschutz an den Vorderkanten', branch: 'aerodynamik', cost: 6e7, epoch: 4, effects: [{ type: 'cpMult', value: 1.03 }], why: 'Regentropfen schlagen bei 300 km/h Blattspitzengeschwindigkeit wie Schrot ein. Schutzfolie hält das Profil glatt: +3 %.' },

  // ---- Regelung ----
  { id: 'r_lidar', name: 'LIDAR-Vorausschau', branch: 'regelung', cost: 4e7, epoch: 4, effects: [{ type: 'outputMult', value: 1.03 }], why: 'Ein Laser misst den Wind vor dem Rotor. Die Anlage stellt sich auf Böen ein: +3 % Ertrag.', lexicon: 'lidar' },
  { id: 'r_wake', name: 'Nachlaufsteuerung', branch: 'regelung', cost: 1.2e8, epoch: 4, effects: [{ type: 'wakeMult', value: 0.5 }], why: 'Vordere Anlagen drehen leicht schräg und lenken den Windschatten ab: halber Parkverlust.', lexicon: 'nachlauf' },

  // ---- Elektrik ----
  { id: 'e_kupfer', name: 'Kupfer statt Aluminium', branch: 'elektrik', cost: 300, epoch: 1, effects: [{ type: 'cableLossMult', value: 0.75 }], why: 'Kupfer leitet besser: −25 % Leitungsverluste.', lexicon: 'querschnitt' },
  { id: 'e_kuehlung', name: 'Lüfterkühlung für Trafos', branch: 'elektrik', cost: 6e5, epoch: 3, effects: [{ type: 'trafoHeatMult', value: 0.6 }], why: 'Lüfter am Ölkühler: Trafos vertragen Überlast deutlich länger.', lexicon: 'trafo' },

  // ---- Betrieb ----
  { id: 'b_werkzeug', name: 'Opas Werkzeugkiste', branch: 'betrieb', cost: 150, epoch: 1, effects: [{ type: 'repairSpeed', value: 1.5 }], why: 'Der richtige Schlüssel zur richtigen Zeit: Reparaturen 50 % schneller.' },
  { id: 'b_scada', name: 'Fernüberwachung (SCADA)', branch: 'betrieb', cost: 4e5, epoch: 3, effects: [{ type: 'autoRepair' }], why: 'Die Anlagen melden Schäden selbst und bestellen den Service – Reparaturen starten automatisch.' },
  { id: 'b_vertrag', name: 'Fernwartungsvertrag', branch: 'betrieb', cost: 2e6, epoch: 3, effects: [{ type: 'offlineHours', value: 24 }], why: 'Offline-Ertrag bis zu 24 statt 12 Stunden.' },
  { id: 'b_predictive', name: 'Vorausschauende Wartung', branch: 'betrieb', cost: 2.5e7, epoch: 4, effects: [{ type: 'maintMult', value: 0.6 }], why: 'Schwingungssensoren erkennen Lagerschäden Wochen im Voraus: −40 % Wartungskosten.' },
  { id: 'b_drohne', name: 'Drohneninspektion', branch: 'betrieb', cost: 8e7, epoch: 4, effects: [{ type: 'repairSpeed', value: 2 }], why: 'Drohnen fotografieren jedes Blatt in Minuten statt Industriekletterer in Tagen: Reparaturen doppelt so schnell.' },
  { id: 'b_sov', name: 'Service-Wohnschiff', branch: 'betrieb', cost: 1e9, epoch: 5, effects: [{ type: 'maintMult', value: 0.7 }, { type: 'repairSpeed', value: 2 }], why: '60 Techniker leben wochenlang draußen im Park. Weniger Anfahrt, schnellere Reparaturen.', lexicon: 'offshore-wartung' },

  // ---- Markt ----
  { id: 'm_prognose', name: 'Wetter- und Preisprognose', branch: 'markt', cost: 5000, epoch: 2, effects: [{ type: 'forecast' }], why: 'Zeigt Wind und Börsenpreis für die nächsten 24 Spielstunden.' },
  { id: 'm_oeko', name: 'Ökostrom-Label', branch: 'markt', cost: 20000, epoch: 2, effects: [{ type: 'revenueMult', value: 1.25 }], why: 'Kunden zahlen für nachweislich grünen Strom etwas mehr: +25 % Erlös.' },
  { id: 'm_direkt', name: 'Direktvermarktung', branch: 'markt', cost: 1.5e5, epoch: 3, effects: [{ type: 'unlockMarket', market: 'boerse' }], why: 'Ein Direktvermarkter verkauft deinen Strom an der Börse. Chancen und Risiken inklusive.', lexicon: 'boerse' },
  { id: 'm_neg', name: 'Abregeln bei negativen Preisen', branch: 'markt', cost: 5e5, epoch: 3, requires: ['m_direkt'], effects: [{ type: 'negCurtail' }], why: 'Bei negativem Preis speist der Park nicht ein – statt draufzuzahlen.', lexicon: 'negativpreis' },
  { id: 'm_regional', name: 'Regionalstrom Windhusen', branch: 'markt', cost: 8e6, epoch: 4, effects: [{ type: 'revenueMult', value: 1.3 }], why: 'Strom vom Deich für die Region: +30 % Erlös.' },
  { id: 'm_ppa', name: 'PPA-Abteilung', branch: 'markt', cost: 3e7, epoch: 4, effects: [{ type: 'unlockMarket', market: 'ppa' }], why: 'Langfristige Lieferverträge mit Industriekunden: fester Preis, kein Börsenrisiko.', lexicon: 'ppa' },
  { id: 'm_h2', name: 'Wasserstoff-Abnahmevertrag', branch: 'markt', cost: 2e9, epoch: 5, effects: [{ type: 'revenueMult', value: 1.5 }], why: 'Ein Elektrolyseur an der Küste nimmt Strom auch bei Überschuss ab: +50 % Erlös.', lexicon: 'elektrolyse' },

  // ---- Schutz ----
  { id: 's_blitz', name: 'Blitzschutz im Rotorblatt', branch: 'schutz', cost: 8000, epoch: 2, effects: [{ type: 'lightning' }], why: 'Metallrezeptoren leiten Blitze durch Turm und Fundament in die Erde.', lexicon: 'blitzschutz' },
  { id: 's_heizung', name: 'Rotorblattheizung', branch: 'schutz', cost: 1.5e6, epoch: 3, effects: [{ type: 'deicing' }], why: 'Heizmatten in den Blättern verhindern Eisansatz – kein Ertragsverlust bei Frost.', lexicon: 'vereisung' },

  // ---- Meilensteine ----
  { id: 'ms_garten5', name: 'Mundpropaganda', branch: 'meilenstein', cost: 150, epoch: 1, requireCount: { site: 'garten', count: 5 }, effects: [{ type: 'revenueMult', value: 1.5, site: 'garten' }], why: 'Fünf Windräder im Garten sprechen sich herum: +50 % Erlös im Garten.' },
  { id: 'ms_garten10', name: 'Windhusener Original', branch: 'meilenstein', cost: 2500, epoch: 1, requireCount: { site: 'garten', count: 10 }, effects: [{ type: 'revenueMult', value: 2, site: 'garten' }], why: 'Die Holzwindräder sind Kult. Touristen fotografieren sie: Erlös im Garten ×2.' },
  { id: 'ms_hof10', name: 'Hofladen-Strom', branch: 'meilenstein', cost: 15000, epoch: 2, requireCount: { site: 'hof', count: 10 }, effects: [{ type: 'revenueMult', value: 1.5, site: 'hof' }], why: 'Petersen verkauft Strom mit Hofladen-Stempel: +50 % am Hof.' },
  { id: 'ms_hof25', name: 'Maschinenring', branch: 'meilenstein', cost: 1.2e5, epoch: 2, requireCount: { site: 'hof', count: 25 }, effects: [{ type: 'revenueMult', value: 2, site: 'hof' }], why: 'Die Höfe der Umgebung teilen Service und Ersatzteile: Erlös am Hof ×2.' },
  { id: 'ms_deich10', name: 'Bürgerdividende', branch: 'meilenstein', cost: 8e5, epoch: 3, requireCount: { site: 'deich', count: 10 }, effects: [{ type: 'revenueMult', value: 1.5, site: 'deich' }, { type: 'permitSpeed', value: 2 }], why: 'Das ganze Dorf verdient mit – Genehmigungen gehen doppelt so schnell. +50 % am Deich.' },
  { id: 'ms_deich40', name: 'Energiedorf des Jahres', branch: 'meilenstein', cost: 1.2e7, epoch: 3, requireCount: { site: 'deich', count: 40 }, effects: [{ type: 'revenueMult', value: 2, site: 'deich' }], why: 'Windhusen gewinnt den Preis. Erlös am Deich ×2.' },
  { id: 'ms_geest30', name: 'Serienwartung', branch: 'meilenstein', cost: 8e7, epoch: 4, requireCount: { site: 'geest', count: 30 }, effects: [{ type: 'revenueMult', value: 1.5, site: 'geest' }], why: 'Dreißig gleiche Anlagen: Ersatzteile auf Lager, Service im Takt. +50 % auf der Geest.' },
  { id: 'ms_geest100', name: 'Industriepartnerschaft', branch: 'meilenstein', cost: 1e9, epoch: 4, requireCount: { site: 'geest', count: 100 }, effects: [{ type: 'revenueMult', value: 2, site: 'geest' }], why: 'Ein Chemiewerk bezieht den ganzen Park: Erlös auf der Geest ×2.' },
  { id: 'ms_nordsee50', name: 'Cluster Nordsee', branch: 'meilenstein', cost: 3e9, epoch: 5, requireCount: { site: 'nordsee', count: 50 }, effects: [{ type: 'revenueMult', value: 1.5, site: 'nordsee' }], why: 'Mehrere Parks teilen sich Plattform und Schiffe: +50 % offshore.' },
  { id: 'ms_nordsee200', name: 'Energieinsel', branch: 'meilenstein', cost: 3e10, epoch: 5, requireCount: { site: 'nordsee', count: 200 }, effects: [{ type: 'revenueMult', value: 2, site: 'nordsee' }], why: 'Eine künstliche Insel bündelt mehrere Gigawatt und verteilt sie an mehrere Länder: Erlös offshore ×2.' },
];

export const RESEARCH_BY_ID: Record<string, ResearchDef> = Object.fromEntries(RESEARCH.map((r) => [r.id, r]));
