// Document access that goes through our own backend instead of Google.
//
// The function names and shapes match what the app already calls (doc, getDoc,
// setDoc, query, where, runTransaction, onSnapshot ...), so userService.js and
// the dashboards did not have to be rewritten. The backend decides who may read
// or write each document (see db_api.py).

import { auth } from './ownauth';

const API = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';

export class Timestamp {
  constructor(ms) {
    this._ms = ms;
  }
  static fromDate(date) { return new Timestamp(date.getTime()); }
  static fromMillis(ms) { return new Timestamp(ms); }
  static now() { return new Timestamp(Date.now()); }
  get seconds() { return Math.floor(this._ms / 1000); }
  get nanoseconds() { return (this._ms % 1000) * 1e6; }
  toDate() { return new Date(this._ms); }
  toMillis() { return this._ms; }
  valueOf() { return this._ms; }
}

export const db = { type: 'postgres' };

const randomId = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  const bytes = new Uint8Array(20);
  window.crypto.getRandomValues(bytes);
  bytes.forEach((b) => { out += chars[b % chars.length]; });
  return out;
};

export class DocumentReference {
  constructor(path) {
    this.path = path;
    this.id = path.split('/').pop();
    this.type = 'document';
  }
}

export class CollectionReference {
  constructor(path) {
    this.path = path;
    this.id = path.split('/').pop();
    this.type = 'collection';
  }
}

export const collection = (parent, ...segments) => {
  const base = parent && parent.path ? [parent.path] : [];
  return new CollectionReference([...base, ...segments].join('/').replace(/\/+/g, '/'));
};

export const doc = (parent, ...segments) => {
  if (parent && parent.type === 'collection') {
    return new DocumentReference(`${parent.path}/${segments[0] || randomId()}`);
  }
  return new DocumentReference(segments.join('/').replace(/\/+/g, '/'));
};

export const where = (field, op, value) => ({ kind: 'where', field, op, value });
export const orderBy = (field, direction = 'asc') => ({ kind: 'order', field, direction });
export const limit = (count) => ({ kind: 'limit', count });
export const query = (ref, ...constraints) => ({ type: 'query', path: ref.path, constraints });

export const serverTimestamp = () => ({ __sv: 1 });
export const increment = (n) => ({ __inc: n });
export const deleteField = () => ({ __del: 1 });
export const arrayUnion = (...items) => ({ __au: items });

const encode = (value) => {
  if (value === undefined) return undefined;
  if (value instanceof Date) return { __dt: value.toISOString() };
  if (value instanceof Timestamp) return { __dt: value.toDate().toISOString() };
  if (Array.isArray(value)) return value.map((item) => { const v = encode(item); return v === undefined ? null : v; });
  if (value && typeof value === 'object') {
    const out = {};
    Object.keys(value).forEach((key) => {
      const v = encode(value[key]);
      if (v !== undefined) out[key] = v;
    });
    return out;
  }
  return value;
};

const decode = (value) => {
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 1 && keys[0] === '__dt') return new Timestamp(Date.parse(value.__dt));
    const out = {};
    keys.forEach((key) => { out[key] = decode(value[key]); });
    return out;
  }
  return value;
};

const call = async (path, body) => {
  const user = auth.currentUser;
  if (!user) {
    const error = new Error('Sign-in is required.');
    error.code = 'permission-denied';
    throw error;
  }
  const token = await user.getIdToken();
  const response = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    let detail = '';
    try { detail = (await response.json()).detail; } catch (error) { detail = ''; }
    const error = new Error(typeof detail === 'string' && detail ? detail : `Request failed (${response.status})`);
    error.code = response.status === 403 ? 'permission-denied' : response.status === 409 ? 'aborted' : 'unavailable';
    error.status = response.status;
    throw error;
  }
  return response.json();
};

class DocumentSnapshot {
  constructor(raw) {
    this.id = raw.id;
    this.ref = new DocumentReference(raw.path);
    this._exists = !!raw.exists;
    this._data = raw.exists ? decode(raw.data) : undefined;
  }
  exists() { return this._exists; }
  data() { return this._data; }
  get(field) { return this._data ? this._data[field] : undefined; }
}

class QuerySnapshot {
  constructor(docs) {
    this.docs = docs;
    this.size = docs.length;
    this.empty = docs.length === 0;
  }
  forEach(callback) { this.docs.forEach(callback); }
}

export const getDoc = async (ref) => new DocumentSnapshot(await call('/db/get', { path: ref.path }));

export const getDocs = async (target) => {
  const q = target.type === 'query' ? target : { path: target.path, constraints: [] };
  const filters = q.constraints.filter((c) => c.kind === 'where').map((c) => [c.field, c.op, encode(c.value)]);
  const orders = q.constraints.filter((c) => c.kind === 'order').map((c) => [c.field, c.direction === 'desc' ? 'DESCENDING' : 'ASCENDING']);
  const lim = q.constraints.find((c) => c.kind === 'limit');
  const result = await call('/db/query', { collection: q.path, filters, orders, limit: lim ? lim.count : null });
  return new QuerySnapshot(result.docs.map((raw) => new DocumentSnapshot(raw)));
};

const commit = (writes, checks) => call('/db/commit', { writes, checks: checks || [] });

export const setDoc = async (ref, data, options) => {
  await commit([{ op: 'set', path: ref.path, data: encode(data), merge: !!(options && options.merge) }]);
};

export const updateDoc = async (ref, data) => {
  await commit([{ op: 'update', path: ref.path, data: encode(data) }]);
};

export const deleteDoc = async (ref) => {
  await commit([{ op: 'delete', path: ref.path }]);
};

export const addDoc = async (colRef, data) => {
  const result = await commit([{ op: 'add', path: colRef.path, data: encode(data) }]);
  return new DocumentReference(`${colRef.path}/${result.ids[0]}`);
};

export const runTransaction = async (_db, updateFunction) => {
  let lastError = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const writes = [];
    const checks = [];
    const tx = {
      get: async (ref) => {
        const snap = await getDoc(ref);
        checks.push({ path: ref.path, exists: snap.exists() });
        return snap;
      },
      set: (ref, data, options) => { writes.push({ op: 'set', path: ref.path, data: encode(data), merge: !!(options && options.merge) }); return tx; },
      update: (ref, data) => { writes.push({ op: 'update', path: ref.path, data: encode(data) }); return tx; },
      delete: (ref) => { writes.push({ op: 'delete', path: ref.path }); return tx; },
    };
    // eslint-disable-next-line no-await-in-loop
    const result = await updateFunction(tx);
    try {
      // eslint-disable-next-line no-await-in-loop
      await commit(writes, checks);
      return result;
    } catch (error) {
      if (error.status !== 409) throw error;
      lastError = error;
    }
  }
  throw lastError;
};

// Live updates by polling. Calm on purpose: one check every ~12 seconds, and
// none while the tab is in the background.
export const onSnapshot = (ref, onNext, onError) => {
  let stopped = false;
  let lastSignature = null;
  let timer = null;
  const tick = async () => {
    if (stopped) return;
    if (!document.hidden) {
      try {
        const snap = await getDoc(ref);
        const signature = JSON.stringify(snap._data === undefined ? null : snap._data);
        if (!stopped && signature !== lastSignature) {
          lastSignature = signature;
          onNext(snap);
        }
      } catch (error) {
        if (onError && !stopped) onError(error);
      }
    }
    if (!stopped) timer = window.setTimeout(tick, 12000);
  };
  tick();
  return () => {
    stopped = true;
    if (timer) window.clearTimeout(timer);
  };
};
