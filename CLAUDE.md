# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Salvo is a local-first HTTP client — a lightweight Postman alternative. Single-page app, pure HTML/CSS/JS, no framework, no build step, no dependencies. Runs from a local web server.

## Running locally

```bash
python3 -m http.server 8080
# or: npx serve .
# then open http://localhost:8080
```

Must use a server — `file://` won't work due to browser security restrictions on script loading.

## Architecture

All JS files share the **global browser scope** and are loaded as plain `<script>` tags in `index.html`. There are no modules, no imports, no exports. Load order matters — `state.js` must come first. Functions defined in one file are freely callable from any other.

### JS files and their responsibilities

| File | Owns |
|------|------|
| `js/state.js` | Global `state` object, `SK` storage keys, `MC` method colours, `persist()`, `scheduleAutoSave()`, `uid()`, `clone()`, `esc()`, `interp()`, `notify()`, `demoCollection()` |
| `js/sidebar.js` | `renderSidebar()`, collection/folder/request HTML generation, `toggleCol()`, `toggleFolder()`, `showCtxMenu()`, `hideCtxMenu()`, `colCtx()`, `reqCtx()` |
| `js/curl.js` | `buildCurl()`, `curlPanelHTML()`, `copyCurl()` |
| `js/request.js` | `showReqEditor()`, `syncReqEditor()`, `renderReqPanel()`, `switchReqTab()`, `updateTabBadges()`, `kvEditorHTML()`, `kvToggle/Set/Del/Add()`, `authHTML()`, `authTypeChange/Set()`, `bodyHTML()`, `bodyTypeChange/Set()`, `onMethodChange()`, `onReqNameChange()` |
| `js/response.js` | `renderRespPanel()`, `switchRespTab()`, `copyResponse()`, `buildJsonTree()` |
| `js/send.js` | `sendRequest()`, `cancelReq()`, `buildRequestArgs()`, `parseResponse()` |
| `js/collections.js` | `findReq()`, `selectReq()`, `addCollection/Folder/Req()`, `deleteCol/Req()`, `dupReq()`, `renameCol()`, `exportCol()`, `importFile()`, `parsePostman()` |
| `js/modals.js` | `openGitModal()`, `saveGitCfg()`, `gitPush()`, `gitPull()`, `setGitStatus()`, `openEnvModal()`, `closeEnvModal()`, `renderEnvModal()`, `renderEnvList()`, `renderEnvDetail()`, `envSelect/Rename/SetVar/DelVar/AddVar/Use/Delete()`, `addEnv()`, `getSelEnv()` |
| `js/app.js` | `init()`, `setupResizer()`, `toggleHistPanel()`, `renderHistPanel()`, `replayHistory()`, `clearHistory()` |

> **Note:** `css/curl.js` is a stray file — it is not loaded by `index.html` and should be ignored. The active curl code is `js/curl.js`.

### CSS files and their responsibilities

| File | Owns |
|------|------|
| `css/base.css` | Reset, `#app`/`#workspace`/`#main` layout, `#topbar`, form controls, buttons (`.btn-primary`, `.btn-danger`), `.tabbar`/`.tab`/`.tab-badge`, `.panel`, `.spinner` |
| `css/sidebar.css` | `#sidebar`, `#resizer`, `.col-header`, `.col-arrow`, `.col-name`, `.col-body`, `.folder-header`, `.req-row`, `.req-method`, `.req-name`, `.ctx-menu`, `.ctx-item` |
| `css/request.css` | `#empty-state`, `#url-bar`, `#req-name-input`, `.kv-grid`, `.kv-grid-notes`, `.kv-note`, `.kv-del`, `.kv-add`, `.body-types`, `#body-raw-area`, `.auth-row` |
| `css/response.css` | `#resp-section`, `#resp-header`, `.resp-label`, `.status-badge`, `#resp-body-wrap`, JSON tree classes (`.jt-*`), `#hist-panel`, `.hist-item` |
| `css/modals.css` | `.modal-bg`, `.modal`, `.modal-footer`, `.env-layout`, `.env-item`, `.env-kv-grid`, `.notif` (toasts) |

## State shape

