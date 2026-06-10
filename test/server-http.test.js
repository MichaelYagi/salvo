'use strict';

// HTTP-level tests for server.js: /api/data, /api/save, /api/proxy, and
// static file serving. Run with `node --test`.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'salvo-test-http-'));
process.env.SALVO_DATA_DIR = DATA_DIR;

const { server } = require('../server.js');

let base;

test.before(() => new Promise(resolve => {
  server.listen(0, '127.0.0.1', () => {
    base = `http://127.0.0.1:${server.address().port}`;
    resolve();
  });
}));

test.after(() => {
  server.close();
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
});

test('GET /api/data returns default envs/hist for an empty data dir', async () => {
  const res = await fetch(`${base}/api/data`);
  assert.strictEqual(res.status, 200);
  assert.match(res.headers.get('content-type'), /application\/json/);

  const data = await res.json();
  assert.deepStrictEqual(data.cols, []);
  assert.deepStrictEqual(data.envs, [{ id: 'default', name: 'No Environment', vars: {} }]);
  assert.deepStrictEqual(data.hist, []);
});

test('POST /api/save then GET /api/data round trips collections', async () => {
  const payload = {
    cols: [{ name: 'Demo', requests: [{ id: 'r1', name: 'Ping', method: 'GET', url: '/ping' }], folders: [] }],
    envs: [{ id: 'default', name: 'No Environment', vars: { token: 'abc' } }],
    hist: [{ method: 'GET', url: '/ping', status: 200, elapsed: 5 }],
  };

  const saveRes = await fetch(`${base}/api/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  assert.strictEqual(saveRes.status, 200);
  assert.deepStrictEqual(await saveRes.json(), { ok: true });

  const dataRes = await fetch(`${base}/api/data`);
  const data = await dataRes.json();
  assert.strictEqual(data.cols.length, 1);
  assert.strictEqual(data.cols[0].name, 'Demo');
  assert.strictEqual(data.cols[0].requests[0].name, 'Ping');
  assert.strictEqual(data.envs[0].vars.token, 'abc');
  assert.strictEqual(data.hist[0].url, '/ping');
});

test('POST /api/save with invalid JSON returns ok:false', async () => {
  const res = await fetch(`${base}/api/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'not json',
  });
  assert.strictEqual(res.status, 500);
  const data = await res.json();
  assert.strictEqual(data.ok, false);
  assert.ok(data.error);
});

test('POST /api/proxy forwards a request to the target URL and returns the response', async () => {
  const upstream = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json', 'X-Test': 'yes' });
    res.end(JSON.stringify({ hello: 'world' }));
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const upstreamUrl = `http://127.0.0.1:${upstream.address().port}/`;

  try {
    const res = await fetch(`${base}/api/proxy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: upstreamUrl, method: 'GET', headers: {} }),
    });
    assert.strictEqual(res.status, 200);

    const data = await res.json();
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.status, 200);
    assert.strictEqual(data.headers['x-test'], 'yes');

    const body = JSON.parse(Buffer.from(data.bodyBase64, 'base64').toString('utf8'));
    assert.deepStrictEqual(body, { hello: 'world' });
  } finally {
    upstream.close();
  }
});

test('POST /api/proxy supports a raw request body', async () => {
  const received = [];
  const upstream = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      received.push(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{}');
    });
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const upstreamUrl = `http://127.0.0.1:${upstream.address().port}/`;

  try {
    const res = await fetch(`${base}/api/proxy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: upstreamUrl, method: 'POST', headers: { 'Content-Type': 'application/json' },
        bodyKind: 'raw', body: '{"hello":"world"}',
      }),
    });
    assert.strictEqual((await res.json()).ok, true);
    assert.strictEqual(received[0], '{"hello":"world"}');
  } finally {
    upstream.close();
  }
});

test('POST /api/proxy supports formdata and urlencoded request bodies', async () => {
  const received = [];
  const upstream = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      received.push({ contentType: req.headers['content-type'], body });
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
    });
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const upstreamUrl = `http://127.0.0.1:${upstream.address().port}/`;

  try {
    const formdataRes = await fetch(`${base}/api/proxy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: upstreamUrl, method: 'POST', headers: {},
        bodyKind: 'formdata', body: [{ key: 'name', value: 'salvo' }],
      }),
    });
    assert.strictEqual((await formdataRes.json()).ok, true);
    assert.match(received[0].contentType, /multipart\/form-data/);
    assert.match(received[0].body, /name="name"[\s\S]*salvo/);

    const urlencodedRes = await fetch(`${base}/api/proxy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: upstreamUrl, method: 'POST', headers: {},
        bodyKind: 'urlencoded', body: [{ key: 'a', value: 'b' }],
      }),
    });
    assert.strictEqual((await urlencodedRes.json()).ok, true);
    assert.strictEqual(received[1].body, 'a=b');
  } finally {
    upstream.close();
  }
});

test('POST /api/proxy returns ok:false when the upstream is unreachable', async () => {
  const res = await fetch(`${base}/api/proxy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'http://127.0.0.1:1/', method: 'GET', headers: {} }),
  });
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.ok, false);
  assert.ok(data.error);
});

test('GET / serves index.html', async () => {
  const res = await fetch(`${base}/`);
  assert.strictEqual(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  const text = await res.text();
  assert.match(text, /<html/i);
});

test('GET /js/state.js serves a JS file with the right content type', async () => {
  const res = await fetch(`${base}/js/state.js`);
  assert.strictEqual(res.status, 200);
  assert.match(res.headers.get('content-type'), /application\/javascript/);
});

test('GET /does-not-exist returns 404', async () => {
  const res = await fetch(`${base}/does-not-exist`);
  assert.strictEqual(res.status, 404);
});
