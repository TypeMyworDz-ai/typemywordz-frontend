import React, { useEffect, useState } from 'react';
import AIOutputWindow from './AIOutputWindow';

const box = { border: '1px solid #e1e6e2', borderRadius: 8, padding: '12px 14px', display: 'grid', gap: 10, background: '#fff' };
const muted = { color: '#7b857d', fontSize: 12 };

// Every submitted part is readable and rateable straight away, without
// waiting for the other parts or for proofreading. Also works afterwards.
export function AdminPartReview({ job, act, downloadProtectedFile }) {
  const [open, setOpen] = useState({});
  const [draft, setDraft] = useState({});
  const ratings = job.part_ratings || {};
  const isSplit = ['dual', 'multi'].includes(String(job.split_mode || '').toLowerCase());
  const rows = [];
  if (isSplit) {
    (job.segments || []).forEach((part) => {
      if (part.status === 'submitted') rows.push({ id: part.id, label: part.label, worker: part.worker_name || part.worker_email || 'Worker', text: part.transcript || '', attachment: part.final_attachment, attachmentPath: `/human-transcription/jobs/${job.id}/segments/${encodeURIComponent(part.id)}/attachment` });
    });
    if (job.proofreader_status === 'submitted') rows.push({ id: 'proofreader', label: 'Final proofreading', worker: job.proofreader_name || 'Proofreader', text: job.transcript || '', attachment: job.final_attachment, attachmentPath: `/human-transcription/jobs/${job.id}/final-attachment` });
  }
  if (!rows.length) return null;

  const save = async (row) => {
    const value = draft[row.id] || {};
    const rating = Number(value.rating || ratings[row.id]?.rating || 0);
    if (!rating) return;
    await act(`/human-transcription/jobs/${job.id}/rate-part`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ segment_id: row.id, rating, note: value.note ?? ratings[row.id]?.note ?? '' }) }, `${row.label} rated.`);
  };

  const suggested = job.proofreader_suggested_ratings || {};
  const applySuggestion = (row) => act(`/human-transcription/jobs/${job.id}/rate-part`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ segment_id: row.id, rating: suggested[row.id].rating, note: `Proofreader: ${suggested[row.id].note || ''}`.trim().slice(0, 1800), source: 'proofreader' }) }, `Applied the proofreader's rating to ${row.label}.`);
  const dismissSuggestion = (row) => act(`/human-transcription/jobs/${job.id}/proofreader-ratings/dismiss`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ segment_id: row.id }) }, 'Suggestion dismissed.');

  return (
    <div className="tm-human-assign" style={box}>
      <div><strong>Submitted parts</strong><div style={muted}>Read each part as soon as it is in, and rate its worker separately. Ratings stay open after proofreading.</div></div>
      {rows.map((row) => {
        const saved = ratings[row.id];
        const value = draft[row.id] || {};
        return (
          <div key={row.id} style={{ borderTop: '1px solid #eef1ee', paddingTop: 10, display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
              <strong style={{ minWidth: 140 }}>{row.label}</strong>
              <span style={muted}>{row.worker}</span>
              {saved && <span style={{ ...muted, color: '#267b40' }}>Rated {saved.rating}/5{saved.source === 'ai' ? ' (AI)' : ''}</span>}
              <button type="button" onClick={() => setOpen((current) => ({ ...current, [row.id]: !current[row.id] }))}>{open[row.id] ? 'Hide text' : 'Read this part'}</button>
              {row.attachment && <button type="button" onClick={() => downloadProtectedFile(row.attachmentPath, row.attachment.name, 'The finished file could not be downloaded.')}>Download: {row.attachment.name}</button>}
            </div>
            {suggested[row.id] && (
              <div role="status" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, background: '#f3f0fc', border: '1px solid #ddd5f6', borderRadius: 6, padding: '8px 12px', fontSize: 13 }}>
                <span><strong>The proofreader suggests {suggested[row.id].rating}/5</strong>{suggested[row.id].note ? `: ${suggested[row.id].note}` : ''}. This is not registered until you apply it.</span>
                <button type="button" onClick={() => applySuggestion(row)}>Apply this rating</button>
                <button type="button" onClick={() => dismissSuggestion(row)}>Dismiss</button>
              </div>
            )}
            {open[row.id] && <div style={{ whiteSpace: 'pre-wrap', maxHeight: 300, overflow: 'auto', background: '#fafbfa', border: '1px solid #e5e9e5', borderRadius: 6, padding: 12, fontSize: 14, lineHeight: 1.5 }}>{row.text || 'No text was typed for this part. See the attached file.'}</div>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <select aria-label={`Rating for ${row.label}`} value={value.rating ?? saved?.rating ?? ''} onChange={(event) => setDraft((current) => ({ ...current, [row.id]: { ...current[row.id], rating: event.target.value } }))}>
                <option value="">Rate this worker</option>
                <option value="5">5 · excellent</option><option value="4">4 · strong</option><option value="3">3 · acceptable</option><option value="2">2 · needs work</option><option value="1">1 · poor</option>
              </select>
              <input aria-label={`Note for ${row.label}`} style={{ flex: '1 1 220px' }} placeholder="Short note (optional)" value={value.note ?? saved?.note ?? ''} onChange={(event) => setDraft((current) => ({ ...current, [row.id]: { ...current[row.id], note: event.target.value } }))} />
              <button type="button" onClick={() => save(row)}>{saved ? 'Update rating' : 'Save rating'}</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// AI proofreading. Works on a job finished by one worker or on every submitted
// part of a split job, and produces one client-ready transcript.




export function AdminAiReviewPanel({ job, act, busy, splitJob = true, onInsert, allowApply = false }) {
  const review = job.ai_review;
  const [note, setNote] = useState('');
  const flash = (message) => { setNote(message); window.setTimeout(() => setNote(''), 4000); };
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!running) { setElapsed(0); return undefined; }
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [running]);
  const run = async () => {
    if (running) return;
    setRunning(true);
    try {
      await act(`/human-transcription/jobs/${job.id}/ai-review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }, 'AI-proofread transcript is ready.');
    } finally {
      setRunning(false);
    }
  };
  const applyRatings = async () => {
    for (const part of review.parts || []) {
      // eslint-disable-next-line no-await-in-loop
      await act(`/human-transcription/jobs/${job.id}/rate-part`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ segment_id: part.segment_id, rating: part.rating, note: `AI proofread: ${part.notes || part.accuracy || ''}`.slice(0, 1800), source: 'ai' }) }, `Applied the AI proofreader's rating to ${part.segment_id}.`);
    }
  };
  const useCombined = () => {
    if (!review?.combined_text || !onInsert) return;
    onInsert(review.combined_text);
    flash('Inserted into the editable proofreader transcript.');
  };
  const applyReviewedTranscript = async () => {
    if (!review?.combined_text || !allowApply) return;
    if (!window.confirm('Replace this job transcript with the AI-proofread version and move it to admin approval? The final approval step will still remain.')) return;
    await act(`/human-transcription/jobs/${job.id}/ai-review/apply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }, 'AI-proofread transcript applied and ready for admin approval.');
  };
  const labelFor = (id) => (id === 'main' ? 'Full transcript' : ((job.segments || []).find((part) => part.id === id)?.label || id));

  const notesText = () => [
    'CHANGES MADE AND WHY',
    ...(review.changes || []).map((item) => `${item.part ? `${item.part}: ` : ''}${item.before ? `"${item.before}" to "${item.after}". ` : (item.after ? `${item.after}. ` : '')}${item.why}`),
    ...((review.issues || []).length ? ['', 'OPEN ISSUES', ...review.issues] : []),
  ].join('\n');
  const copyNotes = async () => { try { await navigator.clipboard.writeText(notesText()); flash('Change notes copied.'); } catch { flash('Copying was blocked by the browser.'); } };

  return (
    <div className="tm-human-assign" style={box}>
      <div><strong>AI proofreader</strong><div style={muted}>{splitJob ? 'Proofreads every submitted part and combines them into one transcript.' : 'Proofreads the submitted transcript.'} It uses Claude Sonnet 5.5 first, with Gemini 3.5 Flash-Lite as fallback, and checks client spellings, job instructions, reference files, worker research notes, company guidelines and grounded web research. Unverified terms are preserved unless the source audio or client references support a correction. The final admin approval remains required.</div></div>
      <style>{`@keyframes tmAiSpin{to{transform:rotate(360deg)}}.tm-ai-spin{display:inline-block;width:14px;height:14px;margin-right:8px;vertical-align:-2px;border:2px solid rgba(91,45,158,.25);border-top-color:#5b2d9e;border-radius:50%;animation:tmAiSpin .8s linear infinite}`}</style>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        <button type="button" disabled={busy || running} aria-busy={running} onClick={run}>{running ? <><span className="tm-ai-spin" aria-hidden="true" />Proofreading...</> : (review ? 'Proofread again' : (splitJob ? 'Proofread and combine' : 'Proofread with AI'))}</button>
        {running && <span role="status" style={{ ...muted, color: '#4b2a8a' }}>Working for {elapsed}s. Checking each part against the audio and references. Please keep this page open.</span>}
      </div>
      {review && (
        <div style={{ display: 'grid', gap: 10 }}>
          {review.summary && <p style={{ margin: 0 }}>{review.summary}</p>}
          <AIOutputWindow
            title="AI-proofread transcript"
            description="Check the proofread text, then insert it into the editable proofreader transcript below."
            text={review.combined_text || ''}
            fileName={`${job.job_name || job.title || 'transcript'} - AI proofread`}
            minHeight={360}
            showCopyDownload={false}
            revision={`${job.id}-${(review.combined_text || '').length}`}
            actionContent={<div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}><button type="button" className="tm-ai-output-button is-primary" disabled={busy || !onInsert || ['assigned', 'in_progress'].includes(job.proofreader_status)} onClick={useCombined}>Insert into the proofreader editor</button>{allowApply && <button type="button" className="tm-ai-output-button" disabled={busy || running || !review?.combined_text || job.ai_review_applied === true} onClick={applyReviewedTranscript}>{job.ai_review_applied ? 'AI proofread applied' : 'Apply AI proofread to this job'}</button>}</div>}
          />
          {note && <span style={{ ...muted, color: '#267b40' }}>{note}</span>}
          {(review.changes || []).length > 0 && (
            <div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><strong style={{ fontSize: 13 }}>What the AI changed and why</strong><button type="button" onClick={copyNotes}>Copy notes</button></div>
              <ul style={{ margin: '6px 0 0 18px', padding: 0, fontSize: 13, display: 'grid', gap: 4 }}>
                {review.changes.map((item, index) => <li key={index}>{item.part && <strong>{item.part}: </strong>}{item.before ? <>&ldquo;{item.before}&rdquo; to &ldquo;{item.after}&rdquo;. </> : (item.after ? `${item.after}. ` : '')}<span style={muted}>{item.why}</span></li>)}
              </ul>
            </div>
          )}
          {(review.parts || []).length > 0 && (
            <div>
              <strong style={{ fontSize: 13 }}>{splitJob ? 'Ratings by part' : 'Quality rating'}</strong>
              {(review.parts || []).map((part) => (
                <div key={part.segment_id} style={{ borderTop: '1px solid #eef1ee', paddingTop: 8, marginTop: 6, fontSize: 14 }}>
                  <strong>{labelFor(part.segment_id)}</strong> · {part.rating}/5
                  {(part.accuracy || part.notes) && <div style={muted}>{[part.accuracy, part.notes].filter(Boolean).join(' ')}</div>}
                </div>
              ))}
              {splitJob && <div style={{ marginTop: 8 }}><button type="button" disabled={busy} onClick={applyRatings}>Apply these ratings</button></div>}
            </div>
          )}
          {(review.issues || []).length > 0 && <div><strong style={{ fontSize: 13 }}>Open issues</strong><ul style={{ margin: '4px 0 0 18px', padding: 0, fontSize: 13 }}>{review.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul></div>}
          {review.research && <details><summary style={{ cursor: 'pointer', fontSize: 13 }}>Spelling research</summary><pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, margin: '6px 0 0' }}>{review.research}</pre></details>}
          <div style={muted}>Proofread with {review.model}.</div>
        </div>
      )}
    </div>
  );
}
