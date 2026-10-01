/* Service worker. Поиск идёт через настоящую вкладку браузера: открываем страницу поисковика
   в фоновой вкладке, content.js читает из неё ссылки, вкладка закрывается.
   Так работают cookies и сессия самого браузера, и поисковики не принимают нас за бота. */
importScripts('shared.js');

const runs = new Map();   // tabId (вкладка стрима) -> { cancelled, tabId (поисковая), st, raw, req }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getSettings = () => chrome.storage.sync.get(SAF.DEFAULTS);

/* ---------- состояние вкладки стрима (переживает засыпание service worker) ---------- */
const stKey = (id) => 'tab:' + id;
async function getState(tabId) {
  const o = await chrome.storage.session.get(stKey(tabId));
  return o[stKey(tabId)] || null;
}
async function putState(tabId, st) {
  await chrome.storage.session.set({ [stKey(tabId)]: st });
  chrome.tabs.sendMessage(tabId, { type: 'SAF_STATE', state: st }).catch(() => {});
}

/* ---------- работа с поисковой вкладкой ---------- */
const loadedAt = new Map();   // tabId -> время последнего status:'complete'
chrome.tabs.onUpdated.addListener((id, info) => { if (info.status === 'complete') loadedAt.set(id, Date.now()); });

/* Обычный режим: свёрнутое окно (в панели вкладок ничего не появляется).
   Тестовый режим: обычная видимая вкладка. Если свернуть окно не вышло — фоновая вкладка. */
async function openSurface(run, url) {
  if (run.test) {
    const tab = await chrome.tabs.create({ url, active: true });
    run.tabId = tab.id; run.winId = null;
    return;
  }
  try {
    const win = await chrome.windows.create({ url, state: 'minimized', focused: false });
    let tab = win.tabs && win.tabs[0];
    if (!tab) tab = (await chrome.tabs.query({ windowId: win.id }))[0];
    run.tabId = tab.id; run.winId = win.id;
  } catch (_) {
    const tab = await chrome.tabs.create({ url, active: false });
    run.tabId = tab.id; run.winId = null;
  }
}

async function navigate(run, url) {
  const t0 = Date.now();
  let id = null;
  if (run.tabId != null) { try { await chrome.tabs.get(run.tabId); id = run.tabId; } catch (_) { run.tabId = null; } }
  if (id == null) {
    await openSurface(run, url);
    id = run.tabId;
  } else {
    await chrome.tabs.update(id, { url });
  }
  while (Date.now() - t0 < 25000 && (loadedAt.get(id) || 0) < t0) await sleep(150);
  return id;
}

async function extractFromTab(id) {
  for (let i = 0; i < 20; i++) {
    try {
      const r = await chrome.tabs.sendMessage(id, { type: 'SAF_EXTRACT' });
      if (r && r.links) return r;
    } catch (_) { /* content script ещё не загрузился */ }
    await sleep(300);
  }
  return null;
}

async function closeTab(run) {
  if (run.winId != null) { try { await chrome.windows.remove(run.winId); } catch (_) {} }
  else if (run.tabId != null) { try { await chrome.tabs.remove(run.tabId); } catch (_) {} }
  run.tabId = null; run.winId = null;
}

async function focusSurface(run) {
  try {
    const tab = await chrome.tabs.get(run.tabId);
    await chrome.windows.update(tab.windowId, { state: 'normal', focused: true });
    await chrome.tabs.update(run.tabId, { active: true });
  } catch (_) {}
}
async function banner(run, id, text) {
  if (run.test) chrome.tabs.sendMessage(id, { type: 'SAF_BANNER', text }).catch(() => {});
}

/* Один поисковый запрос -> { items } | { blocked, url } | { error } */
async function runQuery(run, engineId, q, site) {
  const eng = SAF.ENGINES[engineId];
  const base = SAF.siteHost(site);
  run.req++;
  try {
    const id = await navigate(run, eng.url(q));
    let res = null, items = [];
    for (let attempt = 0; attempt < (eng.late ? 3 : 1); attempt++) {
      if (attempt) await sleep(800);
      res = await extractFromTab(id);
      if (!res) continue;
      await banner(run, id, eng.name + ' · ' + (run.label || '') + ' · ' + q);
      if (SAF.isBlockedPage(res)) return { blocked: true, url: res.url };
      items = SAF.linksToItems(res.links);
      if (items.some((i) => { try { return SAF.hostMatches(new URL(i.url).hostname, base); } catch (_) { return false; } })) break;
    }
    if (!res) return { error: 'no response from page' };
    return { items, url: res.url, body: res.body };
  } catch (e) {
    return { error: String((e && e.message) || e) };
  }
}

