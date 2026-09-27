import React, { useEffect, useState } from 'react';

const BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';

export default function TraineeReviewDialog({ trainee, currentUser, onClose, onDecision, busy = false }) {
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true); setError('');
      try {
        const token = await currentUser.getIdToken();
        const response = await fetch(`${BACKEND_URL}/api/admin/trainees/${encodeURIComponent(trainee.uid || trainee.id)}/submissions`, { headers: { Authorization: `Bearer ${token}` } });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.detail || 'This trainee’s training record could not be loaded.');
        if (!cancelled) setRecord(payload);
      } catch (loadError) { if (!cancelled) setError(loadError.message); }
      finally { if (!cancelled) setLoading(false); }
    };
    load();
    return () => { cancelled = true; };
  }, [currentUser, trainee.id, trainee.uid]);

  const modules = record?.modules || [];
  const ready = record?.complete === true && modules.length === 6;
  const finishDecision = async () => {
    if (!confirming || !ready) return;
    const saved = await onDecision(trainee.uid || trainee.id, confirming);
    if (saved) setConfirming('');
  };

  return <div className="tm-training-review-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="tm-training-review-dialog" role="dialog" aria-modal="true" aria-labelledby="tm-training-review-title">
      <header className="tm-training-review-head"><div><p className="tm-admin-kicker">Final training review</p><h2 id="tm-training-review-title">{trainee.name || 'Trainee'} · {trainee.email}</h2><span>Review all six module submissions before deciding on Work Room access.</span></div><button type="button" className="tm-training-review-close" onClick={onClose} aria-label="Close training review">×</button></header>
      <div className="tm-training-review-body">
        {loading ? <div className="tm-admin-empty">Loading saved answers and practical work…</div> : error ? <div className="tm-training-review-error" role="alert">{error}</div> : <>
          {!ready && <div className="tm-training-review-error">The saved record is incomplete. Promotion remains disabled until every module and the final transcript are present.</div>}
          {modules.map((module) => <article className="tm-training-review-module" key={module.level}>
            <div className="tm-training-review-module-head"><div><span>Module {module.level}</span><h3>{module.name}</h3></div><strong className={module.status === 'submitted' ? 'is-complete' : ''}>{module.status === 'submitted' ? 'Submitted' : 'Missing'}</strong></div>
            {module.status !== 'submitted' ? <p className="tm-training-review-muted">No completed submission was saved for this module.</p> : <>
              <div className="tm-training-review-checks"><strong>Checklist</strong>{(module.answers?.checklist || []).map((item, index) => <div key={`${module.level}-${index}`}><span aria-hidden="true">{item.checked ? '✓' : '—'}</span><span>{item.label}</span></div>)}</div>
              <div className="tm-training-review-answer"><strong>Knowledge check</strong><p>{module.answers?.quiz_question || 'No question saved'}</p><span>{module.answers?.quiz_answer || 'No answer saved'} · {module.answers?.quiz_answer_correct ? 'Correct' : 'Needs review'}</span></div>
              <div className="tm-training-review-answer"><strong>Written response</strong><p className="tm-training-review-prewrap">{module.answers?.activity || 'No response saved.'}</p></div>
              {module.transcript && <div className="tm-training-review-answer"><strong>{module.level === 6 ? 'Final Human Job transcript' : 'Practical transcript'}</strong><pre>{module.transcript}</pre></div>}
              {module.notes && <div className="tm-training-review-answer"><strong>Additional notes</strong><p className="tm-training-review-prewrap">{module.notes}</p></div>}
            </>}
          </article>)}
          {ready && !confirming && <div className="tm-training-review-decision"><p>After reviewing the full record, decide whether the trainee meets the quality standard for paid work.</p><div><button type="button" className="tm-admin-btn" onClick={() => setConfirming('promote_worker')}>Promote to worker</button><button type="button" className="tm-admin-btn tm-admin-btn-danger" onClick={() => setConfirming('reject')}>Decline trainee</button></div></div>}
          {ready && confirming && <div className="tm-training-review-confirm" role="alert"><strong>{confirming === 'promote_worker' ? 'Confirm worker promotion?' : 'Confirm decline?'}</strong><p>{confirming === 'promote_worker' ? 'This grants access to the Work Room and available paid jobs.' : 'This closes the trainee’s training access. Their saved training record remains available to admins.'}</p><div><button type="button" className="tm-admin-btn" disabled={busy} onClick={finishDecision}>{busy ? 'Saving…' : confirming === 'promote_worker' ? 'Confirm promotion' : 'Confirm decline'}</button><button type="button" className="tm-admin-btn" disabled={busy} onClick={() => setConfirming('')}>Cancel</button></div></div>}
        </>}
      </div>
    </section>
  </div>;
}
