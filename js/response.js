// ─── Response Panel ───────────────────────────────────────────────────────────

function switchRespTab(tabName) {
  const tab = activeTab();
  if (!tab) return;
  tab.respTab = tabName;
  document.querySelectorAll('[data-rtab]').forEach(t =>
    t.classList.toggle('active', t.dataset.rtab === tabName)
  );
  renderRespPanel();
}

function renderRespPanel() {
  const wrap    = document.getElementById('resp-body-wrap');
  const badge   = document.getElementById('status-badge');
  const timeEl  = document.getElementById('resp-time');
  const sizeEl  = document.getElementById('resp-size');
  const copyBtn = document.getElementById('copy-resp-btn');
  const tab     = activeTab();
  const resp    = tab?.resp;

  updateTestsBadge(resp);

  // Nothing sent yet
  if (!resp) {
    wrap.innerHTML = `<span class="muted">Press Send to execute the request</span>`;
    return;
  }

  // Network / abort error
  if (resp.error) {
    badge.style.display   = 'none';
    timeEl.style.display  = 'none';
    sizeEl.style.display  = 'none';
    copyBtn.style.display = 'none';
    wrap.innerHTML = `
      <div style="color:var(--danger);background:var(--danger-bg);border:1px solid var(--danger-border);border-radius:4px;padding:10px 14px">
        ${esc(resp.error)}
        ${resp.elapsed ? `<span style="margin-left:8px;color:var(--text-muted)">(${resp.elapsed}ms)</span>` : ''}
      </div>`;
    return;
  }

  // Status badge
  const statusColor = resp.status < 300 ? '#3fb950' : resp.status < 400 ? '#fca130' : '#f85149';
  badge.style.display    = '';
  badge.style.background = statusColor + '22';
  badge.style.color      = statusColor;
  badge.className        = 'status-badge';
  badge.textContent      = `${resp.status} ${resp.statusText}`;

  // Timing & size
  timeEl.style.display = '';
  timeEl.textContent   = resp.elapsed + 'ms';

  if (resp.size != null) {
    sizeEl.style.display = '';
    sizeEl.textContent   = resp.size < 1024 ? resp.size + ' B' : (resp.size / 1024).toFixed(1) + ' KB';
  } else {
    sizeEl.style.display = 'none';
  }

  // Body tab
  if (tab.respTab === 'body') {
    copyBtn.style.display = '';

    if (resp.bodyType === 'image') {
      wrap.innerHTML = `<img src="${resp.body}" style="max-width:100%;border-radius:4px">`;
      return;
    }

    if (resp.bodyType === 'binary') {
      copyBtn.style.display = 'none';
      const ct = resp.headers['content-type'] || 'application/octet-stream';
      wrap.innerHTML = `<span class="muted">Binary response (${esc(ct)}) — preview not supported</span>`;
      return;
    }

    if (resp.bodyType === 'json') {
      try {
        wrap.innerHTML = '';
        wrap.appendChild(buildJsonTree(JSON.parse(resp.body), 0));
        return;
      } catch { /* fall through to plain text */ }
    }

    let notice = '';
    if ((resp.headers['content-type'] || '').includes('json') && resp.size > JSON_TREE_MAX_BYTES) {
      notice = `<div class="muted" style="margin-bottom:6px">Response is large (${(resp.size / 1024 / 1024).toFixed(1)} MB) — showing raw text instead of the JSON tree.</div>`;
    }

    wrap.innerHTML = `${notice}<pre>${esc(resp.body)}</pre>`;

  // Headers tab
  } else if (tab.respTab === 'headers') {
    copyBtn.style.display = 'none';
    wrap.innerHTML = Object.entries(resp.headers)
      .map(([k, v]) =>
        `<div style="margin-bottom:3px">
          <span style="color:var(--json-key)">${esc(k)}</span>
          <span style="color:var(--text-muted)">: </span>
          <span>${esc(v)}</span>
        </div>`
      ).join('');

  // Tests tab
  } else if (tab.respTab === 'tests') {
    copyBtn.style.display = 'none';
    const results = resp.testResults || [];
    if (!results.length) {
      wrap.innerHTML = `<span class="muted">No tests defined. Add a test script in the Scripts tab.</span>`;
    } else {
      wrap.innerHTML = results.map(r => `
        <div class="test-result ${r.passed ? 'pass' : 'fail'}">
          <span class="test-icon">${r.passed ? '✓' : '✗'}</span>
          <span class="test-name">${esc(r.name)}</span>
          ${r.error ? `<div class="test-error">${esc(r.error)}</div>` : ''}
        </div>`
      ).join('');
    }
  }
}

