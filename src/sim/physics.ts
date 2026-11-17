// Physik der Windkraftanlage: Leistung im Wind, Leistungskurve, Regelung.

import type { ControlTier, GeneratorTier, RotorTier } from './types';

export const RHO = 1.225; // Luftdichte kg/m³
export const BETZ = 16 / 27; // ≈ 0,593

/** Mechanische Leistung des Rotors in kW: P = ½ · ρ · A · v³ · cp. */
export function aeroPowerKW(diameter: number, cp: number, v: number): number {
  const area = Math.PI * (diameter / 2) ** 2;
  return (0.5 * RHO * area * v * v * v * cp) / 1000;
}

export type TurbineMode = 'still' | 'teillast' | 'nennlast' | 'gerefft' | 'abgeschaltet' | 'kaputt';

export interface TurbineResult {
  /** Mechanische Leistung pro Anlage (kW), Eingang des Generators. */
  mechKW: number;
  /** Ohne Regelung: dieser Wind bricht den Rotor. */
  rotorBreak: boolean;
  mode: TurbineMode;
}

/** Leistung einer Anlage bei Windgeschwindigkeit v (Nabenhöhe). */
export function turbinePower(
  rotor: RotorTier,
  gen: GeneratorTier,
  control: ControlTier,
  cutIn: number,
  v: number,
  cpMult = 1,
): TurbineResult {
  const cp = Math.min(BETZ * 0.95, rotor.cp * cpMult);
  const p = (vv: number) => aeroPowerKW(rotor.diameter, cp, vv) * (1 + (control.bonus ?? 0));
  if (v < cutIn) return { mechKW: 0, rotorBreak: false, mode: 'still' };
  switch (control.kind) {
    case 'none': {
      const mech = p(v);
      return {
        mechKW: mech,
        rotorBreak: v > (control.breakAt ?? 99),
        mode: mech > gen.ratedKW ? 'nennlast' : 'teillast',
      };
    }
    case 'furl': {
      const at = control.furlAt ?? 10;
      if (v > at) return { mechKW: p(at) * 0.6, rotorBreak: false, mode: 'gerefft' };
      return { mechKW: p(v), rotorBreak: false, mode: 'teillast' };
    }
    case 'stall': {
      if (v > (control.cutOut ?? 25)) return { mechKW: 0, rotorBreak: false, mode: 'abgeschaltet' };
      const cap = p(control.stallAt ?? 12);
      const mech = Math.min(p(v), cap);
      return { mechKW: mech, rotorBreak: false, mode: mech >= cap * 0.98 ? 'nennlast' : 'teillast' };
    }
    case 'pitch': {
      if (v > (control.cutOut ?? 25)) return { mechKW: 0, rotorBreak: false, mode: 'abgeschaltet' };
      const mech = Math.min(p(v), gen.ratedKW);
      return { mechKW: mech, rotorBreak: false, mode: mech >= gen.ratedKW * 0.98 ? 'nennlast' : 'teillast' };
    }
  }
}

/** Windgeschwindigkeit, bei der eine Anlage ihre Generator-Nennleistung erreicht. */
export function ratedWindSpeed(rotor: RotorTier, gen: GeneratorTier, cpMult = 1): number {
  const cp = Math.min(BETZ * 0.95, rotor.cp * cpMult);
  const area = Math.PI * (rotor.diameter / 2) ** 2;
  return Math.cbrt((gen.ratedKW * 1000) / (0.5 * RHO * area * cp));
}

/** Thermik: Temperatur steigt bei Auslastung u > 1 mit u² − 1 und kühlt sonst ab. */
export function heat(temp: number, load: number, dt: number, a: number, b: number): number {
  const next = temp + dt * (a * Math.max(0, load * load - 1) - b * temp);
  return Math.max(0, next);
}

export const THERMAL = {
  generator: { a: 0.25, b: 0.06 },
  cable: { a: 0.6, b: 0.12 },
  trafo: { a: 0.09, b: 0.025 },
} as const;
