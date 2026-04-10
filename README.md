# Arc IDE

Modern desktop IDE built with **C++ (Qt 6)** and a fully web-based interface (**HTML/CSS/JavaScript + Monaco Editor**).  
It combines a native desktop shell with a fast, customizable editor experience inspired by Visual Studio Code.

## Features

- VS Code-like dark UI with:
  - left sidebar
  - file explorer
  - top tabs
  - status/title area
  - polished hover states and transitions
- Monaco Editor integration (`vs-dark` + custom Arc themes)
- Multi-language editing support:
  - C++
  - JavaScript
  - Python
  - Sway (custom Swift-like syntax highlighting)
- File operations through Qt/C++ backend:
  - open file dialog
  - open folder dialog
  - read/write file contents
  - recursive explorer listing
- Settings overlay:
  - UI themes (`Arc Dark`, `Midnight`, `Graphite`)
  - Monaco themes (`arc-dark`, `arc-midnight`, `arc-graphite`, etc.)
  - font size range `15..19` (default `17`)
  - reduce motion toggle
- Extension system:
  - extension folder discovery
  - `manifest.json` + `main.js` activation
  - optional extension CSS

## Architecture

The app uses a split architecture:

- **Frontend (Web UI)** in `web/`
  - `index.html` - layout and panels
  - `styles.css` - themes, animations, visual system
  - `app.js` - Monaco setup, explorer, tabs, settings, extensions
- **Native backend (Qt/C++)** in `src/`
  - `main.cpp` - `QWebEngineView`, `QWebChannel`, app bootstrap
  - `FileBridge.h/.cpp` - filesystem + dialogs + app data helpers
- **Qt resources** in `resources/`
  - `resources.qrc` embeds web UI files into the executable

Communication between JS and C++ is done via **QWebChannel** using the `bridge` object.

## Bridge API

Implemented in `src/FileBridge.*`:

- `readFile(path)` -> `QString`
- `writeFile(path, content)` -> `bool`
- `listFiles(path)` -> `QJsonArray` (folder tree)
- `openFileDialog()` -> `QString`
- `openFolderDialog()` -> `QString`
- `appDataDir()` -> `QString`
- `ensureDir(path)` -> `bool`

## Requirements

- Qt 6 with modules:
  - `Widgets`
  - `WebEngineWidgets`
  - `WebChannel`
- CMake `3.21+`
- C++17 compiler

## Build & Run (Linux/macOS)

```bash
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j
./build/arc-mini-ide
```

## Build & Release Scripts

### Linux release artifact

```bash
./scripts/build-linux-release.sh
```

Outputs:

- `website/downloads/arc-mini-ide-v0.1.0-linux-x86_64.tar.gz`
- `website/downloads/arc-mini-ide-v0.1.0-linux-x86_64.tar.gz.sha256`

### Windows release artifact

Run on a Windows machine:

```powershell
pwsh ./scripts/build-windows-release.ps1
```

See also:

- `website/downloads/v0.1.0/windows/BUILD_ON_WINDOWS.md`

## Website

Marketing/download website is located in:

- `website/` (English pages)
- `website/ru-ru/` (Russian localization)

Download page:

- `website/download.html`

Release notes:

- `website/downloads/v0.1.0/RELEASE_NOTES.md`

## Extension Development

Each extension is a folder under app extensions root containing:

- `manifest.json` (must include `id`)
- `main.js` (exports `activate(api)`)
- optional `styles.css`

Example entry:

```js
module.exports.activate = (api) => {
  api.setStatus("My extension activated");
};
```

## Notes

- Monaco is loaded from CDN (`jsDelivr`) in current setup; internet access is required at runtime for editor assets.
- The app is designed to be extended further with:
  - command palette
  - project search
  - offline Monaco bundling
  - CI-based multi-platform release packaging

