'use strict';

// Tests for js/runner.js's CSV/JSON Collection Runner data file parsing
// (parseCsv, parseCsvLine, parseRunnerDataFile), exercised in a vm sandbox
// since these files are written for the global browser scope (no modules/
// exports). Run with `node --test`.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadSandbox() {
  const sandbox = {
    console,
    document: { getElementById: () => null, querySelectorAll: () => [] },
    window: {},
    navigator: {},
    fetch: () => Promise.reject(new Error('fetch not available in tests')),
    setTimeout, clearTimeout,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);

  const stateSrc  = fs.readFileSync(path.join(__dirname, '../js/state.js'), 'utf8');
  const runnerSrc = fs.readFileSync(path.join(__dirname, '../js/runner.js'), 'utf8');
  vm.runInContext(stateSrc, sandbox, { filename: 'state.js' });
  vm.runInContext(runnerSrc, sandbox, { filename: 'runner.js' });

  vm.runInContext(`globalThis.state = state;`, sandbox, { filename: 'stubs.js' });

  return sandbox;
}

test('parseCsvLine splits on commas and handles quoted fields with embedded commas/quotes', () => {
  const sandbox = loadSandbox();
  assert.deepEqual(sandbox.parseCsvLine('a,b,c'), ['a', 'b', 'c']);
  assert.deepEqual(sandbox.parseCsvLine('"a,b",c'), ['a,b', 'c']);
  assert.deepEqual(sandbox.parseCsvLine('"He said ""hi"""'), ['He said "hi"']);
  assert.deepEqual(sandbox.parseCsvLine('a,,c'), ['a', '', 'c']);
});

test('parseCsv builds one row object per line, keyed by the header row', () => {
  const sandbox = loadSandbox();
  const rows = sandbox.parseCsv('userId,name\n1,Alice\n2,Bob');
  assert.deepEqual(rows, [
    { userId: '1', name: 'Alice' },
    { userId: '2', name: 'Bob' },
  ]);
});

test('parseCsv ignores blank lines and fills missing trailing cells with ""', () => {
  const sandbox = loadSandbox();
  const rows = sandbox.parseCsv('a,b,c\n1,2\n\n3,4,5');
  assert.deepEqual(rows, [
    { a: '1', b: '2', c: '' },
    { a: '3', b: '4', c: '5' },
  ]);
});

test('parseRunnerDataFile parses .csv files as CSV', () => {
  const sandbox = loadSandbox();
  const rows = sandbox.parseRunnerDataFile('id,name\n1,Alice', 'data.csv');
  assert.deepEqual(rows, [{ id: '1', name: 'Alice' }]);
});

test('parseRunnerDataFile parses .json files as a JSON array', () => {
  const sandbox = loadSandbox();
  const rows = sandbox.parseRunnerDataFile('[{"id":1},{"id":2}]', 'data.json');
  assert.deepEqual(rows, [{ id: 1 }, { id: 2 }]);
});

test('parseRunnerDataFile rejects a JSON file that is not an array', () => {
  const sandbox = loadSandbox();
  assert.throws(() => sandbox.parseRunnerDataFile('{"id":1}', 'data.json'), /array of objects/);
});
