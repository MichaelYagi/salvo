// ─── Click Selection ─────────────────────────────────────────────────────────

function reqClick(event, reqId) {
  if (event.ctrlKey || event.metaKey) {
    if (state.selectedReqIds.has(reqId)) state.selectedReqIds.delete(reqId);
    else state.selectedReqIds.add(reqId);
    state.lastSelReqId = reqId;
    renderSidebar();
  } else if (event.shiftKey && state.lastSelReqId) {
    if (state.selectedReqIds.has(reqId)) {
      // Shift-clicking an already-selected item removes it
      state.selectedReqIds.delete(reqId);
    } else {
      const order = sidebarReqOrder();
      const a = order.indexOf(state.lastSelReqId);
      const b = order.indexOf(reqId);
      if (a !== -1 && b !== -1) {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        state.selectedReqIds = new Set(order.slice(lo, hi + 1));
      }
    }
    state.lastSelReqId = reqId;
    renderSidebar();
  } else {
    state.selectedReqIds = new Set();
    state.lastSelReqId   = reqId;
    selectReq(reqId);
  }
}

function sidebarReqOrder() {
  // Only include requests that are actually visible (expanded cols + folders)
  const ids = [];
  for (const col of state.cols) {
    if (!state.expandedCols.has(col.id)) continue;
    for (const f of col.folders) {
      if (!state.expandedFolders.has(f.id)) continue;
      for (const r of f.requests) ids.push(r.id);
    }
    for (const r of col.requests) ids.push(r.id);
  }
  return ids;
}

// Stored when "Move to..." opens so IDs survive the two-step menu chain
let _pendingMoveIds = null;

function showMovePicker(ids, x, y) {
  _pendingMoveIds = [...ids];
  const items = [];
  for (const col of state.cols) {
    const colId = col.id;
    items.push({ label: col.name,
      action: () => { moveReqs(_pendingMoveIds, 'col', colId); _pendingMoveIds = null; } });
    for (const folder of col.folders) {
      const fId = folder.id;
      items.push({ label: '  ↳ ' + folder.name,
        action: () => { moveReqs(_pendingMoveIds, 'folder', fId); _pendingMoveIds = null; } });
    }
  }
  showCtxMenu(x, y, items);
}

function showMovePickerForSelection(event) {
  event.stopPropagation();
  const rect = event.target.getBoundingClientRect();
  showMovePicker([...state.selectedReqIds], rect.left, rect.bottom + 4);
}

function clearSelection() {
  state.selectedReqIds = new Set();
  renderSidebar();
}

// ─── Sidebar Rendering ───────────────────────────────────────────────────────

function renderSidebar() {
  const list     = document.getElementById('col-list');
  const query    = document.getElementById('search-input').value.trim().toLowerCase();
  const clearBtn = document.getElementById('search-clear');

  clearBtn.style.display = query ? '' : 'none';

  list.innerHTML = state.selectedReqIds.size ? selBannerHTML() : '';

  if (query) {
    renderSearchResults(list, query);
    return;
  }

  state.cols.forEach(col => list.insertAdjacentHTML('beforeend', colHTML(col)));
}

function selBannerHTML() {
  const n = state.selectedReqIds.size;
  return `
    <div class="sel-banner">
      <span>${n} selected</span>
      <button onclick="showMovePickerForSelection(event)">Move to…</button>
      <button class="sel-clear" onclick="clearSelection()">Clear</button>
      <button class="sel-danger" onclick="deleteReqs([...state.selectedReqIds])">Delete</button>
    </div>`;
}

function renderSearchResults(list, query) {
  const matches = state.cols
    .flatMap(c => [
      ...c.requests.map(r => ({ r, colName: c.name })),
      ...c.folders.flatMap(f => f.requests.map(r => ({ r, colName: `${c.name} / ${f.name}` }))),
    ])
    .filter(({ r }) =>
      r.name.toLowerCase().includes(query) ||
      r.url.toLowerCase().includes(query)
    );

  list.insertAdjacentHTML('beforeend',
    `<div style="padding:4px 12px;font-size:10px;color:#8b949e;letter-spacing:1px">RESULTS (${matches.length})</div>`);

  if (!matches.length) {
    list.insertAdjacentHTML('beforeend', '<div style="color:#484f58;padding:8px 12px;font-size:12px">No results</div>');
    return;
  }

  matches.forEach(({ r }) => list.insertAdjacentHTML('beforeend', reqRowHTML(r, 6)));
}

// ─── Collection HTML ──────────────────────────────────────────────────────────

function colHTML(col) {
  const open = state.expandedCols.has(col.id);

  let html = `
    <div style="position:relative">
      <div class="col-header" onclick="toggleCol('${col.id}')" oncontextmenu="colCtx(event,'${col.id}')">
        <span class="col-arrow ${open ? 'open' : ''}">&#9654;</span>
        <span class="col-name">${esc(col.name)}</span>
        <button class="col-add" onclick="event.stopPropagation();addReq('${col.id}')" title="New request">+</button>
      </div>`;

  if (open) {
    html += `<div class="col-body">`;
    col.folders.forEach(folder => { html += folderHTML(col.id, folder); });
    col.requests.forEach(r => { html += reqRowHTML(r, 6); });
    html += `</div>`;
  }

  html += `</div>`;
  return html;
}

