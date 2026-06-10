// ─── Show / sync the request editor pane ─────────────────────────────────────

function showReqEditor() {
  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('hist-panel').style.display  = 'none';
  document.getElementById('req-editor').style.display  = 'flex';
  state.showHist = false;
  document.getElementById('hist-toggle').textContent   = '⏱ History';
  renderTabStrip();
  syncReqEditor();
}

function showEmptyState() {
  document.getElementById('req-editor').style.display  = 'none';
  document.getElementById('hist-panel').style.display  = 'none';
  document.getElementById('empty-state').style.display = 'flex';
  renderTabStrip();
}

function syncReqEditor() {
  const tab = activeTab();
  if (!tab) return;
  const r  = tab.req;
  const ms = document.getElementById('method-select');
  ms.value       = r.method;
  ms.style.color = MC[r.method] || 'var(--text)';
  document.getElementById('url-input').value      = r.url;
  document.getElementById('req-name-input').value = r.name;
  updateTabBadges();
  renderReqPanel();
  renderRespPanel();
}

// ─── Method / name change handlers (called from inline HTML events) ───────────

function onMethodChange() {
  const tab = activeTab();
  const v = document.getElementById('method-select').value;
  document.getElementById('method-select').style.color = MC[v] || 'var(--text)';
  tab.req.method = v;
  scheduleAutoSave();
  renderTabStrip();
  if (tab.reqTab === 'curl') renderReqPanel();
}

function onReqNameChange(v) {
  activeTab().req.name = v;
  scheduleAutoSave();
  renderTabStrip();
}

// ─── Tab switching ────────────────────────────────────────────────────────────

function updateTabBadges() {
  const tab = activeTab();
  if (!tab) return;
  const pCount = tab.req.params.filter(p => p.enabled && p.key).length;
  const hCount = tab.req.headers.filter(h => h.enabled && h.key).length;

  document.querySelectorAll('#req-tabbar .tab').forEach(t => {
    const name = t.dataset.tab;
    t.classList.toggle('active', name === tab.reqTab);

    let label = name.charAt(0).toUpperCase() + name.slice(1);
    if (name === 'params'  && pCount > 0) label += `<span class="tab-badge">${pCount}</span>`;
    if (name === 'headers' && hCount > 0) label += `<span class="tab-badge">${hCount}</span>`;
    t.innerHTML = label;
  });
}

function switchReqTab(tabName) {
  const tab = activeTab();
  if (!tab) return;
  tab.reqTab = tabName;
  updateTabBadges();
  renderReqPanel();
  scheduleDiskSave();
}

// ─── Request panel dispatcher ─────────────────────────────────────────────────

function renderReqPanel() {
  const el  = document.getElementById('req-panel');
  const tab = activeTab();
  if (!tab) return;

  switch (tab.reqTab) {
    case 'params':  el.innerHTML = kvEditorHTML(tab.req.params,  'params');  break;
    case 'headers': el.innerHTML = kvEditorHTML(tab.req.headers, 'headers'); break;
    case 'auth':    el.innerHTML = authHTML(tab.req.auth);                   break;
    case 'body':    el.innerHTML = bodyHTML(tab.req.body);                   break;
    case 'curl':    el.innerHTML = curlPanelHTML();                          break;
  }
}

// ─── Header name/value autocomplete ───────────────────────────────────────────
// Common header names, suggested for the "name" field of header rows.
const HEADER_NAME_SUGGESTIONS = [
  'Accept', 'Accept-Charset', 'Accept-Encoding', 'Accept-Language', 'Accept-Ranges',
  'Authorization', 'Cache-Control', 'Connection', 'Content-Disposition',
  'Content-Encoding', 'Content-Length', 'Content-Type', 'Cookie', 'DNT', 'Host',
  'If-Modified-Since', 'If-None-Match', 'Origin', 'Pragma', 'Referer', 'TE',
  'Transfer-Encoding', 'Upgrade-Insecure-Requests', 'User-Agent',
  'X-API-Key', 'X-Auth-Token', 'X-Correlation-ID', 'X-CSRF-Token',
  'X-Forwarded-For', 'X-Request-ID', 'X-Requested-With',
];

