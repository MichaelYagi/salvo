'use strict';

// Tests for js/curl.js (buildCurl, and the cURL tab's "test against the mock
// server" command), exercised in a vm sandbox since these files are written
// for the global browser scope (no modules/exports). Run with `node --test`.

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
    location: { hostname: 'localhost' },
    fetch: () => Promise.reject(new Error('fetch not available in tests')),
    Blob: function Blob() {},
    setTimeout, clearTimeout,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);

  const stateSrc   = fs.readFileSync(path.join(__dirname, '../js/state.js'), 'utf8');
  const requestSrc = fs.readFileSync(path.join(__dirname, '../js/request.js'), 'utf8');
  const curlSrc    = fs.readFileSync(path.join(__dirname, '../js/curl.js'), 'utf8');
  const mockSrc    = fs.readFileSync(path.join(__dirname, '../js/mock.js'), 'utf8');
  vm.runInContext(stateSrc, sandbox, { filename: 'state.js' });
  vm.runInContext(requestSrc, sandbox, { filename: 'request.js' });
  vm.runInContext(curlSrc, sandbox, { filename: 'curl.js' });
  vm.runInContext(mockSrc, sandbox, { filename: 'mock.js' });

  vm.runInContext(`
    let _activeTab = null;
    let _cookieJar = [];
    function activeTab() { return _activeTab; }
    function scheduleDiskSave() {}
    function notify() {}
    globalThis.state = state;
    globalThis.setActiveTab = t => { _activeTab = t; };
    globalThis.setMockStatus = s => { _mockStatus = s; };
  `, sandbox, { filename: 'stubs.js' });

  return sandbox;
}

function makeReq(overrides = {}) {
  return {
    url: '', method: 'GET', params: [], pathVars: [], headers: [],
    body: { type: 'none', raw: '', formData: [] },
    auth: { type: 'none', token: '', username: '', password: '', apiKey: '', apiValue: '', cachedToken: '', jwtSecret: '' },
    mock: { enabled: false, status: 200, headers: [], body: '', delay: 0 },
    ...overrides,
  };
}

function makeTab(req) {
  return { req, reqTab: 'curl' };
}

test('buildCurl renders the method, URL, and headers', () => {
  const sandbox = loadSandbox();
  const req = makeReq({ method: 'POST', url: 'https://api.example.com/widgets', headers: [{ id: '1', key: 'X-Test', value: 'abc', enabled: true }] });
  sandbox.setActiveTab(makeTab(req));

  const cmd = sandbox.buildCurl();
  assert.match(cmd, /^curl \\\n {2}-X POST \\\n {2}'https:\/\/api\.example\.com\/widgets'/);
  assert.match(cmd, /-H 'X-Test: abc'/);
});

test('curlPanelHTML omits the mock section when the request\'s mock is not enabled', () => {
  const sandbox = loadSandbox();
  const req = makeReq({ url: 'https://api.example.com/ping' });
  sandbox.setActiveTab(makeTab(req));

  const html = sandbox.curlPanelHTML();
  assert.doesNotMatch(html, /Mock Server/);
});

test('curlPanelHTML omits the mock section when mock is enabled but the mock server is not running', () => {
  const sandbox = loadSandbox();
  const req = makeReq({ url: 'https://api.example.com/ping', mock: { enabled: true, status: 200, headers: [], body: '', delay: 0 } });
  sandbox.setActiveTab(makeTab(req));
  sandbox.setMockStatus({ running: false, port: null, routes: 0 });

  const html = sandbox.curlPanelHTML();
  assert.doesNotMatch(html, /Mock Server/);
  assert.doesNotMatch(html, /mock-curl-output/);
});

test('curlPanelHTML and buildMockCurl render a curl command against the running mock server', () => {
  const sandbox = loadSandbox();
  const req = makeReq({ method: 'POST', url: '{{baseUrl}}/users/:id?x=1', mock: { enabled: true, status: 200, headers: [], body: '', delay: 0 } });
  sandbox.setActiveTab(makeTab(req));
  sandbox.setMockStatus({ running: true, port: 5875, routes: 1 });

  const cmd = sandbox.buildMockCurl();
  assert.strictEqual(cmd, `curl \\\n  -X POST \\\n  'http://localhost:5875/users/:id'`);

  const html = sandbox.curlPanelHTML();
  assert.match(html, /mock-curl-output/);
  assert.match(html, /http:\/\/localhost:5875\/users\/:id/);
});
