// Parses and pretty-prints a JSON response body off the main thread, so
// large bodies don't block the UI. See parseJsonOffMainThread() in send.js.
self.onmessage = (e) => {
  try {
    const value  = JSON.parse(e.data);
    const pretty = JSON.stringify(value, null, 2);
    self.postMessage({ ok: true, value, pretty });
  } catch {
    self.postMessage({ ok: false });
  }
};
