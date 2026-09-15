import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';

const formatDate = (value) => {
  if (!value) return 'Just now';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Recorded' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

export default function CreditHistory({ admin = false, showMessage, onBack }) {
  const { currentUser } = useAuth();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ email: '', amount: '', reason: '', context: '' });
  const [busy, setBusy] = useState(false);

  const request = useCallback(async (path, options = {}) => {
    const idToken = await currentUser?.getIdToken();
    const response = await fetch(`${BACKEND_URL}${path}`, {
      ...options,
      headers: { ...(options.headers || {}), Authorization: `Bearer ${idToken}` },
    });
    const text = await response.text();
    let payload = {};
    try { payload = text ? JSON.parse(text) : {}; } catch { /* handled below */ }
    if (!response.ok) throw new Error(payload.detail || 'The credit history request failed.');
    return payload;
  }, [currentUser]);

  const loadHistory = useCallback(async (targetEmail = '') => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const query = admin && targetEmail ? `?email=${encodeURIComponent(targetEmail)}` : '';
      const payload = await request(`/credits/ledger${query}`);
      setEntries(payload.entries || []);
    } catch (error) {
      showMessage?.(error.message, 'error');
    } finally { setLoading(false); }
  }, [admin, currentUser, request, showMessage]);

  useEffect(() => { if (!admin) loadHistory(); else setLoading(false); }, [admin, loadHistory]);

  const submitAdjustment = async (event) => {
    event.preventDefault();
    const amount = Number(form.amount);
    if (!form.email.trim() || !Number.isInteger(amount) || amount === 0 || !form.reason.trim()) {
      showMessage?.('Enter a client email, a whole-number credit amount, and a reason.', 'error');
      return;
    }
    setBusy(true);
    try {
      await request('/api/admin/credits/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email.trim(),
          amount,
          reason: form.reason.trim(),
          context: form.context.trim() ? { note: form.context.trim() } : {},
        }),
      });
      showMessage?.(`${amount > 0 ? 'Credits added' : 'Credits removed'} and recorded.`, 'success');
      setForm({ ...form, amount: '', reason: '', context: '' });
      loadHistory(form.email.trim());
    } catch (error) {
      showMessage?.(error.message, 'error');
    } finally { setBusy(false); }
  };

  return (
    <section className="tm-human-workspace" aria-labelledby="credit-history-title">
      <div className="tm-human-workspace-head">
        <div>
          <p className="tm-human-eyebrow">{admin ? 'Account controls' : 'Your account'}</p>
          <h1 id="credit-history-title">Credit activity</h1>
          <p>{admin ? 'Make a support adjustment and leave a clear record for the client.' : 'Every addition and deduction is recorded with its reason and time.'}</p>
        </div>
        {!admin && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {onBack && <button className="tm-human-refresh" type="button" onClick={onBack}>Back to Dashboard</button>}
            <button className="tm-human-refresh" type="button" onClick={() => loadHistory()}>Refresh</button>
          </div>
        )}
      </div>

      {admin && (
        <form className="tm-human-review" onSubmit={submitAdjustment}>
          <h2>Adjust a client balance</h2>
          <p>Use a positive number to add credits or a negative number to remove them.</p>
          <label>Client email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="client@example.com" /></label>
          <label>Credit change<input type="number" step="1" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="100 or -20" /></label>
          <label>Reason<input value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="Goodwill adjustment, correction, or job" /></label>
          <label>Context (optional)<input value={form.context} onChange={(event) => setForm({ ...form, context: event.target.value })} placeholder="Job or payment reference" /></label>
          <div><button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save adjustment'}</button><button type="button" onClick={() => loadHistory(form.email.trim())}>Load client history</button></div>
        </form>
      )}

      <div className="tm-human-chat-card">
        <div className="tm-human-chat-head"><div><strong>{entries.length} recorded change{entries.length === 1 ? '' : 's'}</strong><span>Signed credit movements</span></div></div>
        {loading ? <div className="tm-human-empty">Loading credit activity…</div> : !entries.length ? <div className="tm-human-empty">No credit movements have been recorded yet.</div> : (
          <div className="tm-human-messages">
            {entries.map((entry) => (
              <article key={entry.id} className="tm-human-message">
                <div><strong className={Number(entry.amount) >= 0 ? 'tm-credit-added' : 'tm-credit-deducted'}>{Number(entry.amount) >= 0 ? '+' : ''}{entry.amount} credits</strong><time>{formatDate(entry.createdAt)}</time></div>
                <p>{entry.reason || 'Account credit update'}</p>
                {entry.context && <small>{Object.values(entry.context).filter(Boolean).join(' · ')}</small>}
                {entry.balanceAfter !== undefined && <small>Balance after: {entry.balanceAfter} credits</small>}
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
