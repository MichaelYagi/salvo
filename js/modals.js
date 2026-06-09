// ─── Git Modal ────────────────────────────────────────────────────────────────

function openGitModal() {
  const g = state.git;
  document.getElementById('git-token').value  = g.token  || '';
  document.getElementById('git-owner').value  = g.owner  || '';
  document.getElementById('git-repo').value   = g.repo   || '';
  document.getElementById('git-branch').value = g.branch || 'main';
  document.getElementById('git-path').value   = g.path   || 'salvo.json';
  document.getElementById('git-auto').checked = !!g.auto;
  document.getElementById('git-modal').style.display = 'flex';
}

function saveGitCfg() {
  state.git = {
    token:  document.getElementById('git-token').value.trim(),
    owner:  document.getElementById('git-owner').value.trim(),
    repo:   document.getElementById('git-repo').value.trim(),
    branch: document.getElementById('git-branch').value.trim() || 'main',
    path:   document.getElementById('git-path').value.trim()   || 'salvo.json',
    auto:   document.getElementById('git-auto').checked,
  };
  persist();
  document.getElementById('git-modal').style.display = 'none';
  notify('Git settings saved', 'success');
}

// ─── Git Push / Pull (GitHub Contents API) ───────────────────────────────────

async function gitPush() {
  const g = state.git;
  if (!g.owner || !g.repo || !g.token) { notify('Configure Git settings first', 'error'); return; }

  setGitStatus('Pushing…');

  try {
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(state.cols, null, 2))));
    const apiUrl  = `https://api.github.com/repos/${g.owner}/${g.repo}/contents/${g.path}`;
    const headers = { Authorization: `token ${g.token}`, 'Content-Type': 'application/json' };

    // Fetch existing SHA (needed to update an existing file)
    let sha;
    try { const r = await fetch(apiUrl, { headers }); if (r.ok) sha = (await r.json()).sha; } catch {}

    const payload = { message: `salvo: sync ${new Date().toISOString()}`, content, branch: g.branch };
    if (sha) payload.sha = sha;

    const res = await fetch(apiUrl, { method: 'PUT', headers, body: JSON.stringify(payload) });
    if (!res.ok) { const err = await res.json(); throw new Error(err.message || res.status); }

    setGitStatus('Pushed ' + new Date().toLocaleTimeString());
    notify('Synced to GitHub ✓', 'success');

  } catch (err) {
    setGitStatus('Push failed');
    notify('Push failed: ' + err.message, 'error');
  }
}

async function gitPull() {
  const g = state.git;
  if (!g.owner || !g.repo || !g.token) { notify('Configure Git settings first', 'error'); return; }

  setGitStatus('Pulling…');

  try {
    const apiUrl = `https://api.github.com/repos/${g.owner}/${g.repo}/contents/${g.path}?ref=${g.branch}`;
    const res    = await fetch(apiUrl, { headers: { Authorization: `token ${g.token}` } });
    if (!res.ok) { const err = await res.json(); throw new Error(err.message || res.status); }

    const data     = await res.json();
    const decoded  = decodeURIComponent(escape(atob(data.content)));
    state.cols     = JSON.parse(decoded);

    persist();
    renderSidebar();
    setGitStatus('Pulled ' + new Date().toLocaleTimeString());
    notify('Pulled from GitHub ✓', 'success');

  } catch (err) {
    setGitStatus('Pull failed');
    notify('Pull failed: ' + err.message, 'error');
  }
}

function setGitStatus(text) {
  document.getElementById('git-status').textContent = text;
}

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
    `<button onclick="addEnv()" style="color:#00d9c8;font-size:11px;margin-top:8px;width:100%;padding:5px 0">
       + New Environment
     </button>`;
}

function renderEnvDetail() {
  const detailEl = document.getElementById('env-detail-panel');
  const env = state.envs.find(e => e.id === state.envSelId);
  if (!env) { detailEl.innerHTML = ''; return; }

  let html = `<input value="${esc(env.name)}" oninput="envRename(this.value)"
                     style="width:100%;margin-bottom:12px;font-size:13px">`;

  Object.entries(env.vars).forEach(([k, v]) => {
    html += `
      <div class="env-kv-grid">
        <input value="${esc(k)}" readonly style="opacity:.7">
        <input value="${esc(v)}" oninput="envSetVar('${esc(k)}',this.value)">
        <button onclick="envDelVar('${esc(k)}')"
                style="color:#f85149;background:none;border:none;cursor:pointer;font-size:15px">×</button>
      </div>`;
  });

  html += `
    <div class="env-kv-grid" style="margin-top:10px">
      <input id="env-new-k" placeholder="Variable" style="font-family:monospace;font-size:11px">
      <input id="env-new-v" placeholder="Value"    style="font-family:monospace;font-size:11px"
             onkeydown="if(event.key==='Enter')envAddVar()">
      <button onclick="envAddVar()"
              style="color:#00d9c8;background:none;border:none;cursor:pointer;font-size:18px">+</button>
    </div>
    <div style="display:flex;gap:8px;margin-top:16px">
      <button class="btn-primary" onclick="envUse()">Use This Environment</button>
      ${env.id !== 'default' ? `<button onclick="envDelete()" style="color:#f85149">Delete</button>` : ''}
    </div>`;

  detailEl.innerHTML = html;
}

// ─── Environment actions ──────────────────────────────────────────────────────

function envSelect(id)      { state.envSelId = id; renderEnvModal(); }
function envRename(name)    { const e = getSelEnv(); if (e) { e.name = name; persist(); } }
function envSetVar(k, v)    { const e = getSelEnv(); if (e) { e.vars[k] = v; persist(); } }

function envDelVar(k) {
  const e = getSelEnv();
  if (!e) return;
  delete e.vars[k];
  persist();
  renderEnvModal();
}

function envAddVar() {
  const k = document.getElementById('env-new-k').value.trim();
  const v = document.getElementById('env-new-v').value;
  if (!k) return;
  const e = getSelEnv();
  if (e) { e.vars[k] = v; persist(); renderEnvModal(); }
}

function addEnv() {
  const e = { id: uid(), name: 'New Environment', vars: {} };
  state.envs.push(e);
  state.envSelId = e.id;
  persist();
  renderEnvModal();
}

function envUse() {
  state.activeEnv = state.envSelId;
  renderEnvSelect();
  closeEnvModal();
}

function envDelete() {
  if (!confirm('Delete this environment?')) return;
  state.envs     = state.envs.filter(e => e.id !== state.envSelId);
  state.envSelId = 'default';
  persist();
  renderEnvModal();
}

function getSelEnv() {
  return state.envs.find(e => e.id === state.envSelId) ?? null;
}
