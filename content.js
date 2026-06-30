(() => {
let activeSince = Date.now();
let totalActiveTime = 0;
let isStreamDetected = false;
let searchStarted = false;
let widgetInjected = false;
let pluginEnabled = true;
let autoScan = false;
let isSearching = false;
let isPaused = false;
let widgetPosition = { x: null, y: null };
let lastDetectedModel = null;
let currentLang = 'en';

const KNOWN_STREAM_HOSTS = [
'bongacams.com', 'bonga11.com', 'bonga12.com', 'bonga13.com',
'bonga14.com', 'bonga15.com', 'bonga16.com', 'bonga17.com',
'chaturbate.com', 'stripchat.com', 'stripchat.webcam',
'livejasmin.com', 'camsoda.com', 'myfreecams.com',
'streamate.com', 'flirtymania.com', 'imlive.com'
];

// Локализация виджета
const WIDGET_TEXTS = {
  en: {
    title: 'Archive Search',
	modelLabel: 'Model:',
    ready: 'Ready to search',
    searching: 'Searching archives...',
    auto: 'Auto-scan',
    searchNow: 'Search now',
    checking: 'Checking',  
    foundOn: 'Found on',   
    paused: 'Search paused', 
    stop: 'Stop',
    continue: 'Continue',
    notFound: 'Nothing found',
    stopped: 'Search stopped',
    continuing: 'Continuing search...',
    noNick: 'Could not detect nickname',
    modelChanged: 'Model changed. Ready to search',
    foundOn: 'Found on',
    paused: 'Search paused',
    completed: 'Search completed',
    cache: '(cache)',
    foundEarlier: 'Found earlier'
  },
  ru: {
    title: 'Поиск архивов',
	modelLabel: 'Модель:',
    ready: 'Готов к поиску',
    searching: 'Ищу архивы...',
    auto: 'Автосканирование',
    searchNow: 'Искать сейчас',
    stop: 'Стоп',
    checking: 'Проверяю',  
    foundOn: 'Найдено на', 
    paused: 'Поиск на паузе',
    continue: 'Продолжить',
    notFound: 'Ничего не найдено',
    stopped: 'Поиск остановлен',
    continuing: 'Продолжаю поиск...',
    noNick: 'Не удалось определить ник',
    modelChanged: 'Модель сменилась. Готов к поиску',
    foundOn: 'Найдено на',
    paused: 'Поиск на паузе',
    completed: 'Поиск завершён',
    cache: '(кэш)',
    foundEarlier: 'Найдено ранее'
  }
};

function t(key) {
  return (WIDGET_TEXTS[currentLang] && WIDGET_TEXTS[currentLang][key]) || WIDGET_TEXTS.en[key] || key;
}

function loadLanguage() {
  chrome.storage.sync.get({ language: 'en' }, (items) => {
    currentLang = items.language || 'en';
  });
}

// XSS-защита: экранирование HTML
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Безопасное создание ссылки
function createSafeLink(url, title) {
    // Проверка протокола
    if (!url || !url.startsWith('http')) return null;
    
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.className = 'saf-link';
    a.textContent = title;
    return a;
}

function detectStreamByContent() {
  const url = window.location.href.toLowerCase();
  const pathKeywords = ['/live/', '/cam/', '/room/', '/chat/', '/model/', '/profile/'];
  const hasPathKeyword = pathKeywords.some(kw => url.includes(kw));
  const hasVideo = document.querySelector('video') !== null;
  const hasHls = document.querySelector('[src*=".m3u8"], [data-src*=".m3u8"]') !== null;
  const hasCamClasses = document.querySelector('[class*="videojs"], [class*="player"], [id*="video_player"], [class*="cam-container"]') !== null;
  return hasPathKeyword && (hasVideo || hasHls || hasCamClasses);
}

function detectStream() {
  const hostname = window.location.hostname.toLowerCase().replace('www.', '');
  for (const host of KNOWN_STREAM_HOSTS) {
    if (hostname === host || hostname.endsWith('.' + host)) {
      return true;
    }
  }
  return false;
}

function extractModelNick() {
  const url = window.location.href;
  const hostname = window.location.hostname.toLowerCase().replace('www.', '');
  try {
    const urlObj = new URL(url);
    const parts = urlObj.pathname.split('/').filter(Boolean);
    if (hostname.includes('chaturbate') || hostname.includes('bonga') ||
        hostname.includes('stripchat') || hostname.includes('camsoda')) {
      for (const part of parts) {
        if (part.length >= 3 && !['live', 'cam', 'room', 'chat', 'rooms', 'featured', 'top', 'new'].includes(part.toLowerCase())) {
          return part;
        }
      }
    }
    return parts[parts.length - 1] || parts[parts.length - 2];
  } catch (e) {
    return null;
  }
}

// Проверка смены модели
function checkModelChange() {
  if (!isStreamDetected || !pluginEnabled) return;

  const currentModel = extractModelNick();
  if (currentModel && currentModel !== lastDetectedModel) {
    console.log(`[SAF] Model changed from ${lastDetectedModel} to ${currentModel}`);
    lastDetectedModel = currentModel;

    searchStarted = false;
    isSearching = false;
    isPaused = false;
	updateModelDisplay(currentModel);

    const content = document.getElementById('safContent');
    const badge = document.getElementById('safBadge');
    const progressBar = document.getElementById('safProgressBar');

    if (content) content.innerHTML = '';
if (badge) {
  badge.textContent = '0';
  badge.classList.remove('saf-found');
}

updateControlButtons();

    if (autoScan) {
      startSearch(currentModel);
    }
  }
}

async function init() {
  loadLanguage();

  const settings = await new Promise(resolve => {
    chrome.storage.sync.get({
      pluginEnabled: true,
      autoScan: false,
      detectAnyStream: true,
      widgetPosition: 'bottom-right'
    }, resolve);
  });

  pluginEnabled = settings.pluginEnabled;
  autoScan = settings.autoScan;
  widgetPosition = settings.widgetPosition;

  console.log('[SAF] Init. pluginEnabled:', pluginEnabled, 'autoScan:', autoScan, 'position:', widgetPosition);

  if (!pluginEnabled) {
    console.log('[SAF] Plugin disabled, skipping');
    return;
  }

  isStreamDetected = detectStream();
  if (!isStreamDetected && settings.detectAnyStream) {
    setTimeout(() => {
      isStreamDetected = detectStreamByContent();
      if (isStreamDetected) {
        console.log('[SAF] Stream detected by content');
        lastDetectedModel = extractModelNick();
		updateModelDisplay(lastDetectedModel);
        onStreamDetected();
      }
    }, 2000);
  } else if (isStreamDetected) {
    console.log('[SAF] Stream detected by hostname');
    lastDetectedModel = extractModelNick();
	updateModelDisplay(lastDetectedModel);
    onStreamDetected();
  }

  setInterval(() => {
    checkAndStartSearch();
    checkModelChange();
  }, 1000);
}

function onStreamDetected() {
  if (!widgetInjected) {
    injectWidget();
    widgetInjected = true;
  }
}

async function checkAndStartSearch() {
  if (!isStreamDetected || searchStarted || !pluginEnabled) return;
  const currentTime = document.hidden ? totalActiveTime : totalActiveTime + (Date.now() - activeSince);
  if (currentTime >= 3000 && autoScan) {
    searchStarted = true;
    const modelNick = extractModelNick();
    if (modelNick) {
      console.log('[SAF] Auto-starting search for:', modelNick);
      startSearch(modelNick);
    }
  }
}

function startSearch(modelNick) {
  if (!widgetInjected) {
    injectWidget();
    widgetInjected = true;
  }
  updateWidgetStatus(t('searching'));
  isSearching = true;
  isPaused = false;
  updateControlButtons();
  chrome.runtime.sendMessage({
    type: 'START_SEARCH',
    data: {
      model: modelNick,
      url: window.location.href,
      hostname: window.location.hostname
    }
  });
}

function applyWidgetPosition() {
  const widget = document.getElementById('stream-archive-finder-widget');
  if (!widget) return;
  widget.style.top = '';
  widget.style.bottom = '';
  widget.style.left = '';
  widget.style.right = '';

  switch (widgetPosition) {
    case 'top-left':
      widget.style.top = '20px';
      widget.style.left = '20px';
      break;
    case 'top-right':
      widget.style.top = '20px';
      widget.style.right = '20px';
      break;
    case 'bottom-left':
      widget.style.bottom = '20px';
      widget.style.left = '20px';
      break;
    case 'bottom-right':
    default:
      widget.style.bottom = '20px';
      widget.style.right = '20px';
      break;
  }
}

function injectWidget() {
  const widget = document.createElement('div');
  widget.id = 'stream-archive-finder-widget';

  const toggle = document.createElement('div');
  toggle.className = 'saf-toggle';
  toggle.id = 'safToggle';

  const icon = document.createElement('div');
  icon.className = 'saf-icon';
  icon.textContent = '📚';

  const badge = document.createElement('div');
  badge.className = 'saf-badge';
  badge.id = 'safBadge';
  badge.textContent = '0';

  toggle.appendChild(icon);
  toggle.appendChild(badge);

  const panel = document.createElement('div');
  panel.className = 'saf-panel';
  panel.id = 'safPanel';

  const header = document.createElement('div');
  header.className = 'saf-header';
  header.id = 'safHeader';
  const title = document.createElement('h3');
  title.textContent = t('title');
  title.id = 'safTitle';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'saf-close';
  closeBtn.id = 'safClose';
  closeBtn.textContent = '×';
  header.appendChild(title);
  header.appendChild(closeBtn);
  
  const modelInfo = document.createElement('div');
  modelInfo.className = 'saf-model-info';
  modelInfo.id = 'safModelInfo';
  modelInfo.style.display = 'none';

  const progressBar = document.createElement('div');
  progressBar.className = 'saf-progress-bar';
  progressBar.id = 'safProgressBar';
  const statusDiv = document.createElement('div');
  statusDiv.className = 'saf-status';
  statusDiv.textContent = t('ready');
  progressBar.appendChild(statusDiv);

  const controls = document.createElement('div');
  controls.className = 'saf-controls';

  const label = document.createElement('label');
  label.className = 'saf-checkbox-label';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = 'safAutoScan';
  checkbox.checked = autoScan;

  const labelSpan = document.createElement('span');
  labelSpan.textContent = t('auto');

  label.appendChild(checkbox);
  label.appendChild(labelSpan);

  const searchBtn = document.createElement('button');
  searchBtn.className = 'saf-search-btn';
  searchBtn.id = 'safSearchBtn';
  searchBtn.textContent = t('searchNow');

  const stopBtn = document.createElement('button');
  stopBtn.className = 'saf-stop-btn';
  stopBtn.id = 'safStopBtn';
  stopBtn.style.display = 'none';
  stopBtn.textContent = t('stop');

  const continueBtn = document.createElement('button');
  continueBtn.className = 'saf-continue-btn';
  continueBtn.id = 'safContinueBtn';
  continueBtn.style.display = 'none';
  continueBtn.textContent = t('continue');

  controls.appendChild(label);
  controls.appendChild(searchBtn);
  controls.appendChild(stopBtn);
  controls.appendChild(continueBtn);

  const content = document.createElement('div');
  content.className = 'saf-content';
  content.id = 'safContent';

  panel.appendChild(header);
  if (lastDetectedModel) {
    updateModelDisplay(lastDetectedModel);
}
  panel.appendChild(modelInfo);
  panel.appendChild(progressBar);
  panel.appendChild(controls);
  panel.appendChild(content);

  widget.appendChild(toggle);
  widget.appendChild(panel);

  document.body.appendChild(widget);
  applyWidgetPosition();
  
  // Показываем имя модели, если оно уже определено (при обновлении страницы)
  if (lastDetectedModel) {
      updateModelDisplay(lastDetectedModel);
}

  // Drag-and-drop
  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  header.addEventListener('mousedown', (e) => {
    if (e.target.id === 'safClose') return;
    isDragging = true;
    const rect = panel.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    panel.style.position = 'fixed';
    panel.style.cursor = 'move';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    panel.style.left = (e.clientX - dragOffsetX) + 'px';
    panel.style.top = (e.clientY - dragOffsetY) + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      panel.style.cursor = 'default';
    }
  });

  toggle.addEventListener('click', () => {
    panel.classList.toggle('saf-open');
  });

  closeBtn.addEventListener('click', () => {
    panel.classList.remove('saf-open');
  });

  checkbox.addEventListener('change', (e) => {
    autoScan = e.target.checked;
    chrome.storage.sync.set({ autoScan: autoScan });
    console.log('[SAF] autoScan changed to:', autoScan);
    if (autoScan && isStreamDetected && !searchStarted) {
      const modelNick = extractModelNick();
      if (modelNick) {
        searchStarted = true;
        startSearch(modelNick);
      }
    }
  });

  searchBtn.addEventListener('click', () => {
    const modelNick = extractModelNick();
    if (modelNick) {
      searchStarted = true;
      startSearch(modelNick);
    } else {
      updateWidgetStatus(t('noNick'));
    }
  });

  stopBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'STOP_SEARCH' });
    isSearching = false;
    isPaused = false;
    updateControlButtons();
    updateWidgetStatus(t('stopped'));
  });

  continueBtn.addEventListener('click', () => {
    console.log('[SAF] Continue button clicked');
    chrome.runtime.sendMessage({ type: 'CONTINUE_SEARCH' });
    isPaused = false;
    isSearching = true;
    updateControlButtons();
    updateWidgetStatus(t('continuing'));
  });

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'SEARCH_UPDATE') {
      updateWidget(msg.data);
    }
    if (msg.type === 'PLUGIN_STATE_CHANGED') {
      pluginEnabled = msg.data.pluginEnabled;
      if (!pluginEnabled) {
        widget.remove();
        widgetInjected = false;
      }
    }
  });
}

