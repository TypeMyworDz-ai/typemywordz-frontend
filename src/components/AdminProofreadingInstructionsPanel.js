import React, { useCallback, useEffect, useState } from 'react';

const BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';
const MAX_LENGTH = 20000;

// Super admin only. These standing instructions are added to every
// Proofreading Agent run (audio, Text Messages and PDF jobs), on top of the
// agent's built-in rules. Instructions written inside a job still win; edit them whenever you like.
export default function AdminProofreadingInstructionsPanel({ currentUser, showMessage }) {
  const [text, setText] = useState('');
  const [saved, setSaved] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);

  const request = useCallback(async (method, body) => {
    const token = await currentUser.getIdToken();
    const response = await fetch(`${BACKEND_URL}/api/admin/proofreading-agent-instructions`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || 'The instructions request failed.');
    return payload;
  }, [currentUser]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const payload = await request('GET');
      setText(payload.text || '');
      setSaved(payload.text || '');
      setUpdatedAt(payload.updated_at || null);
    } catch (error) { setLoadError(error.message); } finally { setLoading(false); }
  }, [request]);

  useEffect(() => { load(); }, [load]);

  const save = async (value, message) => {
    setBusy(true);
    try {
      await request('PUT', { text: value });
      showMessage?.(message, 'success');
      await load();
    } catch (error) { showMessage?.(error.message, 'error'); } finally { setBusy(false); }
  };

  const clearAll = () => {
    if (!window.confirm('Remove all saved Proofreading Agent instructions? The agent will then have no standing proofreading rules.')) return;
    save('', 'Added instructions removed. The agent uses its built-in rules only.');
  };

  const dirty = text !== saved;
  return (
    <section className="tm-admin-panel" aria-labelledby="tm-proofreading-instructions-title">
      <h2 id="tm-proofreading-instructions-title" style={{ marginBottom: 4 }}>Proofreading Agent instructions</h2>
      <p style={{ color: '#5b665e', marginTop: 0, maxWidth: 700 }}>
        These are the Proofreading Agent's standing proofreading instructions for audio, Text Messages and PDF jobs. Other than the brief speech-transcript comparison note, it has no built-in proofreading rules. Instructions specific to a job are also supplied to the agent. Only the Super admin sees this page.
      </p>
      {loading ? <p role="status">Loading the instructions...</p> : loadError ? (
        <div role="alert" style={{ maxWidth: 700, padding: 16, border: '1px solid #e1c7b9', borderRadius: 10, background: '#fffaf6' }}>
          <strong>The instructions are not available right now.</strong>
          <p style={{ margin: '6px 0 12px' }}>{loadError}</p>
          <button type="button" className="tm-admin-refresh" onClick={load}>Try again</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10, maxWidth: 900 }}>
          <div style={{ fontSize: 13, color: '#6b756e' }}>
            {saved
              ? `Saved${updatedAt ? ` ${new Date(updatedAt).toLocaleString()}` : ''}. Next runs use these instructions.`
              : 'Nothing added yet. The agent is using its built-in rules only.'}
            {' '}{text.length.toLocaleString()} of {MAX_LENGTH.toLocaleString()} characters.
          </div>
          <textarea
            aria-label="Proofreading Agent instructions"
            value={text}
            maxLength={MAX_LENGTH}
            onChange={(event) => setText(event.target.value)}
            placeholder="For example: Always write street names in full (Street, not St.). Never add a city that was not dictated."
            spellCheck
            style={{ width: '100%', minHeight: 360, padding: 14, borderRadius: 10, border: '1px solid #cfd6d1', font: '14px/1.55 Georgia, serif', resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="tm-admin-refresh" disabled={busy || !dirty} onClick={() => save(text, 'Proofreading Agent instructions saved. They apply to the next run.')}>{busy ? 'Saving...' : 'Save instructions'}</button>
            <button type="button" className="tm-admin-refresh" disabled={busy || !dirty} onClick={() => setText(saved)}>Discard changes</button>
            {saved && <button type="button" className="tm-admin-refresh" disabled={busy} onClick={clearAll}>Remove all added instructions</button>}
          </div>
        </div>
      )}
    </section>
  );
}
