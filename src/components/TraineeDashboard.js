import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';
const MATERIAL_PATH = '/human-transcription/trainee/training/materials/';
const EMPTY_RECORD = Object.freeze({});

const MODULE_GUIDES = {
  1: {
    kicker: 'Orientation and the craft',
    lesson: 'Transcription is careful listening turned into a useful written record. This first module introduces the TypeMyworDz workflow, the kinds of recordings you may meet, and the habits that make accurate work possible.',
    lessonSections: [
      { title: 'What transcription means', body: 'A transcript records what a speaker says in writing. It is not a summary, a rewrite, or a chance to make the speaker sound more polished. Your job is to listen carefully, follow the assignment brief, and preserve the meaning and wording that the client needs.' },
      { title: 'Why the work is harder than it looks', body: 'Recordings can contain overlapping speakers, accents, poor microphones, background noise, interruptions, repeated phrases, and technical names. Good work often requires replaying a short passage several times and checking the surrounding meaning before you commit to a word.' },
      { title: 'Where general transcription is used', body: 'General assignments may include interviews, meetings, lectures, focus groups, seminars, sermons, podcasts, webinars, panels, research interviews, dictated books, journalist interviews, memoir recordings, and online videos. Legal and medical work have additional requirements; never assume a general brief covers them.' },
      { title: 'The TypeMyworDz workflow', body: 'Read the brief, protect the source file, listen before typing, draft faithfully, mark uncertainty with the approved notation, review names and speaker changes, then complete a final quality pass before submitting. Accuracy comes before speed.' },
      { title: 'Your working setup', body: 'A desktop or laptop, reliable internet, good earphones or headphones, and a comfortable workspace are enough to begin. Listening skill, patience, discipline, research, grammar, spelling, vocabulary, and typing speed improve with practice and feedback.' },
    ],
    checklist: ['I can explain the difference between a transcript and a summary.', 'I understand why difficult audio may need repeated listening.', 'I can name at least three kinds of general-transcription assignments.', 'I know the TypeMyworDz workflow from brief to final review.', 'I know where to ask the admin a question.'],
    quiz: { question: 'What should guide your first pass through a difficult recording?', options: ['Speed, even if the words are uncertain', 'Accuracy, meaning, and the assignment brief', 'Making every sentence sound formal'], answer: 1 },
    activity: 'In your own words, describe one difficult audio situation and the first step you would take.',
  },
  2: {
    kicker: 'TypeMyworDz standards',
    lesson: 'Learn the standards that protect accuracy and make a transcript easy for a client to use. The complete supplied reference documents are included with your Module 6 final practical.',
    lessonSections: [
      { title: 'Faithful wording', body: 'Do not paraphrase, rearrange, or replace the speaker’s wording with your own. Make only the corrections allowed by the applicable client instructions.' },
      { title: 'Uncertainty notation', body: 'Use the required square-bracket notation and timestamp format when speech cannot be heard or understood. Replay the audio before marking a passage.' },
      { title: 'Paragraphs and names', body: 'Follow the dictated paragraph instructions and research unfamiliar proper nouns when appropriate. Research helps confirm spelling; it is not permission to add or rewrite content.' },
    ],
    checklist: ['I understand that I must preserve the speaker’s wording and follow the assignment brief.', 'I can distinguish a filler from a meaningful phrase.', 'I know when to use an uncertainty marker.', 'I understand the paragraphing instructions.', 'I can explain when a proper noun needs research.'],
    quiz: { question: 'What should you do when a distinctive name is unclear?', options: ['Guess and move on', 'Replay the audio and research the name when appropriate', 'Replace it with a simpler name'], answer: 1 },
    activity: 'Give one example of a decision where you should check the audio or research instead of guessing.',
  },
  3: {
    kicker: 'Tools, privacy and review habits',
    lesson: 'Reliable work comes from a repeatable review routine. Use the editor deliberately, protect client files, and leave a clear trail when something needs an admin decision.',
    lessonSections: [
      { title: 'A practical review loop', body: 'Listen to the passage, type the best-supported wording, replay uncertain sections, check the paragraph in context, and complete a final pass from beginning to end. Do not rely on a single sentence that sounds plausible.' },
      { title: 'Privacy is part of quality', body: 'Treat recordings, transcripts, names, and client instructions as confidential. Keep files inside approved tools, do not share them casually, and ask the admin before moving work to another service.' },
      { title: 'Feedback and progress', body: 'Short assignments and specific feedback are part of learning. A rejection or correction is a quality signal, not a personal failure. Apply the feedback to the next exercise and record questions in Messages.' },
    ],
    checklist: ['I know how to use timestamps and speaker labels.', 'I can keep client files private.', 'I can explain my final review routine in order.', 'I know how to flag uncertainty instead of guessing.', 'I know how to use Messages to discuss an example with the admin.'],
    quiz: { question: 'What is the best response to a word that does not sound right?', options: ['Leave it without checking', 'Replay the audio and compare the surrounding meaning', 'Invent a word that fits the sentence'], answer: 1 },
    activity: 'Describe your three-step final review routine.',
  },
  4: {
    kicker: 'Practical one',
    lesson: 'Clean transcript exercise: remove only clear disfluencies while keeping the speaker’s meaning and wording.',
    practical: 'Practical prompt: Prepare this spoken line as a clean-read transcript: “I, I think we should—we should leave now.” Preserve the wording and order; remove only an unmistakable stutter or repeated word. Explain your choice in the written response below.',
    checklist: ['I removed only clear fillers, stutters, or duplicates.', 'I kept the speaker’s wording and order.', 'I reviewed the complete transcript before submitting.'],

    quiz: { question: 'Which change is appropriate?', options: ['Rewriting a rough sentence to sound elegant', 'Removing an obvious repeated word', 'Adding a conclusion the speaker did not say'], answer: 1 },
    activity: 'Spot the error: “I, I think we should— we should leave now.” Explain what you would remove and what you would keep.',
  },
  5: {
    kicker: 'Practical two',
    lesson: 'Speaker and timestamp exercise: make turns easy to follow and check the audio whenever identity or timing is uncertain.',
    practical: 'Practical prompt: Format the supplied turns as a short transcript, keeping the provided timestamps and wording exactly as shown. [00:00:02] Speaker 1: We should begin now. [00:00:04] Speaker 2: I agree. [00:00:05] Speaker 1: Then let’s start.',
    checklist: ['I marked speaker changes consistently.', 'I checked timestamps against the audio.', 'I flagged uncertainty instead of guessing.'],

    quiz: { question: 'When should you add or correct a timestamp?', options: ['Only at the very end without replaying', 'When the brief requires it and after checking the audio', 'Whenever a paragraph looks too long'], answer: 1 },
    activity: 'Two speakers are both labelled Speaker 1. Explain how you would identify and correct the speaker changes.',
  },
  6: {
    kicker: 'Final practical',
    lesson: 'Transcribe the full Human Job recording below. Use the two supplied Word references and submit your transcript with the module checks and a short note about your review.',
    checklist: ['I followed the attached TypeMyworDz General Guidelines.', 'I applied the supplied formatting instructions and checked proper nouns.', 'I replayed the complete recording and reviewed my transcript before submitting.'],
    quiz: { question: 'What should you do if the speaker’s wording sounds awkward but is clear?', options: ['Rewrite it to sound professional', 'Preserve the wording and follow the supplied guidelines', 'Replace it with a summary'], answer: 1 },
    activity: 'Briefly describe the checks you completed before submitting your final transcript.',
  },
};

