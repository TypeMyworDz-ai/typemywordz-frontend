import React, { useEffect, useState } from 'react';

const BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';

export default function TraineeReviewDialog({ trainee, currentUser, onClose, onDecision, busy = false }) {
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState('');
  const [redoLevels, setRedoLevels] = useState([]);
  const [redoMessage, setRedoMessage] = useState('');

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
    if (!confirming) return;
    if ((confirming === 'promote_worker' || confirming === 'reject') && !ready) return;
    if (confirming === 'invite_redo' && !redoLevels.length) return;
    const extra = confirming === 'invite_redo' ? { levels: redoLevels, message: redoMessage.trim() } : {};
    const saved = await onDecision(trainee.uid || trainee.id, confirming, extra);
    if (saved) setConfirming('');
  };

  return <div className="tm-training-review-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="tm-training-review-dialog" role="dialog" aria-modal="true" aria-labelledby="tm-training-review-title">
      <header className="tm-training-review-head"><div><p className="tm-admin-kicker">Final training review</p><h2 id="tm-training-review-title">{trainee.name || 'Trainee'} · {trainee.email}</h2><span>Review all six module submissions before deciding on Work Room access.</span></div><button type="button" className="tm-training-review-close" onClick={onClose} aria-label="Close training review">×</button></header>
      <div className="tm-training-review-body">
        {loading ? <div className="tm-admin-empty">Loading saved answers and practical work…</div> : error ? <div className="tm-training-review-error" role="alert">{error}</div> : <>
          {!ready && <div className="tm-training-review-error">The saved record is incomplete. Promotion remains disabled until every module and the final transcript are present.</div>}
          {modules.map((module) => <article className="tm-training-review-module" key={module.level}>
            <div className="tm-training-review-module-head"><div><span>Module {module.level}</span><h3>{module.name}</h3></div><strong className={module.status === 'submitted' ? 'is-complete' : ''}>{module.status === 'submitted' ? 'Submitted' : module.status === 'redo_requested' ? 'Redo invited' : 'Missing'}</strong>{module.status !== 'redo_requested' && <button type="button" className="tm-admin-btn" onClick={() => { setRedoLevels([module.level]); setConfirming('invite_redo'); }}>Invite to redo this module</button>}</div>
            {module.status !== 'submitted' ? <p className="tm-training-review-muted">No completed submission was saved for this module.</p> : <>
              <div className="tm-training-review-checks"><strong>Checklist</strong>{(module.answers?.checklist || []).map((item, index) => <div key={`${module.level}-${index}`}><span aria-hidden="true">{item.checked ? '✓' : '—'}</span><span>{item.label}</span></div>)}</div>
              <div className="tm-training-review-answer"><strong>Knowledge check</strong><p>{module.answers?.quiz_question || 'No question saved'}</p><span>{module.answers?.quiz_answer || 'No answer saved'} · {module.answers?.quiz_answer_correct ? 'Correct' : 'Needs review'}</span></div>
              <div className="tm-training-review-answer"><strong>Written response</strong><p className="tm-training-review-prewrap">{module.answers?.activity || 'No response saved.'}</p></div>
              {module.transcript && <div className="tm-training-review-answer"><strong>{module.level === 6 ? 'Final Human Job transcript' : 'Practical transcript'}</strong><pre>{module.transcript}</pre></div>}
              {module.notes && <div className="tm-training-review-answer"><strong>Additional notes</strong><p className="tm-training-review-prewrap">{module.notes}</p></div>}
            </>}
          </article>)}
          {!confirming && <div className="tm-training-review-decision"><p>{ready ? 'After reviewing the full record, decide whether the trainee meets the quality standard for paid work. You can also invite them to redo modules, or keep them on the waitlist if there is no open position.' : 'The saved record is incomplete, but you can still invite the trainee to redo modules or keep them on the waitlist.'}</p><div>{ready && <button type="button" className="tm-admin-btn" onClick={() => setConfirming('promote_worker')}>Promote to worker</button>}<button type="button" className="tm-admin-btn" onClick={() => { setRedoLevels([1, 2, 3, 4, 5, 6]); setConfirming('invite_redo'); }}>Invite to redo all modules</button><button type="button" className="tm-admin-btn" onClick={() => setConfirming('waitlist')}>Passed, no open position: waitlist</button>{ready && <button type="button" className="tm-admin-btn tm-admin-btn-danger" onClick={() => setConfirming('reject')}>Decline trainee</button>}</div></div>}
          {confirming === 'invite_redo' && <div className="tm-training-review-confirm" role="alert"><strong>Invite {trainee.name || 'this trainee'} to redo {redoLevels.length === 6 ? 'all modules' : `module${redoLevels.length > 1 ? 's' : ''} ${redoLevels.join(', ')}`}?</strong><div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, margin: '8px 0' }}>{[1, 2, 3, 4, 5, 6].map((n) => <label key={n}><input type="checkbox" checked={redoLevels.includes(n)} onChange={(event) => setRedoLevels((current) => event.target.checked ? [...current, n].sort() : current.filter((x) => x !== n))} /> Module {n}</label>)}</div><textarea rows={3} style={{ width: '100%' }} placeholder="Optional note for the trainee, for example what to improve" value={redoMessage} onChange={(event) => setRedoMessage(event.target.value)} /><p>Their earlier answers stay on record. The chosen modules reopen on their dashboard right away.</p><div><button type="button" className="tm-admin-btn" disabled={busy || !redoLevels.length} onClick={finishDecision}>{busy ? 'Saving…' : 'Send invitation'}</button><button type="button" className="tm-admin-btn" disabled={busy} onClick={() => setConfirming('')}>Cancel</button></div></div>}
          {confirming && confirming !== 'invite_redo' && <div className="tm-training-review-confirm" role="alert"><strong>{confirming === 'promote_worker' ? 'Confirm worker promotion?' : confirming === 'waitlist' ? 'Move this trainee to the waitlist?' : 'Confirm decline?'}</strong><p>{confirming === 'promote_worker' ? 'This grants access to the Work Room and available paid jobs. They will move to the Workers tab.' : confirming === 'waitlist' ? 'They will see that they completed the training successfully, that no position is open, and that they are on the waitlist for future work.' : 'This closes the trainee’s training access. Their saved training record remains available to admins.'}</p><div><button type="button" className="tm-admin-btn" disabled={busy} onClick={finishDecision}>{busy ? 'Saving…' : confirming === 'promote_worker' ? 'Confirm promotion' : confirming === 'waitlist' ? 'Confirm waitlist' : 'Confirm decline'}</button><button type="button" className="tm-admin-btn" disabled={busy} onClick={() => setConfirming('')}>Cancel</button></div></div>}
        </>}
      </div>
    </section>
  </div>;
}
