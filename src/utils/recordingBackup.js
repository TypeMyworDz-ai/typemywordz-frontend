// Keeps a recording safe on the client's own device while it is being made,
// so a crash or a closed tab does not lose it. Nothing here leaves the browser.
const DB = 'tmwz-rec';
const STORE = 'parts';

const open = (name, store) =>
  new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no indexedDB')); return; }
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const run = async (name, store, mode, fn) => {
  try {
    const db = await open(name, store);
    return await new Promise((resolve) => {
      const tx = db.transaction(store, mode);
      let out;
      try { out = fn(tx.objectStore(store)); } catch (e) { out = undefined; }
      tx.oncomplete = () => { db.close(); resolve(out && out.result !== undefined ? out.result : out); };
      tx.onerror = () => { db.close(); resolve(undefined); };
    });
  } catch (e) {
    return undefined;
  }
};

export const saveChunk = (n, blob) => run(DB, STORE, 'readwrite', (s) => s.put(blob, n));
export const saveMeta = (meta) => run(DB, STORE, 'readwrite', (s) => s.put(meta, 'meta'));
export const clearBackup = () => run(DB, STORE, 'readwrite', (s) => s.clear());

const readAll = async () => {
  try {
    const db = await open(DB, STORE);
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE);
      const out = {};
      const cur = tx.objectStore(STORE).openCursor();
      cur.onsuccess = (e) => {
        const c = e.target.result;
        if (c) { out[c.key] = c.value; c.continue(); }
      };
      tx.oncomplete = () => { db.close(); resolve(out); };
      tx.onerror = () => { db.close(); resolve({}); };
    });
  } catch (e) {
    return {};
  }
};

export const hasBackup = async () => {
  const all = await readAll();
  return Object.keys(all).some((k) => k !== 'meta');
};

export const loadBackup = async () => {
  const all = await readAll();
  const keys = Object.keys(all).filter((k) => k !== 'meta').sort((a, b) => a - b);
  if (!keys.length) return null;
  const meta = all.meta || {};
  const type = meta.type || 'audio/webm';
  return { blob: new Blob(keys.map((k) => all[k]), { type }), type, ext: meta.ext || 'webm' };
};

// A recording sent over from the free online recorder tool.
export const takeHandoff = async () => {
  try {
    const db = await open('tmwz-handoff', 'files');
    const rec = await new Promise((resolve) => {
      const tx = db.transaction('files', 'readwrite');
      const store = tx.objectStore('files');
      const get = store.get('recording');
      let value;
      get.onsuccess = () => { value = get.result; if (value) store.delete('recording'); };
      tx.oncomplete = () => { db.close(); resolve(value); };
      tx.onerror = () => { db.close(); resolve(undefined); };
    });
    return rec && rec.blob ? rec : null;
  } catch (e) {
    return null;
  }
};