// Show a pass/fail summary badge on the "Tests" response tab.
function updateTestsBadge(resp) {
  const badge = document.getElementById('resp-tests-badge');
  if (!badge) return;
  const results = resp?.testResults;
  if (!results || !results.length) { badge.style.display = 'none'; return; }
  const failed = results.filter(r => !r.passed).length;
  badge.style.display    = '';
  badge.textContent      = failed ? `${failed}✗` : `${results.length}✓`;
  badge.style.background = failed ? 'var(--danger-bg)' : 'transparent';
  badge.style.color      = failed ? 'var(--danger)' : 'var(--success, #3fb950)';
}

function copyResponse() {
  const resp = activeTab()?.resp;
  if (resp?.body) {
    navigator.clipboard.writeText(resp.body).then(() => notify('Copied', 'success'));
  }
}

// ─── JSON Tree (DOM-built — no innerHTML, safe for any content) ───────────────

// Save a value extracted from the response into the active environment.
async function saveJsonValueAsVar(value) {
  const env = state.envs.find(e => e.id === state.activeEnv);
  if (!env) { notify('No active environment', 'error'); return; }

  const name = await promptDialog('Save as environment variable named:');
  if (!name) return;

  const strValue = typeof value === 'string' ? value : JSON.stringify(value);
  const existing = env.vars.find(v => v.key === name);
  if (existing) existing.value = strValue;
  else env.vars.push({ id: uid(), key: name, value: strValue, enabled: true });

  scheduleDiskSave();
  notify(`Saved {{${name}}}`, 'success');
}

function buildSaveVarBtn(value) {
  const btn = document.createElement('button');
  btn.className   = 'jt-savevar';
  btn.textContent = '→{{}}';
  btn.title       = 'Save as environment variable';
  btn.addEventListener('click', e => {
    e.stopPropagation();
    saveJsonValueAsVar(value);
  });
  return btn;
}

function buildJsonTree(data, depth) {
  const wrap = document.createElement('span');

  // Primitives
  if (data === null || typeof data === 'boolean' || typeof data === 'number' || typeof data === 'string') {
    wrap.className = 'jt-leaf';
    const valueEl = document.createElement('span');
    if (data === null)             { valueEl.className = 'jt-null'; valueEl.textContent = 'null';       }
    else if (typeof data === 'boolean') { valueEl.className = 'jt-bool'; valueEl.textContent = String(data); }
    else if (typeof data === 'number')  { valueEl.className = 'jt-num';  valueEl.textContent = data;         }
    else                            { valueEl.className = 'jt-str'; valueEl.textContent = `"${data}"`;  }
    wrap.appendChild(valueEl);
    wrap.appendChild(buildSaveVarBtn(data));
    return wrap;
  }

  // Arrays & objects
  const isArr   = Array.isArray(data);
  const keys    = isArr ? data.map((_, i) => i) : Object.keys(data);

  if (!keys.length) {
    wrap.textContent  = isArr ? '[]' : '{}';
    wrap.style.color  = 'var(--text-muted)';
    return wrap;
  }

  let open = depth < 2;

  const toggle   = document.createElement('span');
  toggle.className = 'jt-toggle';

  const openBracket = document.createElement('span');
  openBracket.style.color = 'var(--text-muted)';
  openBracket.textContent = isArr ? '[' : '{';

  const children = document.createElement('div');
  children.className = 'jt-children';

  const closeBracket = document.createElement('span');
  closeBracket.style.color = 'var(--text-muted)';
  closeBracket.textContent = isArr ? ']' : '}';

  function preview() {
    if (isArr) return `▸ [… ${keys.length}]`;
    const sample = Object.keys(data).slice(0, 3).join(', ');
    return `▸ {${sample}${Object.keys(data).length > 3 ? '…' : ''}}`;
  }

  function renderToggle() {
    toggle.textContent           = open ? '▾' : preview();
    openBracket.style.display    = open ? ''  : 'none';
    children.style.display       = open ? ''  : 'none';
    closeBracket.style.display   = open ? ''  : 'none';
  }

  keys.forEach((k, i) => {
    const row = document.createElement('div');
    row.className = 'jt-row';

    if (!isArr) {
      const keyEl   = document.createElement('span');
      keyEl.className   = 'jt-key';
      keyEl.textContent = `"${k}"`;
      row.appendChild(keyEl);

      const colon       = document.createElement('span');
      colon.style.color = 'var(--text-muted)';
      colon.textContent = ': ';
      row.appendChild(colon);
    }

    row.appendChild(buildJsonTree(data[k], depth + 1));

    if (i < keys.length - 1) {
      const comma       = document.createElement('span');
      comma.style.color = 'var(--text-muted)';
      comma.textContent = ',';
      row.appendChild(comma);
    }

    children.appendChild(row);
  });

  toggle.addEventListener('click', () => { open = !open; renderToggle(); });
  renderToggle();

  wrap.appendChild(toggle);
  wrap.appendChild(openBracket);
  wrap.appendChild(children);
  wrap.appendChild(closeBracket);
  return wrap;
}
