# Salvo

A local-first HTTP client. No cloud, no accounts, no telemetry. Just a small Node server and some HTML/JS/CSS.

Built as a clean-room alternative to Postman — same core workflow, none of the lock-in.

## Features

- **Collections** — organise requests into collections and folders. Import Postman v2.x JSON, or Salvo's own export format.
- **Multi-tab editing** — open several requests at once in browser-style tabs above the editor; each tab keeps its own edits, response, and active sub-tab.
- **Full request editing** — method, URL, query params, headers, auth, and body (raw JSON/XML/text, form-data, x-www-form-urlencoded)
- **Auth** — Bearer Token, Basic Auth, API Key, OAuth 2.0 (Client Credentials & Password Grant), Digest Auth, and JWT Bearer (HS256)
- **Environment variables** — `{{variable}}` placeholders are resolved from the active environment when sending. Switch environments from the topbar dropdown, or manage them via "Manage Env".
- **Response viewer** — status, timing, size, collapsible JSON tree, raw body, response headers. Large JSON responses (>1MB) fall back to raw text to avoid freezing the tab.
- **cURL tab** — live curl equivalent for every request, updates as you type, one-click copy
- **Notes on params/headers** — annotate individual rows ("Dev key", "pagination cursor", etc.)
- **Request history** — every sent request logged with method, status, and timing; click to replay
- **Per-request tab memory** — remembers which tab (Params/Headers/Auth/Body/cURL) you last had open for each request
- **CORS-free sending** — requests are proxied through the local server, so the browser never makes the cross-origin call directly
- **Export / Import** — export all collections to a single JSON file, share it with a team, and import it elsewhere. Imports merge with existing collections by name and skip requests with duplicate names.
- **Auto-save** — every change is saved to disk automatically (debounced), with a save-status indicator in the topbar. `Ctrl+S`/`Cmd+S` still works for an explicit save.

## Running it

Salvo needs its local server — it's what reads/writes `data/` and proxies outbound requests.

```bash
node server.js
```

Then open `http://localhost:5874`. No `npm install`, no dependencies — `server.js` only uses Node's standard library.

To use a different port, pass `--port=<port>` (or set the `PORT` env var):

```bash
node server.js --port=3000
```

## Project structure

```
salvo/
├── server.js               — stdlib-only Node server: static files + /api/data, /api/save, /api/proxy
├── data/                    — gitignored; your collections, environments, and history (plain JSON)
├── index.html               — markup only, no inline JS or CSS
├── css/
│   ├── base.css            — reset, layout shell, form controls, buttons, tabs, spinner
│   ├── sidebar.css         — sidebar, resizer, collection/folder/request rows, context menu
│   ├── request.css         — URL bar, KV editor, auth editor, body editor
│   ├── response.css        — response panel, status badge, JSON tree, history panel
│   └── modals.css          — modal backdrop, environment modal, toast notifications
└── js/
    ├── state.js            — global state, auto-save scheduling, shared utilities
    ├── sidebar.js          — sidebar rendering, search, context menus
    ├── curl.js             — curl command generation
    ├── request.js          — request editor: tabs, KV/auth/body editors
    ├── response.js         — response panel rendering, DOM-based JSON tree
    ├── send.js             — request execution (via /api/proxy), response parsing
    ├── collections.js      — collection/folder/request CRUD, Postman & Salvo import/export
    ├── modals.js           — environment modal
    └── app.js              — init, sidebar resizer, history panel, save/load
```

All JS files share the global scope and load in order. `state.js` must be first — everything else depends on it. `app.js` is last and calls `init()` to boot.

## Data storage (`data/`)

`data/` is gitignored — it holds your local collections, environments, and history as plain JSON files.

- **Collections are directories**: `data/<Collection Name>/`
- **Requests are files**: `data/<Collection Name>/<Request Name>.json`
- **Folders are not directories** — a request inside a Postman-style folder just has an extra `"folder": "<Folder Name>"` field; the layout on disk is always flat, one level deep.
- **Environments and history**: `data/_salvo/envs.json` and `data/_salvo/history.json`

### Request shape