const readProgress = (uid) => {
  try { return JSON.parse(window.localStorage.getItem(`typemywordz-training-${uid}`) || '{}'); } catch { return {}; }
};
const fromSavedResults = (results = {}) => Object.fromEntries(Object.entries(results).map(([level, item]) => [level, {
  checked: Array.isArray(item?.answers?.checklist) ? item.answers.checklist : [],
  answer: Number.isInteger(item?.answers?.quizAnswer) ? item.answers.quizAnswer : null,
  activity: item?.answers?.activity || '',
}]));

function ModuleChecks({ guide, progress, onChange, disabled = false }) {
  return <div className="tm-training-checks">
    <h3>Module checks</h3>
    <div className="tm-training-checklist">{guide.checklist.map((item, index) => <label key={item}>
      <input type="checkbox" checked={progress.checked.includes(index)} disabled={disabled} onChange={() => {
        const checked = progress.checked.includes(index) ? progress.checked.filter((value) => value !== index) : [...progress.checked, index];
        onChange({ ...progress, checked });
      }} />
      <span>{item}</span>
    </label>)}</div>
    <fieldset className="tm-training-quiz" disabled={disabled}>
      <legend>{guide.quiz.question}</legend>
      {guide.quiz.options.map((option, index) => <label key={option}>
        <input type="radio" name={`training-quiz-${guide.kicker}`} checked={progress.answer === index} onChange={() => onChange({ ...progress, answer: index })} />
        <span>{option}</span>
      </label>)}
    </fieldset>
    <label className="tm-training-activity"><span>{guide.activity}</span>
      <textarea rows={3} value={progress.activity || ''} disabled={disabled} onChange={(event) => onChange({ ...progress, activity: event.target.value })} />
    </label>
  </div>;
}

