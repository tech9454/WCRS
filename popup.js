const $ = (id) => document.getElementById(id);
let cfg = SAF.DEFAULTS;
const T = (k) => SAF.t(cfg.language, k);

function paint() {
  const dark = cfg.theme === 'dark' || (cfg.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.body.classList.toggle('dark', dark);
  $('ver').textContent = 'v' + chrome.runtime.getManifest().version;
  $('statusText').textContent = cfg.pluginEnabled ? T('active') : T('disabled');
  $('dot').className = 'dot' + (cfg.pluginEnabled ? '' : ' off');
  $('toggleLabel').textContent = T('enabled');
  $('settingsLink').textContent = T('settings');
  $('toggle').checked = cfg.pluginEnabled;
}

chrome.storage.sync.get(SAF.DEFAULTS, (items) => { cfg = items; paint(); });
$('toggle').addEventListener('change', (e) => {
  cfg.pluginEnabled = e.target.checked;
  chrome.storage.sync.set({ pluginEnabled: cfg.pluginEnabled }, paint);
});
$('settingsLink').addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });
