import React, { useState } from 'react';
const readModelPref = () => { try { return window.localStorage.getItem('tmwd.askModel') || ''; } catch { return ''; } };

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

// AI proofreading and combining. Available once every part is in.
export function AdminAiReviewPanel({ job, act, busy }) {
  const review = job.ai_review;
  const [showText, setShowText] = useState(false);
  const run = () => act(`/human-transcription/jobs/${job.id}/ai-review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: readModelPref() }) }, 'The AI review is ready.');
  const applyRatings = async () => {
    for (const part of review.parts || []) {
      // eslint-disable-next-line no-await-in-loop
      await act(`/human-transcription/jobs/${job.id}/rate-part`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ segment_id: part.segment_id, rating: part.rating, note: `AI review: ${part.notes || part.accuracy || ''}`.slice(0, 1800), source: 'ai' }) }, `Applied the AI rating to ${part.segment_id}.`);
    }
  };
  const useCombined = () => act(`/human-transcription/jobs/${job.id}/ai-review/apply`, { method: 'POST' }, 'The AI combined text is now the final transcript, ready for your review.');
  const labelFor = (id) => (job.segments || []).find((part) => part.id === id)?.label || id;

  return (
    <div className="tm-human-assign" style={box}>
      <div><strong>AI proofreading and combining</strong><div style={muted}>Checks that all parts follow the guidelines and this job's instructions, merges them into one transcript and rates each transcriber. It uses the model chosen in your settings. You can still assign a worker to proofread instead.</div></div>
      <div><button type="button" disabled={busy} onClick={run}>{review ? 'Run the AI review again' : 'Review and combine with AI'}</button></div>
      {review && (
        <div style={{ display: 'grid', gap: 10 }}>
          {review.summary && <p style={{ margin: 0 }}>{review.summary}</p>}
          {(review.parts || []).map((part) => (
            <div key={part.segment_id} style={{ borderTop: '1px solid #eef1ee', paddingTop: 8, fontSize: 14 }}>
              <strong>{labelFor(part.segment_id)}</strong> · {part.rating}/5
              {(part.accuracy || part.notes) && <div style={muted}>{[part.accuracy, part.notes].filter(Boolean).join(' ')}</div>}
            </div>
          ))}
          {(review.issues || []).length > 0 && <div><strong style={{ fontSize: 13 }}>Open issues</strong><ul style={{ margin: '4px 0 0 18px', padding: 0, fontSize: 13 }}>{review.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul></div>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button type="button" disabled={busy} onClick={applyRatings}>Apply these ratings</button>
            <button type="button" onClick={() => setShowText((value) => !value)}>{showText ? 'Hide combined text' : 'Read combined text'}</button>
            <button type="button" disabled={busy || ['assigned', 'in_progress'].includes(job.proofreader_status)} onClick={useCombined}>Use combined text as the final transcript</button>
          </div>
          {showText && <div style={{ whiteSpace: 'pre-wrap', maxHeight: 360, overflow: 'auto', background: '#fafbfa', border: '1px solid #e5e9e5', borderRadius: 6, padding: 12, fontSize: 14, lineHeight: 1.5 }}>{review.combined_text}</div>}
          <div style={muted}>Reviewed with {review.model}.</div>
        </div>
      )}
    </div>
  );
}
