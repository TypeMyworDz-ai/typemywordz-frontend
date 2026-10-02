import React, { useMemo, useState } from 'react';
import WordLikeEditor, { domToPlainText, plainTextToHtml, sanitizePastedHtml } from './WordLikeEditor';
import { copyRich, downloadDocx, nodeToWordHtml, safeFileName } from '../utils/transcriptExport';
import './AIOutputWindow.css';

// A consistent document-style surface for AI-generated text throughout the app.
export default function AIOutputWindow({
  title = 'Shared proofreading editor',
  description = 'The same working area is used by the worker, admin and client.',
  text = '',
  html = '',
  fileName = 'TypeMyworDz response',
  minHeight = 240,
  showCopyDownload = true,
  actionContent = null,
  revision = '',
}) {
  const [notice, setNotice] = useState('');
  const safeHtml = useMemo(() => sanitizePastedHtml(html || plainTextToHtml(text)), [html, text]);

  const copy = async () => {
    const holder = document.createElement('div');
    holder.innerHTML = safeHtml;
    try {
      await copyRich(nodeToWordHtml(holder), String(text || domToPlainText(holder)));
      setNotice('Copied. Paste it into Word and the formatting will stay.');
    } catch {
      setNotice('Copying was blocked by the browser. Try Download Word instead.');
    }
  };

  const download = async () => {
    const holder = document.createElement('div');
    holder.innerHTML = safeHtml;
    try {
      await downloadDocx(String(text || domToPlainText(holder)), safeFileName(fileName), safeHtml);
      setNotice('Word document downloaded.');
    } catch {
      setNotice('The Word document could not be created.');
    }
  };

  const revisionKey = revision || `${title}-${text.length}-${html.length}-${String(text).slice(0, 48)}`;

  return (
    <section className="tm-ai-output" aria-label={title}>
      <header className="tm-ai-output-head">
        <div className="tm-ai-output-heading">
          <h3>{title}</h3>
          {description && <p>{description}</p>}
        </div>
        <div className="tm-ai-output-actions">
          {showCopyDownload && (
            <>
              <button type="button" className="tm-ai-output-button" onClick={copy} disabled={!text && !html}>Copy</button>
              <button type="button" className="tm-ai-output-button is-primary" onClick={download} disabled={!text && !html}>Download Word (.docx)</button>
            </>
          )}
          {actionContent}
        </div>
      </header>
      <WordLikeEditor
        key={revisionKey}
        disabled
        initialHtml={safeHtml}
        initialText={text}
        minHeight={minHeight}
      />
      {notice && <span className="tm-ai-output-notice" role="status">{notice}</span>}
    </section>
  );
}
