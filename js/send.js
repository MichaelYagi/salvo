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
    const { url: builtUrl, headers, bodyKind, bodyPayload } = buildRequestArgs();

    const proxyRes = await fetch('/api/proxy', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ url: builtUrl, method: state.req.method, headers, bodyKind, body: bodyPayload }),
      signal:  state.abortCtrl.signal,
    });

    const data = await proxyRes.json();
    if (!data.ok) throw new Error(data.error);

    const elapsed = Date.now() - start;
    state.resp    = parseResponse(data, elapsed);

    // Log to history
    state.hist.push({
      method:  state.req.method,
      url:     builtUrl,
      status:  data.status,
      elapsed,
    });

    if (state.showHist) renderHistPanel();
    scheduleDiskSave();

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
  let bodyKind    = 'none';
  let bodyPayload = null;
  const bt = state.req.body.type;

  if (bt === 'raw' && state.req.body.raw) {
    bodyKind    = 'raw';
    bodyPayload = interp(state.req.body.raw);
    if (!headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json';
    }
  } else if (bt === 'formdata') {
    bodyKind    = 'formdata';
    bodyPayload = state.req.body.formData
      .filter(f => f.enabled && f.key)
      .map(f => ({ key: interp(f.key), value: interp(f.value) }));
  } else if (bt === 'urlencoded') {
    bodyKind    = 'urlencoded';
    bodyPayload = state.req.body.formData
      .filter(f => f.enabled && f.key)
      .map(f => ({ key: interp(f.key), value: interp(f.value) }));
    if (!headers['Content-Type']) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }
  }

  return { url: urlObj.toString(), headers, bodyKind, bodyPayload };
}

// ─── Parse the proxied response into our response state object ───────────────

function base64ToBytes(b64) {
  const bin   = atob(b64 || '');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function parseResponse(data, elapsed) {
  const respHeaders = data.headers || {};
  const ct          = respHeaders['content-type'] || '';
  const bytes       = base64ToBytes(data.bodyBase64);

  if (ct.includes('image')) {
    const blob = new Blob([bytes], { type: ct });
    return {
      status:     data.status,
      statusText: data.statusText,
      headers:    respHeaders,
      body:       URL.createObjectURL(blob),
      bodyType:   'image',
      elapsed,
      size:       bytes.length,
    };
  }

  const isText = !ct || ct.startsWith('text/') || ct.includes('json') || ct.includes('xml') || ct.includes('javascript');
  if (!isText) {
    return {
      status:     data.status,
      statusText: data.statusText,
      headers:    respHeaders,
      body:       null,
      bodyType:   'binary',
      elapsed,
      size:       bytes.length,
    };
  }

  let text     = new TextDecoder('utf-8').decode(bytes);
  let bodyType = 'text';

  if (ct.includes('json') && bytes.length <= JSON_TREE_MAX_BYTES) {
    try { text = JSON.stringify(JSON.parse(text), null, 2); bodyType = 'json'; } catch {}
  }

  return {
    status:     data.status,
    statusText: data.statusText,
    headers:    respHeaders,
    body:       text,
    bodyType,
    elapsed,
    size:       bytes.length,
  };
}
