// ─── cURL Generator ───────────────────────────────────────────────────────────
//
// Builds a valid curl command from the current state.req, respecting
// environment variable interpolation, auth, headers, params, and body.
// Called whenever the request changes (url, method, headers, params, body, auth).

function buildCurl() {
  const r = state.req;
  if (!r || !r.url) return '';

  const parts = ['curl'];

  // ── Method ────────────────────────────────────────────────────────────────
  if (r.method !== 'GET') {
    parts.push(`-X ${r.method}`);
  }

  // ── URL + query params ────────────────────────────────────────────────────
  let rawUrl = interp(r.url);
  if (!rawUrl.match(/^https?:\/\//i)) rawUrl = 'https://' + rawUrl;

  try {
    const urlObj = new URL(rawUrl);
    r.params
      .filter(p => p.enabled && p.key)
      .forEach(p => urlObj.searchParams.set(interp(p.key), interp(p.value)));
    rawUrl = urlObj.toString();
  } catch {
    // If the URL is still being typed and invalid, use it as-is
  }

  parts.push(`'${rawUrl}'`);

  // ── Auth (injected as a header) ───────────────────────────────────────────
  const auth = r.auth;
  if (auth.type === 'bearer' && auth.token) {
    parts.push(`-H 'Authorization: Bearer ${interp(auth.token)}'`);
  } else if (auth.type === 'basic' && (auth.username || auth.password)) {
    parts.push(`-u '${auth.username}:${auth.password}'`);
  } else if (auth.type === 'apikey' && auth.apiKey) {
    parts.push(`-H '${auth.apiKey}: ${auth.apiValue}'`);
  }

  // ── Headers ───────────────────────────────────────────────────────────────
  r.headers
    .filter(h => h.enabled && h.key)
    .forEach(h => parts.push(`-H '${interp(h.key)}: ${interp(h.value)}'`));

  // ── Body ──────────────────────────────────────────────────────────────────
  const body = r.body;

  if (body.type === 'raw' && body.raw) {
    // Add Content-Type if not already in headers
    const hasContentType = r.headers.some(
      h => h.enabled && h.key.toLowerCase() === 'content-type'
    );
    if (!hasContentType) {
      const ct = body.contentType === 'json' ? 'application/json'
               : body.contentType === 'xml'  ? 'application/xml'
               : body.contentType === 'html' ? 'text/html'
               :                               'text/plain';
      parts.push(`-H 'Content-Type: ${ct}'`);
    }
    // Escape single quotes in body for shell safety
    const escaped = interp(body.raw).replace(/'/g, `'\\''`);
    parts.push(`-d '${escaped}'`);
  }

  if (body.type === 'formdata') {
    body.formData
      .filter(f => f.enabled && f.key)
      .forEach(f => parts.push(`-F '${f.key}=${f.value}'`));
  }

  if (body.type === 'urlencoded') {
    const pairs = body.formData
      .filter(f => f.enabled && f.key)
      .map(f => `${encodeURIComponent(f.key)}=${encodeURIComponent(f.value)}`)
      .join('&');
    if (pairs) parts.push(`--data-urlencode '${pairs}'`);
  }

  // ── Assemble: one flag per line for readability ───────────────────────────
  return parts.join(' \\\n  ');
}

// ─── Render into the curl bar ─────────────────────────────────────────────────

function updateCurlBar() {
  const bar  = document.getElementById('curl-bar');
  const code = document.getElementById('curl-code');
  if (!bar || !code) return;

  const r = state.req;
  if (!r || !r.url) {
    bar.style.display = 'none';
    return;
  }

  bar.style.display = '';
  code.textContent  = buildCurl();
}

function copyCurl() {
  const text = buildCurl();
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => notify('curl copied', 'success'));
}