```json
{
  "name": "Get user",
  "method": "GET",
  "url": "https://api.example.com/users/{{userId}}",
  "params":  [{ "id": "x", "key": "include", "value": "profile", "enabled": true, "note": "" }],
  "headers": [{ "id": "y", "key": "Authorization", "value": "Bearer {{token}}", "enabled": true, "note": "Dev key" }],
  "body": {
    "type": "raw",
    "raw": "{\"key\": \"value\"}",
    "contentType": "json",
    "formData": []
  },
  "auth": {
    "type": "bearer",
    "token": "{{token}}",
    "username": "", "password": "", "apiKey": "", "apiValue": "",
    "accessTokenUrl": "", "clientId": "", "clientSecret": "", "scope": "",
    "cachedToken": "", "cachedExpiry": 0,
    "jwtSecret": "", "jwtPayload": "{\"sub\":\"user123\"}"
  }
}
```

## Environment variables

Use `{{variable}}` placeholders anywhere in a request's URL, params, headers, or body — they're resolved against the **active environment** when the request is sent.

1. Click **Manage Env** in the topbar to open the environment editor.
2. Add a variable, e.g. `baseUrl` = `https://api.example.com` and `token` = `your-dev-token`.
3. Pick that environment from the dropdown next to **Manage Env**.
4. In a request, set the URL to `{{baseUrl}}/users/{{userId}}` and add a header `Authorization: Bearer {{token}}`.

`{{userId}}` would come from another environment variable, or you can leave params un-interpolated for ones you fill in per-request. Switching environments from the topbar dropdown instantly changes what every `{{...}}` placeholder resolves to — handy for flipping between dev/staging/prod without editing requests.

## Auth types

Configure auth on the **Auth** tab of a request. Salvo supports:

- **Bearer Token** — sets `Authorization: Bearer <token>`. Token field supports `{{variables}}`.
- **Basic Auth** — sets `Authorization: Basic <base64(username:password)>`.
- **API Key** — adds a custom header (or query param) with a key/value you choose.
- **OAuth 2.0 — Client Credentials** — set **Access Token URL**, **Client ID**, **Client Secret**, and optionally **Scope**. Click **Get Access Token** to fetch and cache a token, or just hit Send — Salvo fetches one automatically if none is cached (or the cached one has expired).
- **OAuth 2.0 — Password Grant** — same as above, plus **Username**/**Password**, sent with `grant_type=password`.
- **Digest Auth** — set **Username**/**Password**. Salvo sends the request, and if the server responds with a `WWW-Authenticate: Digest` challenge, transparently retries with the computed digest response — no manual nonce handling needed.
- **JWT Bearer (HS256)** — set a **Secret** and a JSON **payload** (e.g. `{"sub":"user123"}`). Salvo signs a fresh HS256 JWT at send time, adding `iat`/`exp` (1 hour) automatically if you don't specify them, and sends it as `Authorization: Bearer <jwt>`.

For OAuth2, the fetched token is cached on the request (`cachedToken`/`cachedExpiry`) and reused until it expires.

## Tabs

Opening a request from the sidebar opens it in a new tab (or focuses its existing tab if already open). Each tab keeps its own unsaved edits, response, and active sub-tab (Params/Headers/Auth/Body/cURL), so you can work on multiple requests side by side. Close a tab with its `×` button; closing the last tab returns to the "Select or create a request" empty state.

## Export / Import

The **Export** button (topbar) downloads a `salvo-export.json` containing all collections, folders, and requests (no environments or history — keep those local/private).

The **Import** button accepts either:
- A Salvo export (`{ "cols": [...] }`) — merged into your existing collections, matching by collection/folder name and skipping any request whose name already exists
- A Postman v2.x collection — added as a new collection

## Tests

```bash
node --test
```

Runs the test suite with Node's built-in test runner — no dependencies needed (Node 18+). Covers:

- `test/server.test.js` — `sanitizeName`/`uniqueName`, `buildColsFromFiles`, and the `saveData`/`loadData` round trip against a temporary data directory (the real `data/` is never touched)
- `test/server-http.test.js` — `/api/data`, `/api/save`, `/api/proxy` (raw, formdata, urlencoded bodies, and unreachable upstreams), and static file serving, against a real server instance
- `test/collections.test.js` — `parsePostman` and `mergeImportedData`, run in a sandboxed copy of the global-scope frontend JS

Run `node --test --experimental-test-coverage` for a coverage report (covers `server.js`; the sandboxed frontend tests aren't included in coverage instrumentation).

## No build step

Pure HTML, CSS, and JavaScript on the front end, plus a single stdlib-only Node server. No framework, no bundler, no package manager. Edit any file and refresh.
