// Переводы статусов
const STATUS_TEXT = {
    en: { checking: 'Checking', foundOn: 'Found on', paused: 'Search paused', completed: 'Search completed', stopped: 'Search stopped', mirror_search: 'Searching for working mirror...', mirror_found: 'Working mirror' },
    ru: { checking: 'Проверяю', foundOn: 'Найдено на', paused: 'Поиск на паузе', completed: 'Поиск завершён', stopped: 'Поиск остановлен', mirror_search: 'Ищу рабочее зеркало Bongacams...', mirror_found: 'Рабочее зеркало' }
};

let bgLang = 'en';
chrome.storage.sync.get({ language: 'en' }, (items) => { bgLang = items.language || 'ru'; });
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.language) {
        bgLang = changes.language.newValue || 'en';
    }
});

function t(key) {
    return (STATUS_TEXT[bgLang] && STATUS_TEXT[bgLang][key]) || STATUS_TEXT.ru[key] || key;
}
function t(key) {
  return STATUS_TEXT[key] || key;
}

const SEARCH_ENGINES = [
  { name: 'DuckDuckGo', search: searchDuckDuckGo },
  { name: 'Яндекс', search: searchYandex },
  { name: 'Google', search: searchGoogle },
  { name: 'Rambler', search: searchRambler },
  { name: 'Mail.ru', search: searchMailRu },
  { name: 'Bing', search: searchBing }
];

const BLACKLIST_DOMAINS = [
  'mradx.net', 'mail.ru', 'yandex.ru', 'yandex.com', 'ya.ru',
  'google.com', 'google.ru', 'duckduckgo.com', 'bing.com',
  'rambler.ru', 'doubleclick.net', 'googleadservices.com',
  'googlesyndication.com', 'adclick', 'advertising',
  'facebook.com', 'vk.com', 'twitter.com', 'youtube.com'
];

const searchResults = new Map();
const cancelledSearches = new Set();
const pausedSearches = new Map();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'START_SEARCH') {
    const tabId = sender.tab?.id;
    if (tabId) {
      cancelledSearches.delete(tabId);
      pausedSearches.delete(tabId);
      startCascadeSearch(tabId, msg.data);
    }
    sendResponse({ ok: true });
  }
  if (msg.type === 'STOP_SEARCH') {
    const tabId = sender.tab?.id;
    if (tabId) {
      cancelledSearches.add(tabId);
      pausedSearches.delete(tabId);
    }
    sendResponse({ ok: true });
  }
  if (msg.type === 'CONTINUE_SEARCH') {
    const tabId = sender.tab?.id;
    if (tabId) {
      const paused = pausedSearches.get(tabId);
      if (paused) {
        console.log('[SAF] Continuing search from index:', paused.siteIndex);
        pausedSearches.delete(tabId);
        continueSearch(tabId, paused.siteIndex, paused.allResults, paused.model, paused.hostname);
      } else {
        console.log('[SAF] No paused search found for tab:', tabId);
      }
    }
    sendResponse({ ok: true });
  }
  if (msg.type === 'GET_RESULTS') {
    const results = searchResults.get(msg.tabId) || {};
    sendResponse({ results });
  }
  if (msg.type === 'FIND_BONGA_MIRROR') {
    findBongaMirror().then(mirror => sendResponse({ mirror }));
    return true;
  }
});

function isBlacklisted(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return BLACKLIST_DOMAINS.some(d => hostname.includes(d));
  } catch (e) {
    return true;
  }
}