// Common values for headers whose value is a known set of tokens (MIME types,
// encodings, cache directives, ...). Keyed by lowercased header name.
const HEADER_VALUE_SUGGESTIONS = (() => {
  const mimeTypes = [
    'application/json',
    'application/xml',
    'application/x-www-form-urlencoded',
    'application/javascript',
    'application/octet-stream',
    'application/pdf',
    'application/zip',
    'application/graphql',
    'application/ld+json',
    'application/vnd.api+json',
    'application/xhtml+xml',
    'multipart/form-data',
    'multipart/mixed',
    'text/plain',
    'text/html',
    'text/css',
    'text/csv',
    'text/javascript',
    'text/xml',
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/svg+xml',
    'image/webp',
    'audio/mpeg',
    'video/mp4',
  ];

  return {
    'content-type':      mimeTypes,
    'accept':            ['*/*', ...mimeTypes],
    'accept-encoding':   ['gzip', 'deflate', 'br', 'compress', 'identity', '*'],
    'content-encoding':  ['gzip', 'deflate', 'br', 'compress', 'identity'],
    'transfer-encoding': ['chunked', 'gzip', 'deflate', 'identity'],
    'accept-charset':    ['utf-8', 'iso-8859-1', 'us-ascii', '*'],
    'accept-language':   ['en-US', 'en-GB', 'en', 'fr', 'de', 'es', 'it', 'pt-BR', 'pt', 'ru', 'zh-CN', 'zh-TW', 'ja', 'ko', 'nl', 'sv', 'pl', 'tr', 'ar', 'hi', '*'],
    'cache-control':     ['no-cache', 'no-store', 'no-transform', 'max-age=0', 'max-age=3600', 'max-age=86400', 'must-revalidate', 'proxy-revalidate', 'private', 'public', 'immutable', 'only-if-cached'],
    'connection':        ['keep-alive', 'close'],
    'content-disposition': ['inline', 'attachment', 'form-data'],
    'pragma':            ['no-cache'],
    'te':                ['trailers', 'compress', 'deflate', 'gzip'],
    'accept-ranges':     ['bytes', 'none'],
    'x-requested-with':  ['XMLHttpRequest'],
  };
})();

function getHeaderSuggestions(headerName) {
  return HEADER_VALUE_SUGGESTIONS[String(headerName ?? '').trim().toLowerCase()] || null;
}

// `field` is 'key' (header name) or 'value' (header value).
function showHeaderSuggest(i, field) {
  const row = activeTab().req.headers[i];
  const all = field === 'key' ? HEADER_NAME_SUGGESTIONS : getHeaderSuggestions(row.key);
  hideHeaderSuggest();
  if (!all) return;

  const q = (row[field] || '').toLowerCase();
  const matches = all.filter(v => v.toLowerCase().includes(q));
  if (!matches.length) return;

  const input = document.getElementById(`kv-${field}-headers-${i}`);
  const box   = document.getElementById('header-suggest');
  if (!input || !box) return;

  box.innerHTML = '';
  box.dataset.target = `${i}:${field}`;
  matches.forEach((m, idx) => {
    const el = document.createElement('div');
    el.className = 'hs-item' + (idx === 0 ? ' active' : '');
    el.textContent = m;
    // Hovering an item makes it the "active" one, so Tab fills whatever is highlighted.
    el.addEventListener('mouseenter', () => {
      box.querySelector('.hs-item.active')?.classList.remove('active');
      el.classList.add('active');
    });
    // mousedown (not click) fires before the input's blur, so we can accept
    // the suggestion without the dropdown disappearing first.
    el.addEventListener('mousedown', e => { e.preventDefault(); acceptHeaderSuggest(i, field, m); });
    box.appendChild(el);
  });

  const rect = input.getBoundingClientRect();
  box.style.display = '';
  box.style.left    = (rect.left + window.scrollX) + 'px';
  box.style.top     = (rect.bottom + window.scrollY) + 'px';
  box.style.width   = rect.width + 'px';
}

