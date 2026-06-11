'use strict';

// Tests for js/request.js (path variables, computed-headers preview), exercised
// in a vm sandbox since these files are written for the global browser scope
// (no modules/exports). Run with `node --test`.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadSandbox() {
  const sandbox = {
    console,
    document: {
      createElement: () => ({ remove: () => {} }),
      body: { appendChild: () => {} },
      getElementById: () => null,
      querySelectorAll: () => [],
    },
    window: {},
    navigator: {},
    fetch: () => Promise.reject(new Error('fetch not available in tests')),
    Blob: function Blob() {},
    URL,
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    setTimeout, clearTimeout,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);

  const stateSrc   = fs.readFileSync(path.join(__dirname, '../js/state.js'), 'utf8');
  const requestSrc = fs.readFileSync(path.join(__dirname, '../js/request.js'), 'utf8');
  vm.runInContext(stateSrc, sandbox, { filename: 'state.js' });
  vm.runInContext(requestSrc, sandbox, { filename: 'request.js' });

  // request.js calls activeTab() (js/tabs.js) and reads _cookieJar (js/modals.js) —
  // provide minimal stand-ins and re-expose top-level `const`/`let` bindings as
  // sandbox properties since they aren't reflected on the context's global object.
  vm.runInContext(`
    let _cookieJar = [];
    let _activeTab = null;
    function activeTab() { return _activeTab; }
    function scheduleDiskSave() {}
    globalThis.state = state;
    globalThis.setActiveTab = t => { _activeTab = t; };
    globalThis.setCookieJar = j => { _cookieJar = j; };
  `, sandbox, { filename: 'stubs.js' });

  return sandbox;
}

function makeReq(overrides = {}) {
  return {
    url: '', params: [], pathVars: [], headers: [],
    body: { type: 'none', raw: '', formData: [] },
    auth: { type: 'none', token: '', username: '', password: '', apiKey: '', apiValue: '', cachedToken: '', jwtSecret: '' },
    ...overrides,
  };
}

function makeTab(req) {
  return { req, reqTab: 'params' };
}

// ─── Path Variables ─────────────────────────────────────────────────────────

test('parsePathVarNames extracts :name segments from the URL path, ignoring ports', () => {
  const sandbox = loadSandbox();
  assert.deepEqual(sandbox.parsePathVarNames('https://api.example.com/users/:userId/orders/:orderId?foo=bar'), ['userId', 'orderId']);
  assert.deepEqual(sandbox.parsePathVarNames('localhost:3000/users/:id'), ['id']);
  assert.deepEqual(sandbox.parsePathVarNames('https://example.com/no/vars'), []);
});

test('syncPathVarsFromUrl rebuilds pathVars from the URL, preserving values and dropping removed names', () => {
  const sandbox = loadSandbox();
  const req = makeReq({ url: 'https://api.example.com/users/:userId/orders/:orderId' });
  sandbox.setActiveTab(makeTab(req));

  sandbox.syncPathVarsFromUrl();
  assert.strictEqual(req.pathVars.length, 2);
  assert.strictEqual(req.pathVars[0].key, 'userId');
  assert.strictEqual(req.pathVars[1].key, 'orderId');

  req.pathVars[0].value = '123';
  req.pathVars[1].value = '456';

  // Remove :orderId from the URL — its pathVar entry should be dropped, :userId's value kept.
  req.url = 'https://api.example.com/users/:userId';
  sandbox.syncPathVarsFromUrl();
  assert.strictEqual(req.pathVars.length, 1);
  assert.strictEqual(req.pathVars[0].key, 'userId');
  assert.strictEqual(req.pathVars[0].value, '123');
});

test('substitutePathVars replaces :name segments with interpolated values', () => {
  const sandbox = loadSandbox();
  const req = makeReq();
  sandbox.setActiveTab(makeTab(req));

  const url = sandbox.substitutePathVars(
    'https://api.example.com/users/:userId/orders/:orderId',
    [{ key: 'userId', value: '123' }, { key: 'orderId', value: '456' }]
  );
  assert.strictEqual(url, 'https://api.example.com/users/123/orders/456');

  // A name that's a prefix of another shouldn't be partially substituted.
  const url2 = sandbox.substitutePathVars('/things/:id/:identifier', [{ key: 'id', value: 'X' }, { key: 'identifier', value: 'Y' }]);
  assert.strictEqual(url2, '/things/X/Y');
});

