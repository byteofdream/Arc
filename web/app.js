/* global QWebChannel, monaco, require */

const state = {
  bridge: null,
  editor: null,
  workspaceRoot: "",
  modelsByPath: new Map(), // path -> monaco.editor.ITextModel
  tabs: [], // { path, name, language, dirty }
  activePath: "",
  settings: {
    uiTheme: "arc-dark",
    monacoTheme: "arc-dark",
    fontSize: 17,
    reduceMotion: false,
    extensionsRoot: "",
  },
  extensions: [], // { id, name, version, description, dir }
};

function $(sel) {
  return document.querySelector(sel);
}

function setStatus(text) {
  const el = $("#statusText");
  if (!el) return;
  el.textContent = text;
}

function extToLanguage(path) {
  const p = (path || "").toLowerCase();
  if (p.endsWith(".cpp") || p.endsWith(".cc") || p.endsWith(".cxx") || p.endsWith(".h") || p.endsWith(".hpp")) return "cpp";
  if (p.endsWith(".js") || p.endsWith(".mjs") || p.endsWith(".cjs") || p.endsWith(".ts") || p.endsWith(".tsx")) return "javascript";
  if (p.endsWith(".py")) return "python";
  if (p.endsWith(".sway")) return "sway";
  if (p.endsWith(".json")) return "json";
  if (p.endsWith(".html") || p.endsWith(".htm")) return "html";
  if (p.endsWith(".css")) return "css";
  if (p.endsWith(".md")) return "markdown";
  return "plaintext";
}

function basename(path) {
  const parts = (path || "").split(/[\\/]/g);
  return parts[parts.length - 1] || path;
}

function ensureWelcomeHidden() {
  const w = $("#welcome");
  if (w) w.classList.add("hidden");
}

function loadSettings() {
  const raw = localStorage.getItem("arc.settings");
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    state.settings = { ...state.settings, ...parsed };
  } catch {
    // ignore
  }
}

function saveSettings() {
  localStorage.setItem("arc.settings", JSON.stringify(state.settings));
}

function applySettings() {
  const s = state.settings;
  document.documentElement.dataset.theme = s.uiTheme || "arc-dark";
  document.documentElement.classList.toggle("reduceMotion", !!s.reduceMotion);

  if (state.editor) {
    state.editor.updateOptions({
      fontSize: s.fontSize || 17,
      lineHeight: Math.round((s.fontSize || 17) * 1.35),
    });
    if (typeof monaco !== "undefined") {
      monaco.editor.setTheme(s.monacoTheme || "arc-dark");
    }
  }
}

function renderTabs() {
  const tabsEl = $("#tabs");
  tabsEl.innerHTML = "";

  for (const t of state.tabs) {
    const tab = document.createElement("div");
    tab.className = "tab" + (t.path === state.activePath ? " active" : "") + (t.dirty ? " dirty" : "");
    tab.title = t.path;

    const dot = document.createElement("div");
    dot.className = "dot";
    tab.appendChild(dot);

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = t.name;
    tab.appendChild(name);

    const close = document.createElement("button");
    close.className = "close";
    close.textContent = "×";
    close.title = "Close";
    close.addEventListener("click", (e) => {
      e.stopPropagation();
      closeTab(t.path);
    });
    tab.appendChild(close);

    tab.addEventListener("click", () => activateTab(t.path));
    tabsEl.appendChild(tab);
  }
}

function markDirty(path, dirty) {
  const t = state.tabs.find((x) => x.path === path);
  if (!t) return;
  t.dirty = dirty;
  renderTabs();
}

function activateTab(path) {
  const model = state.modelsByPath.get(path);
  if (!model) return;
  state.activePath = path;
  state.editor.setModel(model);
  ensureWelcomeHidden();
  refreshExplorerActive();
  renderTabs();
  setStatus(`Editing: ${basename(path)}`);
}

function closeTab(path) {
  const idx = state.tabs.findIndex((t) => t.path === path);
  if (idx === -1) return;

  const wasActive = state.activePath === path;
  const model = state.modelsByPath.get(path);
  if (model) {
    model.dispose();
    state.modelsByPath.delete(path);
  }

  state.tabs.splice(idx, 1);

  if (wasActive) {
    const next = state.tabs[idx] || state.tabs[idx - 1];
    state.activePath = next ? next.path : "";
    if (next) activateTab(next.path);
    else {
      state.editor.setModel(null);
      $("#welcome")?.classList.remove("hidden");
      setStatus("Ready");
    }
  }

  renderTabs();
}