function hideHeaderSuggest() {
  const box = document.getElementById('header-suggest');
  if (box) box.style.display = 'none';
}

function acceptHeaderSuggest(i, field, value) {
  const tab = activeTab();
  tab.req.headers[i][field] = value;
  scheduleAutoSave();
  updateTabBadges();
  if (tab.reqTab === 'curl') renderReqPanel();

  const input = document.getElementById(`kv-${field}-headers-${i}`);
  if (input) {
    input.value = value;
    input.focus();
    input.setSelectionRange(value.length, value.length);
  }
  hideHeaderSuggest();

  // Picking a header name immediately surfaces value suggestions for it.
  if (field === 'key') {
    const valueInput = document.getElementById(`kv-value-headers-${i}`);
    if (valueInput) { valueInput.focus(); showHeaderSuggest(i, 'value'); }
  }
}

function kvHeaderKeydown(i, field, event) {
  const box = document.getElementById('header-suggest');
  if (!box || box.style.display === 'none' || box.dataset.target !== `${i}:${field}`) return;

  const items = [...box.querySelectorAll('.hs-item')];
  if (!items.length) return;

  if (event.key === 'Tab' || event.key === 'Enter') {
    event.preventDefault();
    const active = box.querySelector('.hs-item.active') || items[0];
    acceptHeaderSuggest(i, field, active.textContent);
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    let idx = items.findIndex(el => el.classList.contains('active'));
    items[idx]?.classList.remove('active');
    idx = event.key === 'ArrowDown' ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
    items[idx].classList.add('active');
    items[idx].scrollIntoView({ block: 'nearest' });
  } else if (event.key === 'Escape') {
    hideHeaderSuggest();
  }
}

function kvHeaderBlur() {
  // Delay so a click/mousedown on a suggestion can be handled first.
  setTimeout(hideHeaderSuggest, 150);
}

// ─── KV Editor (params / headers / form-data fields) ─────────────────────────

