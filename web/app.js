/* global QWebChannel, monaco, require */

/** Qt resource paths for toolbar / tab icons */
const ICON = (file) => `qrc:/web/icons/white/${file}`;

const state = {
  bridge: null,
  editor: null,
  workspaceRoot: "",
  sideView: "explorer", // "explorer" | "extensions"
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
  extensions: [], // full entry: id, name, version, description, dir, manifest, extRoot, source
  selectedExtension: null,
};

function $(sel) {
  return document.querySelector(sel);
}

function setStatus(text) {
  const el = $("#statusText");
  if (!el) return;
  el.textContent = text;
}

/** Monaco language id + icon key (see LANG_ICON_FILES). */
function extToLanguage(path) {
  const p = (path || "").toLowerCase();
  const dot = p.lastIndexOf(".");
  if (dot === -1) return "plaintext";
  const ext = p.slice(dot);
  const map = {
    ".cpp": "cpp",
    ".cc": "cpp",
    ".cxx": "cpp",
    ".hpp": "cpp",
    ".hh": "cpp",
    ".hxx": "cpp",
    ".h": "cpp",
    ".c": "c",
    ".js": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".py": "python",
    ".pyw": "python",
    ".sway": "sway",
    ".json": "json",
    ".html": "html",
    ".htm": "html",
    ".css": "css",
    ".md": "markdown",
    ".mdx": "markdown",
    ".rs": "rust",
    ".go": "go",
    ".java": "java",
    ".kt": "kotlin",
    ".kts": "kotlin",
    ".rb": "ruby",
    ".php": "php",
    ".sh": "shell",
    ".bash": "shell",
    ".zsh": "shell",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".xml": "xml",
    ".sql": "sql",
    ".vue": "vue",
    ".swift": "swift",
    ".cs": "csharp",
  };
  return map[ext] || "plaintext";
}

const LANG_ICON_FILES = {
  cpp: "lang-cpp.svg",
  c: "lang-c.svg",
  javascript: "lang-javascript.svg",
  typescript: "lang-typescript.svg",
  python: "lang-python.svg",
  sway: "lang-sway.svg",
  json: "lang-json.svg",
  html: "lang-html.svg",
  css: "lang-css.svg",
  markdown: "lang-markdown.svg",
  plaintext: "lang-plaintext.svg",
  rust: "lang-rust.svg",
  go: "lang-go.svg",
  java: "lang-java.svg",
  kotlin: "lang-kotlin.svg",
  ruby: "lang-ruby.svg",
  php: "lang-php.svg",
  shell: "lang-shell.svg",
  yaml: "lang-yaml.svg",
  xml: "lang-xml.svg",
  sql: "lang-sql.svg",
  vue: "lang-vue.svg",
  swift: "lang-swift.svg",
  csharp: "lang-csharp.svg",
};

function langIconUrlFromLang(lang) {
  const f = LANG_ICON_FILES[lang] || LANG_ICON_FILES.plaintext;
  return `qrc:/web/icons/lang/${f}`;
}