function cleanModelUrl(url) {
  if (!url) return url;
  let cleaned = url.trim();
  cleaned = cleaned.replace(/\/\d+-pg\//gi, '/');
  cleaned = cleaned.replace(/\/page\/\d+\//gi, '/');
  cleaned = cleaned.replace(/\/pg\/\d+\//gi, '/');
  cleaned = cleaned.replace(/[?&]page=\d+/gi, '');
  cleaned = cleaned.replace(/[?&]p=\d+/gi, '');
  cleaned = cleaned.replace(/^\/([a-zA-Z0-9.-]+\.[a-z]{2,}\/?.*)$/i, '$1');
  if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
    cleaned = 'https://' + cleaned;
  }
  cleaned = cleaned.replace(/^https?:\/+/, 'https://');
  cleaned = cleaned.replace(/([^:])\/\//g, '$1/');
  cleaned = cleaned.replace(/[?&]$/, '');
  if (cleaned !== url) {
    console.log(`[SAF] URL cleaned: "${url}" → "${cleaned}"`);
  }
  return cleaned;
}

function cleanTitle(title, url) {
  if (!title) {
    try { return new URL(url).hostname.replace('www.', ''); } catch (e) { return 'Ссылка'; }
  }
  let cleaned = title.trim();
  cleaned = cleaned.replace(/\(document\.querySelector\([^)]*\)\|\|\{\}\)\.offsetHeight/gi, '');
  cleaned = cleaned.replace(/document\.querySelector\([^)]*\)/gi, '');
  cleaned = cleaned.replace(/\{[^}]*\}/g, '');
  cleaned = cleaned.replace(/\([^)]*\)/g, '');
  cleaned = cleaned.replace(/ya\.rum\.sendraf\(\d+\)/gi, '');
  cleaned = cleaned.replace(/javascript:[^ ]*/gi, '');
  cleaned = cleaned.replace(/[{}[\]]/g, '');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  if (cleaned.length < 3) {
    try { cleaned = new URL(url).hostname.replace('www.', ''); } catch (e) { cleaned = 'Ссылка'; }
  }
  if (cleaned !== title) {
    console.log(`[SAF] Title cleaned: "${title}" → "${cleaned}"`);
  }
  return cleaned;
}

function isModelMatch(url, title, model) {
  if (!model) return true;
  const modelLower = model.toLowerCase();
  const urlLower = url.toLowerCase();
  const titleLower = title.toLowerCase();
  const modelVariants = [
    modelLower,
    modelLower.replace(/[-_]/g, ''),
    modelLower.replace(/[-_]/g, ' '),
    modelLower.replace(/-/g, '_'),
    modelLower.replace(/_/g, '-')
  ];
  const cleanTitleText = titleLower
    .replace(/ya\.rum\.sendraf\(\d+\)/gi, '')
    .replace(/javascript:[^ ]*/gi, '')
    .replace(/\(\d+\)/g, '')
    .replace(/[{}[\]]/g, '')
    .replace(/\(document\.querySelector\([^)]*\)\|\|\{\}\)\.offsetHeight/gi, '')
    .trim();
  const urlHasModel = modelVariants.some(variant => {
    const pathPattern = new RegExp('[/\\\\]' + variant.replace(/[-_]/g, '[-_]') + '([/\\\\?&]|$)', 'i');
    return pathPattern.test(urlLower);
  });
  const titleHasModel = modelVariants.some(variant => {
    const titlePattern = new RegExp('(^|[^a-z0-9])' + variant.replace(/[-_]/g, '[-_]') + '([^a-z0-9]|$)', 'i');
    return titlePattern.test(cleanTitleText);
  });
  const isTechnicalTitle = cleanTitleText.length < 3 ||
    cleanTitleText.includes('sendraf') ||
    cleanTitleText.includes('javascript') ||
    /^[0-9\(\)\{\}\[\]]+$/.test(cleanTitleText.replace(/\s/g, ''));
  if (isTechnicalTitle) {
    console.log(`[SAF] Filtered technical title: "${title}"`);
    return false;
  }
  const result = urlHasModel || titleHasModel;
  if (!result) {
    console.log(`[SAF] Filtered (no model match): "${title}" - URL: ${url}`);
  }
  return result;
}

