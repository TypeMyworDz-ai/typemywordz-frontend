import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';

const MODULE_GUIDES = {
  1: {
    kicker: 'Orientation',
    lesson: 'A reliable transcript starts with a reliable process. Learn the brief, protect the recording, and check your work before anyone else has to.',
    checklist: ['I know the difference between a transcript and a summary.', 'I can explain why accuracy comes before speed.', 'I know where to ask the admin a question.'],
    quiz: { question: 'What should guide your first pass through a difficult recording?', options: ['Speed', 'Accuracy and meaning', 'Making every sentence sound formal'], answer: 1 },
    activity: 'Write one sentence in Messages explaining what accuracy before speed means to you.',
  },
  2: {
    kicker: 'TypeMyworDz standards',
    lesson: 'Our standard is clean, faithful work: remove obvious noise, preserve the speaker’s meaning, and research only what needs checking.',
    checklist: ['I have read the human-work guidelines.', 'I can identify a filler, a stutter, and a genuine change of wording.', 'I can explain when a proper noun needs research.'],
    quiz: { question: 'What should you do when a name is unclear?', options: ['Guess and move on', 'Check the audio and research the distinctive name when appropriate', 'Replace it with a simpler name'], answer: 1 },
    activity: 'Send the admin one example of a word that needs checking rather than rewriting.',
  },
  3: {
    kicker: 'Tools and review habits',
    lesson: 'Good transcribers use the editor deliberately. Mark uncertainties, listen again, and finish with a complete quality pass.',
    checklist: ['I know how to use timestamps and speaker labels.', 'I can keep client files private.', 'I have a repeatable final review routine.'],
    quiz: { question: 'What is the best response to a word that does not sound right?', options: ['Leave it without checking', 'Replay the audio and compare the surrounding meaning', 'Invent a word that fits the sentence'], answer: 1 },
    activity: 'Describe your three-step final review routine in Messages.',
  },
  4: {
    kicker: 'Practical one',
    lesson: 'Clean transcript exercise: remove clear disfluencies without rewriting the speaker’s meaning.',
    checklist: ['I removed only clear fillers, stutters, and duplicates.', 'I kept the speaker’s wording and order.', 'I checked the whole passage before submitting.'],
    quiz: { question: 'Which change is appropriate?', options: ['Rewriting a rough sentence to sound elegant', 'Removing an obvious repeated word', 'Adding a conclusion the speaker did not say'], answer: 1 },
    activity: 'Spot the error: “I, I think we should— we should leave now.” The clean version should remove the stutter and self-correction, not add new meaning.',
  },
  5: {
    kicker: 'Practical two',
    lesson: 'Speakers and timestamps exercise: make turns easy to follow and check the audio whenever identity or timing is uncertain.',
    checklist: ['I marked speaker changes consistently.', 'I checked timestamps against the audio.', 'I flagged uncertainty instead of guessing.'],
    quiz: { question: 'When should you add or correct a timestamp?', options: ['Only at the very end without replaying', 'When the brief requires it and after checking the audio', 'Whenever a paragraph looks too long'], answer: 1 },
    activity: 'Spot the error: two speakers are labelled Speaker 1 for the whole exchange. Explain how you would correct it.',
  },
  6: {
    kicker: 'Practical three',
    lesson: 'Client-ready delivery: apply the brief, review the complete document, and submit work that another person can use immediately.',
    checklist: ['I followed the requested format and instructions.', 'I checked names, speakers, timestamps, and completeness.', 'I can explain what I checked before delivery.'],
    quiz: { question: 'What makes a transcript client-ready?', options: ['It is fast, even if unchecked', 'It follows the brief and has been reviewed from beginning to end', 'It contains extra commentary from the transcriber'], answer: 1 },
    activity: 'Write a short delivery note explaining the checks you completed.',
  },
};

const readProgress = (uid) => {
  try { return JSON.parse(window.localStorage.getItem(`typemywordz-training-${uid}`) || '{}'); } catch { return {}; }
};