async function openFileByPath(path) {
  if (!path) return;
  ensureWelcomeHidden();

  if (state.modelsByPath.has(path)) {
    activateTab(path);
    return;
  }

  setStatus("Opening file…");
  const content = await new Promise((resolve) => {
    state.bridge.readFile(path, (r) => resolve(r));
  });

  if (content === "") {
    setStatus("Failed to read file (empty or inaccessible).");
  }

  const lang = extToLanguage(path);
  const model = monaco.editor.createModel(content, lang);
  state.modelsByPath.set(path, model);

  const tab = {
    path,
    name: basename(path),
    language: lang,
    dirty: false,
  };
  state.tabs.push(tab);

  model.onDidChangeContent(() => {
    markDirty(path, true);
  });

  activateTab(path);
  setStatus(`Opened: ${tab.name}`);
}

function refreshExplorerActive() {
  const p = state.activePath;
  for (const el of document.querySelectorAll(".treeItem.file")) {
    el.classList.toggle("active", el.dataset.path === p);
  }
}

async function openFileDialog() {
  if (!state.bridge) return;
  const path = await new Promise((resolve) => {
    state.bridge.openFileDialog((p) => resolve(p));
  });
  if (!path) return;
  await openFileByPath(path);
}

async function openFolderDialog() {
  if (!state.bridge) return;
  const dir = await new Promise((resolve) => {
    state.bridge.openFolderDialog((p) => resolve(p));
  });
  if (!dir) return;
  state.workspaceRoot = dir;
  $("#workspaceLabel").textContent = dir;
  await loadExplorer(dir);
  setStatus("Folder opened.");
}

function iconFor(node) {
  if (node.isDir) return "📁";
  const p = (node.path || "").toLowerCase();
  if (p.endsWith(".cpp") || p.endsWith(".h") || p.endsWith(".hpp")) return "🧩";
  if (p.endsWith(".js") || p.endsWith(".ts")) return "🟨";
  if (p.endsWith(".py")) return "🐍";
  if (p.endsWith(".sway")) return "🟦";
  if (p.endsWith(".json")) return "🔧";
  if (p.endsWith(".md")) return "📝";
  return "📄";
}

function buildTree(container, node, depth = 0) {
  const row = document.createElement("div");
  row.className = "treeItem";
  row.style.paddingLeft = `${8 + depth * 12}px`;

  const twisty = document.createElement("div");
  twisty.className = "twisty";
  twisty.textContent = node.isDir ? "▸" : "";
  row.appendChild(twisty);

  const icon = document.createElement("div");
  icon.className = "icon";
  icon.textContent = iconFor(node);
  row.appendChild(icon);

  const label = document.createElement("div");
  label.className = "label";
  label.textContent = node.name;
  row.appendChild(label);

  container.appendChild(row);

  if (!node.isDir) {
    row.classList.add("file");
    row.dataset.path = node.path;
    row.classList.toggle("active", node.path === state.activePath);
    row.addEventListener("click", () => openFileByPath(node.path));
    return;
  }

  const childrenWrap = document.createElement("div");
  childrenWrap.className = "indent";
  childrenWrap.style.display = "none";
  container.appendChild(childrenWrap);

  let expanded = false;

  row.addEventListener("click", () => {
    expanded = !expanded;
    twisty.textContent = expanded ? "▾" : "▸";
    childrenWrap.style.display = expanded ? "block" : "none";
  });

  const children = node.children || [];
  for (const ch of children) {
    buildTree(childrenWrap, ch, depth + 1);
  }
}

async function loadExplorer(rootPath) {
  if (!state.bridge) return;
  setStatus("Loading explorer…");

  const nodes = await new Promise((resolve) => {
    state.bridge.listFiles(rootPath, (r) => resolve(r));
  });

  const explorer = $("#explorer");
  explorer.innerHTML = "";

  if (!nodes || nodes.length === 0) {
    explorer.textContent = "No files.";
    setStatus("Explorer is empty.");
    return;
  }

  for (const n of nodes) buildTree(explorer, n, 0);
  refreshExplorerActive();
  setStatus("Explorer loaded.");
}

