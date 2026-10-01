/* Общий модуль: настройки по умолчанию, переводы, парсеры поисковиков, определение ника.
   Подключается в background (importScripts), content, popup и options. */
var SAF = (function () {
  'use strict';

  const STREAM_HOSTS = ['bongacams.com', 'bonga11.com', 'bonga12.com', 'bonga13.com', 'bonga14.com', 'bonga15.com', 'bonga16.com', 'bonga17.com', 'chaturbate.com', 'stripchat.com', 'stripchat.webcam', 'livejasmin.com', 'camsoda.com', 'myfreecams.com', 'streamate.com', 'flirtymania.com', 'imlive.com'];
  const ARCHIVE_SITES = ['striptube.cc', 'showcamrips.com', 'camplanet.cc', 'archive4free.com', 'camrip.cc', 'camhive.net', 'archivebate.com', 'ecordbate.com', 'cumcams.cc', 'recu.me', 'camwhores.tv', 'privaterecords.webcam', 'livecamrips.to', 'camchickscaps.com', 'cloudbate.com', 'xgirls.webcam'];

  const DEFAULTS = {
    pluginEnabled: true,
    language: (typeof navigator !== 'undefined' && /^ru/i.test(navigator.language || '')) ? 'ru' : 'en',
    theme: 'dark',                 // dark | light | auto
    streamHosts: STREAM_HOSTS,
    archiveSites: ARCHIVE_SITES,
    detectAnyStream: true,
    autoScan: false,
    searchDelay: 3000,             // мс до автопоиска
    pauseOnFound: true,
    widgetPosition: 'bottom-right',
    requestDelay: 2000,            // пауза между запросами к поисковику, мс
    strictMatch: true,             // ник должен быть в URL или заголовке
    engine: 'google',              // поисковик по умолчанию: duckduckgo | google | yandex | rambler | mailru
    cacheMinutes: 360,             // 0 = кэш выключен
    testMode: false                // тестовый режим: видимая вкладка поиска + диагностика
  };

  /* ---------- переводы ---------- */
  const I18N = {
    en: {
      title: 'Archive Search', ready: 'Ready to search', nickPh: 'Model nickname', search: 'Search', stop: 'Stop',
      continue: 'Continue', retry: 'Retry', auto: 'Auto-scan', noNick: 'Enter a nickname',
      running: 'Checking {i}/{n}: {site}', paused: 'Found on {site}. Paused', blocked: '{engine} asks for verification',
      blockedHelp: 'Pass the check in the search tab that just opened, come back here and press Retry.', openSearch: 'Open search tab',
      stopped: 'Search stopped', doneFound: 'Done. Sites with results: {n}', notFound: 'Nothing found',
      cache: '(cache, {min} min ago)', resultsFor: 'Results for {model}',
      noSites: 'Archive site list is empty (see settings)', error: 'Search error', errorsNote: 'Failed requests: {n}', debug: 'Debug: engine {engine}, pages loaded {req}, results seen {raw}',
      active: 'Active', disabled: 'Disabled', enabled: 'Plugin enabled', settings: '⚙️ Settings',
      o_title: 'Settings', o_appearance: 'Appearance', o_language: 'Language', o_theme: 'Theme',
      o_dark: 'Dark', o_light: 'Light', o_auto: 'System',
      o_sites: 'Sites', o_streamHosts: 'Stream sites', o_streamHosts_h: 'One domain per line. The widget appears on these sites.',
      o_archiveSites: 'Archive sites', o_archiveSites_h: 'One domain per line. Lines starting with # are ignored.',
      o_resetSites: 'Restore default lists',
      o_search: 'Search', o_requestDelay: 'Pause between requests', o_requestDelay_h: 'Larger pause = less chance that the search engine shows a bot check.',
      o_strictMatch: 'Only results containing the nickname', o_strictMatch_h: 'Hides unrelated pages: the nickname must be in the URL or title.',
      o_engine_warn: 'While searching, a window of the selected search engine may open (!!!!)', o_engine: 'Default search engine', o_engine_h: 'Searches run in a browser tab that opens in the background and closes by itself, so it behaves like your normal browsing.',
      o_cache: 'Cache results', o_cache_h: 'Repeat visits to the same model show saved results instantly. “Search” always refreshes.', o_off: 'Off',
      o_behavior: 'Behavior', o_detectAny: 'Detect any stream', o_detectAny_h: 'Also show the widget on unlisted sites that look like a stream page.',
      o_pause: 'Pause when found', o_pause_h: 'Stop after the first archive site with a result; press Continue to go on.',
      o_autoScan: 'Auto-scan', o_autoScan_h: 'Start searching automatically when a model page is opened.',
      o_delay: 'Auto-scan delay', o_delay_h: 'How long to wait on the page before the automatic search starts.',
      o_position: 'Widget position', o_tl: 'Top left', o_tr: 'Top right', o_bl: 'Bottom left', o_br: 'Bottom right',
      o_position_h: 'You can also drag the widget; choosing a corner here resets the dragged position.',
      o_data: 'Backup', o_export: 'Export settings', o_import: 'Import settings',
      o_test: 'Test mode', o_test_h: 'Search runs in a visible tab with a progress banner and the diagnostics below become available. When off (default), searches run in a minimized window and nothing opens in your tab strip.', o_diag: 'Diagnostics', o_diag_h: 'Runs one real request through every engine and shows what came back. Send me this output if something does not work.',
      o_diagNick: 'Nickname', o_diagSite: 'Archive site', o_run: 'Run test', o_saved: '✅ Saved', o_imported: '✅ Imported', o_badFile: 'Bad file'
    },
    ru: {
      title: 'Поиск архивов', ready: 'Готов к поиску', nickPh: 'Ник модели', search: 'Искать', stop: 'Стоп',
      continue: 'Продолжить', retry: 'Повторить', auto: 'Автопоиск', noNick: 'Введите ник',
      running: 'Проверяю {i}/{n}: {site}', paused: 'Найдено на {site}. Пауза', blocked: '{engine} требует проверку',
      blockedHelp: 'Пройдите проверку во вкладке поиска, которая только что открылась, вернитесь сюда и нажмите «Повторить».', openSearch: 'Открыть вкладку поиска',
      stopped: 'Поиск остановлен', doneFound: 'Готово. Сайтов с результатами: {n}', notFound: 'Ничего не найдено',
      cache: '(кэш, {min} мин назад)', resultsFor: 'Результаты для {model}',
      noSites: 'Список архивных сайтов пуст (см. настройки)', error: 'Ошибка поиска', errorsNote: 'Неудачных запросов: {n}', debug: 'Отладка: поисковик {engine}, загружено страниц {req}, получено результатов {raw}',
      active: 'Активен', disabled: 'Отключён', enabled: 'Плагин включён', settings: '⚙️ Настройки',
      o_title: 'Настройки', o_appearance: 'Внешний вид', o_language: 'Язык', o_theme: 'Тема',
      o_dark: 'Тёмная', o_light: 'Светлая', o_auto: 'Как в системе',
      o_sites: 'Сайты', o_streamHosts: 'Сайты стримов', o_streamHosts_h: 'По одному домену на строку. На этих сайтах появляется виджет.',
      o_archiveSites: 'Архивные сайты', o_archiveSites_h: 'По одному домену на строку. Строки с # в начале игнорируются.',
      o_resetSites: 'Вернуть списки по умолчанию',
      o_search: 'Поиск', o_requestDelay: 'Пауза между запросами', o_requestDelay_h: 'Чем больше пауза, тем меньше шанс, что поисковик покажет проверку на бота.',
      o_strictMatch: 'Только результаты с ником', o_strictMatch_h: 'Скрывает посторонние страницы: ник должен быть в URL или заголовке.',
      o_engine_warn: 'При поиске может открываться окно выбранного поисковика (!!!!)', o_engine: 'Поисковик по умолчанию', o_engine_h: 'Поиск идёт во вкладке браузера: она открывается в фоне и закрывается сама, так что всё работает как при обычном сёрфинге.',
      o_cache: 'Кэшировать результаты', o_cache_h: 'Повторный заход к той же модели покажет сохранённые результаты сразу. Кнопка «Искать» всегда обновляет.', o_off: 'Выкл',
      o_behavior: 'Поведение', o_detectAny: 'Определять любой стрим', o_detectAny_h: 'Показывать виджет и на сайтах не из списка, если страница похожа на стрим.',
      o_pause: 'Пауза при находке', o_pause_h: 'Остановиться после первого архива с результатом; «Продолжить» ищет дальше.',
      o_autoScan: 'Автопоиск', o_autoScan_h: 'Начинать поиск автоматически при открытии страницы модели.',
      o_delay: 'Задержка автопоиска', o_delay_h: 'Сколько ждать на странице перед автоматическим запуском поиска.',
      o_position: 'Позиция виджета', o_tl: 'Сверху слева', o_tr: 'Сверху справа', o_bl: 'Снизу слева', o_br: 'Снизу справа',
      o_position_h: 'Виджет можно перетаскивать; выбор угла здесь сбрасывает перетащенную позицию.',
      o_data: 'Резервная копия', o_export: 'Экспорт настроек', o_import: 'Импорт настроек',
      o_test: 'Тестовый режим', o_test_h: 'Поиск идёт в видимой вкладке с баннером хода поиска, и становится доступна диагностика ниже. Когда выключено (по умолчанию), поиск идёт в свёрнутом окне, и в панели вкладок ничего не открывается.', o_diag: 'Диагностика', o_diag_h: 'Делает один настоящий запрос через каждый поисковик и показывает, что вернулось. Если что-то не работает — пришли мне этот вывод.',
      o_diagNick: 'Ник', o_diagSite: 'Архивный сайт', o_run: 'Запустить тест', o_saved: '✅ Сохранено', o_imported: '✅ Импортировано', o_badFile: 'Неверный файл'
    }
  };

  function t(lang, key, vars) {
    let s = (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
    return s;
  }

  /* ---------- утилиты ---------- */
  const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '');
  const normalizeSite = (s) => String(s || '').trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
  const siteHost = (site) => normalizeSite(site).split('/')[0];
  const hostMatches = (host, base) => {
    host = String(host).toLowerCase().replace(/^www\./, '');
    return !!base && (host === base || host.endsWith('.' + base));
  };
  function parseList(text) {
    const seen = new Set(), out = [];
    String(text || '').split(/[\n,;]+/).forEach((line) => {
      line = line.trim();
      if (!line || line.startsWith('#')) return;
      const v = normalizeSite(line);
      if (v && !seen.has(v)) { seen.add(v); out.push(v); }
    });
    return out;
  }

  /* ---------- поисковики (выдача читается из настоящей вкладки браузера) ---------- */
  const ENGINES = {
    duckduckgo: { name: 'DuckDuckGo', late: false, url: (q) => 'https://html.duckduckgo.com/html/?kp=-2&q=' + encodeURIComponent(q) },
    google:     { name: 'Google',     late: false, url: (q) => 'https://www.google.com/search?hl=en&safe=off&pws=0&q=' + encodeURIComponent(q) },
    yandex:     { name: 'Yandex',     late: true,  url: (q) => 'https://yandex.com/search/?text=' + encodeURIComponent(q) },
    rambler:    { name: 'Rambler',    late: true,  url: (q) => 'https://nova.rambler.ru/search?query=' + encodeURIComponent(q) },
    mailru:     { name: 'Mail.ru',    late: true,  url: (q) => 'https://go.mail.ru/search?q=' + encodeURIComponent(q) }
  };

  // Ссылки-обёртки поисковиков -> реальный адрес
  function unwrapLink(href) {
    try {
      const u = new URL(href);
      if (/(^|\.)duckduckgo\.com$/.test(u.hostname)) { const v = u.searchParams.get('uddg'); if (v) return v; }
      if (/(^|\.)google\.[a-z.]+$/.test(u.hostname) && u.pathname === '/url') {
        const v = u.searchParams.get('q') || u.searchParams.get('url'); if (v) return v;
      }
    } catch (_) {}
    return href;
  }

  // [{href, text}] со страницы -> [{title, url}] без дублей (оставляем самый длинный заголовок)
  function linksToItems(links) {
    const map = new Map();
    for (const l of links || []) {
      const url = unwrapLink(l.href);
      if (!/^https?:\/\//i.test(url)) continue;
      const text = String(l.text || '').trim();
      const prev = map.get(url);
      if (!prev || text.length > prev.title.length) map.set(url, { title: text, url });
    }
    return Array.from(map.values());
  }

  const BLOCK_URL = /\/sorry\/|captcha|consent\.|anomaly/i;
  const BLOCK_TEXT = /unusual traffic|not a robot|are you a robot|captcha|before you continue|bots use DuckDuckGo|anomaly|не робот|капч|подтвердите, что запросы/i;
  const isBlockedPage = (res) => !!res && (BLOCK_URL.test(res.url || '') || BLOCK_TEXT.test(res.body || ''));

  /* ---------- фильтрация результатов ---------- */
  function cleanResultUrl(u) {
    try {
      const x = new URL(u);
      ['page', 'p'].forEach((k) => x.searchParams.delete(k));
      x.hash = '';
      return x.toString().replace(/\/(?:\d+-pg|pg\/\d+|page\/\d+)(?=\/|$)/i, '').replace(/\?$/, '');
    } catch (_) { return u; }
  }

  function filterItems(items, site, model, opts) {
    const base = siteHost(site), nm = norm(model);
    const seen = new Set(), out = [];
    for (const it of items) {
      let u; try { u = new URL(it.url); } catch (_) { continue; }
      if (!hostMatches(u.hostname, base)) continue;
      let path = u.pathname + u.search;
      try { path = decodeURIComponent(path); } catch (_) {}
      const inUrl = !!nm && norm(path).includes(nm);
      const inTitle = !!nm && norm(it.title).includes(nm);
      if (opts.strictMatch && nm && !inUrl && !inTitle) continue;
      const url = cleanResultUrl(it.url);
      const key = url.replace(/\/$/, '').toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ title: (it.title || u.hostname).slice(0, 140), url, score: (inUrl ? 2 : 0) + (inTitle ? 1 : 0) });
    }
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, 1).map(({ title, url }) => ({ title, url })); // одна лучшая ссылка на сайт
  }

  // 1) "ник" "сайт" — как ты ищешь руками; 2) site:сайт "ник" — запасной вариант
  function buildQueryVariants(site, model) {
    return ['"' + model + '" "' + site + '"', 'site:' + site + ' "' + model + '"'];
  }

  /* ---------- определение ника по URL ---------- */
  const SKIP = new Set(['live', 'cam', 'cams', 'room', 'rooms', 'chat', 'model', 'models', 'profile', 'profiles', 'b', 'p', 'broadcaster', 'broadcasters', 'performer', 'performers', 'webcam', 'webcams', 'show', 'shows', 'in', 'view', 'free', 'video', 'videos', 'html', 'index']);
  const LISTING = new Set(['tag', 'tags', 'category', 'categories', 'search', 'country', 'region', 'explore', 'discover', 'top', 'new', 'featured', 'girls', 'girl', 'couples', 'men', 'trans', 'following', 'favorites', 'messages', 'settings', 'account', 'tokens', 'buy', 'login', 'signin', 'signup', 'register', 'api', 'static', 'blog', 'help', 'support', 'terms', 'about', 'home', 'contests', 'apps', 'tipping', 'affiliates', 'dmca', 'privacy', 'faq', 'news', 'all']);
  const NICK_RE = /^[\p{L}\p{N}_.\-]{3,40}$/u;
  function extractNick(urlStr) {
    try {
      const u = new URL(urlStr);
      for (const k of ['room', 'model', 'username', 'nick', 'performer']) {
        const v = u.searchParams.get(k);
        if (v && NICK_RE.test(v)) return v;
      }
      const hm = u.hash.match(/^#\/?([^\/?#]+)$/);
      if (hm && NICK_RE.test(hm[1]) && !LISTING.has(hm[1].toLowerCase())) return hm[1];
      const parts = u.pathname.split('/').filter(Boolean).map((p) => { try { return decodeURIComponent(p); } catch (_) { return p; } });
      for (const part of parts) {
        const low = part.toLowerCase();
        if (/^[a-z]{2}(-[a-z]{2})?$/.test(low) || /^\d+$/.test(low) || SKIP.has(low)) continue;
        if (LISTING.has(low) || /-cams$/.test(low)) return null;
        return NICK_RE.test(part) ? part : null;
      }
    } catch (_) {}
    return null;
  }

  const api = {
    DEFAULTS, STREAM_HOSTS, ARCHIVE_SITES, I18N, ENGINES, t, norm, normalizeSite, siteHost, hostMatches, parseList,
    unwrapLink, linksToItems, isBlockedPage, cleanResultUrl, filterItems, buildQueryVariants, extractNick
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  return api;
})();
