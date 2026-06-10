// ─── Tab management ───────────────────────────────────────────────────────────

function activeTab() {
  return state.tabs.find(t => t.id === state.activeTabId) || null;
}

function openTab(reqId) {
  const existing = state.tabs.find(t => t.reqId === reqId);
  if (existing) {
    state.activeTabId = existing.id;
    renderSidebar();
    showReqEditor();
    return;
  }

  const r = findReq(reqId);
  if (!r) return;

  const tab = {
    id:        uid(),
    reqId,
    req:       clone(r),
    resp:      null,
    reqTab:    state.reqTabByReqId.get(reqId) || 'params',
    respTab:   'body',
    loading:   false,
    abortCtrl: null,
  };

  state.tabs.push(tab);
  state.activeTabId = tab.id;
  renderSidebar();
  showReqEditor();
}

function closeTab(tabId, event) {
  event?.stopPropagation();

  const idx = state.tabs.findIndex(t => t.id === tabId);
  if (idx === -1) return;

  syncTabIntoCols(state.tabs[idx]);
  state.tabs.splice(idx, 1);

  if (state.activeTabId === tabId) {
    const next = state.tabs[idx] || state.tabs[idx - 1] || null;
    state.activeTabId = next ? next.id : null;
  }

  renderSidebar();
  if (activeTab()) showReqEditor();
  else showEmptyState();
}

function switchTab(tabId) {
  if (state.activeTabId === tabId) return;
  state.activeTabId = tabId;
  renderSidebar();
  showReqEditor();
}

function renderTabStrip() {
  const el = document.getElementById('tab-strip');
  if (!el) return;

  if (!state.tabs.length) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }

  el.style.display = 'flex';
  el.innerHTML = state.tabs.map(t => {
    const active = t.id === state.activeTabId;
    const color  = MC[t.req.method] || '#c9d1d9';
    return `
      <div class="req-tab ${active ? 'active' : ''}" onclick="switchTab('${t.id}')">
        <span class="req-tab-method" style="color:${color}">${esc(t.req.method)}</span>
        <span class="req-tab-name">${esc(t.req.name)}</span>
        <button class="req-tab-close" onclick="closeTab('${t.id}', event)">×</button>
      </div>`;
  }).join('');
}
