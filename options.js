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

let currentLang = 'en';

// Функция перевода: обновляет все элементы с data-en/data-ru
function updateLanguageUI() {
    document.querySelectorAll('[data-en][data-ru]').forEach(el => {
        el.textContent = el.getAttribute(`data-${currentLang}`);
    });
    // Обновляем select
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
        searchDelayMs: 3000,
        pauseOnFound: true,
        widgetPosition: 'bottom-right',
        language: 'en'
    }, (items) => {
        currentLang = items.language || 'en';
        
        // Заполняем поля
        document.getElementById('streamHosts').value = items.streamHosts.join(', ');
        document.getElementById('archiveSites').value = items.archiveSites.join('\n');
        document.getElementById('detectAnyStream').checked = items.detectAnyStream;
        document.getElementById('useBongaMirror').checked = items.useBongaMirror;
        document.getElementById('searchDelay').value = items.searchDelayMs;
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

    // Сохранение настроек
    document.getElementById('saveBtn').addEventListener('click', () => {
        const hostsText = document.getElementById('streamHosts').value;
        const hosts = hostsText.split(',').map(s => s.trim().toLowerCase().replace('www.', '')).filter(Boolean);
        const sitesText = document.getElementById('archiveSites').value;
        const sites = sitesText.split('\n').map(s => s.trim()).filter(Boolean);

        const delay = parseInt(document.getElementById('searchDelay').value) || 3000;

        chrome.storage.sync.set({
            streamHosts: hosts,
            archiveSites: sites,
            detectAnyStream: document.getElementById('detectAnyStream').checked,
            useBongaMirror: document.getElementById('useBongaMirror').checked,
            searchDelayMs: Math.max(1000, delay),
            pauseOnFound: document.getElementById('pauseOnFound').checked,
            widgetPosition: document.getElementById('widgetPosition').value,
            language: currentLang
        }, () => {
            const status = document.getElementById('statusMsg');
            status.textContent = currentLang === 'ru' ? '✅ Сохранено!' : '✅ Saved!';
            setTimeout(() => status.textContent = '', 2000);
        });
    });
});