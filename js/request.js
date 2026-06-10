// ─── Show / sync the request editor pane ─────────────────────────────────────

function showReqEditor() {
  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('hist-panel').style.display  = 'none';
  document.getElementById('req-editor').style.display  = 'flex';
  state.showHist = false;
  document.getElementById('hist-toggle').textContent   = '⏱ History';
  syncReqEditor();
}

function syncReqEditor() {
  const r  = state.req;
  const ms = document.getElementById('method-select');
  ms.value       = r.method;
  ms.style.color = MC[r.method] || '#c9d1d9';
  document.getElementById('url-input').value      = r.url;
  document.getElementById('req-name-input').value = r.name;
  updateTabBadges();
  renderReqPanel();
  renderRespPanel();
}

// ─── Method / name change handlers (called from inline HTML events) ───────────

function onMethodChange() {
  const v = document.getElementById('method-select').value;
  document.getElementById('method-select').style.color = MC[v] || '#c9d1d9';
  state.req.method = v;
  scheduleAutoSave();
  if (state.reqTab === 'curl') renderReqPanel();
}

function onReqNameChange(v) {
  state.req.name = v;
  scheduleAutoSave();
}

// ─── Tab switching ────────────────────────────────────────────────────────────

function updateTabBadges() {
  if (!state.req) return;
  const pCount = state.req.params.filter(p => p.enabled && p.key).length;
  const hCount = state.req.headers.filter(h => h.enabled && h.key).length;

  document.querySelectorAll('#req-tabbar .tab').forEach(tab => {
    const name = tab.dataset.tab;
    tab.classList.toggle('active', name === state.reqTab);

    let label = name.charAt(0).toUpperCase() + name.slice(1);
    if (name === 'params'  && pCount > 0) label += `<span class="tab-badge">${pCount}</span>`;
    if (name === 'headers' && hCount > 0) label += `<span class="tab-badge">${hCount}</span>`;
    tab.innerHTML = label;
  });
}

function switchReqTab(tab) {
  state.reqTab = tab;
  if (state.activeReqId) state.reqTabByReqId.set(state.activeReqId, tab);
  updateTabBadges();
  renderReqPanel();
}

// ─── Request panel dispatcher ─────────────────────────────────────────────────

function renderReqPanel() {
  const el = document.getElementById('req-panel');
  if (!state.req) return;

  switch (state.reqTab) {
    case 'params':  el.innerHTML = kvEditorHTML(state.req.params,  'params');  break;
    case 'headers': el.innerHTML = kvEditorHTML(state.req.headers, 'headers'); break;
    case 'auth':    el.innerHTML = authHTML(state.req.auth);                   break;
    case 'body':    el.innerHTML = bodyHTML(state.req.body);                   break;
    case 'curl':    el.innerHTML = curlPanelHTML();                            break;
  }
}

// ─── KV Editor (params / headers / form-data fields) ─────────────────────────

function kvEditorHTML(rows, key) {
  const hasNotes = key === 'params' || key === 'headers';
  let html = '';

  rows.forEach((row, i) => {
    const op = row.enabled ? 1 : .45;
    html += `
      <div class="${hasNotes ? 'kv-grid-notes' : 'kv-grid'}">
        <input type="checkbox" ${row.enabled ? 'checked' : ''} onchange="kvToggle('${key}',${i},this.checked)">
        <input value="${esc(row.key)}"
               oninput="kvSet('${key}',${i},'key',this.value)"
               placeholder="name"
               style="opacity:${op}">
        <input value="${esc(row.value)}"
               oninput="kvSet('${key}',${i},'value',this.value)"
               placeholder="value"
               style="opacity:${op}">
        ${hasNotes ? `<input value="${esc(row.note || '')}"
               oninput="kvSet('${key}',${i},'note',this.value)"
               placeholder="note"
               class="kv-note"
               style="opacity:${op}">` : ''}
        <button class="kv-del" onclick="kvDel('${key}',${i})">×</button>
      </div>`;
  });

  const addLabel = key === 'params' ? 'query param' : key === 'headers' ? 'header' : 'field';
  html += `<button class="kv-add" onclick="kvAdd('${key}')">+ Add ${addLabel}</button>`;
  return html;
}

function getKvTarget(key) {
  if (key === 'params')   return state.req.params;
  if (key === 'headers')  return state.req.headers;
  if (key === 'formData') return state.req.body.formData;
}

