import React, { useEffect, useState } from 'react';
import WordLikeEditor, { plainTextToHtml } from './WordLikeEditor';
import { copyRich, downloadDocx, nodeToWordHtml, safeFileName } from '../utils/transcriptExport';

export default function FinalTranscriptView({
  job,
  showMessage,
  editable = false,
  onChange,
  onSave,
  saving = false,
  editorRef,
}) {
  const [note, setNote] = useState('');
  const submittedParts = (job.segments || []).filter((part) => part);
  const hasFinal = Boolean((job.transcript || '').trim());
  const parts = !hasFinal && submittedParts.length
    ? submittedParts.map((part, index) => ({
      id: part.id,
      index: index + 1,
      label: part.label || `Part ${index + 1}`,
      author_label: `Worker ${index + 1}`,
      transcript: part.transcript || '',
      transcript_html: part.transcript_html || '',
      pending: part.status !== 'submitted',
    }))
    : null;
  const text = hasFinal ? job.transcript : (parts || []).filter((part) => !part.pending).map((part) => part.transcript).join('\n\n');
  const html = hasFinal ? (job.transcript_html || '') : '';
  const seedKey = `${job.id}-${hasFinal ? 'final' : 'parts'}`;
  const [live, setLive] = useState({ text, html });
  const baseName = safeFileName(job.job_name || job.title || job.pdf_image?.name || job.audio?.name?.replace(/\.[^.]+$/, '') || 'transcript');

  useEffect(() => {
    setLive({ text, html });
    // Seed only when switching jobs or when the server moves from parts to a final transcript.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey]);

  const flash = (message) => { setNote(message); window.setTimeout(() => setNote(''), 4000); };
  const handleChange = (nextText, nextHtml) => {
    setLive({ text: nextText, html: nextHtml });
    onChange?.(nextText, nextHtml);
  };
  const copy = async () => {
    const holder = document.createElement('div');
    holder.innerHTML = live.html || plainTextToHtml(live.text);
    try {
      await copyRich(nodeToWordHtml(holder), live.text || '');
      flash('Copied. Paste it into Word and the formatting will stay.');
    } catch {
      flash('Copying was blocked by the browser. Use Download Word instead.');
    }
  };
  const download = async () => {
    try {
      await downloadDocx(live.text || '', baseName, live.html || plainTextToHtml(live.text));
      flash('Word document downloaded.');
    } catch {
      showMessage?.('The Word file could not be created. Use Copy instead.', 'error');
    }
  };
  if (!live.text.trim() && !editable && !parts?.length) {
    return <div className="tm-human-empty">The transcript will appear here once it has been submitted.</div>;
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <button type="button" onClick={copy} disabled={!live.text.trim()}>Copy</button>
        <button type="button" onClick={download} disabled={!live.text.trim()}>Download Word (.docx)</button>
        {editable && onSave && <button type="button" onClick={() => onSave(live.text, live.html)} disabled={saving || !live.text.trim()}>{saving ? 'Saving…' : 'Save changes'}</button>}
        {note && <span role="status" style={{ fontSize: 12, color: '#267b40' }}>{note}</span>}
      </div>
      <WordLikeEditor
        key={seedKey}
        ref={editorRef}
        disabled={!editable}
        parts={parts}
        initialHtml={html}
        initialText={text}
        onChange={editable ? handleChange : undefined}
        fileName={baseName}
        minHeight={360}
      />
    </div>
  );
}
