import React, { useCallback, useEffect, useState } from 'react';

// Workers see the ratings that were applied to them and can dispute one they think was unfair.
export default function WorkerRatingsPanel({ request, showMessage }) {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [draftFor, setDraftFor] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { const payload = await request('/human-transcription/worker/ratings'); setRows(payload.ratings || []); } catch { /* the rating card above still works */ }
  }, [request]);
  useEffect(() => { load(); }, [load]);

  const submit = async (row) => {
    setBusy(true);
    try {
      await request(`/human-transcription/worker/ratings/${row.id}/dispute`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) });
      showMessage?.('Your dispute was sent to the admin for review.', 'success');
      setDraftFor(''); setReason(''); await load();
    } catch (error) { showMessage?.(error.message, 'error'); } finally { setBusy(false); }
  };

  if (!rows.length) return null;
  return (
    <section className="tm-worker-ratings" aria-label="Your recent ratings" style={{ margin: '12px 0', border: '1px solid #e1e6e2', borderRadius: 10, background: '#fff' }}>
      <button type="button" className="tm-admin-btn" onClick={() => setOpen(!open)} aria-expanded={open} style={{ width: '100%', textAlign: 'center' }}>
        {open ? 'Hide my recent ratings' : `My recent ratings (${rows.length}) and disputes`}
      </button>
      {open && (
        <div style={{ display: 'grid', gap: 10, padding: 12 }}>
          {rows.map((row) => (
            <article key={row.id} style={{ border: '1px solid #e9ede9', borderRadius: 8, padding: 12 }}>
              <strong>{row.rating}/5</strong> <span style={{ color: '#6b756e', fontSize: 12 }}>job {String(row.job_id || '').slice(0, 8)}{row.applied_at ? ` · ${new Date(row.applied_at).toLocaleDateString()}` : ''}</span>
              {row.comments && <p style={{ whiteSpace: 'pre-wrap', margin: '6px 0' }}>{row.comments}</p>}
              {row.dispute_status === 'open' && <p style={{ color: '#7a5b00', margin: 0 }}>Dispute sent. An admin will review it.</p>}
              {row.dispute_status === 'resolved' && <p style={{ color: '#267b40', margin: 0 }}>Dispute reviewed. {row.dispute_resolution}</p>}
              {!row.dispute_status && draftFor !== row.id && <button type="button" className="tm-admin-btn" onClick={() => { setDraftFor(row.id); setReason(''); }}>Dispute this rating</button>}
              {draftFor === row.id && (
                <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                  <textarea aria-label="Why do you think this rating is unfair?" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain what you think was unfair, with examples." style={{ minHeight: 90, padding: 10, borderRadius: 8, border: '1px solid #cfd6d1' }} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="tm-admin-btn" disabled={busy || reason.trim().length < 20} onClick={() => submit(row)}>Send dispute</button>
                    <button type="button" className="tm-admin-btn" disabled={busy} onClick={() => setDraftFor('')}>Cancel</button>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
