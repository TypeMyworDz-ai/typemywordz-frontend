import React, { useCallback, useEffect, useState } from 'react';
import AskChat from './AskChat';
import { useAsk } from './AskContext';

const BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';
const STORE = 'tmwd.adminAsk.';

const readThread = (key) => {
  try { return JSON.parse(window.localStorage.getItem(STORE + key) || '[]'); } catch { return []; }
};
const writeThread = (key, messages) => {
  try { window.localStorage.setItem(STORE + key, JSON.stringify(messages.slice(-60))); } catch { /* history is a convenience only */ }
};

// Admin-only assistant. The "General" thread is always there and always
// carries the editable guidelines, so nobody has to paste them again.
export default function AdminAskPanel({ currentUser, showMessage }) {
  const { model } = useAsk();
  const [thread, setThread] = useState('general');
  const [messages, setMessages] = useState({ general: readThread('general'), blank: readThread('blank') });
  const [guidelines, setGuidelines] = useState('');
  const [savedGuidelines, setSavedGuidelines] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(`${BACKEND_URL}/api/admin/ai-guidelines`, { headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || 'The guidelines could not be loaded.');
      setGuidelines(payload.text || '');
      setSavedGuidelines(payload.text || '');
    } catch (error) { showMessage?.(error.message, 'error'); } finally { setLoading(false); }
  }, [currentUser, showMessage]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(`${BACKEND_URL}/api/admin/ai-guidelines`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ text: guidelines }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || 'The guidelines could not be saved.');
      setSavedGuidelines(guidelines);
      showMessage?.('Guidelines saved. The General thread and AI reviews use them from now on.', 'success');
    } catch (error) { showMessage?.(error.message, 'error'); } finally { setSaving(false); }
  };

  const update = (next) => {
    setMessages((current) => ({ ...current, [thread]: next }));
    writeThread(thread, next);
  };

  const clearThread = () => { update([]); };
  const dirty = guidelines !== savedGuidelines;
  const extra = thread === 'general' && guidelines.trim()
    ? `The following are TypeMyworDz's general transcription guidelines. Treat them as standing instructions for this whole conversation and apply them whenever you check, format or answer questions about transcripts.\n\n${guidelines.trim()}`
    : '';

  return (
    <div className="tm-admin-panel" style={{ display: 'grid', gap: 14 }}>
      <div className="tm-admin-table-toolbar">
        <div>
          <h2 className="tm-admin-panel-title">Ask TypeMyworDz</h2>
          <p className="tm-admin-panel-note">Your private workspace. The General thread already has the guidelines built in, so you never paste them again.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className={`tm-admin-btn${thread === 'general' ? ' is-active' : ''}`} aria-pressed={thread === 'general'} onClick={() => setThread('general')}>General</button>
          <button type="button" className={`tm-admin-btn${thread === 'blank' ? ' is-active' : ''}`} aria-pressed={thread === 'blank'} onClick={() => setThread('blank')}>Blank chat</button>
          <button type="button" className="tm-admin-btn" onClick={clearThread}>Clear this thread</button>
        </div>
      </div>

      <section className="tm-admin-panel" style={{ border: '1px solid #e5e9e5', borderRadius: 8, padding: '10px 14px' }}>
        <button type="button" className="tm-admin-btn" aria-expanded={open} onClick={() => setOpen((v) => !v)}>{open ? 'Hide guidelines' : 'Edit guidelines'}{dirty ? ' (unsaved)' : ''}</button>
        {open && (
          <div style={{ marginTop: 10 }}>
            <textarea aria-label="Guidelines placeholder" value={guidelines} disabled={loading} onChange={(event) => setGuidelines(event.target.value)} rows={14} style={{ width: '100%', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.5 }} placeholder={loading ? 'Loading the guidelines…' : 'Paste or edit the guidelines here.'} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button type="button" className="tm-admin-btn" disabled={saving || !dirty} onClick={save}>{saving ? 'Saving…' : 'Save guidelines'}</button>
              <button type="button" className="tm-admin-btn" disabled={!dirty} onClick={() => setGuidelines(savedGuidelines)}>Discard changes</button>
            </div>
          </div>
        )}
      </section>

      <div className="tm-askpage" style={{ minHeight: 520 }}>
        <AskChat
          key={thread}
          messages={messages[thread]}
          onMessagesChange={update}
          model={model}
          userPlan="free"
          userEmail={currentUser?.email || ''}
          userId={currentUser?.uid || ''}
          systemExtra={extra}
          emptyTitle={thread === 'general' ? 'General' : 'Blank chat'}
          emptyHint={thread === 'general' ? 'Guidelines are already attached to this thread. Paste a transcript and ask for a check, or ask anything about the standards.' : 'A clean conversation with no standing instructions.'}
          suggestions={[]}
        />
      </div>
    </div>
  );
}