function kvToggle(key, i, v)        { getKvTarget(key)[i].enabled   = v; scheduleAutoSave(); updateTabBadges(); if (state.reqTab === 'curl') renderReqPanel(); }
function kvSet(key, i, field, v)    { getKvTarget(key)[i][field]     = v; scheduleAutoSave(); updateTabBadges(); if (state.reqTab === 'curl') renderReqPanel(); }
function kvDel(key, i)              { getKvTarget(key).splice(i, 1);     scheduleAutoSave(); updateTabBadges(); renderReqPanel(); }
function kvAdd(key)                 { getKvTarget(key).push({ id: uid(), key: '', value: '', enabled: true }); scheduleAutoSave(); renderReqPanel(); }

// ─── Auth Editor ──────────────────────────────────────────────────────────────

function authHTML(a) {
  let html = `
    <div class="auth-row">
      <select onchange="authTypeChange(this.value)">
        <option value="none"   ${a.type === 'none'   ? 'selected' : ''}>No Auth</option>
        <option value="bearer" ${a.type === 'bearer' ? 'selected' : ''}>Bearer Token</option>
        <option value="basic"  ${a.type === 'basic'  ? 'selected' : ''}>Basic Auth</option>
        <option value="apikey" ${a.type === 'apikey' ? 'selected' : ''}>API Key</option>
      </select>
    </div>`;

  if (a.type === 'bearer') {
    html += `
      <label style="display:block;color:#8b949e;font-size:11px;margin-bottom:4px">Token</label>
      <input value="${esc(a.token)}" oninput="authSet('token',this.value)"
             placeholder="Bearer token…" style="width:100%;font-family:monospace">`;
  }

  if (a.type === 'basic') {
    html += `
      <div class="two-col">
        <div>
          <label style="display:block;color:#8b949e;font-size:11px;margin-bottom:4px">Username</label>
          <input value="${esc(a.username)}" oninput="authSet('username',this.value)" style="width:100%">
        </div>
        <div>
          <label style="display:block;color:#8b949e;font-size:11px;margin-bottom:4px">Password</label>
          <input type="password" value="${esc(a.password)}" oninput="authSet('password',this.value)" style="width:100%">
        </div>
      </div>`;
  }

  if (a.type === 'apikey') {
    html += `
      <div class="two-col">
        <div>
          <label style="display:block;color:#8b949e;font-size:11px;margin-bottom:4px">Header Name</label>
          <input value="${esc(a.apiKey)}" oninput="authSet('apiKey',this.value)"
                 placeholder="X-API-Key" style="width:100%;font-family:monospace">
        </div>
        <div>
          <label style="display:block;color:#8b949e;font-size:11px;margin-bottom:4px">Value</label>
          <input value="${esc(a.apiValue)}" oninput="authSet('apiValue',this.value)"
                 style="width:100%;font-family:monospace">
        </div>
      </div>`;
  }

  if (a.type === 'none') {
    html += `<p class="muted">No authentication will be sent.</p>`;
  }

  return html;
}

function authTypeChange(v) { state.req.auth.type = v; scheduleAutoSave(); renderReqPanel(); }
function authSet(field, v) { state.req.auth[field] = v; scheduleAutoSave(); }

// ─── Body Editor ──────────────────────────────────────────────────────────────

function bodyHTML(b) {
  const types = ['none', 'raw', 'formdata', 'urlencoded'];
  const labels = { none: 'none', raw: 'raw', formdata: 'form-data', urlencoded: 'x-www-form-urlencoded' };

  let html = `<div class="body-types">`;

  types.forEach(t => {
    html += `
      <label class="${b.type === t ? 'active-type' : ''}">
        <input type="radio" name="btype" value="${t}" ${b.type === t ? 'checked' : ''}
               onchange="bodyTypeChange('${t}')">
        ${labels[t]}
      </label>`;
  });

  if (b.type === 'raw') {
    html += `
      <select style="margin-left:auto;width:auto;font-size:11px;padding:2px 6px"
              onchange="bodySet('contentType',this.value)">
        ${['json','xml','html','text'].map(t => `<option ${b.contentType === t ? 'selected' : ''}>${t}</option>`).join('')}
      </select>`;
  }

  html += `</div>`;

  if (b.type === 'none') {
    html += `<p class="muted">No body will be sent.</p>`;
  } else if (b.type === 'raw') {
    html += `<textarea id="body-raw-area" oninput="bodySet('raw',this.value)">${esc(b.raw)}</textarea>`;
  } else {
    html += kvEditorHTML(b.formData, 'formData');
  }

  return html;
}

function bodyTypeChange(t) { state.req.body.type = t; scheduleAutoSave(); renderReqPanel(); }
function bodySet(field, v) { state.req.body[field] = v; scheduleAutoSave(); }
