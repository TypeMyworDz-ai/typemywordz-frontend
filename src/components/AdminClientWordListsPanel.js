import React, { useCallback, useEffect, useRef, useState } from 'react';

const BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';

// Super admin only. One saved collection of client word lists that every
// Human Work agent can read. Words that appear in a job's dictation are shown
// on their own "Client Word List:" line and are left out of the spelling and
// research sections.
export default function AdminClientWordListsPanel({ currentUser, showMessage }) {
  const [text, setText] = useState('');
  const [saved, setSaved] = useState('');
  const [entryCount, setEntryCount] = useState(0);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef(null);

  const call = useCallback(async (path, options = {}) => {
    const token = await currentUser.getIdToken();
    const response = await fetch(`${BACKEND_URL}${path}`, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || 'The word list request failed.');
    return payload;
  }, [currentUser]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const payload = await call('/api/admin/client-word-lists');
      setText(payload.text || '');
      setSaved(payload.text || '');
      setEntryCount(payload.entry_count || 0);
      setUpdatedAt(payload.updated_at || null);
    } catch (error) { setLoadError(error.message); } finally { setLoading(false); }
  }, [call]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setBusy(true);
    try {
      await call('/api/admin/client-word-lists', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      showMessage?.('Client word lists saved. Agents use them from the next job.', 'success');
      await load();
    } catch (error) { showMessage?.(error.message, 'error'); } finally { setBusy(false); }
  };

  const importDocx = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const payload = await call('/api/admin/client-word-lists/extract', { method: 'POST', body: form });
      const heading = `# ${file.name.replace(/\.docx$/i, '')}`;
      setText((current) => `${current.trim() ? `${current.trim()}\n\n` : ''}${heading}\n${payload.text}`);
      showMessage?.(`Read ${payload.entry_count} entries from ${file.name}. Review the text, then press Save.`, 'success');
    } catch (error) { showMessage?.(error.message, 'error'); } finally { setBusy(false); }
  };

  const dirty = text !== saved;
  return (
    <section className="tm-admin-panel" aria-labelledby="tm-client-wordlists-title">
      <h2 id="tm-client-wordlists-title" style={{ marginBottom: 4 }}>Client word lists</h2>
      <p style={{ color: '#5b665e', marginTop: 0, maxWidth: 720 }}>
        Paste each client's word list here, or upload it as a Word (.docx) file, then save. Put a heading line starting with # above each client's words (for example # Acme Law) and separate words with commas or new lines.
        Human Work agents use these lists to confirm spelling. A word that is dictated in a job and found here appears once on the <em>Client Word List</em> line, and is not repeated under Client spellings, My spellings, I researched or Research Notes.
      </p>
      {loading ? <p role="status">Loading the word lists...</p> : loadError ? (
        <div role="alert" style={{ maxWidth: 700, padding: 16, border: '1px solid #e1c7b9', borderRadius: 10, background: '#fffaf6' }}>
          <strong>The word lists are not available right now.</strong>
          <p style={{ margin: '6px 0 12px' }}>{loadError}</p>
          <button type="button" className="tm-admin-refresh" onClick={load}>Try again</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10, maxWidth: 900 }}>
          <div style={{ fontSize: 13, color: '#6b756e' }}>
            {saved.trim() ? `Saved${updatedAt ? ` ${new Date(updatedAt).toLocaleString()}` : ''}. ${entryCount.toLocaleString()} words and phrases.` : 'No word lists are saved yet.'}
          </div>
          <textarea
            aria-label="Client word lists"
            value={text}
            onChange={(event) => setText(event.target.value)}
            spellCheck={false}
            placeholder={'# Client name\nWord one, Word two\nAnother phrase'}
            style={{ width: '100%', minHeight: 420, padding: 14, borderRadius: 10, border: '1px solid #cfd6d1', font: '14px/1.55 Georgia, serif', resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="tm-admin-refresh" disabled={busy || !dirty} onClick={save}>{busy ? 'Working...' : 'Save word lists'}</button>
            <button type="button" className="tm-admin-refresh" disabled={busy} onClick={() => fileInput.current?.click()}>Upload Word (.docx)</button>
            <button type="button" className="tm-admin-refresh" disabled={busy || !dirty} onClick={() => setText(saved)}>Discard changes</button>
            <input ref={fileInput} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={importDocx} style={{ display: 'none' }} />
          </div>
        </div>
      )}
    </section>
  );
}
