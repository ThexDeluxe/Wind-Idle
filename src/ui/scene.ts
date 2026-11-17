// Canvas-Szene: Landschaft je Standort, Windräder, Wetter, Energiefluss.

import { SITES } from '../data/sites';
import type { Game } from '../sim/game';
import { hash01 } from '../sim/rng';
import type { SiteId } from '../sim/types';
import { hourOfDay } from '../sim/weather';

type RGB = [number, number, number];

const SKY: Array<[number, RGB, RGB]> = [
  [0, [10, 20, 42], [28, 44, 78]],
  [4.5, [12, 24, 50], [36, 52, 88]],
  [6, [70, 90, 140], [245, 170, 110]],
  [7.5, [110, 170, 220], [230, 225, 205]],
  [12, [92, 166, 222], [205, 232, 246]],
  [17, [100, 160, 215], [225, 225, 210]],
  [19.3, [80, 90, 150], [245, 140, 95]],
  [20.8, [26, 36, 72], [70, 70, 110]],
  [24, [10, 20, 42], [28, 44, 78]],
];

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function mix(a: RGB, b: RGB, t: number): RGB {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}
const rgb = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

function sky(h: number): [RGB, RGB] {
  for (let i = 0; i < SKY.length - 1; i++) {
    const [h0, t0, b0] = SKY[i];
    const [h1, t1, b1] = SKY[i + 1];
    if (h >= h0 && h <= h1) {
      const t = (h - h0) / (h1 - h0);
      return [mix(t0, t1, t), mix(b0, b1, t)];
    }
  }
  return [SKY[0][1], SKY[0][2]];
}

/** 0 = Tag, 1 = tiefe Nacht */
function nightness(h: number): number {
  if (h >= 7.5 && h <= 18.5) return 0;
  if (h >= 21 || h <= 4.5) return 1;
  if (h < 7.5) return 1 - (h - 4.5) / 3;
  return (h - 18.5) / 2.5;
}

interface Slot {
  x: number;
  y: number;
  s: number; // Maßstab (Tiefe)
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  kind: 'spark' | 'smoke';
}

const VISIBLE: Record<SiteId, number> = { garten: 10, hof: 12, deich: 16, geest: 26, nordsee: 32 };

