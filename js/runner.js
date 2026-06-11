// ─── Collection Runner ─────────────────────────────────────────────────────────
// Runs every request in a collection (or a single folder) sequentially,
// reusing the same buildRequestArgs/proxy/buildPmApi/runScript pipeline as
// sendRequest(), but headless (no tab/DOM updates). Progress and per-request
// results are tracked in state.runner and shown in the runner modal.

function collectRunnerRequests(col) {
  return [...col.requests, ...col.folders.flatMap(f => f.requests)];
}

async function runCollection(colId) {
  const col = state.cols.find(c => c.id === colId);
  if (!col) return;
  await runRequests(col.name, collectRunnerRequests(col));
}

async function runFolder(colId, folderId) {
  const col    = state.cols.find(c => c.id === colId);
  const folder = col?.folders.find(f => f.id === folderId);
  if (!folder) return;
  await runRequests(folder.name, folder.requests);
}

function stopRunner() {
  if (state.runner) state.runner.stopRequested = true;
}

async function runRequests(label, requests) {
  state.runner = {
    label,
    running:       true,
    stopRequested: false,
    total:         requests.length,
    completed:     0,
    results:       [],
  };
  openRunnerModal();
  renderRunnerModal();

  for (const req of requests) {
    if (state.runner.stopRequested) break;
    const result = await runSingleRequest(req);
    state.runner.results.push(result);
    state.runner.completed++;
    renderRunnerModal();
  }

  state.runner.running = false;
  renderRunnerModal();
  if (state.showHist) renderHistPanel();
  scheduleDiskSave();
}

// Headless equivalent of sendRequest() — runs pre-request/test scripts and the
// proxied request for a single saved request, without touching any open tab.
async function runSingleRequest(reqOrig) {
  const req   = clone(reqOrig);
  const start = Date.now();
  const result = {
    name: req.name, method: req.method, url: req.url,
    status: null, statusText: '', elapsed: 0, error: null, tests: null,
  };

  try {
    if (req.preRequestScript?.trim()) {
      try {
        runScript(req.preRequestScript, buildPmApi(req, null).pm);
      } catch (e) {
        throw new Error(`Pre-request script error: ${e.message}`);
      }
    }

    const { url: builtUrl, headers, bodyKind, bodyPayload, digestAuth } = await buildRequestArgs(req);
    result.url = builtUrl;

    const proxyRes = await fetch('/api/proxy', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ url: builtUrl, method: req.method, headers, bodyKind, body: bodyPayload, digestAuth }),
    });

    const data = await proxyRes.json();
    if (!data.ok) throw new Error(data.error);

    const elapsed = Date.now() - start;
    const resp = parseResponse(data, elapsed);
    result.status     = resp.status;
    result.statusText = resp.statusText;
    result.elapsed    = elapsed;

    state.hist.push({ method: req.method, url: builtUrl, status: data.status, elapsed });

    if (req.testScript?.trim()) {
      const { pm, testResults } = buildPmApi(req, resp);
      try {
        runScript(req.testScript, pm);
      } catch (e) {
        testResults.push({ name: 'Test script error', passed: false, error: e.message });
      }
      result.tests = testResults;
    }
  } catch (err) {
    result.elapsed = Date.now() - start;
    result.error = err.message;
  }

  return result;
}

// ─── Runner Modal ───────────────────────────────────────────────────────────────

function openRunnerModal() {
  document.getElementById('runner-modal').style.display = 'flex';
}

function closeRunnerModal() {
  document.getElementById('runner-modal').style.display = 'none';
}

function renderRunnerModal() {
  const r = state.runner;
  if (!r) return;

  document.getElementById('runner-title').textContent = `Run: ${r.label}`;
  document.getElementById('runner-summary').textContent =
    `${r.completed} / ${r.total} requests` + (r.running ? ' — running…' : ' — done');
  document.getElementById('runner-stop-btn').style.display = r.running ? '' : 'none';

  document.getElementById('runner-results').innerHTML = r.results.map(res => {
    const statusClass = res.error ? 'danger'
      : (res.status >= 200 && res.status < 400) ? 'success' : 'warning';
    const statusLabel = res.error ? 'Error' : `${res.status} ${esc(res.statusText || '')}`.trim();

    let testsHtml = '';
    if (res.tests) {
      const passed = res.tests.filter(t => t.passed).length;
      testsHtml = `<span class="runner-tests ${passed === res.tests.length ? 'success' : 'danger'}">${passed}/${res.tests.length} tests</span>`;
    }

    return `
      <div class="runner-item" title="${esc(res.error || res.url || '')}">
        <span class="runner-method" style="color:${MC[res.method] || 'var(--text)'}">${esc(res.method)}</span>
        <span class="runner-name">${esc(res.name)}</span>
        <span class="runner-status ${statusClass}">${statusLabel}</span>
        <span class="runner-time">${res.elapsed}ms</span>
        ${testsHtml}
      </div>`;
  }).join('');
}
