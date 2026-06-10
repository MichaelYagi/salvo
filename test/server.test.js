'use strict';

// Tests for the data layer in server.js: filename sanitization/dedup and the
// saveData()/loadData() round trip against data/. Uses Node's built-in test
// runner — run with `node --test`.

const test = require('node:test');
const assert = require('node:assert');
const fs   = require('fs');
const os   = require('os');
const path = require('path');

// server.js reads SALVO_DATA_DIR at module-load time, so set it before requiring.
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'salvo-test-'));
process.env.SALVO_DATA_DIR = DATA_DIR;

const { sanitizeName, uniqueName, buildColsFromFiles, loadData, saveData, parseDigestChallenge, buildDigestHeader } = require('../server.js');

function resetData() {
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

test('sanitizeName replaces illegal filesystem characters and falls back to "untitled"', () => {
  assert.strictEqual(sanitizeName('My/Coll:ection*?'), 'My_Coll_ection__');
  assert.strictEqual(sanitizeName('   '), 'untitled');
  assert.strictEqual(sanitizeName(''), 'untitled');
});

test('uniqueName de-duplicates case-insensitively with (2), (3), ...', () => {
  const used = new Set();
  assert.strictEqual(uniqueName('Request', used), 'Request');
  assert.strictEqual(uniqueName('Request', used), 'Request (2)');
  assert.strictEqual(uniqueName('request', used), 'request (3)');
});

test('buildColsFromFiles groups requests, nests folders, and reads _salvo/*', () => {
  const files = [
    { path: 'Demo/Get Users.json', content: JSON.stringify({ name: 'Get Users', method: 'GET', url: '/users' }) },
    { path: 'Demo/Create User.json', content: JSON.stringify({ name: 'Create User', method: 'POST', url: '/users', folder: 'Admin' }) },
    { path: '_salvo/envs.json', content: JSON.stringify([{ id: 'e1', name: 'Dev', vars: {} }]) },
    { path: '_salvo/history.json', content: JSON.stringify([{ method: 'GET', url: '/x', status: 200, elapsed: 12 }]) },
    { path: 'not-json.txt', content: 'ignored' },
  ];

  const { cols, envs, hist } = buildColsFromFiles(files);

  assert.strictEqual(cols.length, 1);
  assert.strictEqual(cols[0].name, 'Demo');
  assert.strictEqual(cols[0].requests.length, 1);
  assert.strictEqual(cols[0].requests[0].name, 'Get Users');
  assert.strictEqual(cols[0].folders.length, 1);
  assert.strictEqual(cols[0].folders[0].name, 'Admin');
  assert.strictEqual(cols[0].folders[0].requests[0].name, 'Create User');
  assert.deepStrictEqual(envs, [{ id: 'e1', name: 'Dev', vars: {} }]);
  assert.deepStrictEqual(hist, [{ method: 'GET', url: '/x', status: 200, elapsed: 12 }]);
});

test('saveData + loadData round trip preserves collections, folders, envs, and history', () => {
  resetData();

  const cols = [
    {
      name: 'Demo',
      requests: [
        { id: 'r1', name: 'Get Users', method: 'GET', url: '/users', params: [], headers: [], body: { type: 'none', raw: '', formData: [] }, auth: { type: 'none' } },
      ],
      folders: [
        {
          id: 'f1', name: 'Admin', requests: [
            { id: 'r2', name: 'Create User', method: 'POST', url: '/users', params: [], headers: [], body: { type: 'none', raw: '', formData: [] }, auth: { type: 'none' } },
          ],
        },
      ],
    },
  ];
  const envs = [{ id: 'default', name: 'No Environment', vars: {} }];
  const hist = [{ method: 'GET', url: '/users', status: 200, elapsed: 10 }];

  saveData({ cols, envs, hist });

  // On-disk layout: flat <Collection>/<Request>.json, folder requests get a "folder" field, ids stripped
  assert.ok(fs.existsSync(path.join(DATA_DIR, 'Demo', 'Get Users.json')));
  assert.ok(fs.existsSync(path.join(DATA_DIR, 'Demo', 'Create User.json')));

  const createUser = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'Demo', 'Create User.json'), 'utf8'));
  assert.strictEqual(createUser.folder, 'Admin');
  assert.strictEqual(createUser.id, undefined);

  const loaded = loadData();
  assert.strictEqual(loaded.cols.length, 1);
  assert.strictEqual(loaded.cols[0].name, 'Demo');
  assert.strictEqual(loaded.cols[0].requests[0].name, 'Get Users');
  assert.strictEqual(loaded.cols[0].folders[0].name, 'Admin');
  assert.strictEqual(loaded.cols[0].folders[0].requests[0].name, 'Create User');
  assert.deepStrictEqual(loaded.envs, envs);
  assert.deepStrictEqual(loaded.hist, hist);
});

