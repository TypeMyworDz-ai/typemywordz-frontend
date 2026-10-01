// Copy and download helpers that keep the transcript's tab indents and double
// spaces when it is pasted into, or opened in, Microsoft Word.
export const DOC_FONT = 'Times New Roman';

const escapeHtml = (value) => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Word collapses tabs and runs of spaces in pasted HTML unless they are written
// the way Word writes them itself: tabs as mso-tab-count spans and runs of
// spaces as mso-spacerun spans of non-breaking spaces.
export const encodeWhitespaceForWord = (escaped) => String(escaped || '')
  .replace(/\t/g, '<span style="mso-tab-count:1">&nbsp;&nbsp;&nbsp;&nbsp;</span>')
  .replace(/ {2,}/g, (run) => `<span style="mso-spacerun:yes">${' ' + '&nbsp;'.repeat(run.length - 1)}</span>`)
  .replace(/^ /, '&nbsp;');

export const wordHtml = (text) => `<div style="font-family:'${DOC_FONT}',serif;font-size:12pt">${String(text || '').split('\n').map((line) => `<p style="margin:0">${line ? encodeWhitespaceForWord(escapeHtml(line)) : '&nbsp;'}</p>`).join('')}</div>`;

// Rewrites the text nodes of a copied selection so that Word keeps every tab
// and double space. Returns HTML.
export const nodeToWordHtml = (root) => {
  const clone = root.cloneNode(true);
  const walker = document.createTreeWalker(clone, 4);
  const texts = [];
  while (walker.nextNode()) texts.push(walker.currentNode);
  texts.forEach((node) => {
    const holder = document.createElement('span');
    holder.innerHTML = encodeWhitespaceForWord(escapeHtml(node.nodeValue));
    node.replaceWith(...Array.from(holder.childNodes));
  });
  clone.querySelectorAll('[style]').forEach((el) => { el.style.removeProperty('white-space'); el.style.removeProperty('tab-size'); });
  return clone.innerHTML;
};

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

// Plain text copy keeps the real tab characters.
export const copyPlainText = async (text) => {
  const value = String(text || '');
  if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(value); return; }
  const area = document.createElement('textarea');
  area.value = value; area.style.cssText = 'position:fixed;left:-9999px;top:0';
  document.body.appendChild(area); area.select();
  const ok = document.execCommand('copy'); area.remove();
  if (!ok) throw new Error('copy blocked');
};

// Copies rich HTML (already built) together with its plain text.
export const copyRich = async (html, plain) => {
  if (navigator.clipboard && window.ClipboardItem) {
    await navigator.clipboard.write([new window.ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([plain], { type: 'text/plain' }) })]);
    return;
  }
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-9999px;top:0';
  holder.innerHTML = html;
  document.body.appendChild(holder);
  const range = document.createRange(); range.selectNodeContents(holder);
  const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
  const ok = document.execCommand('copy');
  selection.removeAllRanges(); holder.remove();
  if (!ok) throw new Error('copy blocked');
};
