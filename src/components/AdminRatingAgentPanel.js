import React, { useCallback, useEffect, useState } from 'react';

const BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';
const FILTERS = [['pending', 'To review'], ['applied', 'Applied'], ['dismissed', 'Dismissed']];
const JOB_TYPE_ROLE = { transcriber: 'Transcriber', proofreader: 'Proofreader' };

// Super admin only. The Rating Agent (Gemini 3.8) assesses every third
// submitted job of each worker. Nothing reaches a worker until it is applied here.
export default function AdminRatingAgentPanel({ currentUser, showMessage }) {
  const [filter, setFilter] = useState('pending');
  const [rows, setRows] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busyId, setBusyId] = useState('');

  const request = useCallback(async (path, method = 'GET', body) => {
    const token = await currentUser.getIdToken();
    const response = await fetch(`${BACKEND_URL}/api/admin/worker-ratings${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || 'The rating request failed.');
    return payload;
  }, [currentUser]);

  const load = useCallback(async (quiet) => {
    if (!quiet) setLoading(true);
    setLoadError('');
    try {
      const payload = await request(`?status=${filter}`);
      setRows(payload.ratings || []);
    } catch (error) { setLoadError(error.message); } finally { setLoading(false); }
  }, [request, filter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!rows.some((row) => row.status === 'generating')) return undefined;
    const timer = window.setInterval(() => load(true), 8000);
    return () => window.clearInterval(timer);
  }, [rows, load]);

  const valueOf = (row) => ({ rating: String(drafts[row.id]?.rating ?? row.rating ?? ''), comments: drafts[row.id]?.comments ?? row.comments ?? '' });
  const setDraft = (row, patch) => setDrafts((current) => ({ ...current, [row.id]: { ...valueOf(row), ...patch } }));

  const run = async (row, action, successMessage) => {
    setBusyId(row.id);
    try {
      const current = valueOf(row);
      if (action === 'apply' && (current.rating !== String(row.rating ?? '') || current.comments !== (row.comments || ''))) {
        await request(`/${row.id}`, 'PUT', { rating: Number(current.rating), comments: current.comments });
      }
      if (action === 'save') await request(`/${row.id}`, 'PUT', { rating: Number(current.rating), comments: current.comments });
      else await request(`/${row.id}/${action}`, 'POST', {});
      showMessage?.(successMessage, 'success');
      setDrafts((all) => { const next = { ...all }; delete next[row.id]; return next; });
      await load(true);
    } catch (error) { showMessage?.(error.message, 'error'); } finally { setBusyId(''); }
  };

  return (
    <section className="tm-admin-panel" aria-labelledby="tm-rating-agent-title">
      <h2 id="tm-rating-agent-title" style={{ marginBottom: 4 }}>Rating Agent</h2>
      <p style={{ color: '#5b665e', marginTop: 0, maxWidth: 720 }}>
        Gemini 3.8 assesses every third job a worker submits against the guidelines, the job instructions and reference files, and accuracy,
        then rates the work out of 5. Review the rating and comments, change either if you disagree, and decide whether to apply it.
        This is the only way worker ratings are created. Only the Super admin sees this page.
      </p>
      <div role="tablist" style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {FILTERS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={filter === id} className="tm-admin-tab" onClick={() => setFilter(id)}>{label}</button>
        ))}
      </div>
      {loading ? <p role="status">Loading ratings...</p> : loadError ? (
        <div role="alert" style={{ maxWidth: 700, padding: 16, border: '1px solid #e1c7b9', borderRadius: 10, background: '#fffaf6' }}>
          <strong>Ratings are not available right now.</strong>
          <p style={{ margin: '6px 0 12px' }}>{loadError}</p>
          <button type="button" className="tm-admin-refresh" onClick={() => load()}>Try again</button>
        </div>
      ) : !rows.length ? (
        <p style={{ color: '#6b756e' }}>{filter === 'pending' ? 'Nothing to review yet. A rating appears here after a worker submits their third, sixth, ninth job, and so on.' : 'Nothing here yet.'}</p>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {rows.map((row) => {
            const current = valueOf(row);
            const editable = row.status === 'pending' || row.status === 'error' || row.status === 'dismissed';
            const busy = busyId === row.id;
            const changed = current.rating !== String(row.rating ?? '') || current.comments !== (row.comments || '');
            return (
              <article key={row.id} style={{ border: '1px solid #e1e6e2', borderRadius: 10, padding: 16, background: '#fff', display: 'grid', gap: 10 }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <strong>{row.worker_name || row.worker_email || 'Worker'}{row.worker_name && row.worker_email ? <span style={{ fontWeight: 400, color: '#6b756e' }}> · {row.worker_email}</span> : null}</strong>
                  <span style={{ fontSize: 12, color: '#6b756e' }}>
                    {JOB_TYPE_ROLE[row.role] || 'Worker'} · job {String(row.job_id || '').slice(0, 8)} · submission #{row.submission_number}
                    {row.created_at ? ` · ${new Date(row.created_at).toLocaleDateString()}` : ''}
                  </span>
                </header>
                {row.status === 'generating' && <p role="status" style={{ margin: 0 }}>The Rating Agent is assessing this job...</p>}
                {row.status === 'error' && <p role="alert" style={{ margin: 0, color: '#9a2b2b' }}>{row.error || 'The Rating Agent could not finish.'}</p>}
                {row.status !== 'generating' && (
                  <>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
                        Rating
                        <select aria-label="Rating out of 5" disabled={!editable} value={current.rating} onChange={(event) => setDraft(row, { rating: event.target.value })} style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #cfd6d1' }}>
                          {!current.rating && <option value="">Choose</option>}
                          <option value="5">5 · excellent</option><option value="4">4 · good</option><option value="3">3 · acceptable</option><option value="2">2 · poor</option><option value="1">1 · unusable</option>
                        </select>
                        <span style={{ color: '#6b756e' }}>/ 5</span>
                      </label>
                      {row.ai_rating != null && <span style={{ fontSize: 12, color: '#6b756e' }}>AI suggested {row.ai_rating}/5{row.edited ? ' · edited by you' : ''}{row.model ? ` · ${row.model}` : ''}</span>}
                    </div>
                    <textarea aria-label="Rating comments" disabled={!editable} value={current.comments} onChange={(event) => setDraft(row, { comments: event.target.value })} style={{ width: '100%', minHeight: 130, padding: 12, borderRadius: 8, border: '1px solid #cfd6d1', font: '14px/1.5 inherit' }} />
                  </>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {row.status !== 'generating' && editable && (
                    <>
                      <button type="button" className="tm-admin-refresh" disabled={busy || !current.rating} onClick={() => run(row, 'apply', 'Rating applied to the worker.')}>{changed ? 'Save changes and apply' : 'Apply to worker'}</button>
                      {changed && <button type="button" className="tm-admin-refresh" disabled={busy || !current.rating} onClick={() => run(row, 'save', 'Changes saved. Not applied yet.')}>Save without applying</button>}
                      {row.status !== 'dismissed' && <button type="button" className="tm-admin-refresh" disabled={busy} onClick={() => run(row, 'dismiss', 'Rating dismissed. The worker will not see it.')}>Dismiss</button>}
                      <button type="button" className="tm-admin-refresh" disabled={busy} onClick={() => run(row, 'rerun', 'The Rating Agent is assessing this job again.')}>Re-run the AI</button>
                    </>
                  )}
                  {row.status === 'applied' && <span style={{ color: '#267b40', fontSize: 13 }}>Applied to the worker{row.applied_at ? ` on ${new Date(row.applied_at).toLocaleDateString()}` : ''}.</span>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
