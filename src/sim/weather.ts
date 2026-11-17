// Wind- und Preismodell. Alles ist eine deterministische Funktion der Spielzeit,
// damit Prognosen, Tests und Offline-Berechnung dieselben Werte liefern.

import { fbm, valueNoise } from './rng';
import type { WeatherEvent } from './types';

/** Zeitraffer: 1 Echtsekunde = 6 Spielminuten = 0,1 Spielstunden. */
export const GAME_HOURS_PER_SECOND = 0.1;
/** Spielfaktor auf alle Erlöse (siehe Lexikon „Spielgeld“). */
export const GAME_FACTOR = 100;

export const hourOfDay = (gh: number) => ((gh % 24) + 24) % 24;
export const dayIndex = (gh: number) => Math.floor(gh / 24);
export const dayOfYear = (gh: number) => ((dayIndex(gh) % 365) + 365) % 365;
export const isWeekend = (gh: number) => dayIndex(gh) % 7 >= 5;

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

export function monthOf(gh: number): number {
  const d = dayOfYear(gh);
  let m = 0;
  for (let i = 0; i < 12; i++) if (d >= MONTH_START[i]) m = i;
  return m;
}

export function clockLabel(gh: number): string {
  const h = hourOfDay(gh);
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  const d = dayOfYear(gh);
  const m = monthOf(gh);
  const day = d - MONTH_START[m] + 1;
  return `${WEEKDAYS[dayIndex(gh) % 7]} ${day}. ${MONTHS[m]} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Jahreszeit: 1 im Hochwinter, -1 im Hochsommer. */
export const winterness = (gh: number) => Math.cos((2 * Math.PI * (dayOfYear(gh) - 15)) / 365);

// Streckung des fbm-Rauschens auf annähernd gleichverteilte Werte (empirisch bestimmt).
const SPREAD = 1.8;
// Skalierung der Weibull-Verteilung (k = 2), sodass der Mittelwert 1 ist: 1 / Γ(1,5).
const WEIBULL_C = 1.1284;

/** Großräumige Wetterlage: Faktor auf die mittlere Windgeschwindigkeit, ~Weibull(k=2), Mittel ≈ 1. */
export function frontFactor(gh: number, seed: number): number {
  const raw = fbm(gh / 18, seed + 11, 3);
  const u = Math.min(0.997, Math.max(0.003, 0.5 + (raw - 0.5) * SPREAD));
  const season = 1 + 0.12 * winterness(gh);
  // Untergrenze: Völlige Windstille ist selten und kurz – gut für den Spielfluss.
  return (0.25 + 0.75 * WEIBULL_C * Math.sqrt(-Math.log(1 - u))) * season;
}

/** Faktor durch aktive Wetter-Ereignisse. */
export function eventWindFactor(gh: number, events: WeatherEvent[]): number {
  let f = 1;
  for (const e of events) {
    if (gh < e.start || gh > e.end) continue;
    const x = (gh - e.start) / (e.end - e.start); // 0..1
    const bell = Math.sin(Math.PI * x);
    if (e.kind === 'sturm') f *= 1 + e.strength * bell;
    if (e.kind === 'flaute') f *= 1 - (1 - e.strength) * Math.min(1, bell * 2.5);
  }
  return f;
}

/** Böen: schnelles Rauschen pro Standort (Periode ~2,5 Echtsekunden). */
export function gustFactor(gh: number, seed: number, gust: number): number {
  const n = fbm(gh / 0.25, seed, 2);
  return 1 + gust * (2 * n - 1) * 1.2;
}

/** Tagesgang an Land: tagsüber etwas mehr Wind in Bodennähe. */
export const diurnalFactor = (gh: number, amp: number) =>
  1 + amp * Math.sin((2 * Math.PI * (hourOfDay(gh) - 8)) / 24);

/** Windgeschwindigkeit in Nabenhöhe h. */
export function windAt(
  gh: number,
  seed: number,
  siteSeed: number,
  wind: { v10: number; alpha: number; gust: number; diurnal: number },
  hubHeight: number,
  events: WeatherEvent[],
): number {
  const shear = Math.pow(hubHeight / 10, wind.alpha);
  const v =
    wind.v10 *
    shear *
    frontFactor(gh, seed) *
    eventWindFactor(gh, events) *
    diurnalFactor(gh, wind.diurnal) *
    gustFactor(gh, seed + siteSeed, wind.gust);
  return Math.max(0, v);
}

/** Windrichtung in Grad (nur Anzeige). */
export const windDirection = (gh: number, seed: number) => 200 + 140 * (valueNoise(gh / 40, seed + 77) - 0.5);

// ---------------- Strompreis ----------------

// Tagesprofil der Börse: Morgen- und Abendspitze, Mittagstal (Solar), Nachttal.
const DAY_SHAPE = [
  0.78, 0.74, 0.72, 0.72, 0.75, 0.85, 1.05, 1.25, 1.3, 1.15, 1.0, 0.9, 0.82, 0.8, 0.82, 0.9, 1.05, 1.25, 1.42, 1.45,
  1.3, 1.1, 0.95, 0.85,
];

export function dayShape(gh: number): number {
  const h = hourOfDay(gh);
  const i = Math.floor(h);
  const f = h - i;
  return DAY_SHAPE[i] * (1 - f) + DAY_SHAPE[(i + 1) % 24] * f;
}

/** Börsenpreis in ct/kWh. Viel Wind drückt den Preis (Merit-Order). */
export function boersePrice(gh: number, seed: number, events: WeatherEvent[]): number {
  const front = frontFactor(gh, seed) * eventWindFactor(gh, events);
  const season = 1 + 0.12 * winterness(gh);
  let p = 9 * dayShape(gh) * season * (1 - 0.5 * (front - 0.9));
  // stündliches Rauschen (Day-Ahead: konstant pro Spielstunde)
  p += (valueNoise(Math.floor(gh), seed + 303) - 0.5) * 2.4;
  // Sonniger, windiger Feiertag/Wochenende: negative Preise zur Mittagszeit
  const h = hourOfDay(gh);
  if (isWeekend(gh) && h >= 10 && h <= 16 && front > 1.35) p -= (front - 1.35) * 12;
  for (const e of events) {
    if (e.kind === 'preisspitze' && gh >= e.start && gh <= e.end) p *= e.strength;
  }
  return Math.max(-10, Math.min(60, p));
}

/** Day-Ahead: Börsenpreis ist innerhalb einer Spielstunde konstant. */
export const boersePriceHourly = (gh: number, seed: number, events: WeatherEvent[]) =>
  boersePrice(Math.floor(gh) + 0.5, seed, events);

// Nachbarschaft: Nachfrageprofil (relativ, Mittel ≈ 1) und Preis.
const DEMAND_SHAPE = [
  0.35, 0.3, 0.3, 0.3, 0.35, 0.5, 0.75, 1.0, 0.9, 0.7, 0.65, 0.7, 0.9, 0.85, 0.7, 0.7, 0.9, 1.15, 1.6, 1.85, 1.85, 1.6,
  1.15, 0.65,
];
const DEMAND_NORM = DEMAND_SHAPE.reduce((a, b) => a + b, 0) / 24;

export function demandShape(gh: number): number {
  const h = hourOfDay(gh);
  const i = Math.floor(h);
  const f = h - i;
  return (DEMAND_SHAPE[i] * (1 - f) + DEMAND_SHAPE[(i + 1) % 24] * f) / DEMAND_NORM;
}

export function neighbourPrice(gh: number): number {
  const h = hourOfDay(gh);
  return h >= 18 && h < 22 ? 50 : 40;
}
