import './style.css';
import { createInitialState, Game } from './sim/game';
import { load, save } from './state/save';
import { App } from './ui/app';

const saved = load();
const game = new Game(saved ?? createInitialState());

let offline: { seconds: number; euro: number; kwh: number } | null = null;
if (saved) {
  const away = (Date.now() - saved.lastSaved) / 1000;
  if (away > 60) {
    const rep = game.simulateOffline(away);
    if (rep.euro > 0) offline = rep;
  }
}

const app = new App(document.getElementById('app')!, game);
if (offline) app.showOfflineReport(offline.seconds, offline.euro, offline.kwh);
save(game.state);

// Für Neugierige und automatisierte Tests
(window as unknown as { rueckenwind: App }).rueckenwind = app;
