// Deutsche Zahlenformate für Geld, Leistung und Energie.

const nf = (digits: number) =>
  new Intl.NumberFormat('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const NF0 = nf(0);
const NF1 = nf(1);
const NF2 = nf(2);

function scaled(value: number, units: Array<[number, string]>, base: string): string {
  const abs = Math.abs(value);
  for (const [f, u] of units) {
    if (abs >= f) {
      const x = value / f;
      const fmt = Math.abs(x) >= 100 ? NF0 : Math.abs(x) >= 10 ? NF1 : NF2;
      return `${fmt.format(x)} ${u}`;
    }
  }
  const fmt = abs >= 100 ? NF0 : abs >= 10 ? NF1 : NF2;
  return `${fmt.format(value)} ${base}`;
}

const MONEY_UNITS: Array<[number, string]> = [
  [1e15, 'Brd. €'],
  [1e12, 'Bio. €'],
  [1e9, 'Mrd. €'],
  [1e6, 'Mio. €'],
];

export function money(value: number): string {
  if (Math.abs(value) < 1e6) {
    const abs = Math.abs(value);
    if (abs < 10) return `${NF2.format(value)} €`;
    if (abs < 1000) return `${NF1.format(value)} €`;
    return `${NF0.format(value)} €`;
  }
  return scaled(value, MONEY_UNITS, '€');
}

/** Leistung, Eingabe in kW. */
export function power(kw: number): string {
  return scaled(
    kw * 1000,
    [
      [1e9, 'GW'],
      [1e6, 'MW'],
      [1e3, 'kW'],
    ],
    'W',
  );
}

/** Energie, Eingabe in kWh. */
export function energy(kwh: number): string {
  return scaled(
    kwh * 1000,
    [
      [1e12, 'TWh'],
      [1e9, 'GWh'],
      [1e6, 'MWh'],
      [1e3, 'kWh'],
    ],
    'Wh',
  );
}

export const percent = (x: number) => `${NF0.format(x * 100)} %`;
export const ct = (x: number) => `${NF1.format(x)} ct/kWh`;
export const num = (x: number, d = 0) => nf(d).format(x);

export function duration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${s % 60} s`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}