// ─── Computed headers preview ───────────────────────────────────────────────

test('computedAuthHeaders reflects the Auth tab (Bearer)', () => {
  const sandbox = loadSandbox();
  const auth = { type: 'bearer', token: 'abc123' };
  assert.deepEqual(sandbox.computedAuthHeaders(auth), [{ key: 'Authorization', value: 'Bearer abc123' }]);
});

test('computedCookieHeader adds a Cookie header for cookies matching the request URL', () => {
  const sandbox = loadSandbox();
  const req = makeReq({ url: 'https://api.example.com/widgets' });
  sandbox.setActiveTab(makeTab(req));
  sandbox.setCookieJar([
    { name: 'session', value: 'abc', domain: 'api.example.com', path: '/', secure: false, expires: null },
    { name: 'other',   value: 'xyz', domain: 'other.com',       path: '/', secure: false, expires: null },
  ]);

  const headers = sandbox.computedCookieHeader(req);
  assert.deepEqual(headers, [{ key: 'Cookie', value: 'session=abc', source: 'Cookie Jar' }]);
});

test('computedCookieHeader excludes expired and cross-domain cookies', () => {
  const sandbox = loadSandbox();
  const req = makeReq({ url: 'https://api.example.com/widgets' });
  sandbox.setActiveTab(makeTab(req));
  sandbox.setCookieJar([
    { name: 'expired', value: 'abc', domain: 'api.example.com', path: '/', secure: false, expires: Date.now() - 1000 },
    { name: 'other',   value: 'xyz', domain: 'other.com',       path: '/', secure: false, expires: null },
  ]);

  assert.deepEqual(sandbox.computedCookieHeader(req), []);
});

test('computedHeaders combines Auth, Body, and Cookie Jar sources', () => {
  const sandbox = loadSandbox();
  const req = makeReq({
    url: 'https://api.example.com/widgets',
    auth: { type: 'bearer', token: 'tok' },
    body: { type: 'raw', raw: '{"a":1}', formData: [], contentType: 'json' },
  });
  sandbox.setActiveTab(makeTab(req));
  sandbox.setCookieJar([{ name: 'session', value: 'abc', domain: 'api.example.com', path: '/', secure: false, expires: null }]);

  const headers = sandbox.computedHeaders(req);
  assert.deepEqual(headers, [
    { key: 'Authorization', value: 'Bearer tok', source: 'Auth tab' },
    { key: 'Content-Type', value: 'application/json', source: 'Body tab' },
    { key: 'Cookie', value: 'session=abc', source: 'Cookie Jar' },
  ]);
});

// ─── kvEditorHTML rendering ──────────────────────────────────────────────────

test('kvEditorHTML renders a Path Variables section with read-only keys and editable values', () => {
  const sandbox = loadSandbox();
  const req = makeReq({ pathVars: [{ id: '1', key: 'userId', value: '123' }] });
  sandbox.setActiveTab(makeTab(req));

  const html = sandbox.kvEditorHTML(req.params, 'params');
  assert.match(html, /Path Variables/);
  assert.match(html, /value="userId" disabled/);
  assert.match(html, /value="123"[^>]*oninput="pathVarSet\(0,this\.value\)"/);
});

test('kvEditorHTML flags a manual header that conflicts with the Auth tab', () => {
  const sandbox = loadSandbox();
  const req = makeReq({
    auth: { type: 'bearer', token: 'tok' },
    headers: [{ id: '1', key: 'Authorization', value: 'Bearer manual', enabled: true, note: '' }],
  });
  sandbox.setActiveTab(makeTab(req));

  const html = sandbox.kvEditorHTML(req.headers, 'headers');
  assert.match(html, /kv-conflict/);
  assert.match(html, /overridden by the Auth tab/);
});

test('kvEditorHTML does not flag a disabled header that shadows an Auth header', () => {
  const sandbox = loadSandbox();
  const req = makeReq({
    auth: { type: 'bearer', token: 'tok' },
    headers: [{ id: '1', key: 'Authorization', value: 'Bearer manual', enabled: false, note: '' }],
  });
  sandbox.setActiveTab(makeTab(req));

  const html = sandbox.kvEditorHTML(req.headers, 'headers');
  assert.doesNotMatch(html, /kv-conflict/);
});
