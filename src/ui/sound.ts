// Dezente Geräusche über WebAudio (optional, standardmäßig aus).

let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, slide = 0) {
  const a = ac();
  if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, a.currentTime);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), a.currentTime + dur);
  g.gain.setValueAtTime(gain, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
  o.connect(g).connect(a.destination);
  o.start();
  o.stop(a.currentTime + dur);
}

export const sound = {
  enabled: false,
  click() {
    if (this.enabled) tone(180 + Math.random() * 40, 0.06, 'triangle', 0.05, 60);
  },
  buy() {
    if (this.enabled) tone(520, 0.12, 'sine', 0.06, 260);
  },
  zap() {
    if (this.enabled) tone(900, 0.25, 'sawtooth', 0.04, -700);
  },
  success() {
    if (!this.enabled) return;
    tone(660, 0.12, 'sine', 0.05);
    setTimeout(() => tone(880, 0.18, 'sine', 0.05), 110);
  },
};
