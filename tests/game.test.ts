import { describe, expect, it } from 'vitest';
import { SITES } from '../src/data/sites';
import { createInitialState, Game } from '../src/sim/game';
import { emptyFlow, tickSite, DEFAULT_MODS } from '../src/sim/site';
import { boersePriceHourly, dayShape, frontFactor, hourOfDay } from '../src/sim/weather';
import { exportSave, importSave, migrate } from '../src/state/save';

function newGame(seed = 1) {
  return new Game(createInitialState(seed));
}

describe('Einstieg', () => {
  it('das erste Windrad ist nach 30–90 s aktivem Klicken (3 Klicks/s) kaufbar', () => {
    const g = newGame();
    let t = 0;
    while (g.state.sites.garten.count === 0 && t < 300) {
      for (let i = 0; i < 3; i++) g.click();
      if (!g.has('k_griff')) g.buyResearch('k_griff');
      g.buyTurbine('garten');
      g.tick(1);
      t++;
    }
    expect(g.state.sites.garten.count).toBe(1);
    expect(t).toBeGreaterThanOrEqual(30);
    expect(t).toBeLessThanOrEqual(90);
  });

  it('Kosten steigen mit jeder Anlage um den Wachstumsfaktor', () => {
    const g = newGame();
    g.state.money = 1e6;
    const c0 = g.turbineCost('garten');
    g.buyTurbine('garten');
    expect(g.turbineCost('garten') / c0).toBeCloseTo(SITES.garten.turbine.growth, 6);
  });

  it('nicht mehr Anlagen als der Standort fasst', () => {
    const g = newGame();
    g.state.money = 1e9;
    g.buyTurbine('garten', 50);
    expect(g.state.sites.garten.count).toBe(SITES.garten.turbine.maxCount);
  });
});

describe('Einseitiger Ausbau', () => {
  function stormGame(protection: number) {
    const g = newGame(3);
    const s = g.state.sites.garten;
    s.count = 4;
    s.parts.tower = 1;
    s.parts.control = 1; // Seitenfahne: Rotor bricht nicht
    s.protection = protection;
    const gh = g.state.gameHours;
    g.state.events = [{ kind: 'sturm', start: gh - 1, end: gh + 30, strength: 1.4, announced: true }];
    return g;
  }

  it('mehrere Holzwindräder am Klingeldraht brennen die Leitung bei Sturm durch', () => {
    const g = stormGame(0);
    for (let i = 0; i < 600 && !g.state.sites.garten.damage.some((d) => d.part === 'cable'); i++) g.tick(0.1);
    expect(g.state.sites.garten.damage.some((d) => d.part === 'cable')).toBe(true);
    expect(g.state.log.some((l) => l.text.includes('Leitung durchgeschmort'))).toBe(true);
  });

  it('eine Sicherung löst stattdessen aus – ohne Schaden', () => {
    const g = stormGame(1);
    for (let i = 0; i < 600 && !g.state.sites.garten.tripped; i++) g.tick(0.1);
    expect(g.state.sites.garten.tripped).toBe(true);
    expect(g.state.sites.garten.damage.length).toBe(0);
  });

  it('ein Regler kappt auf 100 % – kein Schaden, aber Abregelung', () => {
    const g = stormGame(3);
    for (let i = 0; i < 600; i++) g.tick(0.1);
    const s = g.state.sites.garten;
    expect(s.damage.length).toBe(0);
    expect(s.tripped).toBe(false);
    expect(s.curtailedKWh).toBeGreaterThan(0);
    const cable = g.flows.garten.links.find((l) => l.id === 'cable')!;
    expect(cable.load).toBeLessThanOrEqual(1.0001);
  });

  it('die Energiefluss-Leiste nennt das schwächste Glied', () => {
    const g = stormGame(3);
    g.state.sites.garten.protection = 0;
    g.tick(0.1);
    const f = g.flows.garten;
    const worst = [...f.links].filter((l) => l.id !== 'storage').sort((a, b) => b.load - a.load)[0];
    if (worst.load > 0.9) expect(f.bottleneck?.id).toBe(worst.id);
  });
});

