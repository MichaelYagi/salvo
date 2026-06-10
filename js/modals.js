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
    `<button onclick="addEnv()" style="color:#58a6ff;font-size:11px;margin-top:8px;width:100%;padding:5px 0">
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
      ${env.id !== 'default' ? `<button onclick="envDelete()" style="color:#f85149">Delete</button>` : ''}
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
