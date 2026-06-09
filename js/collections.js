// ─── Request Selection ────────────────────────────────────────────────────────

function findReq(id) {
  for (const col of state.cols) {
    for (const r of col.requests)                        if (r.id === id) return r;
    for (const f of col.folders) for (const r of f.requests) if (r.id === id) return r;
  }
  return null;
}

function selectReq(id) {
  const r = findReq(id);
  if (!r) return;
  state.activeReqId = id;
  state.req         = clone(r);
  state.resp        = null;
  state.reqTab      = 'params';
  renderSidebar();
  showReqEditor();
}

// ─── Collection CRUD ──────────────────────────────────────────────────────────

function addCollection() {
  const col = { id: uid(), name: 'New Collection', folders: [], requests: [] };
  state.cols.push(col);
  state.expandedCols.add(col.id);
  persist();
  renderSidebar();
}

function renameCol(id) {
  const col = state.cols.find(c => c.id === id);
  if (!col) return;
  const name = prompt('Rename collection:', col.name);
  if (name !== null) { col.name = name; persist(); renderSidebar(); }
}

function deleteCol(id) {
  if (!confirm('Delete this collection?')) return;
  state.cols = state.cols.filter(c => c.id !== id);
  persist();
  renderSidebar();
}

function exportCol(id) {
  const col = state.cols.find(c => c.id === id);
  if (!col) return;
  const blob = new Blob([JSON.stringify(col, null, 2)], { type: 'application/json' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = col.name + '.json';
  a.click();
}

// ─── Folder CRUD ──────────────────────────────────────────────────────────────

function addFolder(colId) {
  const col = state.cols.find(c => c.id === colId);
  if (!col) return;
  col.folders.push({ id: uid(), name: 'New Folder', requests: [] });
  state.expandedCols.add(colId);
  persist();
  renderSidebar();
}

// ─── Request CRUD ─────────────────────────────────────────────────────────────

function newRequestTemplate() {
  return {
    id:      uid(),
    name:    'New Request',
    method:  'GET',
    url:     '',
    headers: [],
    params:  [],
    body:    { type: 'none', raw: '', formData: [] },
    auth:    { type: 'none', token: '', username: '', password: '', apiKey: '', apiValue: '' },
  };
}

function addReq(colId, folderId = null) {
  const r   = newRequestTemplate();
  const col = state.cols.find(c => c.id === colId);
  if (!col) return;

  if (folderId) {
    const folder = col.folders.find(f => f.id === folderId);
    if (folder) folder.requests.push(r);
  } else {
    col.requests.push(r);
  }

  persist();
  selectReq(r.id);
  renderSidebar();
}

function deleteReq(id) {
  state.cols = state.cols.map(c => ({
    ...c,
    requests: c.requests.filter(r => r.id !== id),
    folders:  c.folders.map(f => ({ ...f, requests: f.requests.filter(r => r.id !== id) })),
  }));

  if (state.activeReqId === id) {
    state.activeReqId = null;
    state.req         = null;
    state.resp        = null;
    document.getElementById('req-editor').style.display   = 'none';
    document.getElementById('empty-state').style.display  = 'flex';
  }

  persist();
  renderSidebar();
}

function dupReq(id) {
  const src = findReq(id);
  if (!src) return;

  const copy = { ...clone(src), id: uid(), name: src.name + ' (copy)' };
  const col  = state.cols.find(c => c.requests.some(r => r.id === id));
  if (!col) return;

  col.requests.push(copy);
  persist();
  selectReq(copy.id);
  renderSidebar();
}

// ─── Postman v2.x Import ──────────────────────────────────────────────────────

function importFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      const col  = parsePostman(data);
      state.cols.push(col);
      state.expandedCols.add(col.id);
      persist();
      renderSidebar();
      notify('Imported: ' + col.name, 'success');
    } catch (err) {
      notify('Import failed: ' + err.message, 'error');
    }
  };

  reader.readAsText(file);
  event.target.value = '';
}

function parsePostman(data) {
  if (!data?.item) throw new Error('Not a Postman v2.x collection');

  const folders  = [];
  const requests = [];

  function parseItem(item, targetReqs, targetFolders) {
    if (item.item) {
      // Folder
      const folder = { id: uid(), name: item.name || 'Folder', requests: [] };
      item.item.forEach(child => {
        if (child.item) parseItem(child, folder.requests, targetFolders);
        else folder.requests.push(parseReqItem(child));
      });
      targetFolders.push(folder);
    } else {
      targetReqs.push(parseReqItem(item));
    }
  }

  function parseReqItem(item) {
    const r       = item.request || {};
    const headers = (r.header || []).map(h => ({
      id: uid(), key: h.key || '', value: h.value || '', enabled: !h.disabled,
    }));

    const params = [];
    let url = '';

    if (typeof r.url === 'string') {
      url = r.url;
    } else if (r.url) {
      url = r.url.raw || '';
      (r.url.query || []).forEach(q =>
        params.push({ id: uid(), key: q.key || '', value: q.value || '', enabled: !q.disabled })
      );
    }

    let body = { type: 'none', raw: '', formData: [] };
    if (r.body) {
      if (r.body.mode === 'raw') {
        body = { type: 'raw', raw: r.body.raw || '', formData: [], contentType: r.body.options?.raw?.language || 'json' };
      } else if (r.body.mode === 'formdata') {
        body = { type: 'formdata', raw: '', formData: (r.body.formdata || []).map(f => ({ id: uid(), key: f.key, value: f.value, enabled: !f.disabled })) };
      } else if (r.body.mode === 'urlencoded') {
        body = { type: 'urlencoded', raw: '', formData: (r.body.urlencoded || []).map(f => ({ id: uid(), key: f.key, value: f.value, enabled: !f.disabled })) };
      }
    }

    const auth = { type: 'none', token: '', username: '', password: '', apiKey: '', apiValue: '' };
    if (r.auth?.type === 'bearer') {
      auth.type  = 'bearer';
      auth.token = r.auth.bearer?.find(b => b.key === 'token')?.value || '';
    } else if (r.auth?.type === 'basic') {
      auth.type     = 'basic';
      auth.username = r.auth.basic?.find(b => b.key === 'username')?.value || '';
      auth.password = r.auth.basic?.find(b => b.key === 'password')?.value || '';
    }

    return {
      id: uid(),
      name:    item.name || 'Untitled',
      method:  (r.method || 'GET').toUpperCase(),
      url, headers, params, body, auth,
    };
  }

  data.item.forEach(item => parseItem(item, requests, folders));

  return {
    id:   uid(),
    name: data.info?.name || 'Imported Collection',
    folders,
    requests,
  };
}
