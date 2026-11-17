// Speichern, Laden, Export und Import des Spielstands.

import { SITE_LIST } from '../data/sites';
import { createInitialState, createSiteState, SAVE_VERSION } from '../sim/game';
import type { GameState } from '../sim/types';

const KEY = 'rueckenwind-save-v1';

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** Ergänzt fehlende Felder (ältere Speicherstände) mit Standardwerten. */
export function migrate(raw: Partial<GameState>): GameState {
  const base = createInitialState(raw.seed ?? 1);
  const st = { ...base, ...raw } as GameState;
  st.stats = { ...base.stats, ...(raw.stats ?? {}) };
  st.settings = { ...base.settings, ...(raw.settings ?? {}) };
  for (const def of SITE_LIST) {
    const fresh = createSiteState(def);
    const old = raw.sites?.[def.id];
    st.sites[def.id] = old
      ? {
          ...fresh,
          ...old,
          parts: { ...fresh.parts, ...old.parts },
          chain: { ...fresh.chain, ...old.chain },
          storage: { ...fresh.storage, ...old.storage },
        }
      : fresh;
  }
  st.version = SAVE_VERSION;
  return st;
}

export function save(state: GameState): boolean {
  const s = storage();
  if (!s) return false;
  try {
    state.lastSaved = Date.now();
    s.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function load(): GameState | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(KEY);
    if (!raw) return null;
    return migrate(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    storage()?.removeItem(KEY);
  } catch {
    /* ignorieren */
  }
}

export function exportSave(state: GameState): string {
  const json = JSON.stringify(state);
  return btoa(unescape(encodeURIComponent(json)));
}

export function importSave(text: string): GameState | null {
  try {
    const json = decodeURIComponent(escape(atob(text.trim())));
    return migrate(JSON.parse(json));
  } catch {
    return null;
  }
}
