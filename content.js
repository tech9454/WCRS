/* Виджет на странице стрима (Shadow DOM — стили сайта не ломают виджет и наоборот). */
(() => {
  'use strict';
  if (window.top !== window.self || window.__safInjected) return;
  window.__safInjected = true;

  // Фоновый скрипт просит прочитать выдачу в поисковой вкладке
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'SAF_BANNER') {
      let b = document.getElementById('saf-banner');
      if (!b) {
        b = document.createElement('div'); b.id = 'saf-banner';
        b.style.cssText = 'all:initial;display:block;position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#667eea;color:#fff;font:600 14px Arial,sans-serif;padding:10px 16px;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,.4);';
        document.documentElement.appendChild(b);
      }
      b.textContent = String(msg.text || '');
      return;
    }
    if (!msg || msg.type !== 'SAF_EXTRACT') return;
    const links = [];
    document.querySelectorAll('a[href]').forEach((a) => {
      if (links.length >= 600 || !/^https?:/i.test(a.href)) return;
      const hd = a.querySelector('h3, h2');
      const text = ((hd ? hd.textContent : a.textContent) || '').replace(/\s+/g, ' ').trim().slice(0, 200);
      links.push({ href: a.href, text });
    });
    sendResponse({ url: location.href, links, body: ((document.body && document.body.innerText) || '').slice(0, 1500) });
  });

  const S = SAF;
  let settings = Object.assign({}, S.DEFAULTS);
  let viewState = null;
  let currentNick = null;
  let autoTimer = null;
  let tickTimer = null;
  let ui = null;           // ссылки на элементы виджета
  let panelOpen = false;
  let savedPos = null;     // {left, top} после перетаскивания
  let scale = 1;           // масштаб карточки (шрифты растут вместе с ней)

  const T = (k, v) => S.t(settings.language, k, v);
  const alive = () => { try { return !!chrome.runtime.id; } catch (_) { return false; } };
  const send = (msg) => new Promise((res) => {
    try { chrome.runtime.sendMessage(msg, (r) => { void chrome.runtime.lastError; res(r); }); } catch (_) { res(null); }
  });

  /* ---------- определение страницы стрима ---------- */
  const hostName = () => location.hostname.toLowerCase().replace(/^www\./, '');
  const isArchive = () => settings.archiveSites.some((a) => S.hostMatches(hostName(), S.siteHost(a)));
  const isStreamHost = () => settings.streamHosts.some((h) => S.hostMatches(hostName(), S.normalizeSite(h)));
  function looksLikeStream() {
    const kw = ['/live/', '/cam/', '/room/', '/chat/', '/model/', '/profile/'];
    const href = location.href.toLowerCase();
    if (!kw.some((k) => href.includes(k))) return false;
    return !!document.querySelector('video, [src*=".m3u8"], [class*="videojs"], [class*="player"], [id*="video_player"], [class*="cam-container"]');
  }

  /* ---------- главный цикл ---------- */
  function tick() {
    if (!alive()) { cleanup(); return; }
    let nick = null;
    if (settings.pluginEnabled && !isArchive() && (isStreamHost() || (settings.detectAnyStream && looksLikeStream()))) {
      nick = S.extractNick(location.href);
    }
    if (!nick) {
      if (ui) ui.host.style.display = 'none';
      if (currentNick) { currentNick = null; clearTimeout(autoTimer); }
      return;
    }
    ensureWidget();
    ui.host.style.display = '';
    if (S.norm(nick) !== S.norm(currentNick)) onNickChanged(nick);
  }

  async function onNickChanged(nick) {
    currentNick = nick;
    clearTimeout(autoTimer);
    ui.nick.value = nick;
    viewState = null;
    render();
    const r = await send({ type: 'GET_STATE' });
    if (S.norm(currentNick) !== S.norm(nick)) return;
    const st = r && r.state;
    if (st && S.norm(st.model) === S.norm(nick)) { viewState = st; render(); return; }
    if (st) send({ type: 'RESET' });
    if (settings.autoScan) scheduleAuto(nick);
  }

  function scheduleAuto(nick) {
    clearTimeout(autoTimer);
    autoTimer = setTimeout(function go() {
      if (!settings.autoScan || S.norm(currentNick) !== S.norm(nick)) return;
      if (document.hidden) { autoTimer = setTimeout(go, 1000); return; }
      startSearch(nick, false);
    }, settings.searchDelay);
  }

  function startSearch(nick, force) {
    nick = String(nick || '').trim();
    if (!nick) { setStatusOnly(T('noNick')); return; }
    viewState = { model: nick, phase: 'running', index: 0, total: 0, results: {}, checked: [] };
    render();
    send({ type: 'START_SEARCH', model: nick, force });
  }

  function cleanup() {
    clearInterval(tickTimer); clearTimeout(autoTimer);
    if (ui) ui.host.remove();
    ui = null;
  }

  /* ---------- виджет ---------- */
  const CSS = `
  :host{all:initial}
  *{box-sizing:border-box;font-family:Arial,Helvetica,sans-serif}
  .wrap{position:relative;width:56px;height:56px;
    --bg:#fff;--fg:#222;--muted:#666;--card:#f3f4f8;--line:#e3e5ee;--accent:#667eea}
  .wrap.dark{--bg:#16213e;--fg:#e8e8f0;--muted:#9aa0b8;--card:#0f3460;--line:#2a2a4a;--accent:#7c8cf5}
  .fab{width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#667eea,#764ba2);display:flex;align-items:center;justify-content:center;
    font-size:26px;cursor:pointer;box-shadow:0 4px 15px rgba(0,0,0,.35);user-select:none;position:relative;touch-action:none;transition:transform .15s,box-shadow .15s}
  .fab:hover{transform:scale(1.08);box-shadow:0 6px 20px rgba(102,126,234,.55)}
  .wrap.dragging .fab{transform:scale(1.05);cursor:grabbing}
  .badge{position:absolute;top:-4px;right:-4px;min-width:22px;height:22px;padding:0 5px;border-radius:11px;background:#ff4757;color:#fff;
    font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid #fff}
  .badge.found{background:#2ed573;animation:pulse 2s infinite}
  @keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}
  @keyframes pop{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:none}}
  /* .panel — невидимая обёртка (позиция), .card — сама карточка; масштаб --s меняет размер карточки вместе со шрифтами */
  .panel{display:none;position:absolute;--s:1}
  .panel.open{display:block}
  .wrap.up .panel{bottom:66px}.wrap.down .panel{top:66px}.wrap.right .panel{right:0}.wrap.left .panel{left:0}
  .card{zoom:var(--s);position:relative;width:360px;display:flex;flex-direction:column;background:var(--bg);color:var(--fg);
    border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.4);overflow:hidden;font-size:13px}
  .panel.open .card{animation:pop .16s ease-out}
  .wrap.up.right .card{transform-origin:bottom right}.wrap.up.left .card{transform-origin:bottom left}
  .wrap.down.right .card{transform-origin:top right}.wrap.down.left .card{transform-origin:top left}
  .wrap.dragging .card{animation:none}
  .head{background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;cursor:grab;touch-action:none;user-select:none}
  .head b{font-size:14px}
  .x{background:none;border:0;color:#fff;font-size:22px;cursor:pointer;line-height:1;padding:0 4px;opacity:.85}.x:hover{opacity:1}
  .row{display:flex;gap:6px;padding:10px 12px 0;align-items:center}
  input.nick{flex:1;min-width:0;padding:7px 9px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--fg);font-size:13px}
  input.nick:focus{outline:2px solid var(--accent);outline-offset:-1px}
  button.b{padding:7px 12px;border:0;border-radius:6px;color:#fff;cursor:pointer;font-size:12px;font-weight:600;background:var(--accent);transition:filter .15s}
  button.b:hover{filter:brightness(1.12)}
  button.b.stop{background:#dc3545}button.b.go2{background:#28a745}
  .prog{margin:10px 12px 0;height:5px;border-radius:3px;background:var(--line);overflow:hidden}
  .fill{height:100%;width:0;background:linear-gradient(90deg,#667eea,#764ba2);transition:width .25s}
  .status{padding:8px 12px 0;color:var(--muted);font-size:12.5px}
  .ctl{display:flex;gap:6px;align-items:center;padding:8px 12px;border-bottom:1px solid var(--line)}
  .ctl label{display:flex;align-items:center;gap:5px;cursor:pointer;color:var(--fg);font-size:12.5px;margin-right:auto}
  .body{padding:10px 12px 14px;overflow-y:auto;flex:1;min-height:0;scrollbar-width:thin;scrollbar-color:var(--accent) transparent}
  .rf{color:var(--muted);font-size:12px;margin-bottom:8px}
  .sec{margin-bottom:10px}.sec strong{display:block;color:var(--accent);font-size:12.5px;margin-bottom:4px}
  a.l{display:block;padding:7px 10px;margin-bottom:5px;background:var(--card);border-left:3px solid var(--accent);border-radius:4px;color:var(--fg);text-decoration:none;font-size:12.5px;word-break:break-word;transition:transform .12s,filter .12s}
  a.l:hover{filter:brightness(1.12);transform:translateX(2px)}
  .warn{padding:9px 10px;background:rgba(255,71,87,.12);border:1px solid rgba(255,71,87,.5);border-radius:6px;margin-bottom:10px;line-height:1.4}
  .warn a{color:var(--accent);font-weight:700}
  /* ручка изменения размера — в углу, противоположном кнопке виджета */
  .rz{position:absolute;width:20px;height:20px;z-index:5;opacity:.75;touch-action:none}.rz:hover{opacity:1}
  .wrap.up .rz{top:0}.wrap.down .rz{bottom:0}.wrap.right .rz{left:0}.wrap.left .rz{right:0}
  .wrap.up.right .rz{cursor:nwse-resize;background:linear-gradient(135deg,rgba(255,255,255,.85) 50%,transparent 50%)}
  .wrap.up.left .rz{cursor:nesw-resize;background:linear-gradient(225deg,rgba(255,255,255,.85) 50%,transparent 50%)}
  .wrap.down.left .rz{cursor:nwse-resize;background:linear-gradient(315deg,var(--accent) 50%,transparent 50%)}
  .wrap.down.right .rz{cursor:nesw-resize;background:linear-gradient(45deg,var(--accent) 50%,transparent 50%)}
  .hide{display:none!important}`;

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) for (const [k, v] of Object.entries(props)) {
      if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v; else el.setAttribute(k, v);
    }
    kids.forEach((c) => c && el.appendChild(c));
    return el;
  }
  function link(url, text, cls) {
    if (!/^https?:\/\//i.test(url)) return null;
    const a = h('a', { class: cls, href: url, target: '_blank', rel: 'noopener noreferrer', text });
    return a;
  }

  function ensureWidget() {
    if (ui) return;
    const host = document.createElement('div');
    host.id = 'saf-host';
    host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;width:56px;height:56px;';
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style'); style.textContent = CSS;

    const badge = h('div', { class: 'badge', text: '0' });
    const fab = h('div', { class: 'fab', text: '📼' }, badge);
    const title = h('b'); const close = h('button', { class: 'x', text: '×' });
    const head = h('div', { class: 'head' }, title, close);
    const nick = h('input', { class: 'nick', type: 'text', spellcheck: 'false', autocomplete: 'off' });
    const go = h('button', { class: 'b' });
    const prog = h('div', { class: 'prog' }, h('div', { class: 'fill' }));
    const status = h('div', { class: 'status' });
    const auto = h('input', { type: 'checkbox' });
    const autoLbl = h('label', null, auto, h('span'));
    const stop = h('button', { class: 'b stop' });
    const cont = h('button', { class: 'b go2' });
    const ctl = h('div', { class: 'ctl' }, autoLbl, stop, cont);
    const body = h('div', { class: 'body' });
    const rz = h('div', { class: 'rz', title: '⤡' });
    const card = h('div', { class: 'card' }, head, h('div', { class: 'row' }, nick, go), prog, status, ctl, body, rz);
    const panel = h('div', { class: 'panel' }, card);
    const wrap = h('div', { class: 'wrap' }, fab, panel);
    root.append(style, wrap);
    document.documentElement.appendChild(host);

    ui = { host, wrap, fab, badge, panel, card, rz, title, close, nick, go, fill: prog.firstChild, status, auto, autoText: autoLbl.lastChild, stop, cont, body };

    /* события */
    go.addEventListener('click', () => startSearch(nick.value, true));
    nick.addEventListener('keydown', (e) => { if (e.key === 'Enter') startSearch(nick.value, true); });
    stop.addEventListener('click', () => send({ type: 'STOP_SEARCH' }));
    cont.addEventListener('click', () => { send({ type: 'CONTINUE_SEARCH' }); if (viewState) { viewState.phase = 'running'; render(); } });
    close.addEventListener('click', () => setOpen(false));
    auto.addEventListener('change', () => {
      settings.autoScan = auto.checked;
      chrome.storage.sync.set({ autoScan: auto.checked });
    });
    makeDraggable(fab, () => setOpen(!panelOpen));
    makeDraggable(head, null);
    makeResizable(rz);
    window.addEventListener('resize', () => { if (ui) { applyPosition(); applyScale(); } });

    chrome.storage.local.get({ safPos: null, safScale: 1 }, (o) => { savedPos = o.safPos; scale = o.safScale || 1; applyPosition(); applyScale(); });
    applyPosition();
    applyScale();
    render();
  }

  function setOpen(v) {
    panelOpen = v;
    ui.panel.classList.toggle('open', v);
    placePanel();
  }

  function placePanel() {
    const r = ui.host.getBoundingClientRect();
    const down = r.top < window.innerHeight / 2, left = r.left < window.innerWidth / 2;
    ui.wrap.classList.toggle('down', down); ui.wrap.classList.toggle('up', !down);
    ui.wrap.classList.toggle('left', left); ui.wrap.classList.toggle('right', !left);
  }

  function applyPosition() {
    if (!ui) return;
    const st = ui.host.style;
    st.top = st.bottom = st.left = st.right = '';
    if (savedPos) {
      st.left = Math.max(0, Math.min(savedPos.left, window.innerWidth - 56)) + 'px';
      st.top = Math.max(0, Math.min(savedPos.top, window.innerHeight - 56)) + 'px';
    } else {
      const p = settings.widgetPosition || 'bottom-right';
      st[p.startsWith('top') ? 'top' : 'bottom'] = '20px';
      st[p.endsWith('left') ? 'left' : 'right'] = '20px';
    }
    placePanel();
  }


  function applyScale() {
    if (!ui) return;
    const maxS = Math.max(0.7, (window.innerWidth - 24) / 360);
    scale = Math.max(0.7, Math.min(scale || 1, 2.4, maxS));
    ui.panel.style.setProperty('--s', String(scale));
    ui.card.style.maxHeight = Math.max(160, (window.innerHeight - 100) / scale) + 'px';
  }

  // Растягивание за угол: масштаб меняется пропорционально, шрифты растут вместе с карточкой. Двойной клик — сброс.
  function makeResizable(handle) {
    let a = null;
    handle.addEventListener('pointerdown', (e) => {
      const r = ui.card.getBoundingClientRect();
      a = { x: e.clientX, y: e.clientY, w: r.width || 1, h: r.height || 1, s: scale,
            gx: ui.wrap.classList.contains('right') ? -1 : 1,   // карточка прижата справа — растёт влево
            gy: ui.wrap.classList.contains('up') ? -1 : 1 };    // раскрыта вверх — растёт вверх
      handle.setPointerCapture(e.pointerId);
      e.preventDefault(); e.stopPropagation();
    });
    handle.addEventListener('pointermove', (e) => {
      if (!a) return;
      const sx = (a.w + (e.clientX - a.x) * a.gx) / a.w;
      const sy = (a.h + (e.clientY - a.y) * a.gy) / a.h;
      scale = a.s * (Math.abs(sx - 1) > Math.abs(sy - 1) ? sx : sy);
      applyScale();
    });
    handle.addEventListener('pointerup', () => { if (!a) return; a = null; chrome.storage.local.set({ safScale: scale }); });
    handle.addEventListener('dblclick', () => { scale = 1; applyScale(); chrome.storage.local.set({ safScale: 1 }); });
  }

  function makeDraggable(handle, onClick) {
    let sx, sy, ox, oy, moved, active = false;
    handle.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button') && handle !== e.target) return;
      active = true; moved = false; sx = e.clientX; sy = e.clientY;
      const r = ui.host.getBoundingClientRect(); ox = r.left; oy = r.top;
      handle.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    handle.addEventListener('pointermove', (e) => {
      if (!active) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (!moved && Math.hypot(dx, dy) < 5) return;
      if (!moved) ui.wrap.classList.add('dragging');   // пока тащим — сторона раскрытия не меняется
      moved = true;
      const st = ui.host.style;
      st.right = st.bottom = '';
      st.left = Math.max(0, Math.min(ox + dx, window.innerWidth - 56)) + 'px';
      st.top = Math.max(0, Math.min(oy + dy, window.innerHeight - 56)) + 'px';
    });
    handle.addEventListener('pointerup', () => {
      if (!active) return;
      active = false;
      ui.wrap.classList.remove('dragging');
      if (moved) {
        placePanel();                                   // сторону пересчитываем один раз — когда отпустили
        const r = ui.host.getBoundingClientRect();
        savedPos = { left: r.left, top: r.top };
        chrome.storage.local.set({ safPos: savedPos });
      } else if (onClick) onClick();
    });
  }

  /* ---------- отрисовка по состоянию ---------- */
  const countSites = (st) => (st && st.results ? Object.keys(st.results).length : 0);
  const countLinks = (st) => (st && st.results ? Object.values(st.results).reduce((n, a) => n + a.length, 0) : 0);

  function statusText(st) {
    if (!st) return T('ready');
    switch (st.phase) {
      case 'running': return T('running', { i: Math.min((st.index || 0) + 1, st.total || 1), n: st.total || '…', site: st.current || '' });
      case 'paused': return T('paused', { site: st.foundSite || '' });
      case 'blocked': return T('blocked', { engine: st.engineName || '' });
      case 'stopped': return T('stopped');
      case 'error': return T(st.errorKey || 'error');
      case 'done': {
        let s = countSites(st) ? T('doneFound', { n: countSites(st) }) : T('notFound');
        if (st.fromCache) s += ' ' + T('cache', { min: Math.max(0, Math.round((Date.now() - st.cachedAt) / 60000)) });
        if (st.errors) s += ' · ' + T('errorsNote', { n: st.errors });
        return s;
      }
      default: return T('ready');
    }
  }

  function setStatusOnly(text) { if (ui) ui.status.textContent = text; }

  function render() {
    if (!ui) return;
    const st = viewState;
    const phase = st ? st.phase : 'idle';
    const dark = settings.theme === 'dark' || (settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    ui.wrap.classList.toggle('dark', dark);

    ui.title.textContent = T('title');
    ui.nick.placeholder = T('nickPh');
    ui.go.textContent = T('search');
    ui.stop.textContent = T('stop');
    ui.cont.textContent = phase === 'paused' ? T('continue') : T('retry');
    ui.autoText.textContent = T('auto');
    ui.auto.checked = !!settings.autoScan;
    ui.status.textContent = statusText(st);

    ui.go.classList.toggle('hide', phase === 'running');
    ui.stop.classList.toggle('hide', phase !== 'running');
    ui.cont.classList.toggle('hide', !(phase === 'paused' || phase === 'blocked' || phase === 'stopped'));
    const pct = st && st.total ? Math.round(((phase === 'done' ? st.total : st.index || 0) / st.total) * 100) : 0;
    ui.fill.style.width = pct + '%';

    const n = countLinks(st);
    ui.badge.textContent = n;
    ui.badge.classList.toggle('found', n > 0);

    /* результаты */
    ui.body.textContent = '';
    if (!st || !st.model) return;
    if (phase === 'blocked') {
      ui.body.appendChild(h('div', { class: 'warn' }, h('div', { text: T('blockedHelp') }), link(st.blockedUrl || '', T('openSearch'))));
    }
    if (n || phase === 'done') ui.body.appendChild(h('div', { class: 'rf', text: T('resultsFor', { model: st.model }) }));
    for (const [site, items] of Object.entries(st.results || {})) {
      const sec = h('div', { class: 'sec' }, h('strong', { text: '📁 ' + site }));
      items.forEach((it) => { const a = link(it.url, it.title, 'l'); if (a) sec.appendChild(a); });
      ui.body.appendChild(sec);
    }
    if (phase === 'done' && !n && st.stats) {
      ui.body.appendChild(h('div', { class: 'rf', text: T('debug', { engine: st.stats.engine, raw: st.stats.raw, req: st.stats.req }) }));
    }
  }

  /* ---------- события расширения ---------- */
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'SAF_STATE' && msg.state && ui && S.norm(msg.state.model) === S.norm(ui.nick.value || currentNick)) {
      viewState = msg.state;
      render();
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (!alive()) return;
    if (area === 'sync') {
      const prevPos = settings.widgetPosition;
      for (const k of Object.keys(changes)) settings[k] = changes[k].newValue;
      if (changes.widgetPosition && changes.widgetPosition.newValue !== prevPos) {
        savedPos = null; chrome.storage.local.remove('safPos'); applyPosition();
      }
      if (changes.autoScan && changes.autoScan.newValue && currentNick && !viewState) scheduleAuto(currentNick);
      tick(); render();
    }
  });

  chrome.storage.sync.get(S.DEFAULTS, (items) => {
    settings = items;
    tick();
    tickTimer = setInterval(tick, 1000);
  });
})();
