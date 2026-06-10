    # Salvo

A local-first HTTP client. No cloud, no accounts, no telemetry. Just a single HTML file and some JS/CSS that runs in any browser.

Built as a clean-room alternative to Postman — same core workflow, none of the lock-in.

## Features

- **Collections** — organise requests into collections and folders. Import Postman v2.x JSON.
- **Full request editing** — method, URL, query params, headers, auth (Bearer, Basic, API Key), and body (raw JSON/XML/text, form-data, x-www-form-urlencoded)
- **Environment variables** — define `{{variable}}` placeholders and swap between environments (dev, staging, prod, etc.)
- **Response viewer** — status, timing, size, collapsible JSON tree, raw body, response headers
- **cURL tab** — live curl equivalent for every request, updates as you type, one-click copy
- **Notes on params/headers** — annotate individual rows ("Dev key", "pagination cursor", etc.)
- **Request history** — every sent request logged with method, status, and timing; click to replay
- **Git sync** — push/pull collections to a GitHub repo via the GitHub Contents API. No git install required, no CLI, no terminal. Auto-push on change with a 2s debounce so teammates stay in sync.

## Running it

Salvo needs a local web server — browsers block `file://` cross-origin requests that the JS module loading depends on.

```bash
# Python (usually already installed)
python3 -m http.server 8080

# Node
npx serve .

# VS Code
# Install the "Live Server" extension, right-click index.html → Open with Live Server
```

Then open `http://localhost:8080`.

## Project structure

```
salvo/
├── index.html              — markup only, no inline JS or CSS
├── css/
│   ├── base.css            — reset, layout shell, form controls, buttons, tabs, spinner
│   ├── sidebar.css         — sidebar, resizer, collection/folder/request rows, context menu
│   ├── request.css         — URL bar, KV editor, auth editor, body editor
│   ├── response.css        — response panel, status badge, JSON tree, history panel
│   └── modals.css          — modal backdrop, git modal, env modal, toast notifications
└── js/
    ├── state.js            — global state, localStorage persistence, shared utilities
    ├── sidebar.js          — sidebar rendering, search, context menus
    ├── curl.js             — curl command generation
    ├── request.js          — request editor: tabs, KV/auth/body editors
    ├── response.js         — response panel rendering, DOM-based JSON tree
    ├── send.js             — fetch execution, request building, response parsing
    ├── collections.js      — collection/folder/request CRUD, Postman import/export
    ├── modals.js           — git settings modal, environment modal, push/pull
    └── app.js              — init, sidebar resizer, history panel
```

All JS files share the global scope and load in order. `state.js` must be first — everything else depends on it. `app.js` is last and calls `init()` to boot.

## Data model

All data lives in `localStorage` under these keys:

| Key | Contents |
|-----|----------|
| `sv_cols` | Array of collections (requests, folders, headers, params, body, auth, notes) |
| `sv_git`  | Git sync config (token, owner, repo, branch, path, auto flag) |
| `sv_envs` | Array of environments with variable maps |
| `sv_hist` | Array of recent requests (last 200), method/url/status/elapsed |

### Request shape

```json
{
  "id": "abc123",
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

## Git sync

Salvo can push and pull the full `sv_cols` collection array to a single JSON file in any GitHub repo using the GitHub Contents API (no git binary required).

**Setup:** click ⚙ Git in the topbar and fill in:
- A GitHub PAT with `repo` scope
- Owner, repo name, branch, and file path (default: `salvo.json`)

**Auto-sync:** enable the checkbox to push automatically 2 seconds after any collection change. Teammates pull to get the latest.

The commit message format is: `salvo: sync <ISO timestamp>`

## No build step

Pure HTML, CSS, and JavaScript. No framework, no bundler, no package manager. Edit any file and refresh.