async function startCascadeSearch(tabId, data) {
  const { model, hostname } = data;
  console.log('[SAF] Starting search for:', model, 'on tab:', tabId);
  let useBongaMirror = false;
  if (hostname.toLowerCase().includes('bonga')) {
    useBongaMirror = await new Promise(resolve => {
      chrome.storage.sync.get({ useBongaMirror: true }, items => resolve(items.useBongaMirror));
    });
    if (useBongaMirror) {
      sendUpdate(tabId, { status: '🔍 ' + t('mirror_search') });
      const mirror = await findBongaMirror();
      sendUpdate(tabId, { status: '✅ ' + t('mirror_found') + ': ' + mirror });
    }
  }
  const settings = await new Promise(resolve => {
    chrome.storage.sync.get({
      archiveSites: getDefaultArchiveSites(),
      searchDelayMs: 3000,
      pauseOnFound: true
    }, resolve);
  });
  const allResults = {};
  for (let i = 0; i < settings.archiveSites.length; i++) {
    if (cancelledSearches.has(tabId)) {
      sendUpdate(tabId, { status: '⛔ ' + t('stopped'), completed: true, results: allResults });
      return;
    }
    const site = settings.archiveSites[i];
    const siteName = extractDomain(site);
    sendUpdate(tabId, {
      status: ' ' + t('checking') + ' ' + (i + 1) + '/' + settings.archiveSites.length + ': ' + siteName + '...',
      progress: { current: i + 1, total: settings.archiveSites.length }
    });
    let found = false;
    for (let j = 0; j < SEARCH_ENGINES.length; j++) {
      if (cancelledSearches.has(tabId)) {
        sendUpdate(tabId, { status: ' ' + t('stopped'), completed: true, results: allResults });
        return;
      }
      const engine = SEARCH_ENGINES[j];
      if (j > 0) {
        await new Promise(r => setTimeout(r, settings.searchDelayMs));
      }
      console.log(`[SAF] Trying ${engine.name} for ${siteName}...`);
      const results = await engine.search(site, model);
      if (results.captcha) {
        console.log(`[SAF] ${engine.name} captcha detected, trying next...`);
        continue;
      }
      const filteredItems = results.items.filter(item => {
        if (isBlacklisted(item.url)) return false;
        if (!isModelMatch(item.url, item.title, model)) return false;
        return true;
      });
      console.log(`[SAF] ${engine.name} returned ${results.items.length} items, after filter: ${filteredItems.length}`);
      if (filteredItems.length > 0) {
        const firstItem = { ...filteredItems[0] };
        firstItem.url = cleanModelUrl(firstItem.url);
        firstItem.title = cleanTitle(firstItem.title, firstItem.url);
        allResults[siteName] = [firstItem];
        found = true;
        break;
      }
    }
    sendUpdate(tabId, { results: allResults });
    if (found && settings.pauseOnFound) {
      console.log('[SAF] Pausing search, found result on:', siteName);
      pausedSearches.set(tabId, {
        siteIndex: i + 1,
        allResults: allResults,
        model: model,
        hostname: hostname
      });
      sendUpdate(tabId, {
        status: '⏸️ ' + t('foundOn') + ' ' + siteName + '. ' + t('paused') + '.',
        paused: true,
        results: allResults
      });
      return;
    }
    if (i < settings.archiveSites.length - 1) {
      await new Promise(r => setTimeout(r, settings.searchDelayMs));
    }
  }
  sendUpdate(tabId, { status: '✅ ' + t('completed'), completed: true, results: allResults });
  searchResults.set(tabId, allResults);
}

async function continueSearch(tabId, startIndex, existingResults, model, hostname) {
  console.log('[SAF] Continuing search from index:', startIndex);
  const settings = await new Promise(resolve => {
    chrome.storage.sync.get({
      archiveSites: getDefaultArchiveSites(),
      searchDelayMs: 3000,
      pauseOnFound: true
    }, resolve);
  });
  const allResults = existingResults;
  for (let i = startIndex; i < settings.archiveSites.length; i++) {
    if (cancelledSearches.has(tabId)) {
      sendUpdate(tabId, { status: '⛔ ' + t('stopped'), completed: true, results: allResults });
      return;
    }
    const site = settings.archiveSites[i];
    const siteName = extractDomain(site);
    sendUpdate(tabId, {
      status: ' ' + t('checking') + ' ' + (i + 1) + '/' + settings.archiveSites.length + ': ' + siteName + '...',
      progress: { current: i + 1, total: settings.archiveSites.length }
    });
    let found = false;
    for (let j = 0; j < SEARCH_ENGINES.length; j++) {
      if (cancelledSearches.has(tabId)) {
        sendUpdate(tabId, { status: ' ' + t('stopped'), completed: true, results: allResults });
        return;
      }
      const engine = SEARCH_ENGINES[j];
      if (j > 0) {
        await new Promise(r => setTimeout(r, settings.searchDelayMs));
      }
      const results = await engine.search(site, model);
      if (results.captcha) continue;
      const filteredItems = results.items.filter(item => {
        if (isBlacklisted(item.url)) return false;
        if (!isModelMatch(item.url, item.title, model)) return false;
        return true;
      });
      if (filteredItems.length > 0) {
        const firstItem = { ...filteredItems[0] };
        firstItem.url = cleanModelUrl(firstItem.url);
        firstItem.title = cleanTitle(firstItem.title, firstItem.url);
        allResults[siteName] = [firstItem];
        found = true;
        break;
      }
    }
    sendUpdate(tabId, { results: allResults });
    if (found && settings.pauseOnFound) {
      pausedSearches.set(tabId, {
        siteIndex: i + 1,
        allResults: allResults,
        model: model,
        hostname: hostname
      });
      sendUpdate(tabId, {
        status: '⏸️ ' + t('foundOn') + ' ' + siteName + '. ' + t('paused') + '.',
        paused: true,
        results: allResults
      });
      return;
    }
    if (i < settings.archiveSites.length - 1) {
      await new Promise(r => setTimeout(r, settings.searchDelayMs));
    }
  }
  sendUpdate(tabId, { status: '✅ ' + t('completed'), completed: true, results: allResults });
  searchResults.set(tabId, allResults);
}