function folderHTML(colId, folder) {
  const open = state.expandedFolders.has(folder.id);

  let html = `
    <div class="folder-header" onclick="toggleFolder('${folder.id}')">
      <span class="col-arrow ${open ? 'open' : ''}">&#9654;</span>
      <span style="font-size:13px">&#128193;</span>
      <span class="folder-name">${esc(folder.name)}</span>
      <button class="col-add" onclick="event.stopPropagation();addReq('${colId}','${folder.id}')">+</button>
    </div>`;

  if (open) {
    folder.requests.forEach(r => { html += reqRowHTML(r, 22); });
  }

  return html;
}

function reqRowHTML(r, indent) {
  const active   = state.activeReqId === r.id;
  const selected = state.selectedReqIds.has(r.id);
  const color    = MC[r.method] || '#c9d1d9';

  return `
    <div class="req-row ${active ? 'active' : ''} ${selected ? 'selected' : ''}" style="padding-left:${indent + 8}px;position:relative"
        onclick="reqClick(event,'${r.id}')" oncontextmenu="reqCtx(event,'${r.id}')">
      <span class="req-check">${selected ? '&#10003;' : ''}</span>
      <span class="req-method" style="color:${color}">${r.method}</span>
      <span class="req-name ${active ? 'active' : ''}">${esc(r.name)}</span>
      <button class="req-menu-btn" onclick="event.stopPropagation();reqCtx(event,'${r.id}')">&#8942;</button>
    </div>`;
}

// ─── Toggle expand / collapse ─────────────────────────────────────────────────

function toggleCol(id) {
  if (state.expandedCols.has(id)) state.expandedCols.delete(id);
  else state.expandedCols.add(id);
  renderSidebar();
}

function toggleFolder(id) {
  if (state.expandedFolders.has(id)) state.expandedFolders.delete(id);
  else state.expandedFolders.add(id);
  renderSidebar();
}

// ─── Context Menus ────────────────────────────────────────────────────────────

function colCtx(event, colId) {
  event.preventDefault();
  event.stopPropagation();
  showCtxMenu(event.clientX, event.clientY, [
    { label: 'New Request',       action: () => addReq(colId) },
    { label: 'New Folder',        action: () => addFolder(colId) },
    'sep',
    { label: 'Rename',            action: () => renameCol(colId) },
    { label: 'Export JSON',       action: () => exportCol(colId) },
    { label: 'Export as Postman', action: () => exportColAsPostman(colId) },
    'sep',
    { label: 'Delete Collection', action: () => deleteCol(colId), danger: true },
  ]);
}

function reqCtx(event, reqId) {
  event.preventDefault();
  event.stopPropagation();

  if (!state.selectedReqIds.has(reqId)) {
    state.selectedReqIds = new Set();
    state.lastSelReqId   = reqId;
    renderSidebar();
  }

  const multi = state.selectedReqIds.size > 1;
  const ids   = multi ? [...state.selectedReqIds] : [reqId];

  showCtxMenu(event.clientX, event.clientY, [
    ...(!multi ? [
      { label: 'Rename',    action: () => renameReq(reqId) },
      { label: 'Duplicate', action: () => dupReq(reqId) },
      'sep',
    ] : []),
    { label: multi ? `Move ${ids.length} requests to…` : 'Move to…',
      action: () => showMovePicker(ids, event.clientX, event.clientY) },
    'sep',
    { label: multi ? `Delete ${ids.length} requests` : 'Delete',
      action: () => deleteReqs(ids), danger: true },
  ]);
}

function showCtxMenu(x, y, items) {
  const menu = document.getElementById('ctx-menu');
  menu.innerHTML = '';

  items.forEach(item => {
    if (item === 'sep') {
      const sep = document.createElement('div');
      sep.className = 'ctx-sep';
      menu.appendChild(sep);
      return;
    }
    const el = document.createElement('div');
    el.className = 'ctx-item' + (item.danger ? ' danger' : '');
    el.textContent = item.label;
    el.addEventListener('click', e => { e.stopPropagation(); hideCtxMenu(); item.action(); });
    menu.appendChild(el);
  });

  // Position — keep within viewport
  menu.style.display = '';
  menu.style.left = '0';
  menu.style.top  = '0';
  const w = menu.offsetWidth, h = menu.offsetHeight;
  menu.style.left = (x + w > window.innerWidth  ? window.innerWidth  - w - 4 : x) + 'px';
  menu.style.top  = (y + h > window.innerHeight ? window.innerHeight - h - 4 : y) + 'px';
}

function hideCtxMenu() {
  document.getElementById('ctx-menu').style.display = 'none';
}
