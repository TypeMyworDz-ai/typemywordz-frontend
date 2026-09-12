import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';

export default function TraineeDashboard({ onBack, onOpenWork, showMessage }) {
  const { currentUser } = useAuth();
  const [data, setData] = useState(null);
  const [submission, setSubmission] = useState({ level: 4, transcript: '', notes: '' });
  const [busy, setBusy] = useState(false);

  const request = useCallback(async (path, options = {}) => {
    const token = await currentUser.getIdToken();
    const response = await fetch(`${BACKEND_URL}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}), Authorization: `Bearer ${token}` } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || 'The Training Room request failed.');
    return payload;
  }, [currentUser]);

  const load = useCallback(async () => {
    try { setData(await request('/human-transcription/trainee/status')); }
    catch (error) { showMessage?.(error.message, 'error'); }
  }, [request, showMessage]);

  useEffect(() => { load(); }, [load]);

  const submitTraining = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await request(`/human-transcription/trainee/training/${submission.level}/submit`, { method: 'POST', body: JSON.stringify(submission) });
      showMessage?.('Practical submitted for admin review.', 'success');
      setSubmission((current) => ({ ...current, transcript: '', notes: '' }));
      await load();
    } catch (error) { showMessage?.(error.message, 'error'); }
    finally { setBusy(false); }
  };

  if (!data) return <section className="tm-human-page"><p>Loading Training Room…</p></section>;
  const enrolled = data.application.payment_status === 'paid' && ['enrolled', 'approved'].includes(data.application.status);
  const worker = Boolean(data.is_worker);
  if (!enrolled && !worker) return <section className="tm-human-page"><button type="button" className="tm-human-back" onClick={onBack}>← Back to workspace</button><div className="tm-human-card"><h1>Training Room is locked</h1><p>Complete the training enrollment first. Your registration can remain pending until checkout is completed.</p></div></section>;

  const currentLevel = Math.max(1, Number(data.training.level || 1));
  const levels = Array.isArray(data.levels) ? data.levels : [];
  const activeModule = levels.find((item) => Number(item.level) === currentLevel) || levels[0];
  const guidelines = data.guidelines || { title: 'Human-work guidelines', sections: [] };
  const submissions = data.training.submissions || {};
  const practicalLevels = levels.filter((item) => item.kind === 'practical' && Number(item.level) <= currentLevel);

  return <section className="tm-human-page" aria-labelledby="trainee-title">
    <div className="tm-human-heading-row"><button type="button" className="tm-human-back" onClick={onBack}>← Back to workspace</button><span className="tm-human-kicker">Private Training Room</span></div>
    <div className="tm-human-intro"><div><h1 id="trainee-title">Your transcription training</h1><p>Payment gives you immediate access to Module 1. The first three modules are guided study and discussion; practical work begins at Module 4. Training develops your skills but does not guarantee employment or paid work.</p></div></div>
    <div className="tm-human-card"><p className="tm-human-eyebrow">Enrollment</p><h2>Training Room access is active</h2><p>Payment status: <strong>{String(data.application.payment_status).replaceAll('_', ' ')}</strong></p><p>Current module: <strong>{currentLevel}</strong> · {String(data.training.status || 'active').replaceAll('_', ' ')}</p><p className="tm-training-note">Module 1 is open automatically after successful payment. Admin review is required before the next module is opened.</p>{worker && <><hr /><p>You have been selected for paid work.</p><button type="button" className="tm-human-send-request" onClick={onOpenWork}>Open Work Room</button></>}</div>

    <section className="tm-training-modules" aria-labelledby="modules-title"><div className="tm-human-card"><p className="tm-human-eyebrow">Programme map</p><h2 id="modules-title">Training modules</h2><div className="tm-training-module-list">{levels.map((module) => { const level = Number(module.level); const open = level <= currentLevel; const complete = submissions[String(level)] === 'submitted'; return <article key={module.level} className={`tm-training-module${open ? ' tm-training-module-open' : ''}${level === currentLevel ? ' tm-training-module-current' : ''}`}><div><span className="tm-training-module-number">{level}</span><div><h3>{module.name}</h3><p>{module.description}</p></div></div><span className="tm-training-module-status">{complete ? 'Submitted' : level === currentLevel ? 'Open' : level < currentLevel ? 'Completed' : 'Locked'}</span></article>; })}</div></div></section>

    {activeModule?.kind === 'study' && <section className="tm-human-card tm-training-study"><p className="tm-human-eyebrow">Module {currentLevel} study</p><h2>{activeModule.name}</h2><p>{activeModule.description}</p>{activeModule.guidelines && <div className="tm-training-guidelines"><h3>{guidelines.title}</h3><p>{guidelines.summary}</p>{guidelines.sections.map((section) => <article key={section.title}><strong>{section.title}</strong><p>{section.body}</p></article>)}</div>}<p className="tm-training-note">Use Messages in the sidebar to discuss this module and exchange questions or examples with the admin. When the admin is satisfied with your progress, they will open the next module.</p></section>}

    {activeModule?.kind === 'practical' && !worker && <form className="tm-human-card" onSubmit={submitTraining}><p className="tm-human-eyebrow">Module {currentLevel} practical</p><h2>{activeModule.name}</h2><p>{activeModule.description}</p><label className="tm-human-field"><span>Practical module</span><select value={submission.level} onChange={(e) => setSubmission({ ...submission, level: Number(e.target.value) })}>{practicalLevels.map((level) => <option key={level.level} value={level.level}>Module {level.level}: {level.name}</option>)}</select></label><label className="tm-human-field tm-human-notes"><span>Completed transcript</span><textarea rows={10} value={submission.transcript} onChange={(e) => setSubmission({ ...submission, transcript: e.target.value })} required /></label><label className="tm-human-field tm-human-notes"><span>Notes for admin</span><textarea rows={3} value={submission.notes} onChange={(e) => setSubmission({ ...submission, notes: e.target.value })} /></label><button className="tm-human-quote-button" disabled={busy}>{busy ? 'Submitting…' : 'Submit practical for review'}</button></form>}
  </section>;
}
