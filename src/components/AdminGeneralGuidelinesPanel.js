import React, { useCallback, useEffect, useState } from 'react';

const BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';

// Super admin only. The guidelines saved here are used by General Jobs only
// (AI agent, worker formatted draft, worker proofread). Other job types keep
// using the all-purpose guidelines in Ask TypeMyworDz > Edit guidelines.
export default function AdminGeneralGuidelinesPanel({ currentUser, showMessage }) {
  const [text, setText] = useState('');
  const [saved, setSaved] = useState('');
  const [usingDefault, setUsingDefault] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);

  const request = useCallback(async (method, body) => {
    const token = await currentUser.getIdToken();
    const response = await fetch(`${BACKEND_URL}/api/admin/general-job-guidelines`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || 'The guidelines request failed.');
    return payload;
  }, [currentUser]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const payload = await request('GET');
      setText(payload.text || '');
      setSaved(payload.text || '');
      setUsingDefault(Boolean(payload.using_default));
      setUpdatedAt(payload.updated_at || null);
    } catch (error) { setLoadError(error.message); } finally { setLoading(false); }
  }, [request]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setBusy(true);
    try {
      await request('PUT', { text });
      showMessage?.('General Jobs guidelines saved. They apply to the next General job.', 'success');
      await load();
    } catch (error) { showMessage?.(error.message, 'error'); } finally { setBusy(false); }
  };

  const reset = async () => {
    if (!window.confirm('Go back to the all-purpose guidelines for General Jobs? Your General Jobs text will be cleared.')) return;
    setBusy(true);
    try {
      await request('PUT', { reset: true });
      showMessage?.('General Jobs now use the all-purpose guidelines again.', 'success');
      await load();
    } catch (error) { showMessage?.(error.message, 'error'); } finally { setBusy(false); }
  };

  const dirty = text !== saved;
  return (
    <section className="tm-admin-panel" aria-labelledby="tm-general-guidelines-title">
      <h2 id="tm-general-guidelines-title" style={{ marginBottom: 4 }}>General Jobs guidelines</h2>
      <p style={{ color: '#5b665e', marginTop: 0, maxWidth: 700 }}>
        These guidelines are used by General Jobs only: the General Jobs agent and the worker formatted draft and proofread for General jobs.
        Template, Letter, PDF and Text Messages jobs keep using the all-purpose guidelines. Only the Super admin sees this page.
      </p>
      {loading ? <p role="status">Loading the guidelines...</p> : loadError ? (
        <div role="alert" style={{ maxWidth: 700, padding: 16, border: '1px solid #e1c7b9', borderRadius: 10, background: '#fffaf6' }}>
          <strong>The guidelines are not available right now.</strong>
          <p style={{ margin: '6px 0 12px' }}>{loadError}</p>
          <button type="button" className="tm-admin-refresh" onClick={load}>Try again</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10, maxWidth: 900 }}>
          <div style={{ fontSize: 13, color: '#6b756e' }}>
            {usingDefault
              ? 'No separate General Jobs guidelines are saved yet, so General jobs currently use the all-purpose guidelines shown below. Edit and save to give General Jobs their own copy.'
              : `Saved${updatedAt ? ` ${new Date(updatedAt).toLocaleString()}` : ''}. ${text.length.toLocaleString()} characters.`}
          </div>
          <textarea
            aria-label="General Jobs guidelines"
            value={text}
            onChange={(event) => setText(event.target.value)}
            spellCheck={false}
            style={{ width: '100%', minHeight: 460, padding: 14, borderRadius: 10, border: '1px solid #cfd6d1', font: '14px/1.55 Georgia, serif', resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="tm-admin-refresh" disabled={busy || !dirty || !text.trim()} onClick={save}>{busy ? 'Saving...' : 'Save guidelines'}</button>
            <button type="button" className="tm-admin-refresh" disabled={busy || !dirty} onClick={() => setText(saved)}>Discard changes</button>
            {!usingDefault && <button type="button" className="tm-admin-refresh" disabled={busy} onClick={reset}>Use all-purpose guidelines</button>}
          </div>
        </div>
      )}
    </section>
  );
}
