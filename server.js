#!/usr/bin/env node
'use strict';

// Salvo dev server — static file serving + a tiny JSON file API for the
// data/ directory (collections, environments, history). No dependencies.

const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const os     = require('os');

// ─── CLI args ───────────────────────────────────────────────────────────────────
// `node server.js --port=<port>` or `node server.js --port <port>`
function getCliPort() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--port=')) return arg.slice('--port='.length);
    if (arg === '--port')          return args[i + 1];
  }
  return undefined;
}

const ROOT      = __dirname;
const DATA_DIR  = process.env.SALVO_DATA_DIR || path.join(ROOT, 'data');
const SALVO_DIR = path.join(DATA_DIR, '_salvo');
const PORT      = getCliPort() || process.env.PORT || 5874;
const LOG_DIR   = process.env.SALVO_LOG_DIR || path.join(ROOT, 'logs');
const LOG_FILE  = path.join(LOG_DIR, 'salvo.log');

// ─── Logging ────────────────────────────────────────────────────────────────────
// Writes to the CLI (console) and appends to logs/salvo.log (gitignored).
function log(level, message) {
  const line = `[${new Date().toISOString()}] [${level}] ${message}`;
  if (level === 'ERROR') console.error(line);
  else console.log(line);
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch {}
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

function sanitizeName(name) {
  const cleaned = String(name ?? '').replace(/[\\/:*?"<>|]/g, '_').trim();
  return cleaned || 'untitled';
}

function uniqueName(base, used) {
  let name = base, i = 2;
  while (used.has(name.toLowerCase())) name = `${base} (${i++})`;
  used.add(name.toLowerCase());
  return name;
}

// ─── Digest auth (RFC 2617) ─────────────────────────────────────────────────────

function parseDigestChallenge(header) {
  const out = {};
  const re = /(\w+)=(?:"([^"]*)"|([^,\s]+))/g;
  let m;
  while ((m = re.exec(header))) out[m[1]] = m[2] !== undefined ? m[2] : m[3];
  return out;
}

function buildDigestHeader({ username, password }, method, uri, { realm, nonce, qop, opaque, algorithm }) {
  const md5 = s => crypto.createHash('md5').update(s).digest('hex');
  const ha1 = md5(`${username}:${realm}:${password}`);
  const ha2 = md5(`${method}:${uri}`);

  const nc     = '00000001';
  const cnonce = crypto.randomBytes(8).toString('hex');
  const response = qop ? md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`) : md5(`${ha1}:${nonce}:${ha2}`);

  let h = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"`;
  if (qop)       h += `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;
  if (opaque)    h += `, opaque="${opaque}"`;
  if (algorithm) h += `, algorithm=${algorithm}`;
  return h;
}

// ─── Build {cols, envs, hist} from a flat list of {path, content} files ───────
// `path` looks like "<Collection>/<Request>.json" or "_salvo/envs.json", mirroring
// the on-disk layout of data/. Used by both loadData() and the zip/folder import.
function buildColsFromFiles(files) {
  const colsMap = new Map();
  let envs, hist;

  for (const { path: relPath, content } of files) {
    const parts = relPath.split('/').filter(Boolean);
    if (parts.length !== 2) continue;
    const [dir, fileName] = parts;
    if (!fileName.toLowerCase().endsWith('.json')) continue;

    if (dir === '_salvo') {
      if (fileName === 'envs.json')    { try { envs = JSON.parse(content); } catch {} }
      if (fileName === 'history.json') { try { hist = JSON.parse(content); } catch {} }
      continue;
    }

    let raw;
    try { raw = JSON.parse(content); } catch { continue; }
    if (!raw || typeof raw !== 'object') continue;

    let col = colsMap.get(dir);
    if (!col) { col = { name: dir, requests: [], folders: new Map() }; colsMap.set(dir, col); }

    const { folder, ...request } = raw;
    if (folder) {
      let fl = col.folders.get(folder);
      if (!fl) { fl = { name: folder, requests: [] }; col.folders.set(folder, fl); }
      fl.requests.push(request);
    } else {
      col.requests.push(request);
    }
  }

  const cols = [...colsMap.values()].map(c => ({
    name: c.name, requests: c.requests, folders: [...c.folders.values()],
  }));

  return { cols, envs, hist };
}

// ─── Read every collection/request file under data/ as {path, content} ────────
function walkDataDir() {
  const files = [];
  if (!fs.existsSync(DATA_DIR)) return files;

  for (const entry of fs.readdirSync(DATA_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const sub = path.join(DATA_DIR, entry.name);
    for (const f of fs.readdirSync(sub, { withFileTypes: true })) {
      if (!f.isFile() || !f.name.toLowerCase().endsWith('.json')) continue;
      files.push({ path: `${entry.name}/${f.name}`, content: fs.readFileSync(path.join(sub, f.name), 'utf8') });
    }
  }

  return files;
}

// Older saves stored env vars as a {key: value} object; convert to the
// array-of-rows shape ({id, key, value, enabled}) used by the kv editor.
function normalizeEnvs(envs) {
  return envs.map(e => ({
    ...e,
    vars: Array.isArray(e.vars)
      ? e.vars
      : Object.entries(e.vars || {}).map(([key, value]) => ({ id: crypto.randomUUID(), key, value, enabled: true })),
  }));
}

// ─── Load all collections + envs + history from data/ ─────────────────────────
// envs.json is { activeEnv, list } — older saves stored a bare array (no
// activeEnv), which is treated as `list` with activeEnv defaulting to 'default'.
function loadData() {
  const { cols, envs, hist } = buildColsFromFiles(walkDataDir());

  const list      = Array.isArray(envs) ? envs : envs?.list;
  const activeEnv = Array.isArray(envs) ? 'default' : (envs?.activeEnv || 'default');

  let tabsData = {};
  try { tabsData = JSON.parse(fs.readFileSync(path.join(SALVO_DIR, 'tabs.json'), 'utf8')); } catch {}

  return {
    cols,
    envs: normalizeEnvs(list?.length ? list : [{ id: 'default', name: 'No Environment', vars: [] }]),
    activeEnv,
    hist: hist || [],
    openTabs:    Array.isArray(tabsData.openTabs) ? tabsData.openTabs : [],
    activeIndex: typeof tabsData.activeIndex === 'number' ? tabsData.activeIndex : -1,
  };
}

// ─── Persist collections + envs + history to data/ ─────────────────────────────
function saveData(payload) {
  const cols      = Array.isArray(payload.cols) ? payload.cols : [];
  const envs      = Array.isArray(payload.envs) ? payload.envs : [];
  const hist      = Array.isArray(payload.hist) ? payload.hist : [];
  const activeEnv = payload.activeEnv || 'default';
  const openTabs  = Array.isArray(payload.openTabs) ? payload.openTabs : [];
  const activeIndex = typeof payload.activeIndex === 'number' ? payload.activeIndex : -1;

  fs.mkdirSync(DATA_DIR, { recursive: true });

  // Remove collection directories that no longer exist
  const keepDirs = new Set(cols.map(c => sanitizeName(c.name)));
  for (const entry of fs.readdirSync(DATA_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === '_salvo') continue;
    if (!keepDirs.has(entry.name)) fs.rmSync(path.join(DATA_DIR, entry.name), { recursive: true, force: true });
  }

  for (const col of cols) {
    const colDir = path.join(DATA_DIR, sanitizeName(col.name));
    fs.mkdirSync(colDir, { recursive: true });

    // Wipe existing request files, then rewrite from current state
    for (const f of fs.readdirSync(colDir, { withFileTypes: true })) {
      if (f.isFile() && f.name.toLowerCase().endsWith('.json')) fs.unlinkSync(path.join(colDir, f.name));
    }

    const used = new Set();
    const writeReq = (req, folderName) => {
      const fileName = uniqueName(sanitizeName(req.name), used) + '.json';
      const { id, ...rest } = req;
      const data = folderName ? { ...rest, folder: folderName } : rest;
      fs.writeFileSync(path.join(colDir, fileName), JSON.stringify(data, null, 2));
    };

    (col.requests || []).forEach(r => writeReq(r, null));
    (col.folders  || []).forEach(f => (f.requests || []).forEach(r => writeReq(r, f.name)));
  }

  fs.mkdirSync(SALVO_DIR, { recursive: true });
  fs.writeFileSync(path.join(SALVO_DIR, 'envs.json'),    JSON.stringify({ activeEnv, list: envs }, null, 2));
  fs.writeFileSync(path.join(SALVO_DIR, 'history.json'), JSON.stringify(hist.slice(-200), null, 2));
  fs.writeFileSync(path.join(SALVO_DIR, 'tabs.json'),    JSON.stringify({ openTabs, activeIndex }, null, 2));
}

// ─── HTTP server ────────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const start = Date.now();
  const u = new URL(req.url, `http://${req.headers.host}`);

  res.on('finish', () => {
    log('INFO', `${req.method} ${u.pathname} ${res.statusCode} ${Date.now() - start}ms`);
  });

  if (u.pathname === '/api/data' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(loadData()));
    return;
  }

  if (u.pathname === '/api/save' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        saveData(JSON.parse(body));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        log('ERROR', `save failed: ${err.message}`);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  if (u.pathname === '/api/proxy' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      let url, method;
      try {
        let headers, reqBody, bodyKind, digestAuth;
        ({ url, method, headers, body: reqBody, bodyKind, digestAuth } = JSON.parse(body));

        function buildFetchBody() {
          if (bodyKind === 'raw') return reqBody;
          if (bodyKind === 'formdata') {
            const fd = new FormData();
            (reqBody || []).forEach(({ key, value }) => fd.append(key, value));
            return fd;
          }
          if (bodyKind === 'urlencoded') {
            return new URLSearchParams((reqBody || []).map(({ key, value }) => [key, value]));
          }
          return undefined;
        }

        const doFetch = hdrs => fetch(url, {
          method,
          headers: hdrs,
          body: ['GET', 'HEAD'].includes(method) ? undefined : buildFetchBody(),
        });

        const start = Date.now();
        let upstream = await doFetch(headers);

        // Transparently answer a Digest auth challenge and retry once.
        if (digestAuth && upstream.status === 401) {
          const challengeHeader = upstream.headers.get('www-authenticate') || '';
          if (/digest/i.test(challengeHeader)) {
            const challenge   = parseDigestChallenge(challengeHeader);
            const reqUrl      = new URL(url);
            const uri         = reqUrl.pathname + reqUrl.search;
            const digestValue = buildDigestHeader(digestAuth, method, uri, challenge);
            upstream = await doFetch({ ...headers, Authorization: digestValue });
          }
        }

        const elapsed = Date.now() - start;

        const buf         = Buffer.from(await upstream.arrayBuffer());
        const respHeaders = {};
        upstream.headers.forEach((v, k) => { respHeaders[k] = v; });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok:         true,
          status:     upstream.status,
          statusText: upstream.statusText,
          headers:    respHeaders,
          bodyBase64: buf.toString('base64'),
          elapsed,
        }));
      } catch (err) {
        log('ERROR', `proxy ${method} ${url} failed: ${err.message}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // Static file serving
  let filePath = path.join(ROOT, decodeURIComponent(u.pathname));
  if (u.pathname === '/') filePath = path.join(ROOT, 'index.html');

  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

// ─── LAN-accessible addresses, for the startup log ─────────────────────────────
function lanAddresses() {
  const addrs = [];
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces || []) {
      if (iface.family === 'IPv4' && !iface.internal) addrs.push(iface.address);
    }
  }
  return addrs;
}

if (require.main === module) {
  server.listen(PORT, () => {
    log('INFO', `Salvo running at http://localhost:${PORT}`);
    for (const addr of lanAddresses()) log('INFO', `  also available at http://${addr}:${PORT}`);
  });
}

module.exports = {
  sanitizeName, uniqueName, buildColsFromFiles, walkDataDir, loadData, saveData, server,
  parseDigestChallenge, buildDigestHeader, normalizeEnvs, log,
};