function updateControlButtons() {
  const searchBtn = document.getElementById('safSearchBtn');
  const stopBtn = document.getElementById('safStopBtn');
  const continueBtn = document.getElementById('safContinueBtn');
  if (searchBtn) searchBtn.style.display = (!isSearching && !isPaused) ? 'inline-block' : 'none';
  if (stopBtn) stopBtn.style.display = (isSearching && !isPaused) ? 'inline-block' : 'none';
  if (continueBtn) continueBtn.style.display = isPaused ? 'inline-block' : 'none';
}

function updateWidgetStatus(status) {
  const progressBar = document.getElementById('safProgressBar');
  if (progressBar) {
    progressBar.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'saf-status';
    div.textContent = status;
    progressBar.appendChild(div);
  }
}
function updateModelDisplay(model) {
    const title = document.getElementById('safTitle');
    if (title && model) {
        title.innerHTML = t('title') + ' — <span style="color: #e91e63; font-weight: 600; -webkit-text-stroke: 0.5px black; text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000;">' + escapeHtml(model) + '</span>';
    } else if (title) {
        title.textContent = t('title');
    }
}
function updateWidget(data) {
  const progressBar = document.getElementById('safProgressBar');
  const content = document.getElementById('safContent');
  const badge = document.getElementById('safBadge');
  if (!progressBar || !content) return;

  if (data.status) {
    progressBar.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'saf-status';
    div.textContent = data.status;
    progressBar.appendChild(div);
  }

  if (data.results) {
    content.innerHTML = '';
    let totalCount = 0;

    for (const [source, items] of Object.entries(data.results)) {
      if (items.length > 0) {
        const section = document.createElement('div');
        section.className = 'saf-section';

        const strong = document.createElement('strong');
        strong.textContent = '📁 ' + source;
        section.appendChild(strong);

        items.forEach(item => {
          const link = createSafeLink(item.url, item.title);
          section.appendChild(link);
          totalCount++;
        });

        content.appendChild(section);
      }
    }

    if (totalCount > 0) {
      badge.textContent = totalCount;
      badge.classList.add('saf-found');
    } else if (data.completed) {
      const div = document.createElement('div');
      div.className = 'saf-status';
      div.textContent = t('notFound');
      content.appendChild(div);
    }
  }

  if (data.paused) {
    isPaused = true;
    isSearching = false;
    updateControlButtons();
  }

  if (data.completed && !data.paused) {
    isSearching = false;
    isPaused = false;
    updateControlButtons();
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    totalActiveTime += Date.now() - activeSince;
  } else {
    activeSince = Date.now();
  }
});

init();
})();