export class Scene {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private angle: Record<SiteId, number> = { garten: 0, hof: 0, deich: 0, geest: 0, nordsee: 0 };
  private omega: Record<SiteId, number> = { garten: 0, hof: 0, deich: 0, geest: 0, nordsee: 0 };
  private clouds: Array<{ x: number; y: number; s: number }> = [];
  private particles: Particle[] = [];
  private flash = 0;
  private flashTimer = 3;
  private t = 0;
  reducedMotion = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    for (let i = 0; i < 7; i++) this.clouds.push({ x: hash01(i, 5) * 1.4, y: 0.05 + hash01(i, 9) * 0.28, s: 0.6 + hash01(i, 13) * 0.9 });
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
  }

  render(game: Game, site: SiteId, dt: number) {
    const ctx = this.ctx;
    if (this.canvas.width === 0) this.resize();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.t += dt;
    const W = this.w;
    const H = this.h;
    const gh = game.state.gameHours;
    const hod = hourOfDay(gh);
    const night = nightness(hod);
    const flow = game.flows[site];
    const v = flow.v || 0;
    const events = game.state.events.filter((e) => gh >= e.start && gh <= e.end);
    const storm = events.some((e) => e.kind === 'sturm') || v > 17;
    const thunder = events.some((e) => e.kind === 'gewitter');
    const ice = events.some((e) => e.kind === 'vereisung') && !game.hasEffect('deicing');

    // Himmel
    const [top, bottom] = sky(hod);
    const dim = storm || thunder ? 0.65 : 1;
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.75);
    g.addColorStop(0, rgb(mix([40, 50, 60], top, dim)));
    g.addColorStop(1, rgb(mix([90, 100, 110], bottom, dim)));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Sterne
    if (night > 0.3) {
      ctx.fillStyle = `rgba(255,255,240,${(night - 0.3) * 1.2})`;
      for (let i = 0; i < 70; i++) {
        const x = hash01(i, 21) * W;
        const y = hash01(i, 33) * H * 0.5;
        const tw = 0.6 + 0.4 * Math.sin(this.t * 1.5 + i);
        ctx.fillRect(x, y, 1.4 * tw, 1.4 * tw);
      }
    }
    // Sonne / Mond
    if (hod > 5.5 && hod < 20.5) {
      const p = (hod - 5.5) / 15;
      const sx = W * (0.08 + 0.84 * p);
      const sy = H * (0.55 - 0.45 * Math.sin(Math.PI * p));
      ctx.fillStyle = `rgba(255,${200 + 40 * Math.sin(Math.PI * p)},120,${dim * 0.95})`;
      ctx.beginPath();
      ctx.arc(sx, sy, Math.min(W, H) * 0.035, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const p = ((hod + 24 - 20.5) % 24) / 9;
      const mx = W * (0.1 + 0.8 * p);
      const my = H * (0.5 - 0.38 * Math.sin(Math.PI * Math.min(1, p)));
      ctx.fillStyle = 'rgba(240,240,225,0.9)';
      ctx.beginPath();
      ctx.arc(mx, my, Math.min(W, H) * 0.025, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgb(top);
      ctx.beginPath();
      ctx.arc(mx + Math.min(W, H) * 0.01, my - 2, Math.min(W, H) * 0.022, 0, Math.PI * 2);
      ctx.fill();
    }

    // Wolken ziehen mit dem Wind
    const cloudSpeed = (0.004 + v * 0.0018) * (this.reducedMotion ? 0.3 : 1);
    const cloudCol = storm || thunder ? [120, 125, 135] : night > 0.5 ? [70, 80, 105] : [250, 250, 252];
    for (const c of this.clouds) {
      c.x += cloudSpeed * dt * c.s;
      if (c.x > 1.25) c.x = -0.3;
      this.cloud(c.x * W, c.y * H, c.s * Math.min(W, H) * 0.09, rgb(cloudCol as RGB, storm ? 0.95 : 0.85));
    }

    // Landschaft
    const horizon = site === 'nordsee' ? H * 0.58 : H * 0.7;
    this.landscape(site, W, H, horizon, night, game);

    // Windräder
    const s = game.state.sites[site];
    const def = SITES[site];
    const rotor = def.parts.rotor[s.parts.rotor];
    const tower = def.parts.tower[s.parts.tower];
    const running = s.count > 0 && !s.tripped && flow.mode !== 'still' && flow.mode !== 'abgeschaltet' && flow.mode !== 'kaputt' && s.permitLeft <= 0;
    const style = def.turbine.style;
    const speedK = { wood: 1.1, small: 0.7, classic: 0.28, modern: 0.17, offshore: 0.14 }[style];
    let target = running ? Math.min(14, v * speedK * (flow.mode === 'gerefft' ? 0.5 : 1)) : 0;
    if (this.reducedMotion) target *= 0.4;
    this.omega[site] += (target - this.omega[site]) * Math.min(1, dt * 0.8);
    this.angle[site] = (this.angle[site] + this.omega[site] * dt) % (Math.PI * 2);

    const slots = this.layout(site, s.count, W, H, horizon);
    const pxPerM = { garten: H * 0.05, hof: H * 0.011, deich: H * 0.0041, geest: H * 0.0024, nordsee: H * 0.0017 }[site];
    const hub = Math.min(H * 0.6, pxPerM * tower.height);
    const r = Math.min(hub * 0.9, (pxPerM * rotor.diameter) / 2);
    const cableLoad = flow.links.find((l) => l.id === 'cable')?.load ?? 0;
    const genLoad = flow.genLoad;
    const damagedRotor = s.damage.some((d) => d.part === 'rotor');
    const sink = this.sinkPoint(site, W, H, horizon);

    // Leitungen: im Garten/Hof sternförmig, im Park als Sammelleitungen je Reihe
    if (s.count > 0) {
      const broken = s.damage.some((d) => d.part === 'cable');
      const col = broken ? 'rgba(60,60,60,0.8)' : cableLoad > 1 ? '#ff4d3d' : cableLoad > 0.9 ? '#ffb02e' : '#ffd86b';
      const glow = broken ? 0 : Math.min(1, 0.25 + cableLoad * 0.75) * (running ? 1 : 0.2);
      const segs: Array<[number, number, number, number]> = [];
      if (site === 'garten' || site === 'hof') {
        for (const sl of slots) segs.push([sl.x, sl.y, sink.x, sink.y]);
      } else {
        const rows = new Map<number, Slot[]>();
        for (const sl of slots) {
          const k = Math.round(sl.y);
          if (!rows.has(k)) rows.set(k, []);
          rows.get(k)!.push(sl);
        }
        for (const [y, list] of rows) {
          const xs = list.map((l) => l.x);
          const x0 = Math.min(...xs);
          segs.push([Math.max(...xs), y, x0, y]);
          segs.push([x0, y, sink.x, sink.y]);
        }
      }
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(30,30,30,0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (const [x1, y1, x2, y2] of segs) {
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
      }
      ctx.stroke();
      if (glow > 0.05) {
        ctx.shadowColor = col;
        ctx.shadowBlur = 8 * glow;
        ctx.strokeStyle = col;
        ctx.globalAlpha = glow;
        ctx.lineWidth = 1.2 + Math.min(4, cableLoad * 3);
        ctx.setLineDash([10, 14]);
        ctx.lineDashOffset = -this.t * 40 * Math.min(2, cableLoad + 0.2);
        ctx.beginPath();
        for (const [x1, y1, x2, y2] of segs) {
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
        }
        ctx.stroke();
      }
      ctx.restore();
      if (cableLoad > 1 && running && !this.reducedMotion && Math.random() < dt * 20 * Math.min(2, cableLoad - 0.9)) {
        const sg = segs[Math.floor(Math.random() * segs.length)];
        const u = Math.random();
        this.spark(lerp(sg[0], sg[2], u), lerp(sg[1], sg[3], u));
      }
      if (broken && Math.random() < dt * 6) this.smoke(sink.x, sink.y - 4);
    }

    // Anlagen von hinten nach vorne
    const order = [...slots].sort((a, b) => a.y - b.y);
    const blink = Math.sin(this.t * 3) > 0.3;
    for (let i = 0; i < order.length; i++) {
      const sl = order[i];
      const phase = hash01(i, 77) * 0.6;
      this.turbine(sl.x, sl.y, hub * sl.s, r * sl.s, this.angle[site] + phase, style, {
        broken: damagedRotor,
        ice,
        night,
        light: blink && (style === 'modern' || style === 'offshore' || style === 'classic') && night > 0.3,
        vane: style === 'wood' && s.parts.control > 0,
        lattice: style === 'small' || (style === 'wood' && s.parts.tower === 3),
        furled: flow.mode === 'gerefft',
      });
      if (genLoad > 1.02 && running && !this.reducedMotion && Math.random() < dt * 6) this.spark(sl.x, sl.y - hub * sl.s);
      if (s.damage.some((d) => d.part === 'generator') && Math.random() < dt * 3) this.smoke(sl.x, sl.y - hub * sl.s);
    }
    if (s.count > slots.length) {
      ctx.fillStyle = night > 0.5 ? 'rgba(255,255,255,0.75)' : 'rgba(10,30,40,0.7)';
      ctx.font = `600 ${Math.max(11, H * 0.028)}px system-ui, sans-serif`;
      ctx.textAlign = 'right';
      ctx.fillText(`+ ${s.count - slots.length} weitere Anlagen`, W - 14, H - 12);
    }

    // Partikel
    this.particles = this.particles.filter((p) => (p.life -= dt) > 0);
    for (const p of this.particles) {
      p.x += p.vx * dt + (p.kind === 'smoke' ? v * 2 * dt : 0);
      p.y += p.vy * dt;
      if (p.kind === 'spark') {
        p.vy += 260 * dt;
        ctx.fillStyle = `rgba(255,${180 + Math.random() * 60},80,${Math.min(1, p.life * 3)})`;
        ctx.fillRect(p.x, p.y, 2.2, 2.2);
      } else {
        ctx.fillStyle = `rgba(70,70,70,${Math.min(0.45, p.life * 0.3)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4 + (2 - p.life) * 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Regen bei Sturm/Gewitter
    if ((storm || thunder) && !this.reducedMotion) {
      ctx.strokeStyle = 'rgba(200,215,230,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const slant = Math.min(0.9, v * 0.04);
      for (let i = 0; i < 90; i++) {
        const x = (hash01(i, 3) * W * 1.2 + this.t * 300 * slant) % (W * 1.2) - W * 0.1;
        const y = (hash01(i, 7) * H + this.t * 600) % H;
        ctx.moveTo(x, y);
        ctx.lineTo(x - 14 * slant, y + 16);
      }
      ctx.stroke();
    }
    if (thunder && !this.reducedMotion) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) {
        this.flash = 1;
        this.flashTimer = 2 + Math.random() * 6;
      }
    }
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.55})`;
      ctx.fillRect(0, 0, W, H);
      this.flash = Math.max(0, this.flash - dt * 3);
    }
    // Nacht-Abdunklung
    if (night > 0) {
      ctx.fillStyle = `rgba(5,10,30,${night * 0.35})`;
      ctx.fillRect(0, horizon - 20, W, H - horizon + 20);
    }
  }

  // ---------- Bausteine ----------

  private spark(x: number, y: number) {
    for (let i = 0; i < 4; i++)
      this.particles.push({ x, y, vx: (Math.random() - 0.5) * 120, vy: -Math.random() * 120, life: 0.4 + Math.random() * 0.3, kind: 'spark' });
  }
  private smoke(x: number, y: number) {
    this.particles.push({ x, y, vx: (Math.random() - 0.5) * 8, vy: -18 - Math.random() * 10, life: 2, kind: 'smoke' });
  }

  private cloud(x: number, y: number, r: number, col: string) {
    const c = this.ctx;
    c.fillStyle = col;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.arc(x + r * 0.9, y + r * 0.15, r * 0.75, 0, Math.PI * 2);
    c.arc(x - r * 0.9, y + r * 0.2, r * 0.65, 0, Math.PI * 2);
    c.arc(x + r * 0.2, y - r * 0.45, r * 0.6, 0, Math.PI * 2);
    c.fill();
  }

  private layout(site: SiteId, count: number, W: number, H: number, horizon: number): Slot[] {
    const n = Math.min(count, VISIBLE[site]);
    const out: Slot[] = [];
    if (n === 0) return out;
    if (site === 'garten') {
      for (let i = 0; i < n; i++) {
        const x = W * (0.36 + (0.58 * (i + 0.5)) / Math.max(n, 4)) + (hash01(i, 3) - 0.5) * W * 0.02;
        out.push({ x, y: horizon + H * (0.06 + (i % 2) * 0.05), s: 1 - (i % 2) * 0.12 });
      }
      return out;
    }
    const rows = site === 'hof' ? [[0.08, 1, 6], [0.02, 0.7, 6]] : site === 'deich' ? [[0.1, 1, 6], [0.03, 0.62, 10]] : site === 'geest' ? [[0.16, 1, 5], [0.07, 0.62, 8], [0.015, 0.38, 13]] : [[0.2, 1, 5], [0.1, 0.6, 9], [0.04, 0.36, 18]];
    let placed = 0;
    for (const [dy, s, cap] of rows) {
      const k = Math.min(cap, n - placed);
      for (let i = 0; i < k; i++) {
        const span = site === 'hof' ? 0.6 : 0.86;
        const x0 = site === 'hof' ? 0.32 : 0.07;
        const x = W * (x0 + (span * (i + 0.5)) / Math.max(k, 3)) + (hash01(placed + i, 9) - 0.5) * W * 0.03;
        out.push({ x, y: horizon + H * dy, s });
      }
      placed += k;
      if (placed >= n) break;
    }
    return out;
  }

  private sinkPoint(site: SiteId, W: number, H: number, horizon: number) {
    switch (site) {
      case 'garten':
        return { x: W * 0.17, y: horizon + H * 0.08 };
      case 'hof':
        return { x: W * 0.18, y: horizon + H * 0.1 };
      case 'deich':
        return { x: W * 0.04, y: horizon + H * 0.2 };
      case 'geest':
        return { x: W * 0.03, y: horizon + H * 0.25 };
      case 'nordsee':
        return { x: W * 0.06, y: horizon + H * 0.08 };
    }
  }

  private landscape(site: SiteId, W: number, H: number, hz: number, night: number, game: Game) {
    const c = this.ctx;
    const shade = (col: RGB) => rgb(mix(col, [20, 30, 50], night * 0.55));
    if (site === 'nordsee') {
      const sea = c.createLinearGradient(0, hz, 0, H);
      sea.addColorStop(0, shade([70, 130, 160]));
      sea.addColorStop(1, shade([20, 70, 100]));
      c.fillStyle = sea;
      c.fillRect(0, hz, W, H - hz);
      // Küste am Horizont links
      c.fillStyle = shade([110, 130, 120]);
      c.fillRect(0, hz - 3, W * 0.12, 3);
      // Wellen
      c.strokeStyle = `rgba(255,255,255,${0.15 + Math.min(0.3, (game.flows.nordsee.v || 0) * 0.015)})`;
      c.lineWidth = 1.2;
      for (let i = 0; i < 40; i++) {
        const y = hz + ((i * 37) % 100) / 100 * (H - hz);
        const x = (hash01(i, 41) * W + this.t * (8 + i % 5)) % W;
        const len = 10 + (y - hz) * 0.12;
        c.beginPath();
        c.moveTo(x, y);
        c.quadraticCurveTo(x + len / 2, y - 3, x + len, y);
        c.stroke();
      }
      // Umspannplattform
      const px = W * 0.06;
      const py = hz + this.h * 0.08;
      c.fillStyle = shade([230, 200, 60]);
      c.fillRect(px - 2, py - 18, 4, 18);
      c.fillRect(px + 22, py - 18, 4, 18);
      c.fillStyle = shade([235, 235, 235]);
      c.fillRect(px - 8, py - 34, 40, 18);
      c.fillStyle = shade([200, 60, 50]);
      c.fillRect(px + 20, py - 40, 10, 6);
      // Schiff
      const sx = ((this.t * 6) % (W + 200)) - 100;
      c.fillStyle = shade([40, 50, 60]);
      c.fillRect(sx, hz + H * 0.03, 34, 5);
      c.fillStyle = shade([240, 240, 240]);
      c.fillRect(sx + 20, hz + H * 0.03 - 8, 10, 8);
      return;
    }
    if (site === 'geest') {
      for (let k = 0; k < 3; k++) {
        c.fillStyle = shade(([[150, 185, 120], [120, 165, 95], [95, 145, 75]] as RGB[])[k]);
        c.beginPath();
        c.moveTo(0, H);
        for (let x = 0; x <= W; x += 20) c.lineTo(x, hz + k * H * 0.06 - Math.sin(x / W * 5 + k * 2) * H * 0.025);
        c.lineTo(W, H);
        c.fill();
      }
      this.substation(W * 0.03, hz + H * 0.25, 1.1, shade);
      return;
    }
    // Wiese
    c.fillStyle = shade(site === 'deich' ? [120, 170, 100] : [110, 170, 90]);
    c.fillRect(0, hz, W, H - hz);
    if (site === 'deich') {
      // Meer hinter dem Deich, Deichlinie
      c.fillStyle = shade([90, 140, 170]);
      c.fillRect(0, hz - H * 0.03, W, H * 0.03);
      c.fillStyle = shade([95, 150, 85]);
      c.beginPath();
      c.moveTo(0, hz + 2);
      c.quadraticCurveTo(W * 0.5, hz - H * 0.05, W, hz + 2);
      c.fill();
      c.fillStyle = shade([245, 245, 240]);
      for (let i = 0; i < 9; i++) {
        const x = hash01(i, 55) * W;
        const y = hz + H * (0.12 + hash01(i, 66) * 0.18);
        c.beginPath();
        c.ellipse(x, y, 5, 3.4, 0, 0, Math.PI * 2);
        c.fill();
      }
      this.substation(W * 0.04, hz + H * 0.2, 0.8, shade);
      return;
    }
    if (site === 'hof') {
      c.fillStyle = shade([200, 190, 110]);
      for (let i = 0; i < 6; i++) c.fillRect(W * 0.3, hz + H * 0.03 + i * H * 0.045, W * 0.7, H * 0.018);
      // Scheune
      const bx = W * 0.05;
      const by = hz + H * 0.12;
      c.fillStyle = shade([170, 50, 40]);
      c.fillRect(bx, by - H * 0.14, W * 0.16, H * 0.14);
      c.fillStyle = shade([90, 40, 35]);
      c.beginPath();
      c.moveTo(bx - 6, by - H * 0.14);
      c.lineTo(bx + W * 0.08, by - H * 0.22);
      c.lineTo(bx + W * 0.16 + 6, by - H * 0.14);
      c.fill();
      c.fillStyle = shade([235, 230, 220]);
      c.fillRect(bx + W * 0.06, by - H * 0.08, W * 0.04, H * 0.08);
      // Silo
      c.fillStyle = shade([190, 195, 200]);
      c.fillRect(bx + W * 0.17, by - H * 0.2, W * 0.035, H * 0.2);
      this.substation(W * 0.18, hz + H * 0.1, 0.5, shade);
      return;
    }
    // Garten: Haus, Zaun, Baum, Nachbarhaus
    const hx = W * 0.04;
    const hy = hz + H * 0.1;
    c.fillStyle = shade([150, 175, 120]);
    c.fillRect(0, hz - H * 0.02, W, H * 0.025); // Hecke hinten
    // Nachbarhaus
    c.fillStyle = shade([220, 205, 180]);
    c.fillRect(W * 0.86, hz - H * 0.1, W * 0.12, H * 0.1);
    c.fillStyle = shade([150, 70, 50]);
    c.beginPath();
    c.moveTo(W * 0.85, hz - H * 0.1);
    c.lineTo(W * 0.92, hz - H * 0.17);
    c.lineTo(W * 0.99, hz - H * 0.1);
    c.fill();
    const lit = night > 0.3 && game.flows.garten.soldKW > 0;
    c.fillStyle = lit ? 'rgba(255,215,120,0.95)' : shade([90, 120, 140]);
    c.fillRect(W * 0.88, hz - H * 0.075, W * 0.02, H * 0.03);
    c.fillRect(W * 0.94, hz - H * 0.075, W * 0.02, H * 0.03);
    // Opas Haus
    c.fillStyle = shade([235, 225, 205]);
    c.fillRect(hx, hy - H * 0.2, W * 0.2, H * 0.2);
    c.fillStyle = shade([160, 60, 45]);
    c.beginPath();
    c.moveTo(hx - 8, hy - H * 0.2);
    c.lineTo(hx + W * 0.1, hy - H * 0.32);
    c.lineTo(hx + W * 0.2 + 8, hy - H * 0.2);
    c.fill();
    c.fillStyle = shade([110, 80, 60]);
    c.fillRect(hx + W * 0.08, hy - H * 0.1, W * 0.035, H * 0.1);
    c.fillStyle = night > 0.3 ? 'rgba(255,215,120,0.95)' : shade([150, 190, 210]);
    c.fillRect(hx + W * 0.025, hy - H * 0.16, W * 0.035, H * 0.04);
    c.fillRect(hx + W * 0.14, hy - H * 0.16, W * 0.035, H * 0.04);
    // Zaun
    c.strokeStyle = shade([245, 240, 230]);
    c.lineWidth = 2;
    c.beginPath();
    for (let x = W * 0.26; x < W; x += 14) {
      c.moveTo(x, hz + H * 0.24);
      c.lineTo(x, hz + H * 0.2);
    }
    c.moveTo(W * 0.26, hz + H * 0.215);
    c.lineTo(W, hz + H * 0.215);
    c.stroke();
    // Apfelbaum
    c.fillStyle = shade([100, 70, 45]);
    c.fillRect(W * 0.28, hz - H * 0.02, 6, H * 0.1);
    c.fillStyle = shade([80, 140, 70]);
    c.beginPath();
    c.arc(W * 0.28 + 3, hz - H * 0.05, H * 0.06, 0, Math.PI * 2);
    c.fill();
    // Batterie-Kiste, falls Speicher
    if (game.state.sites.garten.storage.tier >= 0) {
      c.fillStyle = shade([60, 60, 70]);
      c.fillRect(W * 0.21, hy - 14, 16, 12);
      c.fillStyle = '#7ee08a';
      const soc = game.flows.garten.links.find((l) => l.id === 'storage')?.temp ?? 0;
      c.fillRect(W * 0.21 + 2, hy - 4 - 8 * soc, 12, 8 * soc);
    }
  }

  private substation(x: number, y: number, s: number, shade: (c: RGB) => string) {
    const c = this.ctx;
    c.fillStyle = shade([150, 155, 160]);
    c.fillRect(x - 6 * s, y - 22 * s, 34 * s, 22 * s);
    c.strokeStyle = shade([90, 95, 100]);
    c.lineWidth = 1.5;
    c.beginPath();
    for (let i = 0; i < 4; i++) {
      c.moveTo(x - 4 * s + i * 10 * s, y - 22 * s);
      c.lineTo(x - 4 * s + i * 10 * s, y - 34 * s);
    }
    c.moveTo(x - 6 * s, y - 32 * s);
    c.lineTo(x + 28 * s, y - 32 * s);
    c.stroke();
  }

  private turbine(
    x: number,
    y: number,
    hub: number,
    r: number,
    angle: number,
    style: string,
    o: { broken: boolean; ice: boolean; night: number; light: boolean; vane: boolean; lattice: boolean; furled: boolean },
  ) {
    const c = this.ctx;
    const n = o.night * 0.5;
    const white = rgb(mix([245, 247, 250], [90, 100, 120], n));
    const wood = rgb(mix([150, 105, 60], [60, 50, 50], n));
    const hx = x;
    const hy = y - hub;
    // Fundament / Übergangsstück
    if (style === 'offshore') {
      c.fillStyle = rgb(mix([235, 195, 40], [100, 90, 50], n));
      c.fillRect(x - Math.max(2, r * 0.05), y - hub * 0.12, Math.max(4, r * 0.1), hub * 0.14);
    }
    // Turm
    if (style === 'wood') {
      c.strokeStyle = wood;
      c.lineWidth = Math.max(2, hub * 0.035);
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(hx, hy);
      c.stroke();
    } else if (o.lattice) {
      c.strokeStyle = rgb(mix([150, 155, 160], [70, 75, 85], n));
      c.lineWidth = 1;
      const b = Math.max(4, hub * 0.08);
      c.beginPath();
      c.moveTo(x - b, y);
      c.lineTo(hx - 1, hy);
      c.moveTo(x + b, y);
      c.lineTo(hx + 1, hy);
      for (let i = 0; i < 6; i++) {
        const t0 = i / 6;
        const t1 = (i + 1) / 6;
        c.moveTo(lerp(x - b, hx - 1, t0), lerp(y, hy, t0));
        c.lineTo(lerp(x + b, hx + 1, t1), lerp(y, hy, t1));
        c.moveTo(lerp(x + b, hx + 1, t0), lerp(y, hy, t0));
        c.lineTo(lerp(x - b, hx - 1, t1), lerp(y, hy, t1));
      }
      c.stroke();
    } else {
      const bw = Math.max(2.5, hub * 0.045);
      const tw = Math.max(1.5, hub * 0.022);
      const tg = c.createLinearGradient(x - bw, 0, x + bw, 0);
      tg.addColorStop(0, white);
      tg.addColorStop(1, rgb(mix([200, 205, 215], [70, 80, 95], n)));
      c.fillStyle = tg;
      c.beginPath();
      c.moveTo(x - bw / 2, y - (style === 'offshore' ? hub * 0.12 : 0));
      c.lineTo(hx - tw / 2, hy);
      c.lineTo(hx + tw / 2, hy);
      c.lineTo(x + bw / 2, y - (style === 'offshore' ? hub * 0.12 : 0));
      c.fill();
    }
    // Gondel
    const nw = Math.max(4, r * (style === 'wood' ? 0.25 : 0.16));
    c.fillStyle = style === 'wood' ? wood : white;
    c.fillRect(hx - nw * 0.2, hy - nw * 0.22, nw, nw * 0.44);
    if (o.vane) {
      c.fillStyle = rgb(mix([220, 80, 60], [90, 50, 50], n));
      c.beginPath();
      c.moveTo(hx + nw * 0.7, hy);
      c.lineTo(hx + nw * 1.9, hy - nw * 0.6);
      c.lineTo(hx + nw * 1.9, hy + nw * 0.3);
      c.fill();
    }
    if (o.light) {
      c.fillStyle = 'rgba(255,40,40,0.95)';
      c.beginPath();
      c.arc(hx + nw * 0.3, hy - nw * 0.3, Math.max(1.6, nw * 0.12), 0, Math.PI * 2);
      c.fill();
    }
    // Rotor
    const blades = style === 'wood' ? 4 : 3;
    const rr = style === 'wood' ? Math.max(16, r) : r;
    const len = o.broken ? rr * 0.45 : rr;
    const sx = o.furled ? 0.55 : 1; // aus dem Wind gedreht → schmal
    c.save();
    c.translate(hx - nw * 0.25, hy);
    c.scale(sx, 1);
    for (let b = 0; b < blades; b++) {
      const a = angle + (b * Math.PI * 2) / blades;
      c.save();
      c.rotate(a);
      if (style === 'wood') {
        c.fillStyle = b % 2 ? wood : rgb(mix([200, 160, 100], [80, 70, 60], n));
        const bw = Math.max(4, len * 0.2);
        c.fillRect(-bw / 2, -len, bw, len * 0.92);
      } else {
        const root = Math.max(1.6, len * 0.08);
        c.fillStyle = o.ice ? 'rgba(210,235,255,0.95)' : white;
        c.beginPath();
        c.moveTo(-root / 2, 0);
        c.quadraticCurveTo(-root * 0.9, -len * 0.25, -root * 0.25, -len);
        c.lineTo(root * 0.15, -len);
        c.quadraticCurveTo(root * 0.6, -len * 0.3, root / 2, 0);
        c.fill();
        if (style === 'modern' || style === 'offshore') {
          c.fillStyle = 'rgba(220,60,50,0.85)';
          c.fillRect(-root * 0.25, -len, root * 0.4, len * 0.06);
        }
      }
      c.restore();
    }
    c.fillStyle = style === 'wood' ? '#3b2a1c' : rgb(mix([225, 228, 232], [80, 90, 100], n));
    c.beginPath();
    c.arc(0, 0, Math.max(2, r * 0.07), 0, Math.PI * 2);
    c.fill();
    c.restore();
  }
}