function langIconUrlFromPath(path) {
  return langIconUrlFromLang(extToLanguage(path));
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

    const langImg = document.createElement("img");
    langImg.className = "tabLangIcon";
    langImg.src = langIconUrlFromLang(t.language);
    langImg.alt = "";
    langImg.width = 14;
    langImg.height = 14;
    tab.appendChild(langImg);

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = t.name;
    tab.appendChild(name);

    const close = document.createElement("button");
    close.className = "close";
    close.title = "Close";
    const closeLegacy = document.createElement("span");
    closeLegacy.className = "close-legacy";
    closeLegacy.setAttribute("aria-hidden", "true");
    closeLegacy.textContent = "×";
    const closeImg = document.createElement("img");
    closeImg.className = "ico-svg ico-svg--sm";
    closeImg.src = ICON("icon-close-tab.svg");
    closeImg.width = 14;
    closeImg.height = 14;
    closeImg.alt = "";
    close.appendChild(closeLegacy);
    close.appendChild(closeImg);
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
  await new Promise((resolve) => {
    state.bridge.setWorkspaceRoot(dir, () => resolve());
  });
  await loadExplorer(dir);
  setStatus("Folder opened.");
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
  icon.className = "icon icon--lang";
  const glyph = document.createElement("img");
  glyph.className = "langGlyph";
  glyph.draggable = false;
  glyph.alt = "";
  if (node.isDir) {
    glyph.src = "qrc:/web/icons/lang/lang-folder.svg";
  } else {
    glyph.src = langIconUrlFromPath(node.path);
  }
  icon.appendChild(glyph);
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
  const text = model.getValue();
  const ok = await new Promise((resolve) => {
    state.bridge.writeFile(path, text, (r) => resolve(r));
  });
  if (ok) {
    markDirty(path, false);
    await new Promise((resolve) => {
      state.bridge.syncAutoSaveBaseline(path, text, () => resolve());
    });
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

function showSettingsOverlay() {
  const overlay = $("#overlay");
  overlay.classList.remove("hidden");
  $("#overlayTitle").textContent = "Settings";
  syncSettingsUI();
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
}

function setSideView(view) {
  state.sideView = view;
  const explorerOn = view === "explorer";
  $("#panelExplorer").classList.toggle("hidden", !explorerOn);
  $("#panelExtensions").classList.toggle("hidden", explorerOn);
  $("#btnSideExplorer").classList.toggle("active", explorerOn);
  $("#btnExtensions").classList.toggle("active", !explorerOn);
  if (view === "extensions") renderExtensionsList();
}

function filterExtensionsList(query) {
  const q = (query || "").trim().toLowerCase();
  const rows = document.querySelectorAll("#extPanelItems .extItem");
  for (const row of rows) {
    const hay = (row.dataset.search || "").toLowerCase();
    row.classList.toggle("hidden", q.length > 0 && !hay.includes(q));
  }
}

function renderExtensionsList() {
  const items = $("#extPanelItems");
  if (!items) return;
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
    row.className = "extItem extItem--clickable";
    row.dataset.extId = ext.id;
    row.title = "View details";

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
    row.dataset.search = `${ext.name || ""} ${ext.id || ""} ${ext.description || ""} ${ext.dir || ""}`;
    row.addEventListener("click", () => openExtensionDetail(ext));
    items.appendChild(row);
  }
  filterExtensionsList($("#extSearchInput")?.value || "");
}

function compareSemver(a, b) {
  const pa = String(a || "0")
    .split(/[.+_-]/)
    .map((x) => parseInt(x, 10))
    .map((n) => (Number.isFinite(n) ? n : 0));
  const pb = String(b || "0")
    .split(/[.+_-]/)
    .map((x) => parseInt(x, 10))
    .map((n) => (Number.isFinite(n) ? n : 0));
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

let _extDownloadWaiter = null;
let _extFetchWaiter = null;
let _extensionSignalsWired = false;

function wireExtensionBridgeSignals() {
  if (!state.bridge || _extensionSignalsWired) return;
  _extensionSignalsWired = true;
  state.bridge.extensionDownloadFinished.connect((ok, destPath, err) => {
    if (_extDownloadWaiter) {
      const r = _extDownloadWaiter;
      _extDownloadWaiter = null;
      r({ ok, destPath, err: err || "" });
    }
  });
  state.bridge.extensionFetchFinished.connect((ok, url, body, err) => {
    if (_extFetchWaiter) {
      const r = _extFetchWaiter;
      _extFetchWaiter = null;
      r({ ok, url, body: body || "", err: err || "" });
    }
  });
}

function downloadToFileAsync(url, destPath) {
  return new Promise((resolve) => {
    _extDownloadWaiter = resolve;
    state.bridge.downloadToFile(url, destPath, () => {});
  });
}

function fetchUrlTextAsync(url) {
  return new Promise((resolve) => {
    _extFetchWaiter = resolve;
    state.bridge.fetchUrlText(url, () => {});
  });
}

async function openExtensionDetail(ext) {
  state.selectedExtension = ext;
  const sheet = $("#extDetailSheet");
  const backdrop = $("#extDetailBackdrop");
  if (!sheet || !backdrop) return;
  $("#extDetailTitle").textContent = ext.name || ext.id;
  $("#extDetailId").textContent = ext.id;
  $("#extDetailVersion").textContent = ext.version || "—";
  $("#extDetailPath").textContent = ext.dir || "";
  $("#extDetailDesc").textContent = ext.description || "—";
  const upd = ext.manifest && ext.manifest.updateManifestUrl;
  $("#extDetailUpdateUrl").textContent = upd || "— (add updateManifestUrl to manifest.json)";
  $("#extDetailSource").textContent = ext.source === "bundled" ? "Bundled" : "User folder";
  $("#extDetailSource").className = "extDetailBadge " + (ext.source === "bundled" ? "isBundled" : "isUser");
  $("#extDetailHint").textContent =
    ext.source === "bundled"
      ? "Removing deletes the copy on disk next to the application (developer build)."
      : "Removing deletes this folder under your extensions directory.";
  $("#extDetailReadme").textContent = "Loading…";
  sheet.classList.remove("hidden");
  backdrop.classList.remove("hidden");
  sheet.setAttribute("aria-hidden", "false");

  const readmePath = `${ext.dir}/README.md`;
  const readmeText = await new Promise((resolve) => {
    state.bridge.readFile(readmePath, (r) => resolve(r || ""));
  });
  $("#extDetailReadme").textContent = readmeText.trim() ? readmeText : "— (no README.md)";
}

function closeExtensionDetail() {
  state.selectedExtension = null;
  $("#extDetailSheet")?.classList.add("hidden");
  $("#extDetailBackdrop")?.classList.add("hidden");
  $("#extDetailSheet")?.setAttribute("aria-hidden", "true");
}

async function onExtensionCheckUpdate() {
  const ext = state.selectedExtension;
  if (!ext || !state.bridge) return;
  const url = ext.manifest && ext.manifest.updateManifestUrl;
  if (!url || !String(url).startsWith("http")) {
    setStatus("No updateManifestUrl in manifest (https URL to a JSON manifest).");
    return;
  }
  setStatus("Checking for updates…");
  try {
    const { ok, body, err } = await fetchUrlTextAsync(url);
    if (!ok) {
      setStatus(`Update check failed: ${err || "network"}`);
      return;
    }
    let remote = null;
    try {
      remote = JSON.parse(body);
    } catch {
      setStatus("Update manifest is not valid JSON.");
      return;
    }
    const v = remote.version || remote.latest || "";
    if (!v) {
      setStatus("Remote manifest has no version field.");
      return;
    }
    const cmp = compareSemver(v, ext.version || "0");
    if (cmp > 0) {
      const dl = remote.packageUrl || remote.downloadUrl || remote.zipUrl || "";
      setStatus(`Update available: ${v} (current ${ext.version || "?"})${dl ? " — set packageUrl in manifest to download." : ""}`);
    } else if (cmp === 0) {
      setStatus(`You are on the latest version (${ext.version || v}).`);
    } else {
      setStatus(`Local version is newer or equal (remote ${v}, local ${ext.version || "?"}).`);
    }
  } catch (e) {
    setStatus("Update check failed.");
    // eslint-disable-next-line no-console
    console.error(e);
  }
}

async function onExtensionDelete() {
  const ext = state.selectedExtension;
  if (!ext || !state.bridge) return;
  const ok = confirm(`Remove extension "${ext.name || ext.id}"?\n\n${ext.dir}`);
  if (!ok) return;
  setStatus("Removing extension…");
  const removed = await new Promise((resolve) => {
    state.bridge.removeRecursiveUnderRoot(ext.extRoot, ext.dir, (r) => resolve(r));
  });
  if (removed) {
    closeExtensionDetail();
    await loadExtensions();
    setStatus("Extension removed.");
  } else {
    setStatus("Could not remove (path not allowed or missing).");
  }
}

async function onInstallFromUrl() {
  const url = ($("#extInstallUrl") && $("#extInstallUrl").value.trim()) || "";
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    setStatus("Enter a valid http(s) URL to a .zip file.");
    return;
  }
  const userRoot = state.settings.extensionsRoot;
  if (!userRoot) {
    setStatus("Extensions folder not set.");
    return;
  }
  const staging = `${userRoot}/.arc-staging`;
  await new Promise((resolve) => state.bridge.ensureDir(staging, () => resolve()));
  const zipPath = `${staging}/install-${Date.now()}.zip`;
  setStatus("Downloading extension…");
  const { ok, err } = await downloadToFileAsync(url, zipPath);
  if (!ok) {
    setStatus(`Download failed: ${err || "?"}`);
    return;
  }
  setStatus("Unpacking…");
  const unzipped = await new Promise((resolve) => {
    state.bridge.unzipArchive(zipPath, userRoot, (r) => resolve(r));
  });
  await new Promise((resolve) => {
    state.bridge.removeRecursiveUnderRoot(userRoot, zipPath, () => resolve());
  });
  if (!unzipped) {
    setStatus("Unpack failed (install unzip/tar or check archive).");
    await loadExtensions();
    return;
  }
  $("#extInstallUrl").value = "";
  await loadExtensions();
  setStatus("Extension installed from URL.");
}

function bindExtensionDetailUI() {
  $("#extDetailClose")?.addEventListener("click", closeExtensionDetail);
  $("#extDetailBackdrop")?.addEventListener("click", closeExtensionDetail);
  $("#extDetailCheckUpdate")?.addEventListener("click", () => onExtensionCheckUpdate());
  $("#extDetailDelete")?.addEventListener("click", () => onExtensionDelete());
  $("#btnExtInstallDownload")?.addEventListener("click", () => onInstallFromUrl());
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

  for (const el of document.querySelectorAll("style[data-ext]")) {
    el.remove();
  }

  if (!state.settings.extensionsRoot) {
    state.settings.extensionsRoot = await detectDefaultExtensionsRoot();
    saveSettings();
  }

  const userRoot = state.settings.extensionsRoot;
  const panelInput = $("#extensionsRootPanel");
  if (panelInput) panelInput.value = userRoot;

  const bundled = await new Promise((resolve) => {
    state.bridge.bundledExtensionsDir((r) => resolve(r || ""));
  });

  const roots = [];
  if (bundled) roots.push(bundled);
  if (userRoot && userRoot !== bundled) roots.push(userRoot);

  const byId = new Map();
  for (const root of roots) {
    if (!root) continue;
    const listed = await new Promise((resolve) => state.bridge.listFiles(root, (r) => resolve(r)));
    const rootNode = listed && listed[0];
    const children = (rootNode && rootNode.children) || [];
    for (const ch of children) {
      if (!ch.isDir) continue;
      const manifest = await readJson(`${ch.path}/manifest.json`);
      if (!manifest || !manifest.id) continue;
      byId.set(manifest.id, {
        dir: ch.path,
        manifest,
        extRoot: root,
        source: bundled && root === bundled ? "bundled" : "user",
      });
    }
  }

  const found = [];
  for (const entry of byId.values()) {
    const { dir, manifest, extRoot, source } = entry;
    const mainPath = `${dir}/main.js`;
    const main = await new Promise((resolve) => state.bridge.readFile(mainPath, (r) => resolve(r)));
    if (!main) continue;

    const cssPath = `${dir}/styles.css`;
    const css = await new Promise((resolve) => state.bridge.readFile(cssPath, (r) => resolve(r)));
    if (css) {
      const style = document.createElement("style");
      style.dataset.ext = manifest.id;
      style.textContent = css;
      document.head.appendChild(style);
    }

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
        manifest,
        extRoot,
        source,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("Extension failed:", manifest.id, e);
    }
  }

  state.extensions = found;
  renderExtensionsList();
  setStatus(found.length ? `Extensions loaded: ${found.length}` : "No extensions loaded.");
}

