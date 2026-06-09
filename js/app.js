// ─── App Init ─────────────────────────────────────────────────────────────────

function init() {
  renderEnvSelect();
  renderSidebar();
  setupResizer();

  // Close context menu on any click outside it
  document.addEventListener('click', hideCtxMenu);
}

// ─── Sidebar Drag-to-Resize ───────────────────────────────────────────────────

function setupResizer() {
  const resizer = document.getElementById('resizer');
  const sidebar = document.getElementById('sidebar');
  let dragging  = false;
  let startX, startW;

  resizer.addEventListener('mousedown', e => {
    dragging = true;
    startX   = e.clientX;
    startW   = sidebar.offsetWidth;
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const w = Math.max(180, Math.min(420, startW + e.clientX - startX));
    sidebar.style.width = w + 'px';
  });

  document.addEventListener('mouseup', () => {
    dragging = false;
    document.body.style.userSelect = '';
  });
}

// ─── History Panel ────────────────────────────────────────────────────────────

function toggleHistPanel() {
  state.showHist = !state.showHist;
  document.getElementById('hist-toggle').textContent = state.showHist ? '◀ Back to Request' : '⏱ History';

  if (state.showHist) {
    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('req-editor').style.display  = 'none';
    document.getElementById('hist-panel').style.display  = 'flex';
    renderHistPanel();
  } else {
    document.getElementById('hist-panel').style.display = 'none';
    if (state.req) showReqEditor();
    else document.getElementById('empty-state').style.display = 'flex';
  }
}

function renderHistPanel() {
  const list = document.getElementById('hist-list');

  if (!state.hist.length) {
    list.innerHTML = `<p class="muted" style="padding:12px;font-size:12px">No requests yet.</p>`;
    return;
  }

  list.innerHTML = [...state.hist].reverse().map((h, i) => {
    const color = !h.status       ? '#8b949e'
                : h.status < 300  ? '#3fb950'
                : h.status < 400  ? '#fca130'
                :                   '#f85149';

    const badge = h.status
      ? `<span class="status-badge" style="background:${color}22;color:${color}">${h.status}</span>`
      : '';

    // reversed index → original index for replay
    const origIdx = state.hist.length - 1 - i;

    return `
      <div class="hist-item" onclick="replayHistory(${origIdx})">
        <div class="hist-top">
          <span style="color:${MC[h.method] || '#c9d1d9'};font-weight:700">${h.method}</span>
          ${badge}
          <span style="margin-left:auto;color:#8b949e">${h.elapsed}ms</span>
        </div>
        <div class="hist-url">${esc(h.url)}</div>
      </div>`;
  }).join('');
}

function replayHistory(i) {
  const h = state.hist[i];
  if (!h) return;

  // Populate a minimal request from history entry
  state.req = {
    id:      uid(),
    name:    h.url,
    method:  h.method,
    url:     h.url,
    headers: [],
    params:  [],
    body:    { type: 'none', raw: '', formData: [] },
    auth:    { type: 'none', token: '', username: '', password: '', apiKey: '', apiValue: '' },
  };
  state.activeReqId = null;
  state.resp        = null;
  state.showHist    = false;

  document.getElementById('hist-panel').style.display  = 'none';
  document.getElementById('hist-toggle').textContent   = '⏱ History';
  showReqEditor();
}

function clearHistory() {
  state.hist = [];
  persist();
  renderHistPanel();
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
init();