async function searchSite(site, model, s, run) {
  const engineId = SAF.ENGINES[s.engine] ? s.engine : 'google';
  let anyOk = false;
  for (const q of SAF.buildQueryVariants(site, model)) {
    if (run.cancelled) return { items: [] };
    const r = await runQuery(run, engineId, q, site);
    if (r.blocked) return { items: [], blocked: true, url: r.url };
    if (r.error) continue;
    anyOk = true;
    run.raw += r.items.length;
    const items = SAF.filterItems(r.items, site, model, s);
    if (items.length) return { items };
    await sleep(s.requestDelay);
  }
  return { items: [], failed: !anyOk };
}

/* ---------- кэш ---------- */
async function readCache(model, minutes) {
  if (!minutes) return null;
  const k = 'cache:' + model.toLowerCase();
  const o = await chrome.storage.local.get(k);
  const c = o[k];
  if (c && Date.now() - c.at < minutes * 60000) return c;
  return null;
}
async function writeCache(st, minutes) {
  if (!minutes) return;
  await chrome.storage.local.set({ ['cache:' + st.model.toLowerCase()]: { at: Date.now(), state: st } });
  const all = await chrome.storage.local.get(null);
  const keys = Object.keys(all).filter((k) => k.startsWith('cache:')).sort((a, b) => all[a].at - all[b].at);
  if (keys.length > 100) await chrome.storage.local.remove(keys.slice(0, keys.length - 100));
}

/* ---------- основной цикл ---------- */
function startRun(tabId, st) {
  const run = {
    cancelled: false, st, keepTab: false, test: false, label: '',
    tabId: st.searchTabId != null ? st.searchTabId : null,
    winId: st.searchWinId != null ? st.searchWinId : null,
    raw: (st.stats && st.stats.raw) || 0, req: (st.stats && st.stats.req) || 0
  };
  runs.set(tabId, run);
  loop(tabId, st, run)
    .catch(async (e) => {
      console.error('[SAF] loop error', e);
      if (run.cancelled) return;
      st.phase = 'error';
      await putState(tabId, st);
    })
    .finally(async () => { if (!run.keepTab) await closeTab(run); });
}

async function loop(tabId, st, run) {
  const s = await getSettings();
  const engineName = (SAF.ENGINES[s.engine] || SAF.ENGINES.google).name;
  const save = async () => { if (!run.cancelled) await putState(tabId, st); };
  run.test = !!s.testMode;
  st.phase = 'running'; st.searchTabId = null; st.searchWinId = null;
  // после проверки/капчи окно было развёрнуто — снова сворачиваем его
  if (!run.test && run.winId != null) { try { await chrome.windows.update(run.winId, { state: 'minimized' }); } catch (_) {} }
  while (st.index < st.total) {
    if (run.cancelled) return;
    const site = st.sites[st.index];
    st.current = site;
    run.label = engineName + ' ' + (st.index + 1) + '/' + st.total + ' · ' + site + ' · ' + Object.keys(st.results).length + ' ✓';
    await save();
    const r = await searchSite(site, st.model, s, run);
    if (run.cancelled) return;
    st.stats = { raw: run.raw, req: run.req, engine: engineName };
    if (r.blocked) {
      run.keepTab = true;                       // вкладку не закрываем: в ней нужно пройти проверку
      st.phase = 'blocked'; st.blockedUrl = r.url; st.engineName = engineName; st.searchTabId = run.tabId; st.searchWinId = run.winId;
      await save();
      if (run.tabId != null) await focusSurface(run);
      return;
    }
    if (r.failed) st.errors = (st.errors || 0) + 1;
    st.checked.push(site);
    if (r.items.length) st.results[site] = r.items;
    st.index++;
    if (r.items.length && s.pauseOnFound && st.index < st.total) {
      if (run.test) { run.keepTab = true; st.searchTabId = run.tabId; st.searchWinId = run.winId; }
      st.phase = 'paused'; st.foundSite = site; await save(); return;
    }
    await save();
    if (st.index < st.total) await sleep(s.requestDelay + Math.random() * 500);
  }
  st.phase = 'done'; st.current = null; st.finishedAt = Date.now();
  if (run.test) { run.keepTab = true; if (run.tabId != null) banner(run, run.tabId, engineName + ' · ✔ ' + Object.keys(st.results).length + ' / ' + st.total); }
  await save();
  if (!run.cancelled && !st.errors) await writeCache(st, s.cacheMinutes);
}

function cancelRun(tabId) {
  const run = runs.get(tabId);
  if (run) { run.cancelled = true; runs.delete(tabId); }
  return run;
}

async function startSearch(tabId, model, force) {
  const old = cancelRun(tabId);
  if (old) await closeTab(old);
  model = String(model || '').trim();
  const s = await getSettings();
  const sites = s.archiveSites.map(SAF.normalizeSite).filter(Boolean);
  if (!model) return putState(tabId, { model, phase: 'error', errorKey: 'noNick', results: {}, checked: [] });
  if (!sites.length) return putState(tabId, { model, phase: 'error', errorKey: 'noSites', results: {}, checked: [] });
  if (!force) {
    const c = await readCache(model, s.cacheMinutes);
    if (c) return putState(tabId, Object.assign({}, c.state, { phase: 'done', fromCache: true, cachedAt: c.at }));
  }
  const st = { model, phase: 'running', index: 0, total: sites.length, sites, current: sites[0], results: {}, checked: [], errors: 0 };
  await putState(tabId, st);
  startRun(tabId, st);
}

/* ---------- диагностика (страница настроек): один запрос через каждый поисковик ---------- */
async function diagnose(model, site) {
  const s = await getSettings();
  const q = SAF.buildQueryVariants(site, model)[0];
  const out = [];
  for (const id of Object.keys(SAF.ENGINES)) {
    const run = { tabId: null, winId: null, raw: 0, req: 0, test: true, label: 'diagnostics' };
    const r = await runQuery(run, id, q, site);
    const raw = r.items || [];
    const matched = SAF.filterItems(raw, site, model, s);
    out.push({
      engine: SAF.ENGINES[id].name, query: q, url: r.url || '', blocked: !!r.blocked, error: r.error || null,
      rawResults: raw.length, matched: matched.length,
      sample: (matched.length ? matched : raw).slice(0, 3).map((i) => i.url),
      preview: matched.length ? '' : String(r.body || '').replace(/\s+/g, ' ').slice(0, 200)
    });
    await closeTab(run);
    await sleep(800);
  }
  return out;
}

/* ---------- сообщения ---------- */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab && sender.tab.id;
  (async () => {
    switch (msg.type) {
      case 'START_SEARCH':
        if (tabId != null) await startSearch(tabId, msg.model, !!msg.force);
        return { ok: true };
      case 'STOP_SEARCH': {
        if (tabId == null) return { ok: true };
        const run = cancelRun(tabId);
        const st = (run && run.st) || (await getState(tabId));
        if (run) await closeTab(run);
        if (st) { st.phase = 'stopped'; await putState(tabId, st); }
        return { ok: true };
      }
      case 'CONTINUE_SEARCH': {
        if (tabId == null) return { ok: true };
        const st = await getState(tabId);
        if (st && (st.phase === 'paused' || st.phase === 'blocked' || st.phase === 'stopped')) {
          cancelRun(tabId);
          startRun(tabId, st);
        }
        return { ok: true };
      }
      case 'RESET': {
        if (tabId == null) return { ok: true };
        const run = cancelRun(tabId);
        const st = await getState(tabId);
        if (run) await closeTab(run);
        else if (st && st.searchTabId != null) { try { await chrome.tabs.remove(st.searchTabId); } catch (_) {} }
        await chrome.storage.session.remove(stKey(tabId));
        return { ok: true };
      }
      case 'GET_STATE':
        return { state: tabId != null ? await getState(tabId) : null };
      case 'DIAGNOSE':
        return { report: await diagnose(String(msg.model || ''), SAF.siteHost(msg.site || '')) };
    }
    return { ok: false };
  })().then(sendResponse).catch((e) => sendResponse({ ok: false, error: String(e) }));
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  loadedAt.delete(tabId);
  const run = cancelRun(tabId);
  if (run) closeTab(run);
  chrome.storage.session.remove(stKey(tabId));
});
