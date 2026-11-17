// Gemeinsame Typen für Daten (Konfiguration) und Spielstand.

export type SiteId = 'garten' | 'hof' | 'deich' | 'geest' | 'nordsee';
export const SITE_IDS: SiteId[] = ['garten', 'hof', 'deich', 'geest', 'nordsee'];

export type PartId = 'rotor' | 'tower' | 'foundation' | 'generator' | 'control';
export const PART_IDS: PartId[] = ['rotor', 'tower', 'foundation', 'generator', 'control'];

export type SlotId = 'cable' | 'trafo' | 'grid';
export const SLOT_IDS: SlotId[] = ['cable', 'trafo', 'grid'];

export type MarketId = 'nachbarn' | 'verguetung' | 'boerse' | 'ppa';

/** Gemeinsame Felder aller kaufbaren Stufen. */
export interface TierBase {
  name: string;
  cost: number;
  /** Ein Satz „Warum?“ – erscheint im Shop. */
  why: string;
  /** Lexikon-Karte, die beim Kauf freigeschaltet wird. */
  lexicon?: string;
}

export interface RotorTier extends TierBase {
  diameter: number; // m
  cp: number; // Leistungsbeiwert
}

export interface TowerTier extends TierBase {
  height: number; // Nabenhöhe in m
  needsFoundation: number; // Mindest-Fundamentstufe
}

export type FoundationTier = TierBase;

export interface GeneratorTier extends TierBase {
  ratedKW: number;
  eff: number; // Wirkungsgrad Triebstrang + Generator + Umrichter
}

export type ControlKind = 'none' | 'furl' | 'stall' | 'pitch';

export interface ControlTier extends TierBase {
  kind: ControlKind;
  /** none: ab dieser Windgeschwindigkeit bricht der Rotor. */
  breakAt?: number;
  /** furl: ab hier dreht die Seitenfahne den Rotor aus dem Wind. */
  furlAt?: number;
  /** stall: Strömungsabriss begrenzt auf die Leistung bei dieser Windgeschwindigkeit. */
  stallAt?: number;
  /** Sturmabschaltung. */
  cutOut?: number;
  /** Zusätzlicher Ertrag (z. B. Azimut-Nachführung). */
  bonus?: number;
}

export interface ChainTier extends TierBase {
  capacityKW: number;
  /** Verlustanteil bei Nennlast (I²R). Bei Teillast proportional kleiner. */
  lossAtRated: number;
  voltage: string; // Anzeige, z. B. „12 V“
  /** Preis der ersten Kapazitätsverdopplung; jede weitere ×2,5. */
  levelCost: number;
  levelName: string;
  /** Benötigt eine Mindeststufe eines anderen Glieds. */
  requires?: { slot: SlotId; tier: number };
}

export type ProtectionMode = 'none' | 'fuse' | 'breaker' | 'regulator';

export interface ProtectionTier extends TierBase {
  mode: ProtectionMode;
}

export interface StorageTier extends TierBase {
  capacityKWh: number;
  powerKW: number;
  eff: number; // Rundlauf-Wirkungsgrad
  levelCost: number;
}

export interface CustomerDef {
  name: string;
  addKW: number; // mittlere Nachfrage
  cost: number;
  why: string;
}

export interface SiteDef {
  id: SiteId;
  epoch: number;
  name: string;
  place: string;
  unlockCost: number;
  permitSeconds: number;
  unlockText: string;
  wind: {
    v10: number; // mittlere Windgeschwindigkeit in 10 m Höhe
    alpha: number; // Rauigkeitsexponent
    gust: number; // Böigkeit (0..1)
    diurnal: number; // Tagesgang-Amplitude
  };
  turbine: {
    name: string;
    style: 'wood' | 'small' | 'classic' | 'modern' | 'offshore';
    baseCost: number;
    growth: number;
    maxCount: number;
    cutIn: number;
  };
  parts: {
    rotor: RotorTier[];
    tower: TowerTier[];
    foundation: FoundationTier[];
    generator: GeneratorTier[];
    control: ControlTier[];
  };
  chain: {
    cable: ChainTier[];
    trafo?: ChainTier[];
    grid?: ChainTier[];
  };
  protection: ProtectionTier[];
  storage: StorageTier[];
  markets: MarketId[];
  /** Nachbarschaft: Grundnachfrage + Kunden. */
  demand?: { baseKW: number; baseName: string; customers: CustomerDef[] };
  /** Hof: Eigenverbrauch zu Haushaltspreis. */
  selfUse?: { kW: number; priceCt: number };
  /** Fester Vergütungssatz (ct/kWh). */
  feedInCt?: number;
  wakeLoss: number;
  maintenance: number; // Anteil der Erlöse
  repairSeconds: number;
}

// ---------- Spielstand ----------

export interface SlotState {
  tier: number;
  level: number;
  temp: number; // 0..1, ab 1 Schaden
  aging: number; // dauerhafter Kapazitätsverlust (Trafo), 0..0.3
}

export interface Damage {
  part: 'generator' | 'rotor' | SlotId;
  /** Restzeit der Reparatur in Echtsekunden; -1 = wartet auf Auftrag. */
  remaining: number;
  cost: number;
}

export interface StorageState {
  tier: number; // -1 = keiner
  level: number;
  soc: number; // kWh
  chargeBelow: number; // ct/kWh
  dischargeAbove: number; // ct/kWh
}

export interface SiteState {
  unlocked: boolean;
  permitLeft: number; // Sekunden bis Baugenehmigung
  count: number;
  parts: Record<PartId, number>;
  chain: Record<SlotId, SlotState>;
  genTemp: number;
  protection: number;
  tripped: boolean;
  damage: Damage[];
  storage: StorageState;
  market: MarketId;
  customers: number;
  energyKWh: number;
  revenue: number;
  curtailedKWh: number;
}

export interface WeatherEvent {
  kind: 'sturm' | 'flaute' | 'preisspitze' | 'netzengpass' | 'vereisung' | 'gewitter';
  start: number; // Spielstunde
  end: number;
  strength: number;
  announced: boolean;
}

export interface GameState {
  version: number;
  seed: number;
  money: number;
  totalEarned: number;
  energyTotalKWh: number;
  lifetimeEnergyKWh: number;
  gameHours: number;
  realSeconds: number;
  clicks: number;
  clickEnergyKWh: number;
  sites: Record<SiteId, SiteState>;
  research: string[];
  lexicon: string[];
  achievements: string[];
  seenHints: string[];
  events: WeatherEvent[];
  nextEventCheck: number;
  knowhow: number;
  prestigeCount: number;
  lastSaved: number;
  log: LogEntry[];
  settings: { sound: boolean; reducedMotion: boolean };
  peakKW: number;
  stats: {
    overloadFreeHours: number;
    maxWind: number;
    stormsSurvived: number;
    negativeSeen: number;
    damages: number;
    lastDay: number;
  };
}

export interface LogEntry {
  t: number; // Spielstunde
  text: string;
  kind: 'opa' | 'info' | 'warn' | 'damage' | 'event' | 'success';
}
