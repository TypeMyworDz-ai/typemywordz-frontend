import React, { useState } from 'react';
import WordLikeEditor from './WordLikeEditor';
import { copyForWord, downloadDocx, safeFileName } from '../utils/transcriptExport';

// The finished transcript, shown the same way to everyone (admin, worker and
// client): in the Word-like editor, read only, with Copy and Download buttons
// that keep the tab indents and double spaces.
export default function FinalTranscriptView({ job, showMessage }) {
  const [note, setNote] = useState('');
  const flash = (message) => { setNote(message); window.setTimeout(() => setNote(''), 4000); };
  const submittedParts = (job.segments || []).filter((part) => part && part.status === 'submitted' && (part.transcript || '').trim());
  const hasFinal = Boolean((job.transcript || '').trim());
  const parts = !hasFinal && submittedParts.length
    ? submittedParts.map((part, index) => ({ id: part.id, label: part.label || `Part ${index + 1}`, author_label: `Worker ${index + 1}`, transcript: part.transcript || '', transcript_html: part.transcript_html || '', pending: false }))
    : null;
  const text = hasFinal ? job.transcript : (parts || []).map((part) => part.transcript).join('\n\n');
  const baseName = safeFileName(job.job_name || job.title || job.pdf_image?.name || job.audio?.name?.replace(/\.[^.]+$/, '') || 'transcript');
  const copy = async () => {
    try { await copyForWord(text); flash('Copied. Paste it into Word and the indents and double spaces stay.'); } catch { flash('Copying was blocked by the browser. Use Download Word instead.'); }
  };
  const download = async () => {
    try { await downloadDocx(text, baseName); } catch { showMessage?.('The Word file could not be created. Use Copy instead.', 'error'); }
  };
  if (!text.trim()) {
    return <div className="tm-human-empty">The transcript will appear here once it has been submitted.</div>;
  }
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <button type="button" onClick={copy}>Copy</button>
        <button type="button" onClick={download}>Download Word (.docx)</button>
        {note && <span role="status" style={{ fontSize: 12, color: '#267b40' }}>{note}</span>}
      </div>
      <WordLikeEditor
        key={`${job.id}-${text.length}`}
        disabled
        parts={parts}
        initialHtml={hasFinal ? (job.transcript_html || '') : ''}
        initialText={hasFinal ? job.transcript : ''}
        minHeight={360}
      />
    </div>
  );
}