function wireEditorAutoSave() {
  if (!state.editor || !state.bridge) return;

  state.editor.onDidChangeModelContent(() => {
    const path = state.activePath;
    if (!path) return;
    const model = state.modelsByPath.get(path);
    if (!model) return;
    state.bridge.notifyAutoSaveChange(path, model.getValue(), () => {});
  });

  state.editor.onDidBlurEditorWidget(() => {
    const path = state.activePath;
    if (!path) return;
    const model = state.modelsByPath.get(path);
    if (!model) return;
    state.bridge.notifyAutoSaveFocusLost(path, model.getValue(), () => {});
  });
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

      const ed = monaco.editor.create($("#editor"), {
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
      state.editor = ed;

      // Save shortcut
      window.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          saveActive();
        }
      });

      wireEditorAutoSave();
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
  $("#btnSideExplorer").addEventListener("click", () => setSideView("explorer"));
  $("#btnOpenFile").addEventListener("click", openFileDialog);
  $("#btnOpenFolder").addEventListener("click", openFolderDialog);
  $("#btnSave").addEventListener("click", saveActive);
  $("#btnRefresh").addEventListener("click", () => {
    if (state.workspaceRoot) loadExplorer(state.workspaceRoot);
  });
  $("#welcomeOpenFile").addEventListener("click", openFileDialog);
  $("#welcomeOpenFolder").addEventListener("click", openFolderDialog);

  $("#btnSettings").addEventListener("click", showSettingsOverlay);
  $("#btnExtensions").addEventListener("click", () => setSideView("extensions"));
  $("#overlayClose").addEventListener("click", hideOverlay);
  $("#overlayBackdrop").addEventListener("click", hideOverlay);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!$("#extDetailSheet")?.classList.contains("hidden")) {
        closeExtensionDetail();
        return;
      }
      hideOverlay();
    }
  });

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
  $("#pickExtensionsRootPanel").addEventListener("click", async () => {
    const dir = await new Promise((resolve) => state.bridge.openFolderDialog((p) => resolve(p)));
    if (!dir) return;
    state.settings.extensionsRoot = dir;
    const panelInput = $("#extensionsRootPanel");
    if (panelInput) panelInput.value = dir;
    saveSettings();
    await loadExtensions();
  });
  const extSearch = $("#extSearchInput");
  if (extSearch) {
    extSearch.addEventListener("input", () => filterExtensionsList(extSearch.value));
  }
  bindExtensionDetailUI();
}

(async function boot() {
  setStatus("Starting…");
  loadSettings();
  bindUI();
  await initBridge();
  wireExtensionBridgeSignals();
  if (state.bridge.symbolIndexUpdated) {
    state.bridge.symbolIndexUpdated.connect(() => {
      setStatus("Symbol index updated.");
    });
  }
  await new Promise((resolve) => {
    state.bridge.configureAutoSave(2, 1500, () => resolve());
  });
  await initMonaco();
  applySettings();
  await loadExtensions();
  setSideView("explorer");
  setStatus("Ready");
})();

