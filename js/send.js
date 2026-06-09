// ─── Send Request ─────────────────────────────────────────────────────────────

async function sendRequest() {
  if (!state.req || state.loading) return;

  state.abortCtrl = new AbortController();
  state.loading   = true;
  state.resp      = null;
  state.respTab   = 'body';

  // Switch response tabs to body and show spinner
  document.querySelectorAll('[data-rtab]').forEach(t =>
    t.classList.toggle('active', t.dataset.rtab === 'body')
  );
  document.getElementById('send-btn').textContent = 'Cancel';
  document.getElementById('send-btn').onclick     = cancelReq;
  document.getElementById('resp-body-wrap').innerHTML =
    `<div style="display:flex;align-items:center;gap:8px;color:#8b949e">
       <div class="spinner"><span></span><span></span><span></span></div> Sending…
     </div>`;
  document.getElementById('status-badge').style.display   = 'none';
  document.getElementById('resp-time').style.display      = 'none';
  document.getElementById('resp-size').style.display      = 'none';
  document.getElementById('copy-resp-btn').style.display  = 'none';

  const start = Date.now();

  try {
    const { url: builtUrl, headers, body } = buildRequestArgs();

    const res = await fetch(builtUrl, {
      method:  state.req.method,
      headers,
      body:    ['GET', 'HEAD'].includes(state.req.method) ? undefined : body,
      signal:  state.abortCtrl.signal,
    });

    const elapsed = Date.now() - start;
    state.resp    = await parseResponse(res, elapsed);

    // Log to history
    state.hist.push({
      method:  state.req.method,
      url:     builtUrl,
      status:  res.status,
      elapsed,
    });
    persist();

    if (state.showHist) renderHistPanel();

  } catch (err) {
    const elapsed = Date.now() - start;
    state.resp = err.name === 'AbortError'
      ? { error: 'Request cancelled', elapsed }
      : { error: err.message, elapsed };

  } finally {
    state.loading = false;
    document.getElementById('send-btn').textContent = 'Send';
    document.getElementById('send-btn').onclick     = sendRequest;
    renderRespPanel();
  }
}

function cancelReq() {
  state.abortCtrl?.abort();
}

// ─── Build fetch arguments from the active request ────────────────────────────

function buildRequestArgs() {
  // URL + query params
  let raw = interp(state.req.url);
  if (!raw.match(/^https?:\/\//i)) raw = 'https://' + raw;
  const urlObj = new URL(raw);

  state.req.params
    .filter(p => p.enabled && p.key)
    .forEach(p => urlObj.searchParams.set(interp(p.key), interp(p.value)));

  // Headers
  const headers = {};
  state.req.headers
    .filter(h => h.enabled && h.key)
    .forEach(h => { headers[interp(h.key)] = interp(h.value); });

  // Auth
  const auth = state.req.auth;
  if (auth.type === 'bearer' && auth.token) {
    headers['Authorization'] = `Bearer ${interp(auth.token)}`;
  }
  if (auth.type === 'basic') {
    headers['Authorization'] = `Basic ${btoa(`${auth.username}:${auth.password}`)}`;
  }
  if (auth.type === 'apikey' && auth.apiKey) {
    headers[auth.apiKey] = auth.apiValue;
  }

  // Body
  let body;
  const bt = state.req.body.type;

  if (bt === 'raw' && state.req.body.raw) {
    body = interp(state.req.body.raw);
    if (!headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json';
    }
  } else if (bt === 'formdata') {
    body = new FormData();
    state.req.body.formData
      .filter(f => f.enabled && f.key)
      .forEach(f => body.append(f.key, f.value));
  } else if (bt === 'urlencoded') {
    body = new URLSearchParams();
    state.req.body.formData
      .filter(f => f.enabled && f.key)
      .forEach(f => body.append(f.key, f.value));
    if (!headers['Content-Type']) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }
  }

  return { url: urlObj.toString(), headers, body };
}

// ─── Parse the fetch Response into our response state object ─────────────────

async function parseResponse(res, elapsed) {
  const respHeaders = {};
  res.headers.forEach((v, k) => { respHeaders[k] = v; });

  const ct = res.headers.get('content-type') || '';

  if (ct.includes('image')) {
    const blob = await res.blob();
    return {
      status:     res.status,
      statusText: res.statusText,
      headers:    respHeaders,
      body:       URL.createObjectURL(blob),
      bodyType:   'image',
      elapsed,
      size:       blob.size,
    };
  }

  let text     = await res.text();
  let bodyType = 'text';

  if (ct.includes('json')) {
    try { text = JSON.stringify(JSON.parse(text), null, 2); bodyType = 'json'; } catch {}
  }

  return {
    status:     res.status,
    statusText: res.statusText,
    headers:    respHeaders,
    body:       text,
    bodyType,
    elapsed,
    size:       new Blob([text]).size,
  };
}
