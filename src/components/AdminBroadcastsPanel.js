import React, { useCallback, useEffect, useState } from 'react';

const BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';
const AUDIENCES = [
  { key: 'worker', title: 'Workers', note: 'Shown at the top of the worker room (Available Jobs and My Jobs).' },
  { key: 'home', title: 'Homepage tips', note: 'Shown in the Tips strip on the home page, for every visitor. The link text is clickable and sits before the message.' },
  { key: 'subadmin', title: 'Sub-admins', note: 'Shown at the top of the sub-admin Human Work dashboard. Workers never see these.' },
];
const blank = () => ({ id: `new-${Math.random().toString(36).slice(2, 10)}`, title: '', text: '', link_label: '', link_url: '', active: true });
const field = { padding: '8px 10px', borderRadius: 8, border: '1px solid #cfd6d1', font: 'inherit', width: '100%', boxSizing: 'border-box' };

// Super admin only. Write the messages workers and sub-admins see in the bar
// at the top of their pages. Saved changes show within a few minutes, or on refresh.
export default function AdminBroadcastsPanel({ currentUser, showMessage }) {
  const [draft, setDraft] = useState({ worker: [], subadmin: [], home: [] });
  const [saved, setSaved] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState('');

  const request = useCallback(async (method, body) => {
    const token = await currentUser.getIdToken();
    const response = await fetch(`${BACKEND_URL}/api/admin/broadcasts`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || 'The messages could not be saved.');
    return payload;
  }, [currentUser]);

  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    try {
      const payload = await request('GET');
      setDraft({ worker: payload.worker?.items || [], subadmin: payload.subadmin?.items || [], home: payload.home?.items || [] });
      setSaved({ worker: payload.worker, subadmin: payload.subadmin, home: payload.home });
    } catch (error) {
      setLoadError(error.message || 'Broadcasts are temporarily unavailable.');
    } finally { setLoading(false); }
  }, [request]);

  useEffect(() => { load(); }, [load]);

  const update = (audience, index, patch) => setDraft((current) => ({ ...current, [audience]: current[audience].map((item, i) => (i === index ? { ...item, ...patch } : item)) }));
  const remove = (audience, index) => setDraft((current) => ({ ...current, [audience]: current[audience].filter((_, i) => i !== index) }));
  const move = (audience, index, step) => setDraft((current) => {
    const list = [...current[audience]]; const target = index + step;
    if (target < 0 || target >= list.length) return current;
    [list[index], list[target]] = [list[target], list[index]];
    return { ...current, [audience]: list };
  });

  const save = async (audience, title) => {
    setBusy(audience);
    try {
      const payload = await request('PUT', { audience, items: draft[audience] });
      setDraft((current) => ({ ...current, [audience]: payload.items }));
      setSaved((current) => ({ ...current, [audience]: payload }));
      showMessage?.(`${title} messages saved.`, 'success');
    } catch (error) { showMessage?.(error.message, 'error'); } finally { setBusy(''); }
  };

  return (
    <section className="tm-admin-panel" aria-labelledby="tm-broadcasts-title">
      <h2 id="tm-broadcasts-title" style={{ marginBottom: 4 }}>Broadcasts</h2>
      <p style={{ color: '#5b665e', marginTop: 0, maxWidth: 700 }}>
        Write the announcements that appear in the green bar at the top of the worker room and the sub-admin dashboard.
        Add a link if people need to open something. Untick Show to hide a message without deleting it. No code needed.
      </p>
      {loading ? <p role="status">Loading the current messages...</p> : loadError ? (
        <div role="alert" style={{ maxWidth: 680, padding: 16, border: '1px solid #e1c7b9', borderRadius: 10, background: '#fffaf6' }}>
          <strong>Broadcasts are not available right now.</strong>
          <p style={{ margin: '6px 0 12px' }}>{loadError}</p>
          <button type="button" className="tm-admin-refresh" onClick={load}>Try again</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 18 }}>
          {AUDIENCES.map(({ key, title, note }) => (
            <article key={key} style={{ border: '1px solid #e1e6e2', borderRadius: 10, padding: 16, background: '#fff' }}>
              <header style={{ marginBottom: 12 }}>
                <strong style={{ fontSize: 17 }}>{title}</strong>
                <div style={{ fontSize: 12, color: '#6b756e', marginTop: 2 }}>{note}{saved[key]?.updated_by ? ` Last saved by ${saved[key].updated_by}.` : ''}</div>
              </header>
              {draft[key].length === 0 && <p style={{ color: '#6b756e', fontSize: 13 }}>No messages. The bar is hidden for {title.toLowerCase()}.</p>}
              <div style={{ display: 'grid', gap: 12 }}>
                {draft[key].map((item, index) => (
                  <div key={item.id} style={{ border: '1px solid #e5e9e5', borderRadius: 9, padding: 12, background: '#fafcfa', display: 'grid', gap: 8 }}>
                    <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Heading (bold label)
                      <input style={field} maxLength={80} value={item.title} placeholder="e.g. Payment update" onChange={(e) => update(key, index, { title: e.target.value })} />
                    </label>
                    <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Message
                      <textarea style={{ ...field, minHeight: 78, resize: 'vertical' }} maxLength={2000} value={item.text} onChange={(e) => update(key, index, { text: e.target.value })} />
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
                      <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Link text (optional)
                        <input style={field} maxLength={80} value={item.link_label} placeholder="Read the update" onChange={(e) => update(key, index, { link_label: e.target.value })} />
                      </label>
                      <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Link address (optional, https://)
                        <input style={field} maxLength={500} value={item.link_url} placeholder="https://" onChange={(e) => update(key, index, { link_url: e.target.value })} />
                      </label>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                        <input type="checkbox" checked={item.active !== false} onChange={(e) => update(key, index, { active: e.target.checked })} /> Show
                      </label>
                      <button type="button" className="tm-admin-refresh" disabled={index === 0} onClick={() => move(key, index, -1)}>Move up</button>
                      <button type="button" className="tm-admin-refresh" disabled={index === draft[key].length - 1} onClick={() => move(key, index, 1)}>Move down</button>
                      <button type="button" className="tm-admin-refresh" onClick={() => { if (window.confirm('Remove this message? It will disappear once you save.')) remove(key, index); }}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button type="button" className="tm-admin-refresh" disabled={draft[key].length >= 12} onClick={() => setDraft((current) => ({ ...current, [key]: [...current[key], blank()] }))}>Add message</button>
                <button type="button" className="tm-admin-refresh" disabled={busy === key} onClick={() => save(key, title)}>{busy === key ? 'Saving...' : `Save ${title.toLowerCase()} messages`}</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
