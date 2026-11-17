// App: Layout, Hauptschleife, Kopfleiste, Kurbel, Logbuch, Ticker, Modale.

import { ACHIEVEMENTS } from '../data/achievements';
import { SITE_LIST, SITES } from '../data/sites';
import { LEXICON, TICKER } from '../data/texts';
import { ct, duration, energy, money, power } from '../sim/format';
import { Game } from '../sim/game';
import { SITE_IDS, type SiteId } from '../sim/types';
import { boersePriceHourly, clockLabel, windDirection } from '../sim/weather';
import { clearSave, exportSave, importSave, save } from '../state/save';
import { $, esc, ICON, setHTML, setText } from './dom';
import { renderFlow } from './flow';
import { Scene } from './scene';
import { Shop, SHOP_TABS, type ShopTab } from './shop';
import { sound } from './sound';

const TICK = 0.1; // Simulationsschritt in Echtsekunden

export class App {
  game: Game;
  private site: SiteId = 'garten';
  private scene!: Scene;
  private shop!: Shop;
  private last = performance.now();
  private acc = 0;
  private uiTimer = 0;
  private saveTimer = 0;
  private lastLogTop = '';
  private tickerIdx = 0;
  private mobileTab: 'shop' | 'flow' | 'log' = 'shop';
  private userPickedSite = false;

  constructor(
    private root: HTMLElement,
    game: Game,
  ) {
    this.game = game;
    sound.enabled = game.state.settings.sound;
    this.site = this.newestSite();
    this.build();
    this.bind();
    this.scene.reducedMotion = game.state.settings.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame((t) => this.frame(t));
  }

  private newestSite(): SiteId {
    let best: SiteId = 'garten';
    for (const d of SITE_LIST) if (this.game.state.sites[d.id].unlocked) best = d.id;
    return best;
  }

  // ---------- Aufbau ----------

  private build() {
    this.root.innerHTML = `
    <header class="topbar">
      <div class="brand"><span class="logo" aria-hidden="true"></span><span>Rückenwind</span></div>
      <div class="stat money"><small>Kontostand</small><b id="s-money">0 €</b><span id="s-income" class="pos">+0 €/s</span></div>
      <div class="stat"><small>Einspeisung</small><b id="s-power">0 W</b><span id="s-energy"></span></div>
      <div class="stat"><small>Strompreis</small><b id="s-price">–</b><svg id="s-spark" viewBox="0 0 80 22" aria-hidden="true"></svg></div>
      <div class="stat"><small>Wind</small><b id="s-wind">–</b><span id="s-dir" class="dir" aria-hidden="true">➤</span></div>
      <div class="stat clock"><small id="s-epoch">Epoche 0</small><b id="s-clock"></b></div>
      <nav class="tools">
        <button data-modal="lexicon" title="Lexikon">${ICON.lexicon}<span>Lexikon</span><em id="s-lexcount"></em></button>
        <button data-modal="achievements" title="Erfolge">${ICON.trophy}<span>Erfolge</span></button>
        <button id="b-sound" title="Ton an/aus">${this.game.state.settings.sound ? ICON.sound : ICON.mute}</button>
        <button data-modal="menu" title="Menü">${ICON.menu}<span>Menü</span></button>
      </nav>
    </header>
    <main class="layout">
      <section class="stage" aria-label="Szene">
        <canvas id="scene"></canvas>
        <div class="sites" id="sites" role="tablist" aria-label="Standorte"></div>
        <div class="events" id="events"></div>
        <button class="crank" id="crank" aria-label="Kurbeln (Leertaste)">
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="46" class="disc"/>
            <g id="crank-arm"><rect x="46" y="14" width="8" height="40" rx="4" class="arm"/><circle cx="50" cy="18" r="9" class="knob"/></g>
            <circle cx="50" cy="50" r="10" class="hub"/>
          </svg>
          <span class="crank-label">Kurbeln</span>
          <span class="crank-value" id="crank-value"></span>
        </button>
        <div class="floaters" id="floaters" aria-hidden="true"></div>
        <div class="toasts" id="toasts" aria-live="polite"></div>
      </section>
      <aside class="shop" data-mobile="shop">
        <div class="tabs" role="tablist">${SHOP_TABS.map(([k, l], i) => `<button role="tab" data-tab="${k}" title="Taste ${i + 1}">${l}</button>`).join('')}</div>
        <div class="shop-body" id="shop"></div>
      </aside>
      <section class="flow" data-mobile="flow" aria-label="Energiefluss">
        <div class="flow-head"><h2>Energiefluss <span id="flow-site"></span></h2><span class="flow-help">Die Kette ist nur so stark wie ihr schwächstes Glied.</span></div>
        <div id="flow"></div>
      </section>
      <section class="log" data-mobile="log" aria-label="Logbuch">
        <h2>${ICON.log} Logbuch</h2>
        <ol id="log"></ol>
      </section>
    </main>
    <footer class="ticker"><span class="paper">Windhusener Bote</span><div class="ticker-text" id="ticker"></div></footer>
    <nav class="mobilenav">
      <button data-mtab="shop" class="active">Shop</button><button data-mtab="flow">Energiefluss</button><button data-mtab="log">Logbuch</button>
    </nav>
    <div class="modal" id="modal" hidden><div class="modal-box" role="dialog" aria-modal="true"><button class="close" id="modal-close" aria-label="Schließen">${ICON.close}</button><div id="modal-body"></div></div></div>`;

    this.scene = new Scene($('#scene') as HTMLCanvasElement);
    this.shop = new Shop($('#shop'), () => this.game, () => this.site);
    this.setTab('anlagen');
    this.renderSites();
    this.nextTicker();
  }