describe('Strompreis', () => {
  it('ist abends im Mittel teurer als mittags', () => {
    expect(dayShape(19)).toBeGreaterThan(dayShape(13));
  });

  it('sinkt bei viel Wind (Merit-Order)', () => {
    let windy = 0;
    let calm = 0;
    let nw = 0;
    let nc = 0;
    for (let h = 0; h < 24 * 365; h++) {
      const f = frontFactor(h + 0.5, 9);
      const p = boersePriceHourly(h, 9, []);
      if (hourOfDay(h) !== 12) continue;
      if (f > 1.4) {
        windy += p;
        nw++;
      } else if (f < 0.7) {
        calm += p;
        nc++;
      }
    }
    expect(windy / nw).toBeLessThan(calm / nc);
  });

  it('ist deterministisch (Prognose = Realität)', () => {
    expect(boersePriceHourly(1234.2, 5, [])).toBe(boersePriceHourly(1234.9, 5, []));
  });

  it('Wind schwankt um einen Mittelwert nahe 1', () => {
    let sum = 0;
    const n = 24 * 365 * 2;
    for (let h = 0; h < n; h++) sum += frontFactor(h, 4);
    expect(sum / n).toBeGreaterThan(0.9);
    expect(sum / n).toBeLessThan(1.15);
  });
});

describe('Garten-Nachfrage und Speicher', () => {
  it('verkauft nie mehr, als die Nachbarn abnehmen', () => {
    const g = newGame(2);
    const s = g.state.sites.garten;
    s.count = 10;
    s.parts = { rotor: 3, tower: 3, foundation: 2, generator: 3, control: 2 };
    s.chain.cable = { tier: 3, level: 3, temp: 0, aging: 0 };
    s.protection = 3;
    const flow = emptyFlow();
    for (let i = 0; i < 2000; i++) {
      g.state.gameHours += 0.01;
      tickSite(SITES.garten, s, { gh: g.state.gameHours, dt: 0.1, seed: 2, events: [], mods: DEFAULT_MODS, offline: false }, flow);
      const demand = flow.links.find((l) => l.id === 'demand')!;
      expect(flow.soldKW).toBeLessThanOrEqual(demand.capKW + 1e-9);
    }
  });
});

describe('Offline und Speicherstand', () => {
  it('Offline-Fortschritt bringt Geld, ohne Schäden, und ist gedeckelt', () => {
    const g = newGame(4);
    const s = g.state.sites.garten;
    s.count = 5;
    s.parts.tower = 1;
    const rep = g.simulateOffline(48 * 3600);
    expect(rep.seconds).toBe(12 * 3600);
    expect(rep.euro).toBeGreaterThan(0);
    expect(s.damage.length).toBe(0);
  });

  it('Export und Import ergeben denselben Spielstand', () => {
    const g = newGame(5);
    g.state.money = 1234.5;
    g.state.sites.garten.count = 3;
    const back = importSave(exportSave(g.state))!;
    expect(back.money).toBe(1234.5);
    expect(back.sites.garten.count).toBe(3);
  });

  it('Migration ergänzt fehlende Felder', () => {
    const st = migrate({ seed: 7, money: 5 } as never);
    expect(st.sites.nordsee.chain.cable.tier).toBe(0);
    expect(st.stats.damages).toBe(0);
    expect(st.money).toBe(5);
  });
});

describe('Freischaltungen', () => {
  it('ein Standort braucht den vorherigen und eine Genehmigung', () => {
    const g = newGame(6);
    g.state.money = 1e12;
    expect(g.unlockSite('hof')).toBe(false); // Garten noch leer
    g.buyTurbine('garten');
    expect(g.unlockSite('hof')).toBe(true);
    expect(g.canBuild('hof')).toBe(false);
    for (let i = 0; i < 400; i++) g.tick(0.1);
    expect(g.canBuild('hof')).toBe(true);
  });

  it('Mittelspannung braucht zuerst die Trafostation', () => {
    const g = newGame(6);
    g.state.money = 1e12;
    g.state.sites.hof.unlocked = true;
    g.state.sites.hof.chain.cable.tier = 1;
    expect(g.slotTierNext('hof', 'cable')?.blocked).toBeTruthy();
    g.buySlotTier('hof', 'trafo');
    g.buySlotTier('hof', 'trafo');
    expect(g.slotTierNext('hof', 'cable')?.blocked).toBeFalsy();
  });
});
