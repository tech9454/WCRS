const translations = {
    en: { active: 'Active', disabled: 'Disabled', enabled: 'Plugin enabled', settings: '⚙️ Settings' },
    ru: { active: 'Активен', disabled: 'Отключён', enabled: 'Плагин включён', settings: '⚙️ Настройки' }
};
let currentLang = 'en';

function t(key) {
    return translations[currentLang][key] || translations['en'][key];
}

const toggle = document.getElementById('pluginToggle');
const statusText = document.getElementById('statusText');
const statusDot = document.getElementById('statusDot');
const toggleLabel = document.getElementById('toggleLabel');
const settingsLink = document.getElementById('settingsLink'); // Объявляем ОДИН раз

function updateUI(enabled) {
    statusText.textContent = enabled ? t('active') : t('disabled');
    statusDot.className = 'status-dot' + (enabled ? '' : ' off');
    toggleLabel.textContent = t('enabled');
    if (settingsLink) settingsLink.textContent = t('settings');
}

chrome.storage.sync.get({ pluginEnabled: true, language: 'en' }, (items) => {
    currentLang = items.language || 'en';
    toggle.checked = items.pluginEnabled;
    updateUI(items.pluginEnabled);
});

toggle.addEventListener('change', () => {
    const enabled = toggle.checked;
    chrome.storage.sync.set({ pluginEnabled: enabled }, () => {
        updateUI(enabled);
        chrome.runtime.sendMessage({ type: 'PLUGIN_STATE_CHANGED', data: { pluginEnabled: enabled } });
    });
});

if (settingsLink) {
    settingsLink.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.runtime.openOptionsPage(); // Надёжное открытие настроек
    });
}