  private bind() {
    const crank = $('#crank');
    crank.addEventListener('click', (e) => this.crank(e as MouseEvent));
    window.addEventListener('keydown', (e) => {
      const tgt = e.target as HTMLElement;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA')) return;
      if (!$('#modal').hidden) {
        if (e.key === 'Escape') this.closeModal();
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat) this.crank();
      } else if (/^[1-5]$/.test(e.key)) {
        this.setTab(SHOP_TABS[Number(e.key) - 1][0]);
      }
    });
    document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((b) => b.addEventListener('click', () => this.setTab(b.dataset.tab as ShopTab)));
    $('#shop').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
      if (!b || b.disabled) return;
      if (b.dataset.action === 'prestige') {
        this.confirmPrestige();
        return;
      }
      if (this.shop.handle(b.dataset.action!)) {
        sound.buy();
        this.renderSites();
        if (b.dataset.action!.startsWith('unlock:')) {
          this.site = b.dataset.action!.split(':')[1] as SiteId;
          this.userPickedSite = true;
          this.renderSites();
          this.shop.invalidate();
        }
        this.refresh(true);
      }
    });
    $('#shop').addEventListener('input', (e) => {
      const r = e.target as HTMLInputElement;
      if (!r.dataset.rule) return;
      const [kind, id] = r.dataset.rule.split(':');
      const s = this.game.state.sites[id as SiteId];
      if (kind === 'charge') s.storage.chargeBelow = Number(r.value);
      else s.storage.dischargeAbove = Number(r.value);
      const out = r.parentElement!.querySelector('output');
      if (out) out.textContent = ct(Number(r.value));
    });
    $('#flow').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
      if (!b) return;
      const [kind, id, idx] = b.dataset.action!.split(':');
      if (kind === 'reset') this.game.resetTrip(id as SiteId);
      if (kind === 'repair' && this.game.orderRepair(id as SiteId, Number(idx))) sound.buy();
      this.refresh(true);
    });
    $('#sites').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-site]');
      if (!b) return;
      this.site = b.dataset.site as SiteId;
      this.userPickedSite = true;
      this.renderSites();
      this.shop.invalidate();
      this.refresh(true);
    });
    document.querySelectorAll<HTMLButtonElement>('[data-modal]').forEach((b) => b.addEventListener('click', () => this.openModal(b.dataset.modal!)));
    $('#modal-close').addEventListener('click', () => this.closeModal());
    $('#modal').addEventListener('click', (e) => {
      if (e.target === $('#modal')) this.closeModal();
    });
    $('#b-sound').addEventListener('click', () => {
      this.game.state.settings.sound = !this.game.state.settings.sound;
      sound.enabled = this.game.state.settings.sound;
      $('#b-sound').innerHTML = sound.enabled ? ICON.sound : ICON.mute;
    });
    document.querySelectorAll<HTMLButtonElement>('[data-mtab]').forEach((b) =>
      b.addEventListener('click', () => {
        this.mobileTab = b.dataset.mtab as 'shop' | 'flow' | 'log';
        document.querySelectorAll('[data-mtab]').forEach((x) => x.classList.toggle('active', x === b));
        this.root.dataset.mtab = this.mobileTab;
      }),
    );
    this.root.dataset.mtab = this.mobileTab;
    new ResizeObserver(() => this.scene.resize()).observe($('#scene'));
    window.addEventListener('beforeunload', () => save(this.game.state));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') save(this.game.state);
    });
  }

  private setTab(t: ShopTab) {
    this.shop.tab = t;
    document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
    this.shop.invalidate();
    this.shop.update();
  }

  private renderSites() {
    const st = this.game.state;
    const html = SITE_LIST.map((d) => {
      const s = st.sites[d.id];
      const visible = s.unlocked || (d.id !== 'garten' && st.sites[SITE_LIST[SITE_LIST.indexOf(d) - 1].id].count > 0);
      if (!visible) return '';
      const label = s.unlocked ? d.name : `${d.name} ?`;
      const f = this.game.flows[d.id];
      const warn = s.damage.length > 0 || s.tripped ? ' alarm' : f.bottleneck && f.bottleneck.load > 1 ? ' attention' : '';
      return `<button role="tab" data-site="${d.id}" aria-selected="${d.id === this.site}" class="${s.unlocked ? '' : 'locked'}${warn}">${esc(label)}${s.count ? `<small>${s.count}</small>` : ''}</button>`;
    }).join('');
    setHTML($('#sites'), html);
  }

  // ---------- Kurbel ----------

  private crankAngle = 0;
  private crank(e?: MouseEvent) {
    const euro = this.game.click();
    sound.click();
    this.crankAngle += 40;
    $('#crank-arm').style.transform = `rotate(${this.crankAngle}deg)`;
    const fl = document.createElement('span');
    fl.className = 'floater';
    fl.textContent = `+${money(euro)}`;
    const rect = $('#crank').getBoundingClientRect();
    const stage = $('.stage').getBoundingClientRect();
    const x = e && e.clientX ? e.clientX - stage.left : rect.left - stage.left + rect.width / 2;
    const y = e && e.clientY ? e.clientY - stage.top : rect.top - stage.top;
    fl.style.left = `${x + (Math.random() - 0.5) * 40}px`;
    fl.style.top = `${y}px`;
    const box = $('#floaters');
    if (box.children.length > 8) box.firstElementChild!.remove();
    box.appendChild(fl);
    setTimeout(() => fl.remove(), 900);
  }

  // ---------- Schleife ----------

  private frame(now: number) {
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 5) {
      // Tab war im Hintergrund: als Offline-Zeit rechnen
      const rep = this.game.simulateOffline(dt);
      if (rep.euro > 0) this.game.toast(`Während du weg warst: ${money(rep.euro)} verdient`, 'info');
      dt = 0;
    }
    this.acc += Math.min(dt, 1);
    while (this.acc >= TICK) {
      this.game.tick(TICK);
      this.acc -= TICK;
    }
    this.scene.render(this.game, this.site, Math.min(dt, 0.1));
    this.uiTimer += dt;
    if (this.uiTimer >= 0.2) {
      this.uiTimer = 0;
      this.refresh(false);
    }
    this.saveTimer += dt;
    if (this.saveTimer >= 30) {
      this.saveTimer = 0;
      save(this.game.state);
    }
    requestAnimationFrame((t) => this.frame(t));
  }

  refresh(force: boolean) {
    const g = this.game;
    const st = g.state;
    // Automatisch zum neuen Standort springen, solange der Spieler nicht selbst gewählt hat
    if (!this.userPickedSite && this.newestSite() !== this.site) {
      this.site = this.newestSite();
      this.shop.invalidate();
    }
    setText($('#s-money'), money(st.money));
    setText($('#s-income'), `+${money(g.incomePerSec)}/s`);
    setText($('#s-power'), power(g.outputKW));
    setText($('#s-energy'), `gesamt ${energy(st.energyTotalKWh)}`);
    const f = g.flows[this.site];
    const s = st.sites[this.site];
    const price = s.unlocked && s.permitLeft <= 0 ? f.priceCt : boersePriceHourly(st.gameHours, st.seed, st.events);
    setText($('#s-price'), ct(price));
    $('#s-price').classList.toggle('neg', price < 0);
    setText($('#s-wind'), `${(f.v || 0).toFixed(1).replace('.', ',')} m/s`);
    $('#s-dir').style.transform = `rotate(${windDirection(st.gameHours, st.seed) + 90}deg)`;
    setText($('#s-clock'), clockLabel(st.gameHours));
    setText($('#s-epoch'), `Epoche ${g.epoch} · ${SITES[this.site].name}`);
    setText($('#s-lexcount'), `${st.lexicon.length}`);
    setText($('#crank-value'), `+${money(g.clickValue().euro)}`);
    this.sparkline();
    this.shop.update();
    setHTML($('#flow'), renderFlow(g, this.site));
    setText($('#flow-site'), `· ${SITES[this.site].name}`);
    $('#flow').querySelectorAll<HTMLButtonElement>('button[data-cost]').forEach((b) => (b.disabled = Number(b.dataset.cost) > st.money));
    this.renderSites();
    this.renderEvents();
    this.renderLog(force);
    this.drainToasts();
  }

  private sparkHour = -1;
  private sparkline() {
    const st = this.game.state;
    const h = Math.floor(st.gameHours);
    if (h === this.sparkHour) return;
    this.sparkHour = h;
    const pts: number[] = [];
    for (let i = -23; i <= 0; i++) pts.push(boersePriceHourly(h + i, st.seed, st.events));
    const min = Math.min(0, ...pts);
    const max = Math.max(12, ...pts);
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${((i / 23) * 78 + 1).toFixed(1)} ${(21 - ((p - min) / (max - min)) * 20).toFixed(1)}`).join('');
    $('#s-spark').innerHTML = `<path d="${d}"/><title>Börsenpreis der letzten 24 Spielstunden</title>`;
  }

  private renderEvents() {
    const st = this.game.state;
    const gh = st.gameHours;
    const names: Record<string, string> = {
      sturm: 'Sturm',
      flaute: 'Flaute',
      preisspitze: 'Preisspitze',
      netzengpass: 'Netzengpass',
      vereisung: 'Vereisung',
      gewitter: 'Gewitter',
    };
    const html = st.events
      .filter((e) => e.announced || gh >= e.start)
      .map((e) => {
        const active = gh >= e.start && gh <= e.end;
        const when = active ? `noch ${Math.ceil(e.end - gh)} h` : `in ${Math.ceil(e.start - gh)} h`;
        return `<span class="ev ${e.kind}${active ? ' active' : ''}">${names[e.kind]} · ${when}</span>`;
      })
      .join('');
    setHTML($('#events'), html);
  }

  private renderLog(force: boolean) {
    const log = this.game.state.log;
    const top = log.length ? log[0].text + log.length : '';
    if (!force && top === this.lastLogTop) return;
    this.lastLogTop = top;
    $('#log').innerHTML = log
      .slice(0, 40)
      .map((e) => `<li class="${e.kind}"><time>${clockLabel(e.t).split(' · ')[0]}</time>${e.kind === 'opa' ? '<b>Opa Hinnerk:</b> ' : ''}${esc(e.text)}</li>`)
      .join('');
    // wichtige Meldungen auch in den Ticker
    if (log.length && (log[0].kind === 'event' || log[0].kind === 'damage')) this.showTicker(log[0].text, true);
  }

  private drainToasts() {
    const box = $('#toasts');
    while (this.game.toasts.length) {
      const t = this.game.toasts.shift()!;
      const el = document.createElement('div');
      el.className = `toast ${t.kind}`;
      el.textContent = t.text;
      box.appendChild(el);
      if (t.kind === 'damage') sound.zap();
      if (t.kind === 'success') sound.success();
      setTimeout(() => el.classList.add('out'), 3500);
      setTimeout(() => el.remove(), 4200);
      while (box.children.length > 4) box.firstElementChild!.remove();
    }
  }

  // ---------- Ticker ----------

  private tickerTimer: number | undefined;
  private nextTicker() {
    const text = TICKER[this.tickerIdx++ % TICKER.length];
    this.showTicker(text, false);
  }
  private showTicker(text: string, urgent: boolean) {
    const el = $('#ticker');
    el.classList.remove('run');
    el.classList.toggle('urgent', urgent);
    el.textContent = text;
    void el.offsetWidth; // Animation neu starten
    el.classList.add('run');
    clearTimeout(this.tickerTimer);
    this.tickerTimer = window.setTimeout(() => this.nextTicker(), 14000);
  }

  // ---------- Modale ----------

  private openModal(kind: string) {
    const body = $('#modal-body');
    const st = this.game.state;
    if (kind === 'lexicon') {
      const topics = [...new Set(LEXICON.map((c) => c.topic))];
      body.innerHTML = `<h2>Lexikon <small>${st.lexicon.length} / ${LEXICON.length} Karten</small></h2>
        <p class="intro">Karten schalten sich frei, wenn du etwas Neues baust oder erlebst.</p>
        ${topics
          .map(
            (t) => `<h3>${esc(t)}</h3><div class="lexgrid">${LEXICON.filter((c) => c.topic === t)
              .map((c) =>
                st.lexicon.includes(c.id)
                  ? `<article class="lex"><h4>${esc(c.title)}</h4><p>${esc(c.text)}</p></article>`
                  : `<article class="lex locked"><h4>???</h4><p>Noch nicht entdeckt.</p></article>`,
              )
              .join('')}</div>`,
          )
          .join('')}`;
    } else if (kind === 'achievements') {
      body.innerHTML = `<h2>Erfolge <small>${st.achievements.length} / ${ACHIEVEMENTS.length}</small></h2><ul class="achs">${ACHIEVEMENTS.map(
        (a) => `<li class="${st.achievements.includes(a.id) ? 'got' : ''}"><b>${esc(st.achievements.includes(a.id) ? a.name : '???')}</b><span>${esc(a.desc)}</span></li>`,
      ).join('')}</ul>
      <h3>Statistik</h3><dl class="stats">
        <dt>Gespielt</dt><dd>${duration(st.realSeconds)}</dd>
        <dt>Verdient</dt><dd>${money(st.totalEarned)}</dd>
        <dt>Strom geliefert</dt><dd>${energy(st.lifetimeEnergyKWh)}</dd>
        <dt>Davon gekurbelt</dt><dd>${energy(st.clickEnergyKWh)} (${st.clicks.toLocaleString('de-DE')} Klicks)</dd>
        <dt>Spitzenleistung</dt><dd>${power(st.peakKW)}</dd>
        <dt>Installiert</dt><dd>${power(this.game.installedKW())}</dd>
        <dt>Schäden</dt><dd>${st.stats.damages}</dd>
        <dt>Know-how</dt><dd>${st.knowhow} Punkte (+${st.knowhow * 2} %)</dd>
      </dl>`;
    } else if (kind === 'menu') {
      body.innerHTML = `<h2>Menü</h2>
        <div class="menu-grid">
          <button data-m="save">Jetzt speichern</button>
          <button data-m="export">Spielstand exportieren</button>
          <button data-m="import">Spielstand importieren</button>
          <label class="check"><input type="checkbox" data-m="motion" ${st.settings.reducedMotion ? 'checked' : ''}> Weniger Bewegung</label>
          <button data-m="reset" class="danger">Neu beginnen</button>
        </div>
        <textarea id="io" rows="4" placeholder="Spielstand hier einfügen oder kopieren" hidden></textarea>
        <h3>So funktioniert's</h3>
        <ul class="howto">
          <li><b>Kurbeln</b> (Klick oder Leertaste) bringt am Anfang das Geld für das erste Windrad.</li>
          <li><b>Anlagen</b> laufen von allein. Wind schwankt – und die Leistung wächst mit v³.</li>
          <li><b>Die Kette</b> aus Generator, Leitung, Trafo und Netzanschluss muss zur Leistung passen. Sonst wird es heiß.</li>
          <li><b>Schutz</b> verhindert Schäden, passende Auslegung verhindert Verluste.</li>
          <li><b>Strompreise</b> schwanken: abends teuer, bei Sturm billig. Speicher helfen.</li>
          <li>Ein Spieltag dauert 4 Minuten. Offline läuft der Park bis zu 12 Stunden weiter.</li>
        </ul>
        <p class="small">Rückenwind · Werte orientieren sich an realen Größenordnungen, Geld ist Spielgeld (Faktor 100, siehe Lexikon).</p>`;
      body.querySelectorAll<HTMLElement>('[data-m]').forEach((el) =>
        el.addEventListener(el.tagName === 'INPUT' ? 'change' : 'click', () => this.menuAction(el.dataset.m!, el)),
      );
    }
    $('#modal').hidden = false;
    $('#modal-close').focus();
  }

  private menuAction(m: string, el: HTMLElement) {
    const io = $('#io') as HTMLTextAreaElement;
    switch (m) {
      case 'save':
        if (save(this.game.state)) this.game.toast('Gespeichert', 'success');
        break;
      case 'export':
        io.hidden = false;
        io.value = exportSave(this.game.state);
        io.select();
        break;
      case 'import':
        if (io.hidden || !io.value.trim()) {
          io.hidden = false;
          io.value = '';
          io.placeholder = 'Exportierten Spielstand hier einfügen und erneut auf „Importieren“ klicken';
          io.focus();
          break;
        }
        {
          const st = importSave(io.value);
          if (!st) {
            this.game.toast('Spielstand konnte nicht gelesen werden', 'warn');
            break;
          }
          this.game = new Game(st);
          save(st);
          this.afterSwap();
          this.closeModal();
        }
        break;
      case 'motion':
        this.game.state.settings.reducedMotion = (el as HTMLInputElement).checked;
        this.scene.reducedMotion = this.game.state.settings.reducedMotion;
        break;
      case 'reset':
        if (confirm('Wirklich neu beginnen? Der Spielstand wird gelöscht.')) {
          clearSave();
          location.reload();
        }
        break;
    }
    this.drainToasts();
  }

  private confirmPrestige() {
    const k = this.game.knowhowTotal();
    if (!confirm(`Repowering: Alles abbauen und mit ${k} Know-how-Punkten (+${k * 2} % Einnahmen) neu beginnen?`)) return;
    if (this.game.prestige()) {
      save(this.game.state);
      this.afterSwap();
    }
  }

  private afterSwap() {
    this.site = this.newestSite();
    this.userPickedSite = false;
    this.shop.invalidate();
    this.refresh(true);
  }

  private closeModal() {
    $('#modal').hidden = true;
  }

  showOfflineReport(seconds: number, euro: number, kwh: number) {
    $('#modal-body').innerHTML = `<h2>Willkommen zurück!</h2>
      <p>Während du ${duration(seconds)} weg warst, haben deine Anlagen <b>${energy(kwh)}</b> geliefert und <b>${money(euro)}</b> verdient.</p>
      <p class="small">Offline rechnet das Spiel mit dem mittleren Wind und regelt automatisch ab – es entstehen keine Schäden.</p>
      <button class="primary wide" id="ok-offline">Weiter</button>`;
    $('#modal').hidden = false;
    $('#ok-offline').addEventListener('click', () => this.closeModal());
  }

  /** Für Tests und Debugging */
  get selectedSite(): SiteId {
    return this.site;
  }
  static readonly SITES = SITE_IDS;
}