function sendUpdate(tabId, data) {
  chrome.tabs.sendMessage(tabId, { type: 'SEARCH_UPDATE', data }).catch(() => {});
}

function getDefaultArchiveSites() {
  return [
    "site:striptube.cc {model}",
    "site:archivebate.com {model}",
    "site:showcamrips.com {model}",
    "site:camplanet.cc {model}",
    "site:archive4free.com {model}",
    "site:camrip.cc {model}",
    "site:camhive.net {model}",
    "site:ecordbate.com {model}",
    "site:cumcams.cc {model}",
    "site:recu.me {model}",
    "site:camwhores.tv {model}",
    "site:privaterecords.webcam {model}",
    "site:livecamrips.to {model}",
    "site:camchickscaps.com {model}",
    "site:cloudbate.com {model}"
  ];
}
function extractDomain(template) {
  const match = template.match(/site:([^\s]+)/);
  if (match) return match[1];
  return template.substring(0, 30);
}

async function findBongaMirror() {
  for (const engine of SEARCH_ENGINES) {
    const results = await engine.search('bongacams official site', '');
    if (!results.captcha && results.items.length > 0) {
      for (const item of results.items) {
        if (!item.isAd && item.url.includes('bonga') && !isBlacklisted(item.url)) {
          try { return new URL(item.url).hostname; } catch (e) { continue; }
        }
      }
    }
    await new Promise(r => setTimeout(r, 3000));
  }
  return 'bongacams.com';
}

async function fetchHtml(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': getRotatedUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    });
    const html = await response.text();
    console.log(`[SAF] Fetched ${url}, length: ${html.length}`);
    return html;
  } catch (e) {
    console.error(`[SAF] Fetch error for ${url}:`, e);
    return '';
  }
}

async function searchDuckDuckGo(template, model) {
  const query = model ? template.replace(/{model}/g, model) : template;
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const html = await fetchHtml(url);
  if (!html) return { items: [], captcha: false };
  if (html.includes('captcha') || html.includes('bot detection') || html.includes('Unusual Traffic')) {
    return { items: [], captcha: true };
  }
  const items = [];
  const resultRegex = /class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
  let match;
  while ((match = resultRegex.exec(html)) !== null) {
    let href = match[1];
    const title = match[2].trim();
    let realUrl = href;
    if (href.includes('uddg=')) {
      const uddgMatch = href.match(/uddg=([^&]+)/);
      if (uddgMatch) { try { realUrl = decodeURIComponent(uddgMatch[1]); } catch(e) {} }
    }
    if (!realUrl.startsWith('http')) continue;
    if (realUrl.includes('duckduckgo.com')) continue;
    if (title.length < 3 || title.length > 200) continue;
    if (items.some(i => i.url === realUrl)) continue;
    items.push({ title, url: realUrl, isAd: false });
  }
  return { items: items.slice(0, 10), captcha: false };
}

async function searchYandex(template, model) {
  const query = model ? template.replace(/{model}/g, model) : template;
  const url = `https://yandex.ru/search/?text=${encodeURIComponent(query)}&lr=225`;
  const html = await fetchHtml(url);
  if (!html) return { items: [], captcha: false };
  if (html.includes('showcaptcha') || html.includes('SmartCaptcha') || html.includes('captcha')) {
    return { items: [], captcha: true };
  }
  const items = [];
  const linkRegex = /href="(https?:\/\/[^"]+)"/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    if (!href.startsWith('http')) continue;
    let hostname = '';
    try { hostname = new URL(href).hostname.toLowerCase(); } catch(e) { continue; }
    if (hostname.includes('yandex.') || hostname.includes('ya.ru')) continue;
    const contextStart = Math.max(0, match.index - 500);
    const contextEnd = Math.min(html.length, match.index + 500);
    const context = html.substring(contextStart, contextEnd);
    const titleMatch = context.match(/>([^<]{5,200})</);
    const title = titleMatch ? titleMatch[1].trim() : hostname;
    if (title.length < 3 || title.length > 200) continue;
    if (items.some(i => i.url === href)) continue;
    items.push({ title, url: href, isAd: false });
  }
  return { items: items.slice(0, 10), captcha: false };
}

