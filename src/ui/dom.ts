// Kleine DOM-Helfer.

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function $(sel: string, root: ParentNode = document): HTMLElement {
  const el = root.querySelector(sel);
  if (!el) throw new Error(`Element fehlt: ${sel}`);
  return el as HTMLElement;
}

export function setText(el: HTMLElement, text: string) {
  if (el.textContent !== text) el.textContent = text;
}

export function setHTML(el: HTMLElement, html: string) {
  if (el.innerHTML !== html) el.innerHTML = html;
}

/** Ampelfarbe für eine Auslastung (0..∞). */
export function loadClass(load: number): string {
  if (load > 1.0001) return 'bad';
  if (load > 0.9) return 'warn';
  return 'ok';
}

export const ICON = {
  lexicon:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 7h7M8 11h7" stroke="currentColor" stroke-width="1.8"/></svg>',
  trophy:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v4a5 5 0 0 1-10 0V4z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="1.8"/></svg>',
  log: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" stroke-width="1.8"/></svg>',
  sound:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h4l5-4v12l-5-4H4z" fill="currentColor"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  mute: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h4l5-4v12l-5-4H4z" fill="currentColor"/><path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="1.8"/></svg>',
  wrench:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 4a5 5 0 0 0-4.6 6.9L4 16.8 7.2 20l5.9-5.9A5 5 0 0 0 20 9.5l-3 3-3-.5-.5-3 3-3a5 5 0 0 0-2-2z" fill="currentColor"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4 14h6l-1 8 9-12h-6z" fill="currentColor"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2"/></svg>',
};