```js
state = {
  // persisted to localStorage
  cols:    [],          // array of Collection objects
  git:     { token, owner, repo, branch, path, auto },
  envs:    [],          // array of { id, name, vars: {} }
  hist:    [],          // array of { method, url, status, elapsed } — capped at 200

  // runtime only
  activeEnv:       'default',
  activeReqId:     null,
  req:             null,   // working copy — auto-saved back to cols after 500ms
  resp:            null,
  reqTab:          'params', // 'params' | 'headers' | 'auth' | 'body' | 'curl'
  respTab:         'body',   // 'body' | 'headers'
  loading:         false,
  expandedCols:    Set,
  expandedFolders: Set,
  showHist:        false,
  envSelId:        'default',
  abortCtrl:       null,
  autoSyncTimer:   null,
}
```

### Collection shape

```js
{
  id: String,
  name: String,
  folders: [{ id, name, requests: [Request] }],
  requests: [Request],
}
```

### Request shape

```js
{
  id: String,
  name: String,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS',
  url: String,                          // may contain {{variables}}
  params:  [{ id, key, value, enabled, note }],
  headers: [{ id, key, value, enabled, note }],
  body: {
    type: 'none' | 'raw' | 'formdata' | 'urlencoded',
    raw: String,
    contentType: 'json' | 'xml' | 'html' | 'text',
    formData: [{ id, key, value, enabled }],
  },
  auth: {
    type: 'none' | 'bearer' | 'basic' | 'apikey',
    token: String,
    username: String, password: String,
    apiKey: String, apiValue: String,
  },
}
```

## Key conventions

**HTML generation** — most dynamic UI is built by returning HTML strings from functions (`kvEditorHTML`, `authHTML`, `bodyHTML`, `curlPanelHTML`, `colHTML`, etc.) and assigning to `el.innerHTML`. Inline `onclick`/`oninput` handlers reference global functions by name. The exception is `buildJsonTree()` which builds DOM nodes directly to avoid XSS risks with arbitrary API response content.

**`esc(s)`** — always use this when interpolating user-controlled strings into HTML. Don't skip it.

**`interp(s)`** — replaces `{{var}}` placeholders with values from the active environment. Call this in `send.js` when building the actual fetch request, not when storing/displaying.

**`scheduleAutoSave()`** — debounces (500ms) saving `state.req` back into `state.cols` + `localStorage`, then chains into `scheduleAutoGitPush()` (2s debounce) if auto-sync is enabled. Call it from any function that mutates `state.req`. Don't call `persist()` directly from request editor functions.

**`persist()`** — saves all four `state` slices to localStorage. Call it from collection CRUD operations, history updates, and settings saves. Not from per-keystroke handlers (use `scheduleAutoSave` instead).

**Tab rendering** — `renderReqPanel()` is the single dispatcher for the request editor panel. Adding a new tab means: adding a button to `#req-tabbar` in `index.html`, adding a case in the `switch` in `renderReqPanel()`, and implementing the HTML-returning function.

**Git sync** — `gitPush()` and `gitPull()` in `modals.js` use the GitHub Contents API (`PUT /repos/:owner/:repo/contents/:path`). Push requires fetching the current file SHA first to avoid conflicts. The payload is base64-encoded JSON of `state.cols`.

## Things to be aware of

- **No module system** — all functions are global. Name collisions will cause silent bugs. Keep function names specific (e.g. `renderEnvList` not `renderList`).
- **`Set` objects in state** (`expandedCols`, `expandedFolders`) are runtime-only — they don't serialise to JSON, so they're not persisted and are always initialised fresh.
- **Working copy pattern** — `state.req` is a `clone()` of the selected request. Edits go there first, then auto-save writes it back to `state.cols`. Always use `clone()` when copying a request object to avoid shared references.
- **innerHTML vs DOM** — use `innerHTML` for rendering panels and sidebar rows (strings are `esc()`'d). Use DOM methods (`createElement`, `appendChild`) when rendering untrusted content like API response bodies (`buildJsonTree`).
- **localStorage keys** are prefixed `sv_` (Salvo). Don't change them without a migration — it will wipe users' saved data.