async function saveActive() {
  const path = state.activePath;
  if (!path) return;
  const model = state.modelsByPath.get(path);
  if (!model) return;

  setStatus("Saving…");
  const ok = await new Promise((resolve) => {
    state.bridge.writeFile(path, model.getValue(), (r) => resolve(r));
  });
  if (ok) {
    markDirty(path, false);
    setStatus(`Saved: ${basename(path)}`);
  } else {
    setStatus("Save failed.");
  }
}

function registerSwayLanguage() {
  // Sway: custom Swift-like language (minimal, practical syntax highlighting)
  monaco.languages.register({
    id: "sway",
    extensions: [".sway"],
    aliases: ["Sway", "sway"],
    mimetypes: ["text/x-sway"],
  });

  monaco.languages.setLanguageConfiguration("sway", {
    comments: { lineComment: "//", blockComment: ["/*", "*/"] },
    brackets: [
      ["{", "}"],
      ["[", "]"],
      ["(", ")"],
    ],
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: '"', close: '"', notIn: ["string", "comment"] },
      { open: "'", close: "'", notIn: ["string", "comment"] },
    ],
    surroundingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
  });

  const keywords = [
    "let",
    "var",
    "func",
    "struct",
    "enum",
    "class",
    "protocol",
    "extension",
    "import",
    "return",
    "if",
    "else",
    "switch",
    "case",
    "default",
    "for",
    "in",
    "while",
    "break",
    "continue",
    "guard",
    "defer",
    "throw",
    "throws",
    "try",
    "catch",
    "async",
    "await",
    "public",
    "private",
    "internal",
    "static",
    "mutating",
    "init",
    "self",
    "super",
    "true",
    "false",
    "nil",
  ];

  monaco.languages.setMonarchTokensProvider("sway", {
    defaultToken: "",
    tokenPostfix: ".sway",
    keywords,
    typeKeywords: ["Int", "UInt", "Int64", "UInt64", "Bool", "String", "Double", "Float", "Void", "Any"],
    operators: [
      "=",
      ">",
      "<",
      "!",
      "~",
      "?",
      ":",
      "==",
      "<=",
      ">=",
      "!=",
      "&&",
      "||",
      "+",
      "-",
      "*",
      "/",
      "&",
      "|",
      "^",
      "%",
      "<<",
      ">>",
      "->",
      "=>",
      "..",
      "...",
      "+=",
      "-=",
      "*=",
      "/=",
    ],
    symbols: /[=><!~?:&|+\-*/^%]+/,
    escapes: /\\(?:[nrt0\\'"$]|u\{[0-9a-fA-F]{1,8}\})/,

    tokenizer: {
      root: [
        [/\/\/.*$/, "comment"],
        [/\/\*/, "comment", "@comment"],
        [/@[A-Za-z_]\w*/, "annotation"],
        [/[A-Za-z_]\w*/, { cases: { "@keywords": "keyword", "@typeKeywords": "type", "@default": "identifier" } }],
        [/\b0x[0-9a-fA-F_]+\b/, "number.hex"],
        [/\b\d[\d_]*(\.\d[\d_]*)?([eE][+\-]?\d[\d_]*)?\b/, "number"],
        [/"([^"\\]|\\.)*$/, "string.invalid"],
        [/"/, "string", "@string_double"],
        [/'([^'\\]|\\.)*$/, "string.invalid"],
        [/'/, "string", "@string_single"],
        [/@symbols/, { cases: { "@operators": "operator", "@default": "" } }],
        [/[{}()[\]]/, "@brackets"],
        [/[;,.]/, "delimiter"],
        [/\s+/, ""],
      ],

      comment: [
        [/[^\/*]+/, "comment"],
        [/\*\//, "comment", "@pop"],
        [/[\/*]/, "comment"],
      ],

      string_double: [
        [/[^\\"$]+/, "string"],
        [/\$\{/, "delimiter.bracket", "@interp"],
        [/@escapes/, "string.escape"],
        [/\\./, "string.escape.invalid"],
        [/"/, "string", "@pop"],
      ],
      string_single: [
        [/[^\\']+/, "string"],
        [/@escapes/, "string.escape"],
        [/\\./, "string.escape.invalid"],
        [/'/, "string", "@pop"],
      ],
      interp: [
        [/\}/, "delimiter.bracket", "@pop"],
        { include: "root" },
      ],
    },
  });
}

function defineArcMonacoThemes() {
  const baseRules = [
    { token: "comment", foreground: "6B7280" },
    { token: "string", foreground: "A7F3D0" },
    { token: "string.escape", foreground: "FDE68A" },
    { token: "number", foreground: "FCA5A5" },
    { token: "number.hex", foreground: "FCA5A5" },
    { token: "keyword", foreground: "93C5FD", fontStyle: "bold" },
    { token: "type", foreground: "FBCFE8" },
    { token: "operator", foreground: "E5E7EB" },
    { token: "annotation", foreground: "C4B5FD" },
    { token: "identifier", foreground: "E5E7EB" },
  ];

  monaco.editor.defineTheme("arc-dark", {
    base: "vs-dark",
    inherit: true,
    rules: baseRules,
    colors: {
      "editor.background": "#0f111a",
      "editor.foreground": "#e5e7eb",
      "editorLineNumber.foreground": "#44506a",
      "editorLineNumber.activeForeground": "#cbd5e1",
      "editorCursor.foreground": "#a7b4ff",
      "editor.selectionBackground": "#2b3a7a",
      "editor.inactiveSelectionBackground": "#1f2746",
      "editor.findMatchBackground": "#3a2e7a",
      "editor.findMatchHighlightBackground": "#2c2554",
      "editorWhitespace.foreground": "#2a3148",
      "editorIndentGuide.background1": "#202842",
      "editorIndentGuide.activeBackground1": "#35406a",
      "editorWidget.background": "#151a2f",
      "editorWidget.border": "#2a3354",
      "editorSuggestWidget.background": "#151a2f",
      "editorSuggestWidget.border": "#2a3354",
      "editorSuggestWidget.selectedBackground": "#213061",
      "editorHoverWidget.background": "#151a2f",
      "editorHoverWidget.border": "#2a3354",
    },
  });

  monaco.editor.defineTheme("arc-midnight", {
    base: "vs-dark",
    inherit: true,
    rules: baseRules.map((r) => (r.token === "keyword" ? { ...r, foreground: "C4B5FD", fontStyle: "bold" } : r)),
    colors: {
      "editor.background": "#070a14",
      "editor.foreground": "#e5e7eb",
      "editorLineNumber.foreground": "#2f3a58",
      "editorLineNumber.activeForeground": "#cbd5e1",
      "editorCursor.foreground": "#8b5cf6",
      "editor.selectionBackground": "#2a1f55",
      "editor.inactiveSelectionBackground": "#1b1634",
      "editorWhitespace.foreground": "#202844",
      "editorIndentGuide.background1": "#1d2440",
      "editorIndentGuide.activeBackground1": "#3a3f76",
      "editorWidget.background": "#0b1028",
      "editorWidget.border": "#232c55",
      "editorSuggestWidget.background": "#0b1028",
      "editorSuggestWidget.border": "#232c55",
      "editorSuggestWidget.selectedBackground": "#1a2452",
      "editorHoverWidget.background": "#0b1028",
      "editorHoverWidget.border": "#232c55",
    },
  });

  monaco.editor.defineTheme("arc-graphite", {
    base: "vs-dark",
    inherit: true,
    rules: baseRules.map((r) => (r.token === "string" ? { ...r, foreground: "86EFAC" } : r)),
    colors: {
      "editor.background": "#0f1113",
      "editor.foreground": "#e5e7eb",
      "editorLineNumber.foreground": "#3b4046",
      "editorLineNumber.activeForeground": "#e5e7eb",
      "editorCursor.foreground": "#60a5fa",
      "editor.selectionBackground": "#1f2a33",
      "editor.inactiveSelectionBackground": "#1a222a",
      "editorWhitespace.foreground": "#23282f",
      "editorIndentGuide.background1": "#23282f",
      "editorIndentGuide.activeBackground1": "#3b4654",
      "editorWidget.background": "#151a1f",
      "editorWidget.border": "#2a3038",
      "editorSuggestWidget.background": "#151a1f",
      "editorSuggestWidget.border": "#2a3038",
      "editorSuggestWidget.selectedBackground": "#202733",
      "editorHoverWidget.background": "#151a1f",
      "editorHoverWidget.border": "#2a3038",
    },
  });
}

function showOverlay(mode) {
  const overlay = $("#overlay");
  overlay.classList.remove("hidden");

  const title = $("#overlayTitle");
  const extList = $("#extensionsList");
  const form = overlay.querySelector(".form");

  if (mode === "extensions") {
    title.textContent = "Extensions";
    extList.classList.remove("hidden");
    form.classList.add("hidden");
    renderExtensionsList();
  } else {
    title.textContent = "Settings";
    extList.classList.add("hidden");
    form.classList.remove("hidden");
    syncSettingsUI();
  }
}

function hideOverlay() {
  $("#overlay").classList.add("hidden");
}

function syncSettingsUI() {
  $("#uiTheme").value = state.settings.uiTheme;
  $("#monacoTheme").value = state.settings.monacoTheme;
  $("#fontSize").value = String(state.settings.fontSize);
  $("#fontSizeValue").textContent = String(state.settings.fontSize);
  $("#reduceMotion").checked = !!state.settings.reduceMotion;
  $("#extensionsRoot").value = state.settings.extensionsRoot || "";
}

function renderExtensionsList() {
  const items = $("#extItems");
  items.innerHTML = "";
  const list = state.extensions || [];

  if (list.length === 0) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = "No extensions found.";
    items.appendChild(empty);
    return;
  }

  for (const ext of list) {
    const row = document.createElement("div");
    row.className = "extItem";

    const meta = document.createElement("div");
    meta.className = "extMeta";

    const name = document.createElement("div");
    name.className = "extName";
    name.textContent = ext.name || ext.id || "Extension";

    const desc = document.createElement("div");
    desc.className = "extDesc";
    desc.textContent = ext.description || ext.dir || "";

    meta.appendChild(name);
    meta.appendChild(desc);

    const badge = document.createElement("div");
    badge.className = "badge";
    badge.textContent = ext.version ? `v${ext.version}` : "enabled";

    row.appendChild(meta);
    row.appendChild(badge);
    items.appendChild(row);
  }
}

async function detectDefaultExtensionsRoot() {
  // Default: <AppDataDir>/extensions
  const appData = await new Promise((resolve) => state.bridge.appDataDir((r) => resolve(r)));
  const root = `${appData}/extensions`;
  await new Promise((resolve) => state.bridge.ensureDir(root, (r) => resolve(r)));
  return root;
}

async function readJson(path) {
  const text = await new Promise((resolve) => state.bridge.readFile(path, (r) => resolve(r)));
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function loadExtensions() {
  if (!state.bridge) return;

  if (!state.settings.extensionsRoot) {
    state.settings.extensionsRoot = await detectDefaultExtensionsRoot();
    saveSettings();
  }

  const root = state.settings.extensionsRoot;
  $("#extensionsRoot").value = root;

  // Root listing gives us children nodes; take only directories as extensions.
  const roots = await new Promise((resolve) => state.bridge.listFiles(root, (r) => resolve(r)));
  const rootNode = roots && roots[0];
  const children = (rootNode && rootNode.children) || [];

  const found = [];
  for (const ch of children) {
    if (!ch.isDir) continue;
    const dir = ch.path;
    const manifestPath = `${dir}/manifest.json`;
    const mainPath = `${dir}/main.js`;

    const manifest = await readJson(manifestPath);
    if (!manifest || !manifest.id) continue;

    const main = await new Promise((resolve) => state.bridge.readFile(mainPath, (r) => resolve(r)));
    if (!main) continue;

    // Optional CSS
    const cssPath = `${dir}/styles.css`;
    const css = await new Promise((resolve) => state.bridge.readFile(cssPath, (r) => resolve(r)));
    if (css) {
      const style = document.createElement("style");
      style.dataset.ext = manifest.id;
      style.textContent = css;
      document.head.appendChild(style);
    }

    // Run extension in a tiny sandbox-like wrapper.
    // Extension entry: module.exports.activate(api)
    const module = { exports: {} };
    const exports = module.exports;

    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function("api", "module", "exports", main);
      const api = {
        monaco,
        editor: state.editor,
        bridge: state.bridge,
        state,
        openFileByPath,
        setStatus,
      };
      fn(api, module, exports);
      if (module.exports && typeof module.exports.activate === "function") {
        module.exports.activate(api);
      }
      found.push({
        id: manifest.id,
        name: manifest.name || manifest.id,
        version: manifest.version || "",
        description: manifest.description || "",
        dir,
      });
    } catch (e) {
      // Keep app running even if an extension fails.
      // eslint-disable-next-line no-console
      console.error("Extension failed:", manifest.id, e);
    }
  }

  state.extensions = found;
  renderExtensionsList();
  setStatus(found.length ? `Extensions loaded: ${found.length}` : "No extensions loaded.");
}

function initMonaco() {
  return new Promise((resolve) => {
    require.config({
      paths: {
        vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.47.0/min/vs",
      },
    });

    require(["vs/editor/editor.main"], () => {
      defineArcMonacoThemes();
      registerSwayLanguage();

      state.editor = monaco.editor.create($("#editor"), {
        theme: state.settings.monacoTheme || "arc-dark",
        automaticLayout: true,
        minimap: { enabled: true },
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
        fontSize: state.settings.fontSize || 17,
        lineHeight: Math.round((state.settings.fontSize || 17) * 1.35),
        smoothScrolling: true,
        cursorSmoothCaretAnimation: "on",
        renderWhitespace: "selection",
        padding: { top: 12, bottom: 12 },
      });

      // Save shortcut
      window.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          saveActive();
        }
      });

      resolve();
    });
  });
}

function initBridge() {
  return new Promise((resolve) => {
    new QWebChannel(qt.webChannelTransport, (channel) => {
      state.bridge = channel.objects.bridge;
      resolve();
    });
  });
}

function bindUI() {
  $("#btnOpenFile").addEventListener("click", openFileDialog);
  $("#btnOpenFolder").addEventListener("click", openFolderDialog);
  $("#btnSave").addEventListener("click", saveActive);
  $("#btnRefresh").addEventListener("click", () => {
    if (state.workspaceRoot) loadExplorer(state.workspaceRoot);
  });
  $("#welcomeOpenFile").addEventListener("click", openFileDialog);
  $("#welcomeOpenFolder").addEventListener("click", openFolderDialog);

  // Overlay controls
  $("#btnSettings").addEventListener("click", () => showOverlay("settings"));
  $("#btnExtensions").addEventListener("click", () => showOverlay("extensions"));
  $("#overlayClose").addEventListener("click", hideOverlay);
  $("#overlayBackdrop").addEventListener("click", hideOverlay);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideOverlay();
  });

  // Settings inputs
  $("#fontSize").addEventListener("input", (e) => {
    const v = Number(e.target.value);
    $("#fontSizeValue").textContent = String(v);
  });
  $("#btnApplySettings").addEventListener("click", () => {
    state.settings.uiTheme = $("#uiTheme").value;
    state.settings.monacoTheme = $("#monacoTheme").value;
    state.settings.fontSize = Number($("#fontSize").value) || 17;
    state.settings.reduceMotion = $("#reduceMotion").checked;
    saveSettings();
    applySettings();
    hideOverlay();
    setStatus("Settings applied.");
  });
  $("#btnReloadExtensions").addEventListener("click", async () => {
    await loadExtensions();
  });
  $("#pickExtensionsRoot").addEventListener("click", async () => {
    const dir = await new Promise((resolve) => state.bridge.openFolderDialog((p) => resolve(p)));
    if (!dir) return;
    state.settings.extensionsRoot = dir;
    $("#extensionsRoot").value = dir;
    saveSettings();
    await loadExtensions();
  });
}

(async function boot() {
  setStatus("Starting…");
  loadSettings();
  bindUI();
  await initBridge();
  await initMonaco();
  applySettings();
  await loadExtensions();
  setStatus("Ready");
})();

