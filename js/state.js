// ─── Limits ───────────────────────────────────────────────────────────────────
// Above this size, JSON responses are shown as raw text instead of being
// pretty-printed and rendered as an interactive tree (avoids freezing the tab).
const JSON_TREE_MAX_BYTES = 1_000_000; // 1 MB

// ─── Method colours ───────────────────────────────────────────────────────────
const MC = {
  GET:     '#61affe',
  POST:    '#49cc90',
  PUT:     '#fca130',
  PATCH:   '#50e3c2',
  DELETE:  '#f93e3e',
  HEAD:    '#9012fe',
  OPTIONS: '#0d5aa7',
};

// ─── Global state ─────────────────────────────────────────────────────────────
const state = {
  // All three loaded from data/ via /api/data — see loadData() in app.js
  cols:    [],
  envs:    [{ id: 'default', name: 'No Environment', vars: {} }],
  hist:    [],

  activeEnv:       'default',
  activeReqId:     null,
  req:             null,   // working copy of the selected request
  resp:            null,
  reqTab:          'params',
  respTab:         'body',
  loading:         false,
  expandedCols:    new Set(),
  expandedFolders: new Set(),
  showHist:        false,
  envSelId:        'default',
  abortCtrl:       null,
  selectedReqIds:  new Set(),
  lastSelReqId:    null,
  reqTabByReqId:   new Map(), // remembers the last-active tab per request (runtime only)
};

// ─── Auto-sync working request back into state.cols, then auto-save to disk ───
let _autoSaveTimer = null;

function scheduleAutoSave() {
  clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(() => {
    syncReqIntoCols();
    scheduleDiskSave();
  }, 500);
}

function syncReqIntoCols() {
  if (!state.req) return;
  const r = clone(state.req);
  state.cols = state.cols.map(c => {
    const inRoot   = c.requests.some(x => x.id === r.id);
    const inFolder = c.folders.some(f => f.requests.some(x => x.id === r.id));
    if (!inRoot && !inFolder) return c;
    return {
      ...c,
      requests: c.requests.map(x => x.id === r.id ? r : x),
      folders:  c.folders.map(f => ({ ...f, requests: f.requests.map(x => x.id === r.id ? r : x) })),
    };
  });
}

// ─── Debounced disk save — fires after any change (button or keystroke) ───────
let _diskSaveTimer = null;

function scheduleDiskSave() {
  clearTimeout(_diskSaveTimer);
  _diskSaveTimer = setTimeout(() => saveAll(true), 800);
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/** HTML-escape a value for safe innerHTML insertion */
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Interpolate {{variable}} placeholders using the active environment */
function interp(s) {
  if (!s) return s;
  const vars = state.envs.find(e => e.id === state.activeEnv)?.vars ?? {};
  return s.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

/** Emit a toast notification (success | error | info) */
function notify(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `notif ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}