export default function TraineeDashboard({ onBack, onOpenWork, showMessage }) {
  const { currentUser } = useAuth();
  const [data, setData] = useState(null);
  const [submission, setSubmission] = useState({ transcript: '', notes: '' });
  const [studyProgress, setStudyProgress] = useState({});
  const [audioUrl, setAudioUrl] = useState('');
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioError, setAudioError] = useState('');
  const [busy, setBusy] = useState(false);
  const [materialBusy, setMaterialBusy] = useState('');
  const submissionLevelRef = useRef(null);

  const request = useCallback(async (path, options = {}) => {
    const token = await currentUser.getIdToken();
    const response = await fetch(`${BACKEND_URL}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}), Authorization: `Bearer ${token}` } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || 'The Training Room request failed.');
    return payload;
  }, [currentUser]);

  const load = useCallback(async () => {
    try {
      const next = await request('/human-transcription/trainee/status');
      setData(next);
      setStudyProgress({ ...readProgress(currentUser?.uid), ...fromSavedResults(next.training?.results) });
    } catch (error) { showMessage?.(error.message, 'error'); }
  }, [currentUser?.uid, request, showMessage]);

  useEffect(() => { load(); }, [load]);

  const level = Math.max(1, Number(data?.training?.level || 1));
  const guide = MODULE_GUIDES[level] || MODULE_GUIDES[1];
  const submissions = data?.training?.submissions || EMPTY_RECORD;
  const levels = Array.isArray(data?.levels) ? data.levels : [];
  const activeProgress = studyProgress[level] || { checked: [], answer: null, activity: '' };
  const moduleReady = activeProgress.checked.length === guide.checklist.length && activeProgress.answer === guide.quiz.answer && Boolean(activeProgress.activity?.trim());
  const completedCount = levels.filter((item) => submissions[String(item.level)] === 'submitted').length;
  const progressPercent = levels.length ? Math.round((completedCount / levels.length) * 100) : 0;
  const worker = Boolean(data?.is_worker);
  const enrolled = data?.application?.payment_status === 'paid' && ['enrolled', 'approved', 'pending_review'].includes(data?.application?.status);
  const allSubmitted = completedCount === 6;
  const pendingReview = data?.training?.status === 'pending_final_review' || data?.training?.status === 'review';
  const waitlisted = Boolean(data?.training?.waitlisted) && !worker;
  const redoLevels = Array.isArray(data?.training?.redo_levels) ? data.training.redo_levels.map(Number) : [];
  const redoMessage = data?.training?.redo_message || '';

  useEffect(() => {
    if (level !== 6 || !currentUser || worker || !enrolled || submissions['6'] === 'submitted') {
      setAudioUrl('');
      return undefined;
    }
    let objectUrl = '';
    let cancelled = false;
    const loadAudio = async () => {
      setAudioLoading(true); setAudioError('');
      try {
        const token = await currentUser.getIdToken();
        const response = await fetch(`${BACKEND_URL}${MATERIAL_PATH}human-job-practical.mp3`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.detail || 'The practice audio could not be loaded.');
        }
        objectUrl = URL.createObjectURL(await response.blob());
        if (!cancelled) setAudioUrl(objectUrl);
      } catch (error) { if (!cancelled) setAudioError(error.message); }
      finally { if (!cancelled) setAudioLoading(false); }
    };
    loadAudio();
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [currentUser, enrolled, level, submissions, worker]);

  const updateProgress = (next) => {
    setStudyProgress((current) => {
      const updated = { ...current, [level]: next };
      try { window.localStorage.setItem(`typemywordz-training-${currentUser.uid}`, JSON.stringify(updated)); } catch { /* Server submission remains the durable record. */ }
      return updated;
    });
  };

  useEffect(() => {
    if (!currentUser?.uid || level < 4 || submissionLevelRef.current !== level || !submission.transcript) return;
    try {
      window.localStorage.setItem(`typemywordz-training-practical-${currentUser.uid}-${level}`, JSON.stringify(submission));
      if (level === 6) window.localStorage.setItem(`typemywordz-training-final-${currentUser.uid}`, JSON.stringify(submission));
    } catch { /* Draft backup is optional. */ }
  }, [currentUser?.uid, level, submission]);

  useEffect(() => {
    if (!currentUser?.uid || level < 4) return;
    submissionLevelRef.current = level;
    const savedResult = data?.training?.results?.[String(level)];
    if (savedResult?.transcript) {
      setSubmission({ transcript: savedResult.transcript, notes: savedResult.notes || '' });
      return;
    }
    try {
      const key = `typemywordz-training-practical-${currentUser.uid}-${level}`;
      const saved = JSON.parse(window.localStorage.getItem(key) || (level === 6 ? window.localStorage.getItem(`typemywordz-training-final-${currentUser.uid}`) : null) || '{}');
      setSubmission({ transcript: saved.transcript || '', notes: saved.notes || '' });
    } catch { setSubmission({ transcript: '', notes: '' }); }
  }, [currentUser?.uid, level, data?.training?.results]);

  const downloadMaterial = async (name, filename) => {
    setMaterialBusy(name);
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(`${BACKEND_URL}${MATERIAL_PATH}${name}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || 'The reference document could not be downloaded.');
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { showMessage?.(error.message, 'error'); }
    finally { setMaterialBusy(''); }
  };

  const submitModule = async (event) => {
    event.preventDefault();
    if (!moduleReady) {
      showMessage?.('Complete every checklist item, choose the correct knowledge-check answer, and write the module response before submitting.', 'warning');
      return;
    }
    if (level >= 4 && !submission.transcript.trim()) {
      showMessage?.('Enter the completed transcript before submitting this practical.', 'warning');
      return;
    }
    setBusy(true);
    try {
      const payload = await request(`/human-transcription/trainee/training/${level}/submit`, {
        method: 'POST',
        body: JSON.stringify({
          level,
          transcript: level >= 4 ? submission.transcript : '',
          notes: level >= 4 ? submission.notes : '',
          answers: { checklist: activeProgress.checked, quizAnswer: activeProgress.answer, activity: activeProgress.activity },
        }),
      });
      try {
        window.localStorage.removeItem(`typemywordz-training-practical-${currentUser.uid}-${level}`);
        if (level === 6) window.localStorage.removeItem(`typemywordz-training-final-${currentUser.uid}`);
      } catch { /* Optional local draft cleanup. */ }
      setSubmission({ transcript: '', notes: '' });
      if (payload.training_status === 'pending_final_review') {
        showMessage?.('All six modules are submitted. Your full training record is ready for admin review.', 'success');
      } else {
        showMessage?.(`Module ${level} saved. Module ${payload.next_level} is now open.`, 'success');
      }
      await load();
    } catch (error) { showMessage?.(error.message, 'error'); }
    finally { setBusy(false); }
  };

  if (!data) return <section className="tm-human-page"><p>Loading Training Room…</p></section>;
  if (waitlisted) return <section className="tm-human-page tm-training-room"><button type="button" className="tm-human-back" onClick={onBack}>Back to workspace</button><div className="tm-human-card tm-training-review-pending" role="status"><p className="tm-human-eyebrow">Training complete</p><h1>You completed the training successfully</h1><p>Thank you for the effort you put in. There is no open position right now, so we have kept you on our waitlist. When work opens up, we will contact you first by email and in your notifications.</p></div></section>;
  if (!enrolled && !worker) return <section className="tm-human-page"><button type="button" className="tm-human-back" onClick={onBack}>Back to workspace</button><div className="tm-human-card"><h1>Training Room is locked</h1><p>Complete the training enrollment first. Your registration can remain pending until checkout is completed.</p></div></section>;

  return <section className="tm-human-page tm-training-room" aria-labelledby="trainee-title">
    <div className="tm-human-heading-row"><button type="button" className="tm-human-back" onClick={onBack}>Back to workspace</button><span className="tm-human-kicker">Private Training Room</span></div>
    <div className="tm-human-intro tm-training-hero"><div><p className="tm-human-eyebrow">A practical path to better transcripts</p><h1 id="trainee-title">Learn the work, one quality pass at a time.</h1><p>Complete six modules in order. Your checks, answers, practicals, and final transcript are saved for one admin review after the full programme is submitted.</p></div><div className="tm-training-progress-card"><strong>{progressPercent}%</strong><span>programme progress</span><div className="tm-training-progress-bar"><i style={{ width: `${progressPercent}%` }} /></div><small>{completedCount} of {levels.length || 6} modules submitted</small></div></div>

    <section className="tm-human-card tm-training-guidelines tm-training-guidelines-featured" aria-labelledby="guidelines-title"><p className="tm-human-eyebrow">Reference standard</p><h2 id="guidelines-title">TypeMyworDz human-work guidelines</h2><p>{data.guidelines?.summary}</p><div className="tm-training-guideline-grid">{(data.guidelines?.sections || []).map((section) => <article key={section.title}><strong>{section.title}</strong><p>{section.body}</p></article>)}</div></section>

    <div className="tm-human-card tm-training-access"><div><p className="tm-human-eyebrow">Your access</p><h2>{pendingReview ? 'Full submission ready for review' : 'Training Room is active'}</h2><p>Payment status: <strong>{String(data.application.payment_status).replaceAll('_', ' ')}</strong> · {pendingReview ? 'All six modules are saved.' : `Current module: ${level}`}</p></div><p className="tm-training-note">Module progression is automatic once the checks, knowledge answer, activity, and practical transcript are complete.</p>{worker && <button type="button" className="tm-human-send-request" onClick={onOpenWork}>Open Work Room</button>}</div>

    <div className="tm-human-card tm-training-workflow-note" role="note"><div><strong>When you start paid work</strong><p>Keep enough TypeMyworDz credits to create each AI draft in the app. Edit it in Microsoft Word, then attach the finished Word document to your submission. Work without an in-app AI draft may be declined.</p></div><a className="tm-training-practice-link" href="/typing-practice" target="_blank" rel="noopener noreferrer">Open free touch typing practice</a></div>

    <section className="tm-training-modules" aria-labelledby="modules-title"><div className="tm-human-card"><div className="tm-training-section-head"><div><p className="tm-human-eyebrow">Programme map</p><h2 id="modules-title">Six modules, one final review</h2></div><span className="tm-training-badge">{allSubmitted ? 'Ready for admin review' : `${completedCount} saved`}</span></div><div className="tm-training-module-list">{levels.map((module) => { const moduleLevel = Number(module.level); const complete = submissions[String(moduleLevel)] === 'submitted'; const redo = submissions[String(moduleLevel)] === 'redo_requested'; const open = (moduleLevel === level || redo) && !pendingReview; return <article key={module.level} className={`tm-training-module${open ? ' tm-training-module-open' : ''}${complete ? ' tm-training-module-complete' : ''}`}><div><span className="tm-training-module-number">{String(module.level).padStart(2, '0')}</span><div><h3>{module.name}</h3><p>{module.description}</p></div></div><span className="tm-training-module-status">{complete ? 'Saved' : redo ? 'Redo invited' : open ? 'Open' : 'Locked'}</span></article>; })}</div></div></section>

    {redoLevels.length > 0 && !pendingReview && <div className="tm-human-card tm-training-workflow-note" role="status"><div><strong>{redoLevels.length === levels.length ? 'The admin has invited you to redo all modules' : `The admin has invited you to redo module${redoLevels.length > 1 ? 's' : ''} ${redoLevels.join(', ')}`}</strong><p>{redoMessage || 'Take your time, review the lesson and guidelines, and submit again. Your earlier attempt stays on record.'}</p></div></div>}
    {pendingReview ? <section className="tm-human-card tm-training-review-pending" role="status"><p className="tm-human-eyebrow">Training submitted</p><h2>Thanks. Your work is with the admin.</h2><p>Your six module checks, written responses, practical work, and final audio transcript are saved. An admin will review the complete record and decide whether to promote you to the Work Room.</p></section> : !worker && <form className="tm-human-card tm-training-study" onSubmit={submitModule}>
      <p className="tm-human-eyebrow">{guide.kicker}</p><h2>{levels.find((item) => Number(item.level) === level)?.name || `Module ${level}`}</h2><p className="tm-training-lead">{guide.lesson}</p>
      {guide.lessonSections?.length > 0 && <div className="tm-training-columns"><div><h3>Lesson</h3>{guide.lessonSections.map((section) => <article className="tm-training-lesson-section" key={section.title}><h4>{section.title}</h4><p>{section.body}</p></article>)}</div></div>}
      {guide.practical && <div className="tm-training-exercise-prompt">{guide.practical}</div>}
      {level === 6 && <section className="tm-training-final-brief" aria-labelledby="final-practical-title">
        <h3 id="final-practical-title">Your final practical: transcribe this recording</h3>
        <ol><li>Listen to the full recording. Replay difficult sections as often as needed.</li><li>Download and read both reference documents before preparing your transcript.</li><li>Preserve the speaker’s wording, order, and awkward phrasing. Do not paraphrase, rearrange, polish, or add information.</li><li>Start a new paragraph only when the speaker dictates one. Apply the references’ rules for fillers, repetitions, punctuation, numbers, dates, times, and the required closing spellings paragraph.</li><li>Research unfamiliar proper nouns to confirm spelling only; do not use research to replace the speaker’s wording or add facts.</li><li>Apply the supplied formatting document’s instructions for the client’s default font and numbered paragraphs, including wrapped lines returning to the left margin.</li><li>Review the complete transcript against the recording before submitting.</li></ol>
        <div className="tm-training-materials"><button type="button" disabled={Boolean(materialBusy)} onClick={() => downloadMaterial('transcription-guidelines.docx', 'TypeMyworDz General Guidelines.docx')}>{materialBusy === 'transcription-guidelines.docx' ? 'Preparing document…' : 'Download TypeMyworDz General Guidelines'}</button><button type="button" disabled={Boolean(materialBusy)} onClick={() => downloadMaterial('formatting-default.docx', 'TypeMyworDz Default Document settings.docx')}>{materialBusy === 'formatting-default.docx' ? 'Preparing document…' : 'Download TypeMyworDz Default Document settings'}</button><a className="tm-training-practice-link" href="/guidelines" target="_blank" rel="noopener noreferrer">Read the guidelines online</a></div>
        <div className="tm-training-audio"><strong>Human Job recording</strong>{audioLoading ? <span>Loading the private practice audio…</span> : audioError ? <span role="alert">{audioError}</span> : audioUrl ? <audio controls preload="metadata" src={audioUrl}>Your browser does not support audio playback.</audio> : <span>The practice audio is available while this module is open.</span>}</div>
      </section>}
      {level <= 3 && <div className="tm-training-columns"><div><h3>Lesson notes</h3><p>{levels.find((item) => Number(item.level) === level)?.description}</p></div></div>}
      <ModuleChecks guide={guide} progress={activeProgress} onChange={updateProgress} />
      {level >= 4 && <label className="tm-human-field tm-human-notes tm-training-transcript-field"><span>{level === 6 ? 'Final transcript of the Human Job recording' : 'Completed practical transcript'}</span><textarea rows={16} value={submission.transcript} onChange={(event) => setSubmission((current) => ({ ...current, transcript: event.target.value }))} required /></label>}
      {level >= 4 && <label className="tm-human-field tm-human-notes"><span>Additional notes for the admin (optional)</span><textarea rows={3} value={submission.notes} onChange={(event) => setSubmission((current) => ({ ...current, notes: event.target.value }))} /></label>}
      <div className="tm-training-submit-row"><span>{moduleReady ? 'Checks complete. Your answers will be saved with this module.' : 'Complete all checks and write the module response to continue.'}</span><button className="tm-human-quote-button" type="submit" disabled={busy || !moduleReady || (level >= 4 && !submission.transcript.trim())}>{busy ? 'Saving…' : level === 6 ? 'Submit all six modules for review' : 'Save module and open next'}</button></div>
    </form>}
  </section>;
}
