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
      <div style="color:#f85149;background:#2d0f0f;border:1px solid #5a1a1a;border-radius:4px;padding:10px 14px">
        ${esc(resp.error)}
        ${resp.elapsed ? `<span style="margin-left:8px;color:#8b949e">(${resp.elapsed}ms)</span>` : ''}
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
  } else {
    copyBtn.style.display = 'none';
    wrap.innerHTML = Object.entries(resp.headers)
      .map(([k, v]) =>
        `<div style="margin-bottom:3px">
          <span style="color:#79c0ff">${esc(k)}</span>
          <span style="color:#8b949e">: </span>
          <span>${esc(v)}</span>
        </div>`
      ).join('');
  }
}

function copyResponse() {
  const resp = activeTab()?.resp;
  if (resp?.body) {
    navigator.clipboard.writeText(resp.body).then(() => notify('Copied', 'success'));
  }
}

// ─── JSON Tree (DOM-built — no innerHTML, safe for any content) ───────────────

function buildJsonTree(data, depth) {
  const wrap = document.createElement('span');

  // Primitives
  if (data === null)             { wrap.className = 'jt-null'; wrap.textContent = 'null';        return wrap; }
  if (typeof data === 'boolean') { wrap.className = 'jt-bool'; wrap.textContent = String(data);  return wrap; }
  if (typeof data === 'number')  { wrap.className = 'jt-num';  wrap.textContent = data;          return wrap; }
  if (typeof data === 'string')  { wrap.className = 'jt-str';  wrap.textContent = `"${data}"`;   return wrap; }

  // Arrays & objects
  const isArr   = Array.isArray(data);
  const keys    = isArr ? data.map((_, i) => i) : Object.keys(data);

  if (!keys.length) {
    wrap.textContent  = isArr ? '[]' : '{}';
    wrap.style.color  = '#8b949e';
    return wrap;
  }

  let open = depth < 2;

  const toggle   = document.createElement('span');
  toggle.className = 'jt-toggle';

  const openBracket = document.createElement('span');
  openBracket.style.color = '#8b949e';
  openBracket.textContent = isArr ? '[' : '{';

  const children = document.createElement('div');
  children.className = 'jt-children';

  const closeBracket = document.createElement('span');
  closeBracket.style.color = '#8b949e';
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
      colon.style.color = '#8b949e';
      colon.textContent = ': ';
      row.appendChild(colon);
    }

    row.appendChild(buildJsonTree(data[k], depth + 1));

    if (i < keys.length - 1) {
      const comma       = document.createElement('span');
      comma.style.color = '#8b949e';
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
