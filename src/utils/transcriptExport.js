// Copy and download helpers that keep the transcript's tab indents and double
// spaces when it is pasted into, or opened in, Microsoft Word.
export const DOC_FONT = 'Times New Roman';

const escapeHtml = (value) => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const wordHtml = (text) => `<div style="font-family:'${DOC_FONT}',serif;font-size:12pt">${String(text || '').split('\n').map((line) => `<p style="margin:0;white-space:pre-wrap">${line ? escapeHtml(line) : '&nbsp;'}</p>`).join('')}</div>`;

export const downloadBlob = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
};

export const safeFileName = (name, fallback = 'transcript') => String(name || '').replace(/[^A-Za-z0-9._ -]+/g, '').trim() || fallback;

// Resolves when copied, rejects if the browser blocked it.
export const copyForWord = async (text) => {
  const plain = String(text || '');
  if (navigator.clipboard && window.ClipboardItem) {
    await navigator.clipboard.write([new window.ClipboardItem({ 'text/html': new Blob([wordHtml(plain)], { type: 'text/html' }), 'text/plain': new Blob([plain], { type: 'text/plain' }) })]);
    return;
  }
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-9999px;top:0';
  holder.innerHTML = wordHtml(plain);
  document.body.appendChild(holder);
  const range = document.createRange(); range.selectNodeContents(holder);
  const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
  const ok = document.execCommand('copy');
  selection.removeAllRanges(); holder.remove();
  if (!ok) throw new Error('copy blocked');
};

export const downloadDocx = async (text, baseName = 'transcript') => {
  const { Document, Packer, Paragraph, TextRun, Tab } = await import('docx');
  const paragraphs = String(text || '').split('\n').map((line) => {
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
  downloadBlob(await Packer.toBlob(doc), `${safeFileName(baseName)}.docx`);
};
