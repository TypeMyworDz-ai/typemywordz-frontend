import React, { useCallback, useEffect, useState } from 'react';

const BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';

const ITEMS = [
  { key: 'notifications', title: 'Notifications', note: 'Every in-app notification for every client and worker.' },
  { key: 'messages', title: 'Direct messages', note: 'All direct-message conversations between people on the platform.' },
  { key: 'transcriptions', title: 'Transcriptions', note: 'All saved client transcripts (My files). Credits, payments and accounts are not touched.' },
];

// Super admin only. Clear out whole categories in one go. This cannot be undone,
// so each button asks you to type DELETE first.
export default function AdminCleanupPanel({ currentUser, showMessage }) {
  const [counts, setCounts] = useState(null);
  const [busy, setBusy] = useState('');

  const call = useCallback(async (path, options) => {
    const token = await currentUser.getIdToken();
    const response = await fetch(`${BACKEND_URL}${path}`, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, ...(options && options.body ? { 'Content-Type': 'application/json' } : {}) },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof payload.detail === 'string' ? payload.detail : 'That did not work.');
    return payload;
  }, [currentUser]);

  const load = useCallback(async () => {
    try {
      setCounts(await call('/api/admin/cleanup/counts'));
    } catch (error) {
      showMessage(error.message, 'error');
    }
  }, [call, showMessage]);

  useEffect(() => { load(); }, [load]);

  const wipe = async (item) => {
    const typed = window.prompt(`This permanently deletes ALL ${item.title.toLowerCase()} (${counts ? counts[item.key] : '?'} items) and cannot be undone.\n\nType DELETE to continue.`);
    if (typed !== 'DELETE') return;
    setBusy(item.key);
    try {
      const result = await call('/api/admin/cleanup/delete-all', { method: 'POST', body: JSON.stringify({ what: item.key, confirm: 'DELETE' }) });
      showMessage(`Deleted ${result.deleted} ${item.title.toLowerCase()}.`, 'success');
      await load();
    } catch (error) {
      showMessage(error.message, 'error');
    } finally {
      setBusy('');
    }
  };

  return (
    <section style={{ marginTop: 28 }}>
      <h3 style={{ margin: '0 0 6px' }}>Clear data</h3>
      <p style={{ margin: '0 0 14px', color: '#5b665f', fontSize: 14 }}>Delete everything in a category whenever you want a fresh start.</p>
      <div style={{ display: 'grid', gap: 10, maxWidth: 720 }}>
        {ITEMS.map((item) => (
          <article key={item.key} style={{ border: '1px solid #dfe5e1', borderRadius: 10, padding: 14, display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <div>
              <strong>{item.title}</strong>
              <span style={{ marginLeft: 8, color: '#5b665f' }}>{counts ? `${counts[item.key]} saved` : '...'}</span>
              <div style={{ fontSize: 13, color: '#5b665f', marginTop: 2 }}>{item.note}</div>
            </div>
            <button type="button" className="tm-admin-refresh" disabled={busy === item.key || (counts && counts[item.key] === 0)} onClick={() => wipe(item)}>
              {busy === item.key ? 'Deleting...' : `Delete all ${item.title.toLowerCase()}`}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
