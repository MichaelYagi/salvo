// ─── Environment Modal ────────────────────────────────────────────────────────

function openEnvModal() {
  state.envSelId = state.activeEnv;
  renderEnvModal();
  document.getElementById('env-modal').style.display = 'flex';
}

function closeEnvModal() {
  document.getElementById('env-modal').style.display = 'none';
  renderEnvSelect();
}

function renderEnvSelect() {
  const sel = document.getElementById('env-select');
  sel.innerHTML = state.envs.map(e =>
    `<option value="${e.id}" ${e.id === state.activeEnv ? 'selected' : ''}>${esc(e.name)}</option>`
  ).join('');
}

function renderEnvModal() {
  renderEnvList();
  renderEnvDetail();
}

function renderEnvList() {
  const listEl = document.getElementById('env-list-panel');
  listEl.innerHTML =
    state.envs.map(e => `
      <div class="env-item ${e.id === state.envSelId ? 'active' : ''}" onclick="envSelect('${e.id}')">
        ${esc(e.name)}
        ${e.id === state.activeEnv ? '<span class="env-dot">●</span>' : ''}
      </div>`
    ).join('') +
    `<button onclick="addEnv()" style="color:var(--accent);font-size:11px;margin-top:8px;width:100%;padding:5px 0">
       + New Environment
     </button>`;
}

function renderEnvDetail() {
  const detailEl = document.getElementById('env-detail-panel');
  const env = state.envs.find(e => e.id === state.envSelId);
  if (!env) { detailEl.innerHTML = ''; return; }

  let html = `<input value="${esc(env.name)}" oninput="envRename(this.value)"
                     style="width:100%;margin-bottom:12px;font-size:13px">`;

  html += kvEditorHTML(env.vars, 'envVars');

  html += `
    <div style="display:flex;gap:8px;margin-top:16px">
      <button class="btn-primary" onclick="envUse()">Use This Environment</button>
      ${env.id !== 'default' ? `<button onclick="envDelete()" style="color:var(--danger)">Delete</button>` : ''}
    </div>`;

  detailEl.innerHTML = html;
}

// ─── Environment actions ──────────────────────────────────────────────────────

// Switch the active environment directly from the topbar dropdown.
function envQuickSwitch(id) { state.activeEnv = id; scheduleDiskSave(); }

function envSelect(id)      { state.envSelId = id; renderEnvModal(); }
function envRename(name)    { const e = getSelEnv(); if (e) { e.name = name; scheduleDiskSave(); } }

function addEnv() {
  const e = { id: uid(), name: 'New Environment', vars: [] };
  state.envs.push(e);
  state.envSelId = e.id;
  renderEnvModal();
  scheduleDiskSave();
}

function envUse() {
  state.activeEnv = state.envSelId;
  renderEnvSelect();
  closeEnvModal();
  scheduleDiskSave();
}

function envDelete() {
  if (!confirm('Delete this environment?')) return;
  state.envs     = state.envs.filter(e => e.id !== state.envSelId);
  state.envSelId = 'default';
  renderEnvModal();
  scheduleDiskSave();
}

function getSelEnv() {
  return state.envs.find(e => e.id === state.envSelId) ?? null;
}

// ─── Cookie Jar Modal ─────────────────────────────────────────────────────────

let _cookieJar = [];

async function openCookiesModal() {
  document.getElementById('cookies-modal').style.display = 'flex';
  await renderCookiesModal();
}

function closeCookiesModal() {
  document.getElementById('cookies-modal').style.display = 'none';
}

async function renderCookiesModal() {
  const list = document.getElementById('cookies-list');
  list.innerHTML = `<p class="muted">Loading…</p>`;

  try {
    const res  = await fetch('/api/cookies');
    const data = await res.json();
    _cookieJar = data.cookies || [];
  } catch (e) {
    list.innerHTML = `<p class="muted">Failed to load cookies: ${esc(e.message)}</p>`;
    return;
  }

  if (!_cookieJar.length) {
    list.innerHTML = `<p class="muted">No cookies stored yet.</p>`;
    return;
  }

  list.innerHTML = _cookieJar.map((c, i) => `
    <div class="cookie-item">
      <div class="cookie-main">
        <span class="cookie-name">${esc(c.name)}</span>
        <span class="cookie-domain">${esc(c.domain)}${esc(c.path)}</span>
        <button class="cookie-del" onclick="deleteCookie(${i})" title="Delete cookie">✕</button>
      </div>
      <div class="cookie-value">${esc(c.value)}</div>
      <div class="cookie-expires">${c.expires ? 'Expires ' + new Date(c.expires).toLocaleString() : 'Session cookie'}</div>
    </div>`
  ).join('');
}

async function deleteCookie(i) {
  const c = _cookieJar[i];
  if (!c) return;
  await fetch('/api/cookies', {
    method:  'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ domain: c.domain, path: c.path, name: c.name }),
  });
  renderCookiesModal();
}

async function clearAllCookies() {
  if (!confirm('Delete all stored cookies?')) return;
  await fetch('/api/cookies', {
    method:  'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({}),
  });
  renderCookiesModal();
}
