# Salvo

A local-first HTTP client. No cloud, no accounts, no telemetry. Just a small Node server and some HTML/JS/CSS.

Built as a clean-room alternative to Postman — same core workflow, none of the lock-in.

## Features

- **Collections** — organise requests into collections and folders. Import Postman v2.x JSON, or Salvo's own export format.
- **Full request editing** — method, URL, query params, headers, auth (Bearer, Basic, API Key), and body (raw JSON/XML/text, form-data, x-www-form-urlencoded)
- **Environment variables** — define `{{variable}}` placeholders and swap between environments (dev, staging, prod, etc.)
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

Then open `http://localhost:8080`. No `npm install`, no dependencies — `server.js` only uses Node's standard library.

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
    "username": "", "password": "", "apiKey": "", "apiValue": ""
  }
}
```

## Export / Import

The **Export** button (topbar) downloads a `salvo-export.json` containing all collections, folders, and requests (no environments or history — keep those local/private).

The **Import** button accepts either:
- A Salvo export (`{ "cols": [...] }`) — merged into your existing collections, matching by collection/folder name and skipping any request whose name already exists
- A Postman v2.x collection — added as a new collection

## No build step

Pure HTML, CSS, and JavaScript on the front end, plus a single stdlib-only Node server. No framework, no bundler, no package manager. Edit any file and refresh.