export default function TraineeDashboard({ onBack, onOpenWork, showMessage }) {
  const { currentUser } = useAuth();
  const [data, setData] = useState(null);
  const [submission, setSubmission] = useState({ level: 4, transcript: '', notes: '' });
  const [studyProgress, setStudyProgress] = useState({});
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

  useEffect(() => { load(); setStudyProgress(readProgress(currentUser?.uid)); }, [currentUser, load]);

  const updateProgress = (level, next) => {
    setStudyProgress((current) => {
      const updated = { ...current, [level]: next };
      try { window.localStorage.setItem(`typemywordz-training-${currentUser.uid}`, JSON.stringify(updated)); } catch { /* local progress is helpful but not required */ }
      return updated;
    });
  };

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

  const submitStudy = async (level) => {
    const progress = studyProgress[level] || { checked: [], answer: null };
    const guide = MODULE_GUIDES[level];
    if (progress.checked.length < guide.checklist.length || progress.answer === null) {
      showMessage?.('Complete the checklist and quiz before sending this study check-in.', 'warning');
      return;
    }
    setBusy(true);
    try {
      await request(`/human-transcription/trainee/training/${level}/submit`, { method: 'POST', body: JSON.stringify({ level, transcript: '', notes: JSON.stringify({ checklist: progress.checked, quizAnswer: progress.answer, activity: progress.activity || '' }) }) });
      showMessage?.('Study check-in sent for admin review.', 'success');
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
  const guide = MODULE_GUIDES[currentLevel] || MODULE_GUIDES[1];
  const guidelines = data.guidelines || { title: 'Human-work guidelines', sections: [] };
  const submissions = data.training.submissions || {};
  const practicalLevels = levels.filter((item) => item.kind === 'practical' && Number(item.level) <= currentLevel);
  const completedCount = levels.filter((item) => submissions[String(item.level)] === 'submitted').length;
  const progressPercent = levels.length ? Math.round((completedCount / levels.length) * 100) : 0;
  const activeProgress = studyProgress[currentLevel] || { checked: [], answer: null };
  const studyReady = activeProgress.checked.length === guide.checklist.length && activeProgress.answer !== null;

  return <section className="tm-human-page tm-training-room" aria-labelledby="trainee-title">
    <div className="tm-human-heading-row"><button type="button" className="tm-human-back" onClick={onBack}>← Back to workspace</button><span className="tm-human-kicker">Private Training Room</span></div>
    <div className="tm-human-intro tm-training-hero"><div><p className="tm-human-eyebrow">A practical path to better transcripts</p><h1 id="trainee-title">Learn the work, one quality pass at a time.</h1><p>Modules 1–3 are guided study and discussion. Practical work begins at Module 4. Training develops your skills but does not guarantee employment or paid work.</p></div><div className="tm-training-progress-card"><strong>{progressPercent}%</strong><span>programme progress</span><div className="tm-training-progress-bar"><i style={{ width: `${progressPercent}%` }} /></div><small>{completedCount} of {levels.length || 6} modules submitted</small></div></div>
    <div className="tm-human-card tm-training-access"><div><p className="tm-human-eyebrow">Your access</p><h2>Training Room is active</h2><p>Payment status: <strong>{String(data.application.payment_status).replaceAll('_', ' ')}</strong> · Current module: <strong>{currentLevel}</strong></p></div><p className="tm-training-note">Module 1 opens automatically after successful payment. Admin review opens the next module.</p>{worker && <button type="button" className="tm-human-send-request" onClick={onOpenWork}>Open Work Room</button>}</div>

    <section className="tm-training-modules" aria-labelledby="modules-title"><div className="tm-human-card"><div className="tm-training-section-head"><div><p className="tm-human-eyebrow">Programme map</p><h2 id="modules-title">Six modules, three kinds of practice</h2></div><span className="tm-training-badge">{completedCount > 0 ? 'Progress saved' : 'Start with Module 1'}</span></div><div className="tm-training-module-list">{levels.map((module) => { const level = Number(module.level); const open = level <= currentLevel; const complete = submissions[String(level)] === 'submitted'; return <article key={module.level} className={`tm-training-module${open ? ' tm-training-module-open' : ''}${level === currentLevel ? ' tm-training-module-current' : ''}`}><div><span className="tm-training-module-number">{String(level).padStart(2, '0')}</span><div><h3>{module.name}</h3><p>{module.description}</p></div></div><span className="tm-training-module-status">{complete ? 'Submitted' : level === currentLevel ? 'Open' : level < currentLevel ? 'Completed' : 'Locked'}</span></article>; })}</div></div></section>

    {activeModule?.kind === 'study' && <section className="tm-human-card tm-training-study"><p className="tm-human-eyebrow">{guide.kicker}</p><h2>{activeModule.name}</h2><p className="tm-training-lead">{guide.lesson}</p><div className="tm-training-columns"><div><h3>Quick lesson</h3><p>{activeModule.description}</p>{activeModule.guidelines && <div className="tm-training-guidelines"><h3>{guidelines.title}</h3><p>{guidelines.summary}</p>{guidelines.sections.map((section) => <article key={section.title}><strong>{section.title}</strong><p>{section.body}</p></article>)}</div>}</div><div className="tm-training-activity"><h3>Study checklist</h3>{guide.checklist.map((item, index) => <label key={item}><input type="checkbox" checked={activeProgress.checked.includes(index)} onChange={() => { const checked = activeProgress.checked.includes(index) ? activeProgress.checked.filter((value) => value !== index) : [...activeProgress.checked, index]; updateProgress(currentLevel, { ...activeProgress, checked }); }} /> <span>{item}</span></label>)}<h3>Mini quiz</h3><p>{guide.quiz.question}</p>{guide.quiz.options.map((option, index) => <label key={option} className="tm-training-option"><input type="radio" name={`quiz-${currentLevel}`} checked={activeProgress.answer === index} onChange={() => updateProgress(currentLevel, { ...activeProgress, answer: index })} /> <span>{option}</span></label>)}<p className="tm-training-activity-note">Discussion activity: {guide.activity}</p><button type="button" className="tm-human-quote-button" disabled={busy || !studyReady} onClick={() => submitStudy(currentLevel)}>{busy ? 'Sending…' : submissions[String(currentLevel)] === 'submitted' ? 'Study check-in sent' : 'Send study check-in'}</button></div></div><p className="tm-training-note">Use Messages to discuss this module and exchange questions or examples with the admin.</p></section>}

    {activeModule?.kind === 'practical' && !worker && <form className="tm-human-card tm-training-practical" onSubmit={submitTraining}><p className="tm-human-eyebrow">{guide.kicker}</p><h2>{activeModule.name}</h2><p className="tm-training-lead">{guide.lesson}</p><div className="tm-training-spot-error"><strong>Spot the error</strong><p>{guide.activity}</p></div><label className="tm-human-field"><span>Practical module</span><select value={submission.level} onChange={(e) => setSubmission({ ...submission, level: Number(e.target.value) })}>{practicalLevels.map((level) => <option key={level.level} value={level.level}>Module {level.level}: {level.name}</option>)}</select></label><label className="tm-human-field tm-human-notes"><span>Completed transcript</span><textarea rows={10} value={submission.transcript} onChange={(e) => setSubmission({ ...submission, transcript: e.target.value })} required /></label><label className="tm-human-field tm-human-notes"><span>Notes for admin</span><textarea rows={3} value={submission.notes} onChange={(e) => setSubmission({ ...submission, notes: e.target.value })} /></label><button className="tm-human-quote-button" disabled={busy}>{busy ? 'Submitting…' : 'Submit practical for review'}</button></form>}
  </section>;
}
