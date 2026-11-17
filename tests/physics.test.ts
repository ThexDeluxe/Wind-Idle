import { describe, expect, it } from 'vitest';
import { SITES } from '../src/data/sites';
import { aeroPowerKW, BETZ, heat, ratedWindSpeed, turbinePower } from '../src/sim/physics';

describe('Leistung im Wind', () => {
  it('folgt P = ½ ρ A v³ cp', () => {
    // 1 m² Fläche (D = 2/√π), 10 m/s, cp 1 → 0,5 · 1,225 · 1000 W = 612,5 W
    const d = 2 / Math.sqrt(Math.PI);
    expect(aeroPowerKW(d, 1, 10)).toBeCloseTo(0.6125, 4);
  });

  it('doppelter Durchmesser = vierfache Leistung', () => {
    expect(aeroPowerKW(20, 0.4, 8) / aeroPowerKW(10, 0.4, 8)).toBeCloseTo(4, 6);
  });

  it('doppelte Windgeschwindigkeit = achtfache Leistung', () => {
    expect(aeroPowerKW(10, 0.4, 10) / aeroPowerKW(10, 0.4, 5)).toBeCloseTo(8, 6);
  });

  it('kein Rotor überschreitet die Betz-Grenze', () => {
    expect(BETZ).toBeCloseTo(0.593, 3);
    for (const def of Object.values(SITES)) for (const r of def.parts.rotor) expect(r.cp).toBeLessThan(BETZ);
  });
});

describe('Leistungskurve und Regelung', () => {
  const d = SITES.deich;
  const rotor = d.parts.rotor[1];
  const gen = d.parts.generator[1];
  const pitch = d.parts.control[1];

  it('steht unter der Anlaufgeschwindigkeit', () => {
    expect(turbinePower(rotor, gen, pitch, 3, 2.5).mechKW).toBe(0);
  });

  it('Pitch begrenzt exakt auf Nennleistung', () => {
    const r = turbinePower(rotor, gen, pitch, 3, 18);
    expect(r.mechKW).toBeCloseTo(gen.ratedKW, 6);
    expect(r.mode).toBe('nennlast');
  });

  it('schaltet bei Sturm ab', () => {
    expect(turbinePower(rotor, gen, pitch, 3, 26).mode).toBe('abgeschaltet');
  });

  it('ohne Regelung überschreitet der Rotor die Generatorleistung und bricht im Sturm', () => {
    const g = SITES.garten;
    const r = turbinePower(g.parts.rotor[0], g.parts.generator[0], g.parts.control[0], 2.5, 12);
    expect(r.mechKW).toBeGreaterThan(g.parts.generator[0].ratedKW);
    expect(turbinePower(g.parts.rotor[0], g.parts.generator[0], g.parts.control[0], 2.5, 16).rotorBreak).toBe(true);
  });

  it('Seitenfahne klappt den Rotor aus dem Wind', () => {
    const g = SITES.garten;
    const r = turbinePower(g.parts.rotor[0], g.parts.generator[0], g.parts.control[1], 2.5, 14);
    expect(r.mode).toBe('gerefft');
    expect(r.rotorBreak).toBe(false);
  });

  it('Nennwindgeschwindigkeiten moderner Anlagen liegen bei 9–13 m/s', () => {
    for (const id of ['geest', 'nordsee'] as const) {
      const def = SITES[id];
      for (let i = 0; i < def.parts.rotor.length; i++) {
        const v = ratedWindSpeed(def.parts.rotor[i], def.parts.generator[i]);
        expect(v).toBeGreaterThan(9);
        expect(v).toBeLessThan(13);
      }
    }
  });
});

describe('Thermik', () => {
  it('heizt bei Überlast, kühlt bei Teillast', () => {
    let t = 0;
    for (let i = 0; i < 20; i++) t = heat(t, 1.3, 0.1, 0.6, 0.12);
    expect(t).toBeGreaterThan(0.5);
    const hot = t;
    for (let i = 0; i < 50; i++) t = heat(t, 0.5, 0.1, 0.6, 0.12);
    expect(t).toBeLessThan(hot);
  });

  it('bei Nennlast entsteht keine zusätzliche Wärme', () => {
    expect(heat(0, 1, 1, 0.6, 0.12)).toBe(0);
  });
});
