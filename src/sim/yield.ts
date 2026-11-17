// Ertragsprognose: mittlere Leistung einer Anlage über ein Spieljahr (für Shop-Anzeige und Bot).

import { turbinePower } from './physics';
import type { PartId, SiteDef } from './types';
import { windAt } from './weather';

const SAMPLE_SEED = 777;
const samples = new Map<string, Float64Array>();
const q98 = new Map<string, number>();

/** 98-%-Quantil der Windgeschwindigkeit in 10 m Höhe („Starkwind“, ohne Stürme). */
export function strongWind10(def: SiteDef): number {
  let q = q98.get(def.id);
  if (q === undefined) {
    const sorted = Array.from(windSamples(def)).sort((a, b) => a - b);
    q = sorted[Math.floor(sorted.length * 0.98)];
    q98.set(def.id, q);
  }
  return q;
}

/** Starkwind an der Nabe für eine Turmhöhe. */
export function strongWindAt(def: SiteDef, hubHeight: number): number {
  return strongWind10(def) * Math.pow(hubHeight / 10, def.wind.alpha);
}

/** Windgeschwindigkeiten in 10 m Höhe über ein Spieljahr (ohne Ereignisse). */
function windSamples(def: SiteDef): Float64Array {
  let arr = samples.get(def.id);
  if (!arr) {
    const n = 3000;
    arr = new Float64Array(n);
    for (let i = 0; i < n; i++) arr[i] = windAt((i * 8760) / n + 0.13 * i, SAMPLE_SEED, 11 * i, def.wind, 10, []);
    samples.set(def.id, arr);
  }
  return arr;
}

export interface YieldEstimate {
  /** Mittlere elektrische Leistung pro Anlage (kW), Überlast-Ausfälle grob berücksichtigt. */
  avgKW: number;
  /** Kapazitätsfaktor bezogen auf die Generator-Nennleistung. */
  cf: number;
  /** Anteil der Zeit, in der der Generator über 100 % läuft. */
  overloadShare: number;
  /** Mittlere Windgeschwindigkeit an der Nabe. */
  meanWind: number;
}

const cache = new Map<string, YieldEstimate>();

export function expectedYield(
  def: SiteDef,
  parts: Record<PartId, number>,
  cpMult = 1,
  outputMult = 1,
  regulated = false,
): YieldEstimate {
  const key = `${def.id}|${parts.rotor}${parts.tower}${parts.generator}${parts.control}|${cpMult.toFixed(4)}|${outputMult}|${regulated}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const rotor = def.parts.rotor[parts.rotor];
  const tower = def.parts.tower[parts.tower];
  const gen = def.parts.generator[parts.generator];
  const ctl = def.parts.control[parts.control];
  const shear = Math.pow(tower.height / 10, def.wind.alpha);
  const ws = windSamples(def);
  let sum = 0;
  let over = 0;
  let vsum = 0;
  for (let i = 0; i < ws.length; i++) {
    const v = ws[i] * shear;
    vsum += v;
    const r = turbinePower(rotor, gen, ctl, def.turbine.cutIn, v, cpMult);
    let mech = r.mechKW * outputMult;
    if (mech > gen.ratedKW * 1.0001) {
      over++;
      // Überlast: Mit Regler gekappt, sonst grob halbe Ausbeute durch Abschaltungen
      mech = regulated ? gen.ratedKW : mech * 0.5;
    }
    if (r.rotorBreak) mech = 0;
    sum += mech * gen.eff;
  }
  const avgKW = sum / ws.length;
  const est: YieldEstimate = {
    avgKW,
    cf: avgKW / gen.ratedKW,
    overloadShare: over / ws.length,
    meanWind: vsum / ws.length,
  };
  cache.set(key, est);
  return est;
}
