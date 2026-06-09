// ─── Storage Keys ────────────────────────────────────────────────────────────
const SK = {
  COLS: 'sv_cols',
  GIT:  'sv_git',
  ENVS: 'sv_envs',
  HIST: 'sv_hist',
};

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
  cols:    load(SK.COLS, [demoCollection()]),
  git:     load(SK.GIT,  { token: '', owner: '', repo: '', branch: 'main', path: 'salvo.json', auto: false }),
  envs:    load(SK.ENVS, [{ id: 'default', name: 'No Environment', vars: {} }]),
  hist:    load(SK.HIST, []),

  activeEnv:      'default',
  activeReqId:    null,
  req:            null,   // working copy of the selected request
  resp:           null,
  reqTab:         'params',
  respTab:        'body',
  loading:        false,
  expandedCols:   new Set(['demo']),
  expandedFolders:new Set(),
  showHist:       false,
  envSelId:       'default',
  abortCtrl:      null,
  autoSyncTimer:  null,
};

// ─── Persistence ──────────────────────────────────────────────────────────────
function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}

function persist() {
  save(SK.COLS, state.cols);
  save(SK.GIT,  state.git);
  save(SK.ENVS, state.envs);
  save(SK.HIST, state.hist.slice(-200));
}

function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// ─── Auto-save working request back to collection ─────────────────────────────
let _autoSaveTimer = null;

function scheduleAutoSave() {
  clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(() => {
    if (!state.req) return;
    const r = clone(state.req);
    state.cols = state.cols.map(c => ({
      ...c,
      requests: c.requests.map(x => x.id === r.id ? r : x),
      folders:  c.folders.map(f => ({ ...f, requests: f.requests.map(x => x.id === r.id ? r : x) })),
    }));
    persist();
    scheduleAutoGitPush();
  }, 500);
}

function scheduleAutoGitPush() {
  if (!state.git.auto) return;
  clearTimeout(state.autoSyncTimer);
  state.autoSyncTimer = setTimeout(gitPush, 2000);
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

// ─── Demo collection (first-run seed data) ────────────────────────────────────
function demoCollection() {
  return {
    id: 'demo',
    name: 'Demo Collection',
    folders: [],
    requests: [
      {
        id: uid(),
        name: 'JSONPlaceholder Todo',
        method: 'GET',
        url: 'https://jsonplaceholder.typicode.com/todos/1',
        headers: [{ id: uid(), key: 'Accept', value: 'application/json', enabled: true }],
        params: [],
        body: { type: 'none', raw: '', formData: [] },
        auth: { type: 'none', token: '', username: '', password: '', apiKey: '', apiValue: '' },
      },
      {
        id: uid(),
        name: 'Create Post',
        method: 'POST',
        url: 'https://jsonplaceholder.typicode.com/posts',
        headers: [{ id: uid(), key: 'Content-Type', value: 'application/json', enabled: true }],
        params: [],
        body: { type: 'raw', raw: '{\n  "title": "Hello World",\n  "body": "Test post.",\n  "userId": 1\n}', formData: [] },
        auth: { type: 'none', token: '', username: '', password: '', apiKey: '', apiValue: '' },
      },
    ],
  };
}
