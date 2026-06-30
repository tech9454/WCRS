# WebCam Records Searcher

An automatic browser extension that searches for stream recordings (archives) across multiple archive sites directly from the stream page.

## Features
- 🔍 **Multi-Engine Search:** Uses a cascade of search engines (DuckDuckGo, Yandex, Google, etc.) to find archives.
-  **Smart Detection:** Automatically detects the model name and stream site.
- 🛡️ **Strict Filtering:** Filters out irrelevant results and technical garbage.
- 📌 **Customizable:** Choose widget position, auto-scan, and custom archive sites.
- 🌐 **Bilingual:** English and Russian support.

## ️ Local Installation Guide (Chrome / Edge / Brave)
Since this extension is not published on the Chrome Web Store, you need to install it manually. It takes 1 minute.

1. **Download the code:**
   - Click the green **"Code"** button at the top of this page.
   - Select **"Download ZIP"**.
   - Extract the ZIP file to any folder on your computer.

2. **Open Extension Settings:**
   - Open your browser (Chrome, Edge, or Brave).
   - Go to `chrome://extensions/` (or `edge://extensions/`).

3. **Enable Developer Mode:**
   - Look for the **"Developer mode"** toggle in the top right corner and turn it **ON**.

4. **Load the Extension:**
   - Click the **"Load unpacked"** button that appeared in the top left.
   - Select the **folder** where you extracted the ZIP file (the folder that contains `manifest.json`).

5. **Done!**
   - The extension icon will appear in your browser toolbar. Pin it for easy access.
## 🦊 Local Installation Guide (Firefox)

### Temporary installation (resets after browser restart)
1. Download and extract the ZIP file (see above).
2. Open Firefox and go to `about:debugging#/runtime/this-firefox`.
3. Click **"Load Temporary Add-on…"**.
4. Select the `manifest.json` file from the extracted folder.
5. The extension will appear in the toolbar. Pin it for easy access.

⚠️ **Note:** Temporary add-ons are removed every time you restart Firefox. 

### Permanent installation (Developer Edition / Nightly / ESR only)
1. Open `about:config` and set `xpinstall.signatures.required` to `false`.
2. Go to `about:addons` → ⚙️ → **"Install Add-on From File…"**.
3. Select the `.xpi` file or the folder with `manifest.json`.
4. Restart Firefox.

> Regular stable Firefox does not allow unsigned extensions to be installed permanently.
## Usage
1. Go to any supported cam site (Chaturbate, Bongacams, Stripchat, etc.).
2. The widget will appear in the bottom right corner (you can drag it or change position in settings).
3. Click the 📚 icon to open the panel.
4. Click **"Search now"** or enable **"Auto-scan"** to find archives automatically.

## Support & Donations
If you like this extension and want to support its development, you can do so on Boosty:
 **https://boosty.to/wcrs**

[![Download Latest](https://img.shields.io/badge/Download_Latest-ZIP-2ea44f?style=for-the-badge&logo=github)](https://github.com/tech9454/WCRS/releases/latest/download/WCRS.zip)

## License
This project is protected by a custom Non-Commercial License. 
You can use it personally, but you **cannot** monetize it, remove author links, or republish it on extension stores. 
See the `LICENSE` file for details.
