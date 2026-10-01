const $ = (id) => document.getElementById(id);
const D = SAF.DEFAULTS;
let cfg = Object.assign({}, D);
const T = (k, v) => SAF.t(cfg.language, k, v);

const NUM = ['requestDelay', 'cacheMinutes', 'searchDelay'];
const CHECK = ['detectAnyStream', 'pauseOnFound', 'autoScan', 'strictMatch', 'testMode'];
const SELECT = ['language', 'theme', 'widgetPosition', 'engine'];
const LISTS = ['streamHosts', 'archiveSites'];

function fill(id, options) {
  const el = $(id); el.textContent = '';
  options.forEach(([v, label]) => { const o = document.createElement('option'); o.value = v; o.textContent = label; el.appendChild(o); });
}

function buildSelects() {
  const sec = cfg.language === 'ru' ? 'с' : 's';
  const hour = cfg.language === 'ru' ? 'ч' : 'h';
  fill('theme', [['dark', T('o_dark')], ['light', T('o_light')], ['auto', T('o_auto')]]);
  fill('widgetPosition', [['top-left', '↖ ' + T('o_tl')], ['top-right', '↗ ' + T('o_tr')], ['bottom-left', '↙ ' + T('o_bl')], ['bottom-right', '↘ ' + T('o_br')]]);
  fill('engine', Object.keys(SAF.ENGINES).map((id) => [id, SAF.ENGINES[id].name]));
  fill('requestDelay', [600, 1200, 2000, 3500].map((n) => [n, (n / 1000) + ' ' + sec]));
  fill('searchDelay', [1000, 2000, 3000, 5000, 10000].map((n) => [n, (n / 1000) + ' ' + sec]));
  fill('cacheMinutes', [[0, T('o_off')], [60, '1 ' + hour], [360, '6 ' + hour], [1440, '24 ' + hour]]);
  const prev = $('diagSite').value;
  fill('diagSite', cfg.archiveSites.map((s) => [s, s]));
  if (prev) $('diagSite').value = prev;
}

function paintTheme() {
  const dark = cfg.theme === 'dark' || (cfg.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.body.classList.toggle('dark', dark);
}

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = T(el.dataset.i18n); });
  document.title = T('o_title');
  document.documentElement.lang = cfg.language;
}

function toForm() {
  buildSelects();
  SELECT.concat(NUM).forEach((k) => { $(k).value = cfg[k]; });
  CHECK.forEach((k) => { $(k).checked = !!cfg[k]; });
  LISTS.forEach((k) => { $(k).value = (cfg[k] || []).join('\n'); });
  applyI18n(); paintTheme();
  $('diagBox').style.display = cfg.testMode ? '' : 'none';
}

let toastTimer;
function toast(text) {
  const t = $('toast'); t.textContent = text; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
}

function save(patch) {
  Object.assign(cfg, patch);
  chrome.storage.sync.set(patch, () => toast(T('o_saved')));
}

function bind() {
  SELECT.forEach((k) => $(k).addEventListener('change', () => {
    save({ [k]: $(k).value });
    if (k === 'language') toForm(); if (k === 'theme') paintTheme();
  }));
  NUM.forEach((k) => $(k).addEventListener('change', () => save({ [k]: parseInt($(k).value, 10) })));
  CHECK.forEach((k) => $(k).addEventListener('change', () => {
    save({ [k]: $(k).checked });
    if (k === 'testMode') $('diagBox').style.display = $(k).checked ? '' : 'none';
  }));
  LISTS.forEach((k) => $(k).addEventListener('change', () => {
    const list = SAF.parseList($(k).value);
    $(k).value = list.join('\n');
    save({ [k]: list });
    if (k === 'archiveSites') buildSelects();
  }));

  $('resetSites').addEventListener('click', () => {
    save({ streamHosts: D.STREAM_HOSTS.slice(), archiveSites: D.ARCHIVE_SITES.slice() });
    toForm();
  });

  $('exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'wcrs-settings.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('importBtn').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', async (e) => {
    try {
      const data = JSON.parse(await e.target.files[0].text());
      const patch = {};
      Object.keys(D).forEach((k) => { if (k in data && typeof data[k] === typeof D[k]) patch[k] = data[k]; });
      Object.assign(cfg, patch);
      chrome.storage.sync.set(patch, () => { toForm(); toast(T('o_imported')); });
    } catch (_) { toast(T('o_badFile')); }
    e.target.value = '';
  });

  $('diagRun').addEventListener('click', async () => {
    const nick = $('diagNick').value.trim(), site = $('diagSite').value;
    const out = $('diagOut');
    out.style.display = 'block';
    if (!nick || !site) { out.textContent = T('noNick'); return; }
    out.textContent = '…';
    $('diagRun').disabled = true;
    const r = await new Promise((res) => chrome.runtime.sendMessage({ type: 'DIAGNOSE', model: nick, site }, res));
    $('diagRun').disabled = false;
    if (!r || !r.report) { out.textContent = 'No response from background: ' + JSON.stringify(r); return; }
    out.textContent = r.report.map((x) =>
      `[${x.engine}] ${x.blocked ? 'BLOCKED (check/captcha/consent)' : x.error ? 'ERROR: ' + x.error : 'ok'}\n` +
      `  query: ${x.query}\n  page: ${x.url}\n  links on page: ${x.rawResults}, matched: ${x.matched}\n` +
      (x.sample.length ? '  ' + x.sample.join('\n  ') + '\n' : '') +
      (x.preview ? '  page text: ' + x.preview + '\n' : '')
    ).join('\n');
  });
}

chrome.storage.sync.get(D, (items) => { cfg = items; toForm(); bind(); });
