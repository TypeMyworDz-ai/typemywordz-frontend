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

// AI proofreading. Works on a job finished by one worker or on every submitted
// part of a split job, and produces one client-ready transcript.
const DOC_FONT = 'Times New Roman';

const escapeHtml = (value) => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Word-ready markup: every line keeps its leading tab and double spaces.
const wordHtml = (text) => `<div style="font-family:'${DOC_FONT}',serif;font-size:12pt">${String(text || '').split('\n').map((line) => `<p style="margin:0;white-space:pre-wrap">${line ? escapeHtml(line) : '&nbsp;'}</p>`).join('')}</div>`;

const downloadBlob = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
};

export function AdminAiReviewPanel({ job, act, busy, splitJob = true }) {
  const review = job.ai_review;
  const [showText, setShowText] = useState(true);
  const [note, setNote] = useState('');
  const flash = (message) => { setNote(message); window.setTimeout(() => setNote(''), 4000); };
  const run = () => act(`/human-transcription/jobs/${job.id}/ai-review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: readModelPref() }) }, 'The AI review is ready.');
  const applyRatings = async () => {
    for (const part of review.parts || []) {
      // eslint-disable-next-line no-await-in-loop
      await act(`/human-transcription/jobs/${job.id}/rate-part`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ segment_id: part.segment_id, rating: part.rating, note: `AI review: ${part.notes || part.accuracy || ''}`.slice(0, 1800), source: 'ai' }) }, `Applied the AI rating to ${part.segment_id}.`);
    }
  };
  const useCombined = () => act(`/human-transcription/jobs/${job.id}/ai-review/apply`, { method: 'POST' }, splitJob ? 'The AI transcript is now the final transcript, ready for your review.' : 'The AI transcript replaced the worker text on this job.');
  const labelFor = (id) => (id === 'main' ? 'Full transcript' : ((job.segments || []).find((part) => part.id === id)?.label || id));

  const copyForWord = async () => {
    const text = review.combined_text || '';
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new window.ClipboardItem({ 'text/html': new Blob([wordHtml(text)], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
      } else {
        const holder = document.createElement('div');
        holder.style.cssText = 'position:fixed;left:-9999px;top:0';
        holder.innerHTML = wordHtml(text);
        document.body.appendChild(holder);
        const range = document.createRange(); range.selectNodeContents(holder);
        const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
        document.execCommand('copy'); selection.removeAllRanges(); holder.remove();
      }
      flash('Copied. Paste it into Word and the indents and double spaces stay.');
    } catch {
      flash('Copying was blocked by the browser. Use Download Word instead.');
    }
  };

  const downloadWord = async () => {
    try {
      const { Document, Packer, Paragraph, TextRun, Tab } = await import('docx');
      const paragraphs = String(review.combined_text || '').split('\n').map((line) => {
        const tabs = (/^\t*/.exec(line) || [''])[0].length;
        const body = line.slice(tabs);
        const children = [];
        for (let i = 0; i < tabs; i += 1) children.push(new TextRun({ children: [new Tab()] }));
        if (body) children.push(new TextRun({ text: body }));
        return new Paragraph({ children, spacing: { before: 0, after: 0, line: 240 } });
      });
      const doc = new Document({
        styles: { default: { document: { run: { font: DOC_FONT, size: 24 } } } },
        sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } }, children: paragraphs }],
      });
      downloadBlob(await Packer.toBlob(doc), `${String(job.job_name || job.title || 'transcript').replace(/[^A-Za-z0-9._ -]+/g, '').trim() || 'transcript'} - final.docx`);
    } catch {
      flash('The Word file could not be created. Use Copy for Word instead.');
    }
  };

  const notesText = () => [
    'CHANGES MADE AND WHY',
    ...(review.changes || []).map((item) => `${item.part ? `${item.part}: ` : ''}${item.before ? `"${item.before}" to "${item.after}". ` : (item.after ? `${item.after}. ` : '')}${item.why}`),
    ...((review.issues || []).length ? ['', 'OPEN ISSUES', ...review.issues] : []),
  ].join('\n');
  const copyNotes = async () => { try { await navigator.clipboard.writeText(notesText()); flash('Change notes copied.'); } catch { flash('Copying was blocked by the browser.'); } };

  return (
    <div className="tm-human-assign" style={box}>
      <div><strong>AI proofreading</strong><div style={muted}>{splitJob ? 'Combines every part into one transcript.' : 'Proofreads the worker\'s transcript.'} Spellings follow the first {splitJob ? 'part' : 'part of the dictation'}, then the job instructions, reference files, your notes to the workers, the guidelines and web research. It gives you a Word-ready final transcript and a list of what it changed and why. It uses the model chosen in your settings.</div></div>
      <div><button type="button" disabled={busy} onClick={run}>{review ? 'Run the AI review again' : (splitJob ? 'Review and combine with AI' : 'Review with AI')}</button></div>
      {review && (
        <div style={{ display: 'grid', gap: 10 }}>
          {review.summary && <p style={{ margin: 0 }}>{review.summary}</p>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <button type="button" onClick={copyForWord}>Copy for Word</button>
            <button type="button" onClick={downloadWord}>Download Word (.docx)</button>
            <button type="button" onClick={() => setShowText((value) => !value)}>{showText ? 'Hide final transcript' : 'Read final transcript'}</button>
            <button type="button" disabled={busy || ['assigned', 'in_progress'].includes(job.proofreader_status)} onClick={useCombined}>{splitJob ? 'Use as the final transcript' : 'Replace the worker text with this'}</button>
            {note && <span style={{ ...muted, color: '#267b40' }}>{note}</span>}
          </div>
          {showText && <div style={{ whiteSpace: 'pre-wrap', tabSize: 4, fontFamily: `'${DOC_FONT}', serif`, maxHeight: 420, overflow: 'auto', background: '#fafbfa', border: '1px solid #e5e9e5', borderRadius: 6, padding: 12, fontSize: 15, lineHeight: 1.5 }}>{review.combined_text}</div>}
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
          <div style={muted}>Reviewed with {review.model}.</div>
        </div>
      )}
    </div>
  );
}
