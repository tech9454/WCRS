const DEFAULT_STREAM_HOSTS = ['bongacams.com', 'bonga11.com', 'bonga12.com', 'bonga13.com', 'bonga14.com', 'bonga15.com', 'bonga16.com', 'bonga17.com', 'chaturbate.com', 'stripchat.com', 'stripchat.webcam', 'livejasmin.com', 'camsoda.com', 'myfreecams.com', 'streamate.com', 'flirtymania.com', 'imlive.com'];
const DEFAULT_ARCHIVE_SITES = ['striptube.cc', 'showcamrips.com', 'camplanet.cc', 'archive4free.com', 'camrip.cc', 'camhive.net', 'archivebate.com', 'ecordbate.com', 'cumcams.cc', 'recu.me', 'camwhores.tv', 'privaterecords.webcam', 'livecamrips.to', 'camchickscaps.com', 'cloudbate.com'];

let currentLang = 'en';

function updateLanguageUI() {
  document.querySelectorAll('[data-en][data-ru]').forEach(el => { el.textContent = el.getAttribute('data-' + currentLang); });
  const languageSelect = document.getElementById('languageSelect');
  if (languageSelect) languageSelect.value = currentLang;
}

document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.sync.get({
    streamHosts: DEFAULT_STREAM_HOSTS, archiveSites: DEFAULT_ARCHIVE_SITES, detectAnyStream: true,
    pauseOnFound: true, autoScan: false, searchDelay: 3000, widgetPosition: 'bottom-right', language: 'en', theme: 'dark'
  }, (items) => {
    currentLang = items.language || 'en';
    if (items.theme === 'dark') document.body.classList.add('dark');
    document.getElementById('themeSelect').value = items.theme || 'dark';
    document.getElementById('streamHosts').value = items.streamHosts.join(', ');
    document.getElementById('archiveSites').value = items.archiveSites.join('\n');
    document.getElementById('detectAnyStream').checked = items.detectAnyStream;
    document.getElementById('autoScan').checked = items.autoScan || false;
    document.getElementById('searchDelay').value = items.searchDelay || 3000;
    document.getElementById('pauseOnFound').checked = items.pauseOnFound !== false;
    document.getElementById('widgetPosition').value = items.widgetPosition || 'bottom-right';
    updateLanguageUI();
  });

  document.getElementById('languageSelect').addEventListener('change', (e) => {
    currentLang = e.target.value;
    chrome.storage.sync.set({ language: currentLang });
    updateLanguageUI();
  });

  document.getElementById('themeSelect').addEventListener('change', (e) => {
    if (e.target.value === 'dark') document.body.classList.add('dark');
    else document.body.classList.remove('dark');
    chrome.storage.sync.set({ theme: e.target.value });
  });

  document.getElementById('saveBtn').addEventListener('click', () => {
    const hosts = document.getElementById('streamHosts').value.split(',').map(s => s.trim().toLowerCase().replace('www.', '')).filter(Boolean);
    const sites = document.getElementById('archiveSites').value.split('\n').map(s => s.trim()).filter(Boolean);
    chrome.storage.sync.set({
      streamHosts: hosts, archiveSites: sites,
      detectAnyStream: document.getElementById('detectAnyStream').checked,
      pauseOnFound: document.getElementById('pauseOnFound').checked,
      autoScan: document.getElementById('autoScan').checked,
      searchDelay: parseInt(document.getElementById('searchDelay').value),
      widgetPosition: document.getElementById('widgetPosition').value,
      language: currentLang, theme: document.getElementById('themeSelect').value
    }, () => {
      const status = document.getElementById('statusMsg');
      status.textContent = currentLang === 'ru' ? '✅ Сохранено!' : '✅ Saved!';
      setTimeout(() => status.textContent = '', 2000);
    });
  });
});