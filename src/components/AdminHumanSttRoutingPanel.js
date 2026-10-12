import React, { useCallback, useEffect, useState } from 'react';

const BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';
const SLOTS = ['Primary provider', 'Fallback 1', 'Fallback 2'];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export default function AdminHumanSttRoutingPanel({ currentUser, showMessage }) {
  const [stages, setStages] = useState([]);
  const [providers, setProviders] = useState([]);
  const [draft, setDraft] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busyKey, setBusyKey] = useState('');

  const request = useCallback(async (method, body) => {
    const token = await currentUser.getIdToken();
    const response = await fetch(`${BACKEND_URL}/api/admin/human-work-stt-routing`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || 'The speech settings could not be saved.');
    return payload;
  }, [currentUser]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const payload = await request('GET');
      if (!Array.isArray(payload.stages) || !Array.isArray(payload.providers)) throw new Error('The server returned incomplete speech settings.');
      setStages(payload.stages);
      setProviders(payload.providers);
      setDraft(Object.fromEntries(payload.stages.map((stage) => [stage.key, { order: [...stage.order], comparison: stage.comparison || '' }])));
    } catch (error) {
      setLoadError(error.message || 'Speech settings are temporarily unavailable.');
      showMessage?.(error.message, 'error');
    } finally { setLoading(false); }
  }, [request, showMessage]);

  useEffect(() => { load(); }, [load]);

  const updateOrder = (key, slot, value) => {
    setDraft((current) => {
      const config = { ...(current[key] || { order: [], comparison: '' }) };
      const order = [...config.order];
      order[slot] = value;
      config.order = order.slice(0, slot + 1).concat(order.slice(slot + 1).filter(Boolean)).filter((provider, index, all) => provider && all.indexOf(provider) === index);
      if (config.comparison && config.order.includes(config.comparison)) config.comparison = '';
      return { ...current, [key]: config };
    });
  };

  const toggleComparison = (key, enabled) => {
    setDraft((current) => {
      const config = { ...(current[key] || { order: [], comparison: '' }) };
      config.comparison = enabled
        ? (config.comparison || providers.find((provider) => !config.order.includes(provider.id))?.id || '')
        : '';
      return { ...current, [key]: config };
    });
  };

  const updateComparison = (key, value) => setDraft((current) => ({ ...current, [key]: { ...(current[key] || {}), comparison: value } }));
  const name = (id) => providers.find((provider) => provider.id === id)?.label || id;

  const save = async (stage, reset = false) => {
    const config = draft[stage.key] || { order: [], comparison: '' };
    setBusyKey(stage.key);
    try {
      await request('PUT', { key: stage.key, order: config.order, comparison: config.comparison, reset });
      showMessage?.(reset ? `${stage.label} restored to defaults.` : `${stage.label} saved for new runs.`, 'success');
      await load();
    } catch (error) { showMessage?.(error.message, 'error'); } finally { setBusyKey(''); }
  };

  return (
    <section className="tm-admin-panel" aria-labelledby="tm-human-stt-routing-title" style={{ marginTop: 18 }}>
      <h2 id="tm-human-stt-routing-title" style={{ marginBottom: 4 }}>Human Work speech routing</h2>
      <p style={{ color: '#5b665e', marginTop: 0, maxWidth: 760 }}>
        Choose the speech service order for each stage. Optional comparison runs a second speech service alongside the primary route; it adds a separate transcript for the stage to compare. Changes apply to new runs.
      </p>
      {loading ? <p role="status">Loading speech settings...</p> : loadError ? (
        <div role="alert" style={{ maxWidth: 720, padding: 16, border: '1px solid #e1c7b9', borderRadius: 10, background: '#fffaf6' }}>
          <strong>Speech settings are not available right now.</strong>
          <p style={{ margin: '6px 0 12px' }}>{loadError}</p>
          <button type="button" className="tm-admin-refresh" onClick={load}>Try again</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {stages.map((stage) => {
            const config = draft[stage.key] || { order: [], comparison: '' };
            const dirty = !same(config, { order: stage.order, comparison: stage.comparison || '' });
            const comparisonOptions = providers.filter((provider) => !config.order.includes(provider.id));
            return (
              <article key={stage.key} style={{ border: '1px solid #e1e6e2', borderRadius: 10, padding: 16, background: '#fff' }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                  <strong>{stage.label}</strong>
                  <span style={{ fontSize: 12, color: '#6b756e' }}>
                    {stage.customised ? 'Customised' : 'Default'} · default: {stage.default.order.map(name).join(' then ')}{stage.default.comparison ? ` · comparison: ${name(stage.default.comparison)}` : ''}
                  </span>
                </header>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
                  {SLOTS.map((slotName, slot) => (
                    <label key={slotName} style={{ display: 'grid', gap: 4, fontSize: 13 }}>
                      {slotName}
                      <select
                        aria-label={`${stage.label} ${slotName}`}
                        value={config.order[slot] || ''}
                        disabled={slot > 0 && !config.order[slot - 1]}
                        onChange={(event) => updateOrder(stage.key, slot, event.target.value)}
                        style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #cfd6d1' }}
                      >
                        {slot > 0 && <option value="">None</option>}
                        {providers.map((provider) => <option key={provider.id} value={provider.id} disabled={config.order.includes(provider.id) && config.order[slot] !== provider.id}>{provider.label}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700 }}>
                    <input type="checkbox" checked={Boolean(config.comparison)} onChange={(event) => toggleComparison(stage.key, event.target.checked)} />
                    Run a second speech transcript for comparison
                  </label>
                  {Boolean(config.comparison) && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      Comparison provider
                      <select aria-label={`${stage.label} comparison provider`} value={config.comparison} onChange={(event) => updateComparison(stage.key, event.target.value)} style={{ padding: '7px 9px', borderRadius: 8, border: '1px solid #cfd6d1' }}>
                        {comparisonOptions.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}
                      </select>
                    </label>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button type="button" className="tm-admin-refresh" disabled={!dirty || busyKey === stage.key || !config.order.length} onClick={() => save(stage)}>{busyKey === stage.key ? 'Saving...' : 'Save'}</button>
                  {stage.customised && <button type="button" className="tm-admin-refresh" disabled={busyKey === stage.key} onClick={() => save(stage, true)}>Reset to default</button>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
