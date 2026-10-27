import React, { useCallback, useEffect, useState } from 'react';

const BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';
const FILTERS = [['applied', 'Rating review'], ['disputed', 'Disputes'], ['pending', 'Needs attention'], ['instructions', 'Agent instructions']];
const JOB_TYPE_ROLE = { transcriber: 'Transcriber', proofreader: 'Proofreader' };

function InstructionsEditor({ currentUser, showMessage }) {
  const [state, setState] = useState({ loading: true, text: '', defaultText: '', usingDefault: true, fixed: '', error: '' });
  const [busy, setBusy] = useState(false);
  const call = useCallback(async (method, body) => {
    const token = await currentUser.getIdToken();
    const response = await fetch(`${BACKEND_URL}/api/admin/rating-agent-instructions`, {
      method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || 'The request failed.');
    return payload;
  }, [currentUser]);
  const load = useCallback(async () => {
    try {
      const payload = await call('GET');
      setState({ loading: false, text: payload.text || '', defaultText: payload.default_text || '', usingDefault: payload.using_default, fixed: payload.fixed_rules || '', error: '' });
    } catch (error) { setState((current) => ({ ...current, loading: false, error: error.message })); }
  }, [call]);
  useEffect(() => { load(); }, [load]);
  const save = async () => {
    setBusy(true);
    try { await call('PUT', { text: state.text }); showMessage?.('Rating Agent instructions saved. They apply to the next rating.', 'success'); await load(); }
    catch (error) { showMessage?.(error.message, 'error'); } finally { setBusy(false); }
  };
  const reset = async () => {
    if (!window.confirm('Go back to the default instructions? Your edits will be removed.')) return;
    setBusy(true);
    try { await call('PUT', { reset: true }); showMessage?.('Default instructions restored.', 'success'); await load(); }
    catch (error) { showMessage?.(error.message, 'error'); } finally { setBusy(false); }
  };
  if (state.loading) return <p role="status">Loading instructions...</p>;
  if (state.error) return <p role="alert">{state.error}</p>;
  return (
    <div style={{ display: 'grid', gap: 10, maxWidth: 860 }}>
      <p style={{ color: '#5b665e', margin: 0 }}>These are the instructions the Rating Agent follows for every rating. Edit them whenever the standard changes. {state.usingDefault ? 'Showing the built-in defaults.' : 'Showing your saved version.'}</p>
      <textarea aria-label="Rating Agent instructions" value={state.text} onChange={(event) => setState((current) => ({ ...current, text: event.target.value }))} style={{ width: '100%', minHeight: 360, padding: 12, borderRadius: 8, border: '1px solid #cfd6d1', font: '14px/1.5 inherit' }} />
      <small style={{ color: '#6b756e' }}>Always enforced, whatever you write above: {state.fixed}. The reply format is also fixed so ratings can be applied automatically.</small>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="tm-admin-refresh" disabled={busy} onClick={save}>Save instructions</button>
        <button type="button" className="tm-admin-refresh" disabled={busy || state.usingDefault} onClick={reset}>Reset to defaults</button>
      </div>
    </div>
  );
}

// Super admin only. The Rating Agent assesses every fourth submitted job and applies its rating at once.
// This page is where a rating can be reviewed, changed, or a worker's dispute settled.
export default function AdminRatingAgentPanel({ currentUser, showMessage }) {
  const [filter, setFilter] = useState('applied');
  const [rows, setRows] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [openDisputes, setOpenDisputes] = useState(0);

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
    if (filter === 'instructions') { setLoading(false); return; }
    if (!quiet) setLoading(true);
    setLoadError('');
    try {
      const payload = await request(`?status=${filter}`);
      setRows(payload.ratings || []);
      setOpenDisputes(Number(payload.open_disputes || 0));
    } catch (error) { setLoadError(error.message); } finally { setLoading(false); }
  }, [request, filter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!rows.some((row) => row.status === 'generating')) return undefined;
    const timer = window.setInterval(() => load(true), 8000);
    return () => window.clearInterval(timer);
  }, [rows, load]);

  const valueOf = (row) => ({ rating: String(drafts[row.id]?.rating ?? row.rating ?? ''), comments: drafts[row.id]?.comments ?? row.comments ?? '', note: drafts[row.id]?.note ?? '' });
  const setDraft = (row, patch) => setDrafts((current) => ({ ...current, [row.id]: { ...valueOf(row), ...patch } }));

  const run = async (row, action, successMessage) => {
    setBusyId(row.id);
    try {
      const current = valueOf(row);
      if (action === 'save') await request(`/${row.id}`, 'PUT', { rating: Number(current.rating), comments: current.comments, note: current.note });
      else await request(`/${row.id}/${action}`, 'POST', { note: current.note });
      showMessage?.(successMessage, 'success');
      setDrafts((all) => { const next = { ...all }; delete next[row.id]; return next; });
      await load(true);
    } catch (error) { showMessage?.(error.message, 'error'); } finally { setBusyId(''); }
  };

  return (
    <section className="tm-admin-panel" aria-labelledby="tm-rating-agent-title">
      <h2 id="tm-rating-agent-title" style={{ marginBottom: 4 }}>Rating Agent</h2>
      <p style={{ color: '#5b665e', marginTop: 0, maxWidth: 760 }}>
        The Rating Agent rates every fourth job a worker submits on guideline adherence, research, accuracy and double spaces after sentences,
        and applies the rating immediately. Review any rating here and change it if you disagree. Workers can dispute a rating, and disputes appear under Disputes.
      </p>
      <div role="tablist" style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {FILTERS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={filter === id} className="tm-admin-tab" onClick={() => setFilter(id)}>
            {label}{id === 'disputed' && openDisputes > 0 ? ` (${openDisputes})` : ''}
          </button>
        ))}
      </div>
      {filter === 'instructions' ? <InstructionsEditor currentUser={currentUser} showMessage={showMessage} /> : loading ? <p role="status">Loading ratings...</p> : loadError ? (
        <div role="alert" style={{ maxWidth: 700, padding: 16, border: '1px solid #e1c7b9', borderRadius: 10, background: '#fffaf6' }}>
          <strong>Ratings are not available right now.</strong>
          <p style={{ margin: '6px 0 12px' }}>{loadError}</p>
          <button type="button" className="tm-admin-refresh" onClick={() => load()}>Try again</button>
        </div>
      ) : !rows.length ? (
        <p style={{ color: '#6b756e' }}>{filter === 'disputed' ? 'No open disputes.' : filter === 'applied' ? 'No ratings yet. One appears after a worker submits their third, sixth, ninth job, and so on.' : 'Nothing here.'}</p>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {rows.map((row) => {
            const current = valueOf(row);
            const busy = busyId === row.id;
            const changed = current.rating !== String(row.rating ?? '') || current.comments !== (row.comments || '');
            const disputed = row.dispute_status === 'open';
            return (
              <article key={row.id} style={{ border: `1px solid ${disputed ? '#d9b76a' : '#e1e6e2'}`, borderRadius: 10, padding: 16, background: '#fff', display: 'grid', gap: 10 }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <strong>{row.worker_name || row.worker_email || 'Worker'}{row.worker_name && row.worker_email ? <span style={{ fontWeight: 400, color: '#6b756e' }}> · {row.worker_email}</span> : null}</strong>
                  <span style={{ fontSize: 12, color: '#6b756e' }}>
                    {JOB_TYPE_ROLE[row.role] || 'Worker'} · job {String(row.job_id || '').slice(0, 8)} · submission #{row.submission_number}
                    {row.created_at ? ` · ${new Date(row.created_at).toLocaleDateString()}` : ''}
                  </span>
                </header>
                {disputed && (
                  <div role="note" style={{ background: '#fff8e6', border: '1px solid #ecd9a5', borderRadius: 8, padding: 10 }}>
                    <strong>The worker disputes this rating</strong>
                    <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{row.dispute_reason}</p>
                  </div>
                )}
                {row.dispute_status === 'resolved' && <p style={{ margin: 0, color: '#267b40', fontSize: 13 }}>Dispute settled. {row.dispute_resolution}</p>}
                {row.status === 'generating' && <p role="status" style={{ margin: 0 }}>The Rating Agent is assessing this job...</p>}
                {row.status === 'error' && <p role="alert" style={{ margin: 0, color: '#9a2b2b' }}>{row.error || 'The Rating Agent could not finish.'}</p>}
                {row.status !== 'generating' && (
                  <>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
                        Rating
                        <select aria-label="Rating out of 5" value={current.rating} onChange={(event) => setDraft(row, { rating: event.target.value })} style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #cfd6d1' }}>
                          {!current.rating && <option value="">Choose</option>}
                          <option value="5">5 · excellent</option><option value="4">4 · good</option><option value="3">3 · acceptable</option><option value="2">2 · poor</option><option value="1">1 · unusable</option>
                        </select>
                        <span style={{ color: '#6b756e' }}>/ 5</span>
                      </label>
                      <span style={{ fontSize: 12, color: '#6b756e' }}>
                        {row.status === 'applied' ? `Applied by ${row.applied_by || 'Rating Agent'}` : row.status}
                        {row.ai_rating != null ? ` · agent gave ${row.ai_rating}/5` : ''}{row.edited ? ' · changed by an admin' : ''}{row.model ? ` · ${row.model}` : ''}
                      </span>
                    </div>
                    <textarea aria-label="Rating comments" value={current.comments} onChange={(event) => setDraft(row, { comments: event.target.value })} style={{ width: '100%', minHeight: 120, padding: 12, borderRadius: 8, border: '1px solid #cfd6d1', font: '14px/1.5 inherit' }} />
                    {disputed && <input aria-label="Note to the worker" placeholder="Note to the worker (optional)" value={current.note} onChange={(event) => setDraft(row, { note: event.target.value })} style={{ padding: 10, borderRadius: 8, border: '1px solid #cfd6d1' }} />}
                  </>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {row.status !== 'generating' && (
                    <button type="button" className="tm-admin-refresh" disabled={busy || !changed || !current.rating} onClick={() => run(row, 'save', 'Rating changed and applied to the worker.')}>Change rating</button>
                  )}
                  {disputed && <button type="button" className="tm-admin-refresh" disabled={busy || changed} onClick={() => run(row, 'resolve-dispute', 'Dispute settled. The rating stays.')}>Keep rating and close dispute</button>}
                  {row.status === 'error' && <button type="button" className="tm-admin-refresh" disabled={busy} onClick={() => run(row, 'rerun', 'The Rating Agent is assessing this job again.')}>Re-run the AI</button>}
                  {row.status === 'pending' && <button type="button" className="tm-admin-refresh" disabled={busy || !current.rating} onClick={() => run(row, 'apply', 'Rating applied to the worker.')}>Apply now</button>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