function kvEditorHTML(rows, key) {
  const hasNotes = key === 'params' || key === 'headers';
  let html = '';

  rows.forEach((row, i) => {
    const op = row.enabled ? 1 : .45;
    const suggestAttrs = field => key === 'headers'
      ? `id="kv-${field}-headers-${i}"
               onfocus="showHeaderSuggest(${i},'${field}')"
               onkeydown="kvHeaderKeydown(${i},'${field}',event)"
               onblur="kvHeaderBlur()"
               autocomplete="off"`
      : '';
    html += `
      <div class="${hasNotes ? 'kv-grid-notes' : 'kv-grid'}">
        <input type="checkbox" ${row.enabled ? 'checked' : ''} onchange="kvToggle('${key}',${i},this.checked)">
        <input value="${esc(row.key)}"
               ${suggestAttrs('key')}
               oninput="kvSet('${key}',${i},'key',this.value)${key === 'headers' ? `;showHeaderSuggest(${i},'key')` : ''}"
               placeholder="name"
               style="opacity:${op}">
        <input value="${esc(row.value)}"
               ${suggestAttrs('value')}
               oninput="kvSet('${key}',${i},'value',this.value)${key === 'headers' ? `;showHeaderSuggest(${i},'value')` : ''}"
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

  const addLabel = key === 'params' ? 'query param' : key === 'headers' ? 'header' : key === 'envVars' ? 'variable' : 'field';
  html += `<button class="kv-add" onclick="kvAdd('${key}')">+ Add ${addLabel}</button>`;
  return html;
}

function getKvTarget(key) {
  if (key === 'envVars') return getSelEnv()?.vars;
  const r = activeTab().req;
  if (key === 'params')   return r.params;
  if (key === 'headers')  return r.headers;
  if (key === 'formData') return r.body.formData;
}

function kvToggle(key, i, v) {
  getKvTarget(key)[i].enabled = v;
  if (key === 'envVars') return scheduleDiskSave();
  scheduleAutoSave(); updateTabBadges();
  if (activeTab().reqTab === 'curl') renderReqPanel();
}
function kvSet(key, i, field, v) {
  getKvTarget(key)[i][field] = v;
  if (key === 'envVars') return scheduleDiskSave();
  scheduleAutoSave(); updateTabBadges();
  if (activeTab().reqTab === 'curl') renderReqPanel();
}
function kvDel(key, i) {
  getKvTarget(key).splice(i, 1);
  if (key === 'envVars') { scheduleDiskSave(); renderEnvDetail(); return; }
  scheduleAutoSave(); updateTabBadges(); renderReqPanel();
}
function kvAdd(key) {
  getKvTarget(key).push({ id: uid(), key: '', value: '', enabled: true });
  if (key === 'envVars') { scheduleDiskSave(); renderEnvDetail(); return; }
  scheduleAutoSave(); renderReqPanel();
}

// ─── Auth Editor ──────────────────────────────────────────────────────────────

const AUTH_LABEL_STYLE = 'display:block;color:var(--text-muted);font-size:11px;margin-bottom:4px';

function authHTML(a) {
  let html = `
    <div class="auth-row">
      <select onchange="authTypeChange(this.value)">
        <option value="none"      ${a.type === 'none'      ? 'selected' : ''}>No Auth</option>
        <option value="bearer"    ${a.type === 'bearer'    ? 'selected' : ''}>Bearer Token</option>
        <option value="basic"     ${a.type === 'basic'     ? 'selected' : ''}>Basic Auth</option>
        <option value="apikey"    ${a.type === 'apikey'    ? 'selected' : ''}>API Key</option>
        <option value="oauth2_cc" ${a.type === 'oauth2_cc' ? 'selected' : ''}>OAuth 2.0 - Client Credentials</option>
        <option value="oauth2_pwd" ${a.type === 'oauth2_pwd' ? 'selected' : ''}>OAuth 2.0 - Password Grant</option>
        <option value="digest"    ${a.type === 'digest'    ? 'selected' : ''}>Digest Auth</option>
        <option value="jwt"       ${a.type === 'jwt'       ? 'selected' : ''}>JWT Bearer (HS256)</option>
      </select>
    </div>`;

  if (a.type === 'bearer') {
    html += `
      <label style="display:block;color:var(--text-muted);font-size:11px;margin-bottom:4px">Token</label>
      <input value="${esc(a.token)}" oninput="authSet('token',this.value)"
             placeholder="Bearer token…" style="width:100%;font-family:monospace">`;
  }

  if (a.type === 'basic') {
    html += `
      <div class="two-col">
        <div>
          <label style="display:block;color:var(--text-muted);font-size:11px;margin-bottom:4px">Username</label>
          <input value="${esc(a.username)}" oninput="authSet('username',this.value)" style="width:100%">
        </div>
        <div>
          <label style="display:block;color:var(--text-muted);font-size:11px;margin-bottom:4px">Password</label>
          <input type="password" value="${esc(a.password)}" oninput="authSet('password',this.value)" style="width:100%">
        </div>
      </div>`;
  }

  if (a.type === 'apikey') {
    html += `
      <div class="two-col">
        <div>
          <label style="display:block;color:var(--text-muted);font-size:11px;margin-bottom:4px">Header Name</label>
          <input value="${esc(a.apiKey)}" oninput="authSet('apiKey',this.value)"
                 placeholder="X-API-Key" style="width:100%;font-family:monospace">
        </div>
        <div>
          <label style="display:block;color:var(--text-muted);font-size:11px;margin-bottom:4px">Value</label>
          <input value="${esc(a.apiValue)}" oninput="authSet('apiValue',this.value)"
                 style="width:100%;font-family:monospace">
        </div>
      </div>`;
  }

  if (a.type === 'oauth2_cc' || a.type === 'oauth2_pwd') {
    html += `
      <label style="${AUTH_LABEL_STYLE}">Access Token URL</label>
      <input value="${esc(a.accessTokenUrl)}" oninput="authSet('accessTokenUrl',this.value)"
             placeholder="https://auth.example.com/oauth/token" style="width:100%;font-family:monospace;margin-bottom:8px">
      <div class="two-col">
        <div>
          <label style="${AUTH_LABEL_STYLE}">Client ID</label>
          <input value="${esc(a.clientId)}" oninput="authSet('clientId',this.value)" style="width:100%">
        </div>
        <div>
          <label style="${AUTH_LABEL_STYLE}">Client Secret</label>
          <input type="password" value="${esc(a.clientSecret)}" oninput="authSet('clientSecret',this.value)" style="width:100%">
        </div>
      </div>`;

    if (a.type === 'oauth2_pwd') {
      html += `
      <div class="two-col">
        <div>
          <label style="${AUTH_LABEL_STYLE}">Username</label>
          <input value="${esc(a.username)}" oninput="authSet('username',this.value)" style="width:100%">
        </div>
        <div>
          <label style="${AUTH_LABEL_STYLE}">Password</label>
          <input type="password" value="${esc(a.password)}" oninput="authSet('password',this.value)" style="width:100%">
        </div>
      </div>`;
    }

    html += `
      <label style="${AUTH_LABEL_STYLE}">Scope (optional)</label>
      <input value="${esc(a.scope)}" oninput="authSet('scope',this.value)" style="width:100%;font-family:monospace;margin-bottom:8px">
      <div style="display:flex;align-items:center;gap:10px;margin-top:8px">
        <button class="btn-primary" onclick="manualFetchOAuthToken()">Get Access Token</button>
        <span style="font-size:11px;color:var(--text-muted)">${
          a.cachedToken
            ? `Token cached, expires ${new Date(a.cachedExpiry).toLocaleTimeString()}`
            : 'No token yet — fetched automatically on Send'
        }</span>
      </div>`;
  }

  if (a.type === 'digest') {
    html += `
      <div class="two-col">
        <div>
          <label style="${AUTH_LABEL_STYLE}">Username</label>
          <input value="${esc(a.username)}" oninput="authSet('username',this.value)" style="width:100%">
        </div>
        <div>
          <label style="${AUTH_LABEL_STYLE}">Password</label>
          <input type="password" value="${esc(a.password)}" oninput="authSet('password',this.value)" style="width:100%">
        </div>
      </div>
      <p class="muted">Salvo automatically responds to the server's digest challenge.</p>`;
  }

  if (a.type === 'jwt') {
    html += `
      <label style="${AUTH_LABEL_STYLE}">Secret (HS256)</label>
      <input type="password" value="${esc(a.jwtSecret)}" oninput="authSet('jwtSecret',this.value)"
             style="width:100%;font-family:monospace;margin-bottom:8px">
      <label style="${AUTH_LABEL_STYLE}">Payload (JSON claims)</label>
      <textarea oninput="authSet('jwtPayload',this.value)"
                style="width:100%;min-height:100px;font-family:monospace;font-size:12px">${esc(a.jwtPayload)}</textarea>
      <p class="muted"><code>iat</code> and <code>exp</code> (1 hour) are added automatically if not present.</p>`;
  }

  if (a.type === 'none') {
    html += `<p class="muted">No authentication will be sent.</p>`;
  }

  return html;
}

function authTypeChange(v) { activeTab().req.auth.type = v; scheduleAutoSave(); renderReqPanel(); }
function authSet(field, v) { activeTab().req.auth[field] = v; scheduleAutoSave(); }

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

function bodyTypeChange(t) { activeTab().req.body.type = t; scheduleAutoSave(); renderReqPanel(); }
function bodySet(field, v) { activeTab().req.body[field] = v; scheduleAutoSave(); }