async function searchGoogle(template, model) {
  const query = model ? template.replace(/{model}/g, model) : template;
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=ru`;
  const html = await fetchHtml(url);
  if (!html) return { items: [], captcha: false };
  if (html.includes('captcha') || html.includes('unusual traffic') || html.includes('automated')) {
    return { items: [], captcha: true };
  }
  const items = [];
  const linkRegex = /\/url\?q=(https?:\/\/[^&"]+)/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    let url = match[1];
    try { url = decodeURIComponent(url); } catch(e) {}
    if (!url.startsWith('http')) continue;
    let hostname = '';
    try { hostname = new URL(url).hostname.toLowerCase(); } catch(e) { continue; }
    if (hostname.includes('google.')) continue;
    const contextStart = Math.max(0, match.index - 500);
    const contextEnd = Math.min(html.length, match.index + 500);
    const context = html.substring(contextStart, contextEnd);
    const titleMatch = context.match(/>([^<]{5,200})</);
    const title = titleMatch ? titleMatch[1].trim() : hostname;
    if (title.length < 3 || title.length > 200) continue;
    if (items.some(i => i.url === url)) continue;
    items.push({ title, url: url, isAd: false });
  }
  return { items: items.slice(0, 10), captcha: false };
}

async function searchRambler(template, model) {
  const query = model ? template.replace(/{model}/g, model) : template;
  const url = `https://nova.rambler.ru/search?query=${encodeURIComponent(query)}`;
  const html = await fetchHtml(url);
  if (!html) return { items: [], captcha: false };
  if (html.includes('captcha')) return { items: [], captcha: true };
  const items = [];
  const linkRegex = /href="(https?:\/\/[^"]+)"/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    let hostname = '';
    try { hostname = new URL(href).hostname.toLowerCase(); } catch(e) { continue; }
    if (hostname.includes('rambler.')) continue;
    if (items.some(i => i.url === href)) continue;
    const contextStart = Math.max(0, match.index - 500);
    const contextEnd = Math.min(html.length, match.index + 500);
    const context = html.substring(contextStart, contextEnd);
    const titleMatch = context.match(/>([^<]{5,200})</);
    const title = titleMatch ? titleMatch[1].trim() : hostname;
    if (title.length < 3 || title.length > 200) continue;
    items.push({ title, url: href, isAd: false });
  }
  return { items: items.slice(0, 10), captcha: false };
}

async function searchMailRu(template, model) {
  const query = model ? template.replace(/{model}/g, model) : template;
  const url = `https://go.mail.ru/search?q=${encodeURIComponent(query)}`;
  const html = await fetchHtml(url);
  if (!html) return { items: [], captcha: false };
  if (html.includes('captcha')) return { items: [], captcha: true };
  const items = [];
  const linkRegex = /href="(https?:\/\/[^"]+)"/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    let hostname = '';
    try { hostname = new URL(href).hostname.toLowerCase(); } catch(e) { continue; }
    if (hostname.includes('mail.ru') || hostname.includes('mradx.net')) continue;
    if (items.some(i => i.url === href)) continue;
    const contextStart = Math.max(0, match.index - 500);
    const contextEnd = Math.min(html.length, match.index + 500);
    const context = html.substring(contextStart, contextEnd);
    const titleMatch = context.match(/>([^<]{5,200})</);
    const title = titleMatch ? titleMatch[1].trim() : hostname;
    if (title.length < 3 || title.length > 200) continue;
    items.push({ title, url: href, isAd: false });
  }
  return { items: items.slice(0, 10), captcha: false };
}

async function searchBing(template, model) {
  const query = model ? template.replace(/{model}/g, model) : template;
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
  const html = await fetchHtml(url);
  if (!html) return { items: [], captcha: false };
  if (html.includes('captcha')) return { items: [], captcha: true };
  const items = [];
  const linkRegex = /href="(https?:\/\/[^"]+)"/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    let hostname = '';
    try { hostname = new URL(href).hostname.toLowerCase(); } catch(e) { continue; }
    if (hostname.includes('bing.') || hostname.includes('microsoft.')) continue;
    if (items.some(i => i.url === href)) continue;
    const contextStart = Math.max(0, match.index - 500);
    const contextEnd = Math.min(html.length, match.index + 500);
    const context = html.substring(contextStart, contextEnd);
    const titleMatch = context.match(/>([^<]{5,200})</);
    const title = titleMatch ? titleMatch[1].trim() : hostname;
    if (title.length < 3 || title.length > 200) continue;
    items.push({ title, url: href, isAd: false });
  }
  return { items: items.slice(0, 10), captcha: false };
}

function getRotatedUserAgent() {
  const agents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  ];
  return agents[Math.floor(Math.random() * agents.length)];
}