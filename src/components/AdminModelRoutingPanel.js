import React, { useCallback, useEffect, useState } from 'react';

const BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';
const SLOTS = ['Primary model', 'Fallback 1', 'Fallback 2'];

const sameList = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);

// Super admin only. Choose which AI model each kind of job uses first, and
// which models take over if it fails. Changes apply within about 30 seconds,
// with no code change or redeploy.
export default function AdminModelRoutingPanel({ currentUser, showMessage }) {
  const [routes, setRoutes] = useState([]);
  const [models, setModels] = useState([]);
  const [draft, setDraft] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState('');
  const [loadError, setLoadError] = useState('');

  const request = useCallback(async (method, body) => {
    const token = await currentUser.getIdToken();
    const response = await fetch(`${BACKEND_URL}/api/admin/model-routing`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || 'The model settings could not be saved.');
    return payload;
  }, [currentUser]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const payload = await request('GET');
      if (!Array.isArray(payload.routes) || !payload.routes.length || !Array.isArray(payload.models) || !payload.models.length) {
        throw new Error('The server returned incomplete model-routing settings. Please try again.');
      }
      setRoutes(payload.routes || []);
      setModels(payload.models || []);
      setDraft(Object.fromEntries((payload.routes || []).map((route) => [route.key, [...route.models]])));
    } catch (error) { setLoadError(error.message || 'Model settings are temporarily unavailable.'); showMessage?.(error.message, 'error'); } finally { setLoading(false); }
  }, [request, showMessage]);

  useEffect(() => { load(); }, [load]);

  const choose = (key, slot, value) => {
    setDraft((current) => {
      const next = [...(current[key] || [])];
      next[slot] = value;
      return { ...current, [key]: next.filter(Boolean) };
    });
  };

  const save = async (route, reset) => {
    setBusyKey(route.key);
    try {
      await request('PUT', { key: route.key, models: draft[route.key] || [], reset: Boolean(reset) });
      showMessage?.(reset ? `${route.label} is back on its default models.` : `${route.label} saved. It applies to the next job.`, 'success');
      await load();
    } catch (error) { showMessage?.(error.message, 'error'); } finally { setBusyKey(''); }
  };

  const label = (id) => models.find((model) => model.id === id)?.label || id;

  return (
    <section className="tm-admin-panel" aria-labelledby="tm-model-routing-title">
      <h2 id="tm-model-routing-title" style={{ marginBottom: 4 }}>Model routing</h2>
      <p style={{ color: '#5b665e', marginTop: 0, maxWidth: 680 }}>
        Choose the model each kind of job tries first, then the models it falls back to if that one fails.
        Changes apply to the next job within about 30 seconds. Only the Super admin sees this section.
      </p>
      {loading ? <p role="status">Loading the current settings...</p> : loadError ? (
        <div role="alert" style={{ maxWidth: 680, padding: 16, border: '1px solid #e1c7b9', borderRadius: 10, background: '#fffaf6' }}>
          <strong>Model settings are not available right now.</strong>
          <p style={{ margin: '6px 0 12px' }}>{loadError}</p>
          <button type="button" className="tm-admin-refresh" onClick={load}>Try again</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {routes.map((route) => {
            const current = draft[route.key] || [];
            const dirty = !sameList(current, route.models);
            return (
              <article key={route.key} style={{ border: '1px solid #e1e6e2', borderRadius: 10, padding: 16, background: '#fff' }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                  <strong>{route.label}</strong>
                  <span style={{ fontSize: 12, color: '#6b756e' }}>
                    {route.customised ? 'Customised' : 'Default'} &middot; default: {route.default.map(label).join(' then ')}
                  </span>
                </header>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
                  {SLOTS.map((slotName, slot) => (
                    <label key={slotName} style={{ display: 'grid', gap: 4, fontSize: 13 }}>
                      {slotName}
                      <select
                        value={current[slot] || ''}
                        disabled={slot > 0 && !current[slot - 1]}
                        onChange={(event) => choose(route.key, slot, event.target.value)}
                        style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #cfd6d1' }}
                      >
                        {slot > 0 && <option value="">None</option>}
                        {models.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button type="button" className="tm-admin-refresh" disabled={!dirty || busyKey === route.key || !current.length} onClick={() => save(route, false)}>
                    {busyKey === route.key ? 'Saving...' : 'Save'}
                  </button>
                  {route.customised && (
                    <button type="button" className="tm-admin-refresh" disabled={busyKey === route.key} onClick={() => save(route, true)}>Reset to default</button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
