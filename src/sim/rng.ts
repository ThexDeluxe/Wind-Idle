// Deterministischer Zufall: Seed-RNG und glattes Rauschen als Funktion der Zeit.

/** mulberry32 – kleiner, schneller Seed-Zufallsgenerator. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash zweier Ganzzahlen auf [0, 1). */
export function hash01(i: number, seed: number): number {
  let h = (Math.imul(i | 0, 374761393) + Math.imul(seed | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Glattes 1D-Wertrauschen in [0, 1]; `x` in Gitter-Einheiten. */
export function valueNoise(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash01(i, seed);
  const b = hash01(i + 1, seed);
  const s = f * f * (3 - 2 * f); // smoothstep
  return a + (b - a) * s;
}

/** Summe aus mehreren Oktaven, ungefähr in [0, 1]. */
export function fbm(x: number, seed: number, octaves = 3): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let freq = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(x * freq, seed + o * 1013);
    norm += amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return sum / norm;
}
