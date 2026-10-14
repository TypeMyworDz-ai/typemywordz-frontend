import React, { useState } from 'react';

const BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';

export const WORKER_TERMS = [
  ['Credits are your working tools', 'Each AI draft you generate for an assigned job, slice or part uses TypeMyworDz credits from your own account. You must keep enough credits topped up before and while you work. Credits you buy are your own expense of doing the job, and their use follows the Refund Policy. If your credits run out, top up before continuing so that your deadline is not affected.'],
  ['Shifts', 'Regular shifts run Monday to Friday, 3:00 p.m. to 8:00 p.m. Kenya time (Africa/Nairobi). Clock in to register attendance; you can only claim work during a scheduled shift after clocking in, or after an admin call-in. Do not clock out while you have active work. Contact an admin early if you cannot attend.'],
  ['Missed shifts and deadlines', 'Five consecutive missed shifts trigger a warning, and a sixth flags your account for admin review. Returning too many jobs after a missed deadline does the same. An admin then decides whether you retake Module 6 of the Training Room (your other modules stay passed) or complete one supervised job to rebuild your rating. You are never moved back to training without an admin\'s approval.'],
  ['Quality and ratings', 'Claiming work needs a rating of 3.5 or higher, and proofreading needs 4.5 or higher. Follow the TypeMyworDz guidelines, never paraphrase client content, and keep all client material private.'],
  ['Payment', 'Approved work is paid to your registered M-Pesa details in the two pay cycles each month (1st to 15th and 16th to month end), after any adjustments recorded for rejected or returned work.'],
];

export default function WorkerTermsGate({ userProfile, currentUser, refreshUserProfile, showMessage, onLogout }) {
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [declined, setDeclined] = useState(null);

  const respond = async (accept) => {
    if (!accept && !window.confirm('If you decline, you stay a trainee and your account will be deleted within 3 days. Decline the terms?')) return;
    setBusy(true);
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(`${BACKEND_URL}/human-transcription/worker/terms`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ accept }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || 'Your response could not be saved.');
      if (accept) {
        showMessage?.('Terms accepted. Welcome to the Work Room.', 'success');
        await refreshUserProfile?.();
      } else {
        setDeclined(payload.deletion_scheduled_at || true);
        await refreshUserProfile?.();
      }
    } catch (error) { showMessage?.(error.message, 'error'); }
    finally { setBusy(false); }
  };

  if (declined || userProfile?.workerTermsStatus === 'declined') {
    return <section className="tm-human-page" role="status"><div className="tm-human-card"><h1>You declined the worker terms</h1><p>Your account stays at trainee status and will be deleted within 3 days. If this was a mistake, contact an admin before then.</p>{onLogout ? <button type="button" className="tm-human-quote-button" onClick={onLogout}>Sign out</button> : null}</div></section>;
  }

  return <section className="tm-human-page" aria-labelledby="worker-terms-title">
    <div className="tm-human-card" style={{ maxWidth: 760, margin: '24px auto' }}>
      <p className="tm-human-eyebrow">Congratulations, you have been promoted</p>
      <h1 id="worker-terms-title">Worker terms: please read before entering the Work Room</h1>
      <p>These short terms explain how credits and shifts work so there are no surprises.</p>
      {WORKER_TERMS.map(([title, body]) => <article key={title} style={{ margin: '14px 0' }}><h3 style={{ margin: '0 0 4px' }}>{title}</h3><p style={{ margin: 0 }}>{body}</p></article>)}
      <article style={{ margin: '14px 0', padding: 12, border: '1px solid #f0c36d', borderRadius: 8 }}><h3 style={{ margin: '0 0 4px' }}>If you decline</h3><p style={{ margin: 0 }}>You can decline these terms. You will then remain at trainee status and your account will be deleted within 3 days.</p></article>
      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', margin: '16px 0' }}><input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} style={{ marginTop: 4 }} /><span>I agree to these terms, including topping up my own credits to work and following the shift rules.</span></label>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button type="button" className="tm-human-quote-button" disabled={!agreed || busy} onClick={() => respond(true)}>{busy ? 'Saving…' : 'Accept and enter the Work Room'}</button>
        <button type="button" className="tm-admin-btn tm-admin-btn-danger" disabled={busy} onClick={() => respond(false)}>Decline terms</button>
      </div>
    </div>
  </section>;
}
