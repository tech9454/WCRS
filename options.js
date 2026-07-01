const DEFAULT_STREAM_HOSTS = [
    'bongacams.com', 'bonga11.com', 'bonga12.com', 'bonga13.com',
    'bonga14.com', 'bonga15.com', 'bonga16.com', 'bonga17.com',
    'chaturbate.com',
    'stripchat.com', 'stripchat.webcam',
    'livejasmin.com',
    'camsoda.com',
    'myfreecams.com',
    'streamate.com',
    'flirtymania.com',
    'imlive.com'
];
const DEFAULT_ARCHIVE_SITES = [
  'striptube.cc',
  'showcamrips.com',
  'camplanet.cc',
  'archive4free.com',
  'camrip.cc',
  'camhive.net',
  'archivebate.com',
  'ecordbate.com',
  'cumcams.cc',
  'recu.me',
  'camwhores.tv',
  'privaterecords.webcam',
  'livecamrips.to',
  'camchickscaps.com',
  'cloudbate.com'
];

let currentLang = 'en';


function updateLanguageUI() {
  document.querySelectorAll('[data-en][data-ru]').forEach(el => {
    el.textContent = el.getAttribute('data-' + currentLang);
  });

  document.querySelectorAll('[data-help-en][data-help-ru]').forEach(el => {
    el.setAttribute('data-help', el.getAttribute('data-help-' + currentLang));
  });

  const languageSelect = document.getElementById('languageSelect');
  if (languageSelect) languageSelect.value = currentLang;
}

// Загрузка настроек
document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.sync.get({
  streamHosts: DEFAULT_STREAM_HOSTS,
  archiveSites: DEFAULT_ARCHIVE_SITES,
  detectAnyStream: true,
  useBongaMirror: true,
  pauseOnFound: true,
  autoScan: false,
  widgetPosition: 'bottom-right',
  language: 'en',
  theme: 'dark'
}, (items) => {
    currentLang = items.language || 'en';
    
    // Применяем тему
    const theme = items.theme || 'dark';
    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect) {
      themeSelect.value = theme;
      if (theme === 'dark') document.body.classList.add('dark');
    }
    
    // Заполняем поля
    document.getElementById('streamHosts').value = items.streamHosts.join(', ');
    document.getElementById('archiveSites').value = items.archiveSites.join('\n');
    document.getElementById('detectAnyStream').checked = items.detectAnyStream;
    document.getElementById('useBongaMirror').checked = items.useBongaMirror;
	document.getElementById('autoScan').checked = items.autoScan || false;
    document.getElementById('pauseOnFound').checked = items.pauseOnFound !== false;
    document.getElementById('widgetPosition').value = items.widgetPosition || 'bottom-right';
    
    // Применяем язык
    updateLanguageUI();
  });

  // Обработчик выбора языка
  const languageSelect = document.getElementById('languageSelect');
  if (languageSelect) {
    languageSelect.addEventListener('change', (e) => {
      currentLang = e.target.value;
      chrome.storage.sync.set({ language: currentLang });
      updateLanguageUI();
    });
  }
  
  // Обработчик выбора темы
  const themeSelect = document.getElementById('themeSelect');
  if (themeSelect) {
    themeSelect.addEventListener('change', (e) => {
      const theme = e.target.value;
      if (theme === 'dark') {
        document.body.classList.add('dark');
      } else {
        document.body.classList.remove('dark');
      }
      chrome.storage.sync.set({ theme: theme });
    });
  }

  // Сохранение настроек
  document.getElementById('saveBtn').addEventListener('click', () => {
    const hostsText = document.getElementById('streamHosts').value;
    const hosts = hostsText.split(',').map(s => s.trim().toLowerCase().replace('www.', '')).filter(Boolean);
    const sitesText = document.getElementById('archiveSites').value;
    const sites = sitesText.split('\n').map(s => s.trim()).filter(Boolean);

    chrome.storage.sync.set({
  streamHosts: hosts,
  archiveSites: sites,
  detectAnyStream: document.getElementById('detectAnyStream').checked,
  useBongaMirror: document.getElementById('useBongaMirror').checked,
  pauseOnFound: document.getElementById('pauseOnFound').checked,
  autoScan: document.getElementById('autoScan').checked,
  widgetPosition: document.getElementById('widgetPosition').value,
  language: currentLang,
  theme: document.getElementById('themeSelect').value
}, () => {
      const status = document.getElementById('statusMsg');
      status.textContent = currentLang === 'ru' ? '✅ Сохранено!' : '✅ Saved!';
      setTimeout(() => status.textContent = '', 2000);
    });
  });
});