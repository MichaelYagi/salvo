// ─── Sidebar Rendering ───────────────────────────────────────────────────────

function renderSidebar() {
  const list  = document.getElementById('col-list');
  const query = document.getElementById('search-input').value.trim().toLowerCase();
  const clearBtn = document.getElementById('search-clear');

  clearBtn.style.display = query ? '' : 'none';

  if (query) {
    renderSearchResults(list, query);
    return;
  }

  list.innerHTML = '';
  state.cols.forEach(col => list.insertAdjacentHTML('beforeend', colHTML(col)));
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

  list.innerHTML = `<div style="padding:4px 12px;font-size:10px;color:#8b949e;letter-spacing:1px">RESULTS (${matches.length})</div>`;

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
        <span class="col-arrow ${open ? 'open' : ''}">▶</span>
        <span class="col-name">${esc(col.name)}</span>
        <button class="col-add" onclick="event.stopPropagation();addReq('${col.id}')" title="New request">+</button>
      </div>`;

  if (open) {
    html += `<div class="col-body">`;

    col.folders.forEach(folder => {
      html += folderHTML(col.id, folder);
    });

    col.requests.forEach(r => {
      html += reqRowHTML(r, 6);
    });

    html += `</div>`;
  }

  html += `</div>`;
  return html;
}

function folderHTML(colId, folder) {
  const open = state.expandedFolders.has(folder.id);

  let html = `
    <div class="folder-header" onclick="toggleFolder('${folder.id}')">
      <span class="col-arrow ${open ? 'open' : ''}">▶</span>
      <span style="font-size:13px">📁</span>
      <span class="folder-name">${esc(folder.name)}</span>
      <button class="col-add" onclick="event.stopPropagation();addReq('${colId}','${folder.id}')">+</button>
    </div>`;

  if (open) {
    folder.requests.forEach(r => { html += reqRowHTML(r, 22); });
  }

  return html;
}

function reqRowHTML(r, indent) {
  const active = state.activeReqId === r.id;
  const color  = MC[r.method] || '#c9d1d9';

  return `
    <div class="req-row ${active ? 'active' : ''}" style="padding-left:${indent + 8}px;position:relative"
        onclick="selectReq('${r.id}')" oncontextmenu="reqCtx(event,'${r.id}')">
      <span class="req-method" style="color:${color}">${r.method}</span>
      <span class="req-name ${active ? 'active' : ''}">${esc(r.name)}</span>
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
    'sep',
    { label: 'Delete Collection', action: () => deleteCol(colId), danger: true },
  ]);
}

function reqCtx(event, reqId) {
  event.preventDefault();
  event.stopPropagation();
  showCtxMenu(event.clientX, event.clientY, [
    { label: 'Duplicate', action: () => dupReq(reqId) },
    'sep',
    { label: 'Delete',    action: () => deleteReq(reqId), danger: true },
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
    el.addEventListener('click', () => { hideCtxMenu(); item.action(); });
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
