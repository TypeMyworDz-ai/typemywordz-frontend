import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';

export default function TraineeDashboard({ onBack, onOpenWork, showMessage }) {
  const { currentUser } = useAuth();
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ name: '', country: '', payment_reference: '', notes: '' });
  const [submission, setSubmission] = useState({ level: 1, transcript: '', notes: '' });
  const [busy, setBusy] = useState(false);

  const request = useCallback(async (path, options = {}) => {
    const token = await currentUser.getIdToken();
    const response = await fetch(`${BACKEND_URL}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}), Authorization: `Bearer ${token}` } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || 'The trainee request failed.');
    return payload;
  }, [currentUser]);

  const load = useCallback(async () => {
    try { setData(await request('/human-transcription/trainee/status')); } catch (error) { showMessage?.(error.message, 'error'); }
  }, [request, showMessage]);
  useEffect(() => { load(); }, [load]);

  const apply = async (event) => {
    event.preventDefault(); setBusy(true);
    try { await request('/human-transcription/trainee/apply', { method: 'POST', body: JSON.stringify(form) }); showMessage?.('Application submitted for admin review.', 'success'); await load(); }
    catch (error) { showMessage?.(error.message, 'error'); } finally { setBusy(false); }
  };

  const submitTraining = async (event) => {
    event.preventDefault(); setBusy(true);
    try { await request(`/human-transcription/trainee/training/${submission.level}/submit`, { method: 'POST', body: JSON.stringify(submission) }); showMessage?.('Training work submitted.', 'success'); setSubmission((current) => ({ ...current, transcript: '', notes: '' })); await load(); }
    catch (error) { showMessage?.(error.message, 'error'); } finally { setBusy(false); }
  };

  if (!data) return <section className="tm-human-page"><p>Loading trainee workspace…</p></section>;
  const applied = data.application.status !== 'not_started';
  const approved = ['approved', 'worker'].includes(data.application.status) || data.training.level > 0;
  return <section className="tm-human-page" aria-labelledby="trainee-title">
    <div className="tm-human-heading-row"><button type="button" className="tm-human-back" onClick={onBack}>← Back to workspace</button><span className="tm-human-kicker">Trainee pathway</span></div>
    <div className="tm-human-intro"><div><h1 id="trainee-title">Join the proofreading team</h1><p>Apply once, complete the practical levels, and move into approved work when admin signs off each stage.</p></div></div>
    {!applied && <form className="tm-human-card" onSubmit={apply}><div className="tm-human-card-top"><div><p className="tm-human-eyebrow">1 · Apply</p><h2>Tell us who you are</h2></div></div><div className="tm-human-grid"><label className="tm-human-field"><span>Name</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label><label className="tm-human-field"><span>Country</span><input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} required /></label><label className="tm-human-field"><span>Training payment reference</span><input value={form.payment_reference} onChange={(e) => setForm({ ...form, payment_reference: e.target.value })} required /></label></div><label className="tm-human-field tm-human-notes"><span>Notes</span><textarea rows={4} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Experience, languages, or anything admin should know" /></label><button className="tm-human-quote-button" disabled={busy}>{busy ? 'Submitting…' : 'Submit application'}</button></form>}
    {applied && <div className="tm-human-card"><p className="tm-human-eyebrow">Application status</p><h2>{data.application.status === 'approved' ? 'Application approved' : data.application.status === 'rejected' ? 'Application needs review' : 'Application received'}</h2><p>Payment: <strong>{data.application.payment_status.replaceAll('_', ' ')}</strong></p>{data.application.status === 'applied' && <p>Admin will verify the payment reference before training opens.</p>}{approved && <><hr /><p className="tm-human-eyebrow">Training progress</p><h3>Level {data.training.level || 1}</h3><p>{data.training.status.replaceAll('_', ' ')}</p><button type="button" className="tm-human-send-request" onClick={onOpenWork}>Open assigned work</button></>}</div>}
    {approved && <form className="tm-human-card" onSubmit={submitTraining}><p className="tm-human-eyebrow">Submit training work</p><label className="tm-human-field"><span>Level</span><select value={submission.level} onChange={(e) => setSubmission({ ...submission, level: Number(e.target.value) })}>{data.levels.map((level) => <option key={level.level} value={level.level}>Level {level.level}: {level.name}</option>)}</select></label><label className="tm-human-field tm-human-notes"><span>Completed transcript</span><textarea rows={10} value={submission.transcript} onChange={(e) => setSubmission({ ...submission, transcript: e.target.value })} required /></label><label className="tm-human-field tm-human-notes"><span>Notes for admin</span><textarea rows={3} value={submission.notes} onChange={(e) => setSubmission({ ...submission, notes: e.target.value })} /></label><button className="tm-human-quote-button" disabled={busy}>{busy ? 'Submitting…' : 'Submit level for review'}</button></form>}
  </section>;
}