test('saveData removes deleted collection directories and de-duplicates request file names', () => {
  resetData();

  saveData({ cols: [{ name: 'A', requests: [{ name: 'Req' }], folders: [] }], envs: [], hist: [] });
  assert.ok(fs.existsSync(path.join(DATA_DIR, 'A')));

  saveData({ cols: [{ name: 'B', requests: [{ name: 'Req' }, { name: 'Req' }], folders: [] }], envs: [], hist: [] });

  assert.ok(!fs.existsSync(path.join(DATA_DIR, 'A')), 'old collection directory should be removed');
  assert.ok(fs.existsSync(path.join(DATA_DIR, 'B', 'Req.json')));
  assert.ok(fs.existsSync(path.join(DATA_DIR, 'B', 'Req (2).json')));
});

test('saveData wipes a collection\'s old request files when a request is renamed', () => {
  resetData();

  saveData({ cols: [{ name: 'A', requests: [{ name: 'Old Name' }], folders: [] }], envs: [], hist: [] });
  assert.ok(fs.existsSync(path.join(DATA_DIR, 'A', 'Old Name.json')));

  saveData({ cols: [{ name: 'A', requests: [{ name: 'New Name' }], folders: [] }], envs: [], hist: [] });

  assert.ok(!fs.existsSync(path.join(DATA_DIR, 'A', 'Old Name.json')), 'stale request file should be removed');
  assert.ok(fs.existsSync(path.join(DATA_DIR, 'A', 'New Name.json')));
});

test('parseDigestChallenge parses quoted and unquoted directives', () => {
  const out = parseDigestChallenge('Digest realm="testrealm@host.com", qop="auth", nonce="abc123", opaque="xyz", algorithm=MD5');
  assert.deepStrictEqual(out, { realm: 'testrealm@host.com', qop: 'auth', nonce: 'abc123', opaque: 'xyz', algorithm: 'MD5' });
});

test('buildDigestHeader computes a response matching RFC 2617\'s worked example', () => {
  // RFC 2617 §3.5 example vectors (algorithm=MD5, qop=auth)
  const creds = { username: 'Mufasa', password: 'Circle Of Life' };
  const challenge = { realm: 'testrealm@host.com', nonce: 'dcd98b7102dd2f0e8b11d0f600bfb0c093', qop: 'auth', opaque: '5ccc069c403ebaf9f0171e9517f40e41' };

  const header = buildDigestHeader(creds, 'GET', '/dir/index.html', challenge);
  const fields = parseDigestChallenge(header);

  assert.strictEqual(fields.username, 'Mufasa');
  assert.strictEqual(fields.realm, challenge.realm);
  assert.strictEqual(fields.nonce, challenge.nonce);
  assert.strictEqual(fields.opaque, challenge.opaque);
  assert.strictEqual(fields.qop, 'auth');
  assert.strictEqual(fields.nc, '00000001');
  assert.match(fields.response, /^[a-f0-9]{32}$/);

  // The response should be reproducible with the same nc/cnonce
  const md5 = s => require('crypto').createHash('md5').update(s).digest('hex');
  const ha1 = md5(`${creds.username}:${challenge.realm}:${creds.password}`);
  const ha2 = md5(`GET:/dir/index.html`);
  const expected = md5(`${ha1}:${challenge.nonce}:${fields.nc}:${fields.cnonce}:${challenge.qop}:${ha2}`);
  assert.strictEqual(fields.response, expected);
});

test.after(() => {
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
});
