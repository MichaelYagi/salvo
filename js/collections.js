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
  state.reqTab      = state.reqTabByReqId.get(id) || 'headers';
  renderSidebar();
  showReqEditor();
}

// ─── Collection CRUD ──────────────────────────────────────────────────────────

function addCollection() {
  const col = { id: uid(), name: 'New Collection', folders: [], requests: [] };
  state.cols.push(col);
  state.expandedCols.add(col.id);
  renderSidebar();
  scheduleDiskSave();
}

function renameCol(id) {
  const col = state.cols.find(c => c.id === id);
  if (!col) return;
  const name = prompt('Rename collection:', col.name);
  if (name !== null) { col.name = name; renderSidebar(); scheduleDiskSave(); }
}

function deleteCol(id) {
  if (!confirm('Delete this collection?')) return;
  state.cols = state.cols.filter(c => c.id !== id);
  renderSidebar();
  scheduleDiskSave();
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

// ─── Postman v2.1.0 serialisation ─────────────────────────────────────────────

function colToPostman(col) {
  function toPostmanItem(r) {
    const header = r.headers.map(h => ({ key: h.key, value: h.value, disabled: !h.enabled }));

    const urlObj = { raw: r.url };
    if (r.params.length) {
      urlObj.query = r.params.map(p => ({ key: p.key, value: p.value, disabled: !p.enabled }));
    }

    const request = { method: r.method, header, url: urlObj };

    if (r.body.type === 'raw' && r.body.raw) {
      request.body = {
        mode: 'raw',
        raw:  r.body.raw,
        options: { raw: { language: r.body.contentType || 'json' } },
      };
    } else if (r.body.type === 'formdata') {
      request.body = {
        mode:     'formdata',
        formdata: r.body.formData.map(f => ({ key: f.key, value: f.value, disabled: !f.enabled, type: 'text' })),
      };
    } else if (r.body.type === 'urlencoded') {
      request.body = {
        mode:       'urlencoded',
        urlencoded: r.body.formData.map(f => ({ key: f.key, value: f.value, disabled: !f.enabled })),
      };
    }

    if (r.auth.type === 'bearer') {
      request.auth = { type: 'bearer', bearer: [{ key: 'token', value: r.auth.token, type: 'string' }] };
    } else if (r.auth.type === 'basic') {
      request.auth = { type: 'basic', basic: [
        { key: 'username', value: r.auth.username, type: 'string' },
        { key: 'password', value: r.auth.password, type: 'string' },
      ]};
    } else if (r.auth.type === 'apikey') {
      request.auth = { type: 'apikey', apikey: [
        { key: 'key',   value: r.auth.apiKey,   type: 'string' },
        { key: 'value', value: r.auth.apiValue,  type: 'string' },
        { key: 'in',    value: 'header',          type: 'string' },
      ]};
    }

    return { name: r.name, request };
  }

  return {
    info: {
      name:   col.name,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item: [
      ...col.folders.map(f => ({ name: f.name, item: f.requests.map(toPostmanItem) })),
      ...col.requests.map(toPostmanItem),
    ],
  };
}

function exportColAsPostman(id) {
  const col = state.cols.find(c => c.id === id);
  if (!col) return;
  const blob = new Blob([JSON.stringify(colToPostman(col), null, 2)], { type: 'application/json' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = col.name + '.postman_collection.json';
  a.click();
}

// ─── Folder CRUD ──────────────────────────────────────────────────────────────

function addFolder(colId) {
  const col = state.cols.find(c => c.id === colId);
  if (!col) return;
  col.folders.push({ id: uid(), name: 'New Folder', requests: [] });
  state.expandedCols.add(colId);
  renderSidebar();
  scheduleDiskSave();
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

  selectReq(r.id);
  renderSidebar();
  scheduleDiskSave();
}

function deleteReq(id) {
  deleteReqs([id]);
}

function renameReq(id) {
  const r = findReq(id);
  if (!r) return;
  const name = prompt('Rename request:', r.name);
  if (name === null) return;
  r.name = name;
  if (state.req && state.req.id === id) {
    state.req.name = name;
    document.getElementById('req-name-input').value = name;
  }
  renderSidebar();
  scheduleDiskSave();
}

function dupReq(id) {
  const src = findReq(id);
  if (!src) return;

  const copy = { ...clone(src), id: uid(), name: src.name + ' (copy)' };
  const col  = state.cols.find(c => c.requests.some(r => r.id === id));
  if (!col) return;

  col.requests.push(copy);
  selectReq(copy.id);
  renderSidebar();
  scheduleDiskSave();
}

// ─── Move / Delete (single and batch) ────────────────────────────────────────

function moveReqs(ids, targetType, targetId) {
  const idSet = new Set(ids);
  const moved = [];

  state.cols = state.cols.map(c => ({
    ...c,
    requests: c.requests.filter(r => { if (idSet.has(r.id)) { moved.push(clone(r)); return false; } return true; }),
    folders:  c.folders.map(f => ({
      ...f,
      requests: f.requests.filter(r => { if (idSet.has(r.id)) { moved.push(clone(r)); return false; } return true; }),
    })),
  }));

  if (!moved.length) return;

  if (targetType === 'col') {
    const col = state.cols.find(c => c.id === targetId);
    if (col) { moved.forEach(r => col.requests.push(r)); state.expandedCols.add(targetId); }
  } else if (targetType === 'folder') {
    for (const col of state.cols) {
      const folder = col.folders.find(f => f.id === targetId);
      if (folder) {
        moved.forEach(r => folder.requests.push(r));
        state.expandedCols.add(col.id);
        state.expandedFolders.add(targetId);
        break;
      }
    }
  }

  state.selectedReqIds = new Set();
  renderSidebar();
  scheduleDiskSave();
}

function deleteReqs(ids) {
  const idSet = new Set(ids);
  state.cols = state.cols.map(c => ({
    ...c,
    requests: c.requests.filter(r => !idSet.has(r.id)),
    folders:  c.folders.map(f => ({ ...f, requests: f.requests.filter(r => !idSet.has(r.id)) })),
  }));

  if (idSet.has(state.activeReqId)) {
    state.activeReqId = null;
    state.req         = null;
    state.resp        = null;
    document.getElementById('req-editor').style.display  = 'none';
    document.getElementById('empty-state').style.display = 'flex';
  }

  state.selectedReqIds = new Set();
  renderSidebar();
  scheduleDiskSave();
}

// ─── Backup export / import (all collections, as plain JSON) ──────────────────

// Exports every collection (requests + folders, no envs/history) as a single
// JSON file that can be re-imported via importAny() — by this Salvo instance
// or shared with a team and merged into theirs.
function exportAll() {
  const payload = { cols: clone(state.cols) };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = 'salvo-export.json';
  a.click();
}

// Merge a { cols } payload into the current state. Existing collections/folders
// are matched by name; requests with a name that already exists in the matching
// collection/folder are skipped.
function mergeImportedData(data) {
  const importedCols = (data.cols || []).map(c => ({
    name:     c.name,
    requests: (c.requests || []).map(normalizeReq),
    folders:  (c.folders  || []).map(f => ({
      name:     f.name,
      requests: (f.requests || []).map(normalizeReq),
    })),
  }));

  let added = 0, skipped = 0;

  importedCols.forEach(ic => {
    let col = state.cols.find(c => c.name === ic.name);
    if (!col) {
      col = { id: uid(), name: ic.name, requests: [], folders: [] };
      state.cols.push(col);
    }
    state.expandedCols.add(col.id);

    ic.requests.forEach(r => {
      if (col.requests.some(x => x.name === r.name)) { skipped++; return; }
      col.requests.push(r);
      added++;
    });

    ic.folders.forEach(ifo => {
      let folder = col.folders.find(f => f.name === ifo.name);
      if (!folder) {
        folder = { id: uid(), name: ifo.name, requests: [] };
        col.folders.push(folder);
      }
      ifo.requests.forEach(r => {
        if (folder.requests.some(x => x.name === r.name)) { skipped++; return; }
        folder.requests.push(r);
        added++;
      });
    });
  });

  renderSidebar();
  scheduleDiskSave();

  const skippedMsg = skipped ? `, skipped ${skipped} duplicate${skipped === 1 ? '' : 's'}` : '';
  notify(`Imported ${added} request${added === 1 ? '' : 's'}${skippedMsg}`, 'success');
}

// Dispatches based on JSON shape: a Salvo export ({ cols }) is merged into the
// current collections; a Postman v2.x collection ({ info, item }) is added as
// a new collection.
async function importAny(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const data = JSON.parse(await file.text());

    if (Array.isArray(data.cols)) {
      mergeImportedData(data);
    } else if (data.item) {
      const col = parsePostman(data);
      state.cols.push(col);
      state.expandedCols.add(col.id);
      renderSidebar();
      scheduleDiskSave();
      notify('Imported: ' + col.name, 'success');
    } else {
      throw new Error('Not a Salvo export or Postman collection');
    }
  } catch (err) {
    notify('Import failed: ' + err.message, 'error');
  }

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
