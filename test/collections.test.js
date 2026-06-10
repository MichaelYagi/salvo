'use strict';

// Tests for js/collections.js (parsePostman, mergeImportedData), exercised in
// a vm sandbox since these files are written for the global browser scope
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
    },
    window: {},
    navigator: {},
    fetch: () => Promise.reject(new Error('fetch not available in tests')),
    Blob: function Blob() {},
    URL: { createObjectURL: () => '' },
    setTimeout, clearTimeout,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);

  const stateSrc       = fs.readFileSync(path.join(__dirname, '../js/state.js'), 'utf8');
  const collectionsSrc = fs.readFileSync(path.join(__dirname, '../js/collections.js'), 'utf8');
  vm.runInContext(stateSrc, sandbox, { filename: 'state.js' });
  vm.runInContext(collectionsSrc, sandbox, { filename: 'collections.js' });

  // normalizeReq lives in app.js, which has side-effecting boot code we don't
  // want to run — pull just that one function out by source.
  const appSrc = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  const match = appSrc.match(/function normalizeReq[\s\S]*?\n}\n/);
  assert.ok(match, 'normalizeReq not found in app.js');
  vm.runInContext(match[0], sandbox, { filename: 'normalizeReq.js' });

  // mergeImportedData calls these — stub them out as no-ops for the test.
  // Also re-expose top-level `const state` as a property of the sandbox object,
  // since `const`/`let` bindings aren't reflected on the context's global object.
  vm.runInContext(`
    function renderSidebar() {}
    function scheduleDiskSave() {}
    globalThis.state = state;
  `, sandbox, { filename: 'stubs.js' });

  return sandbox;
}

test('parsePostman converts a Postman v2.1 collection into Salvo shape', () => {
  const sandbox = loadSandbox();

  const postman = {
    info: { name: 'My API', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
    item: [
      {
        name: 'List Widgets',
        request: {
          method: 'get',
          header: [{ key: 'Accept', value: 'application/json' }],
          url: { raw: 'https://api.example.com/widgets?limit=10', query: [{ key: 'limit', value: '10' }] },
        },
      },
      {
        name: 'Admin',
        item: [
          {
            name: 'Delete Widget',
            request: {
              method: 'delete',
              url: { raw: 'https://api.example.com/widgets/1' },
            },
          },
        ],
      },
    ],
  };

  const col = sandbox.parsePostman(postman);

  assert.strictEqual(col.name, 'My API');
  assert.strictEqual(col.requests.length, 1);
  assert.strictEqual(col.requests[0].name, 'List Widgets');
  assert.strictEqual(col.requests[0].method, 'GET');
  assert.strictEqual(col.requests[0].url, 'https://api.example.com/widgets?limit=10');
  assert.deepEqual(col.requests[0].params, [{ id: col.requests[0].params[0].id, key: 'limit', value: '10', enabled: true }]);

  assert.strictEqual(col.folders.length, 1);
  assert.strictEqual(col.folders[0].name, 'Admin');
  assert.strictEqual(col.folders[0].requests.length, 1);
  assert.strictEqual(col.folders[0].requests[0].name, 'Delete Widget');
  assert.strictEqual(col.folders[0].requests[0].method, 'DELETE');
});

test('mergeImportedData merges into existing collections and creates new ones, skipping duplicate names', () => {
  const sandbox = loadSandbox();

  sandbox.state.cols = [
    {
      id: 'col-1', name: 'Demo', folders: [],
      requests: [
        { id: 'r1', name: 'Existing Request', method: 'GET', url: '/old', params: [], headers: [], body: { type: 'none', raw: '', formData: [] }, auth: { type: 'none' } },
      ],
    },
  ];

  const importPayload = {
    cols: [
      {
        name: 'Demo',
        requests: [
          { name: 'Existing Request', method: 'GET', url: '/dupe' },  // should be skipped
          { name: 'New Request',      method: 'POST', url: '/new' },  // should be added
        ],
        folders: [],
      },
      {
        name: 'Brand New Collection',
        requests: [],
        folders: [
          { name: 'Sub', requests: [{ name: 'Nested Request', method: 'GET', url: '/nested' }] },
        ],
      },
    ],
  };

  sandbox.mergeImportedData(importPayload);

  const demo = sandbox.state.cols.find(c => c.name === 'Demo');
  assert.strictEqual(demo.requests.length, 2);
  assert.strictEqual(demo.requests.find(r => r.name === 'Existing Request').url, '/old', 'duplicate-named request should not overwrite the existing one');
  assert.ok(demo.requests.find(r => r.name === 'New Request'), 'non-duplicate request should be added');

  const brandNew = sandbox.state.cols.find(c => c.name === 'Brand New Collection');
  assert.ok(brandNew, 'a new collection should be created for unseen names');
  assert.strictEqual(brandNew.folders.length, 1);
  assert.strictEqual(brandNew.folders[0].name, 'Sub');
  assert.strictEqual(brandNew.folders[0].requests[0].name, 'Nested Request');
});
