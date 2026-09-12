import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';

export default function TraineeDashboard({ onBack, onOpenWork, showMessage }) {
  const { currentUser } = useAuth();
  const [data, setData] = useState(null);
  const [submission, setSubmission] = useState({ level: 1, transcript: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const request = useCallback(async (path, options = {}) => {
    const token = await currentUser.getIdToken();
    const response = await fetch(`${BACKEND_URL}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}), Authorization: `Bearer ${token}` } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || 'The Training Room request failed.');
    return payload;
  }, [currentUser]);
  const load = useCallback(async () => { try { setData(await request('/human-transcription/trainee/status')); } catch (error) { showMessage?.(error.message, 'error'); } }, [request, showMessage]);
  useEffect(() => { load(); }, [load]);
  const submitTraining = async (event) => {
    event.preventDefault(); setBusy(true);
    try { await request(`/human-transcription/trainee/training/${submission.level}/submit`, { method: 'POST', body: JSON.stringify(submission) }); showMessage?.('Training work submitted for review.', 'success'); setSubmission((current) => ({ ...current, transcript: '', notes: '' })); await load(); }
    catch (error) { showMessage?.(error.message, 'error'); } finally { setBusy(false); }
  };
  if (!data) return <section className="tm-human-page"><p>Loading Training Room…</p></section>;
  const enrolled = data.application.payment_status === 'paid' && ['enrolled', 'approved'].includes(data.application.status);
  const worker = Boolean(data.is_worker);
  if (!enrolled && !worker) return <section className="tm-human-page"><button type="button" className="tm-human-back" onClick={onBack}>← Back to workspace</button><div className="tm-human-card"><h1>Training Room is locked</h1><p>Complete the $1.50 training enrollment first. Your registration can remain pending until checkout is completed.</p></div></section>;
  const currentLevel = Math.max(1, Number(data.training.level || 1));
  return <section className="tm-human-page" aria-labelledby="trainee-title">
    <div className="tm-human-heading-row"><button type="button" className="tm-human-back" onClick={onBack}>← Back to workspace</button><span className="tm-human-kicker">Private Training Room</span></div>
    <div className="tm-human-intro"><div><h1 id="trainee-title">Your transcription training</h1><p>You are enrolled. Work through each module and practical carefully. This training develops your skills and does not guarantee employment or paid work.</p></div></div>
    <div className="tm-human-card"><p className="tm-human-eyebrow">Enrollment</p><h2>Training Room access is active</h2><p>Payment status: <strong>{data.application.payment_status.replaceAll('_', ' ')}</strong></p><p>Current level: <strong>{currentLevel}</strong> · {String(data.training.status || 'active').replaceAll('_', ' ')}</p>{worker && <><hr /><p>You have been selected for paid work.</p><button type="button" className="tm-human-send-request" onClick={onOpenWork}>Open Work Room</button></>}</div>
    {!worker && <form className="tm-human-card" onSubmit={submitTraining}><p className="tm-human-eyebrow">Submit practical work</p><label className="tm-human-field"><span>Level</span><select value={submission.level} onChange={(e) => setSubmission({ ...submission, level: Number(e.target.value) })}>{data.levels.map((level) => <option key={level.level} value={level.level}>Level {level.level}: {level.name}</option>)}</select></label><label className="tm-human-field tm-human-notes"><span>Completed transcript</span><textarea rows={10} value={submission.transcript} onChange={(e) => setSubmission({ ...submission, transcript: e.target.value })} required /></label><label className="tm-human-field tm-human-notes"><span>Notes for admin</span><textarea rows={3} value={submission.notes} onChange={(e) => setSubmission({ ...submission, notes: e.target.value })} /></label><button className="tm-human-quote-button" disabled={busy}>{busy ? 'Submitting…' : 'Submit practical for review'}</button></form>}
  </section>;
}
