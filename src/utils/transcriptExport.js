// Copy and download helpers that keep the transcript's tab indents and double
// spaces when it is pasted into, or opened in, Microsoft Word.
export const DOC_FONT = 'Times New Roman';

const escapeHtml = (value) => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const EMPTY_PARAGRAPH_TAGS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
const isEmptyInlineNode = (node) => {
  if (node.nodeType === 3) return !String(node.nodeValue || '').replace(/[\s\u200B-\u200D\uFEFF]/g, '');
  if (node.nodeType !== 1) return true;
  if (node.tagName === 'BR') return true;
  return ['SPAN', 'FONT', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'SMALL', 'BIG'].includes(node.tagName)
    && Array.from(node.childNodes).every(isEmptyInlineNode);
};

const isEmptyParagraph = (node) => node.nodeType === 1
  && EMPTY_PARAGRAPH_TAGS.has(node.tagName)
  && Array.from(node.childNodes).every(isEmptyInlineNode);

// Keep at most one empty paragraph between blocks without flattening inline
// formatting, tabs, or deliberate runs of spaces.
export const normalizeParagraphSpacing = (html) => {
  const root = document.createElement('div');
  root.innerHTML = String(html || '');
  const visit = (parent) => {
    let previousWasEmpty = false;
    Array.from(parent.childNodes).forEach((node) => {
      if (node.nodeType === 3 && !String(node.nodeValue || '').trim()) return;
      if (isEmptyParagraph(node)) {
        if (previousWasEmpty) node.remove();
        else previousWasEmpty = true;
        return;
      }
      previousWasEmpty = false;
      if (node.nodeType === 1) visit(node);
    });
  };
  visit(root);
  return root.innerHTML;
};

// Word collapses tabs and runs of spaces in pasted HTML unless they are written
// the way Word writes them itself: tabs as mso-tab-count spans and runs of
// spaces as mso-spacerun spans of non-breaking spaces.
export const encodeWhitespaceForWord = (escaped) => String(escaped || '')
  .replace(/\t/g, '<span style="mso-tab-count:1">&nbsp;&nbsp;&nbsp;&nbsp;</span>')
  .replace(/ {2,}/g, (run) => `<span style="mso-spacerun:yes">${' ' + '&nbsp;'.repeat(run.length - 1)}</span>`)
  .replace(/^ /, '&nbsp;');

export const wordHtml = (text) => `<div style="font-family:'${DOC_FONT}',serif;font-size:12pt">${String(text || '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').split('\n').map((line) => `<p style="margin:0">${line ? encodeWhitespaceForWord(escapeHtml(line)) : '&nbsp;'}</p>`).join('')}</div>`;

// Rewrites the text nodes of a copied selection so that Word keeps every tab
// and double space. Returns HTML.
export const nodeToWordHtml = (root) => {
  const clone = root.cloneNode(true);
  clone.innerHTML = normalizeParagraphSpacing(clone.innerHTML);
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

const TWIPS_PER_INCH = 1440;
const cssLengthToTwips = (value) => {
  const match = /^(-?\d+(?:\.\d+)?)(pt|px|in|cm|mm)?$/i.exec(String(value || '').trim());
  if (!match) return 0;
  const amount = Number(match[1]);
  const unit = (match[2] || 'pt').toLowerCase();
  const inches = unit === 'in' ? amount : unit === 'cm' ? amount / 2.54 : unit === 'mm' ? amount / 25.4 : unit === 'px' ? amount / 96 : amount / 72;
  return Math.round(inches * TWIPS_PER_INCH);
};

const htmlBlocks = (root) => {
  const blocks = [];
  const inline = [];
  const flushInline = () => {
    if (!inline.length) return;
    const wrapper = document.createElement('div');
    inline.splice(0).forEach((node) => wrapper.appendChild(node.cloneNode(true)));
    blocks.push({ node: wrapper });
  };
  const visit = (container) => {
    const children = Array.from(container.childNodes);
    const blockTags = new Set(['div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'li', 'tr', 'ul', 'ol', 'table', 'hr']);
    const containsBlocks = children.some((node) => node.nodeType === 1 && blockTags.has(node.tagName.toLowerCase()));
    children.forEach((node) => {
      if (node.nodeType === 3) {
        if (containsBlocks && !String(node.nodeValue || '').trim()) return;
        inline.push(node); return;
      }
      if (node.nodeType !== 1) return;
      const tag = node.tagName.toLowerCase();
      if (tag === 'ul' || tag === 'ol') {
        flushInline();
        Array.from(node.querySelectorAll(':scope > li')).forEach((item, index) => blocks.push({ node: item, list: tag, listIndex: index + 1 }));
      } else if (tag === 'table') {
        flushInline();
        node.querySelectorAll('tr').forEach((row) => blocks.push({ node: row }));
      } else if (['div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'li', 'tr'].includes(tag)) {
        flushInline();
        const nestedBlocks = tag === 'div' && Array.from(node.children).some((child) => ['div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(child.tagName.toLowerCase()));
        if (nestedBlocks) visit(node); else blocks.push({ node });
      } else {
        inline.push(node);
      }
    });
  };
  visit(root);
  flushInline();
  return blocks;
};

const runStyleFor = (node, inherited) => {
  const next = { ...inherited };
  if (node.nodeType !== 1) return next;
  const tag = node.tagName.toLowerCase();
  const style = node.getAttribute('style') || '';
  if (tag === 'b' || tag === 'strong' || /font-weight\s*:\s*(bold|[6-9]00)/i.test(style)) next.bold = true;
  if (tag === 'i' || tag === 'em' || /font-style\s*:\s*italic/i.test(style)) next.italics = true;
  if (tag === 'u' || /text-decoration[^;]*underline/i.test(style)) next.underline = true;
  if (tag === 's' || tag === 'strike' || /text-decoration[^;]*line-through/i.test(style)) next.strike = true;
  if (tag === 'sub') next.subScript = true;
  if (tag === 'sup') next.superScript = true;
  const font = /font-family\s*:\s*([^;]+)/i.exec(style)?.[1]?.replace(/["']/g, '').split(',')[0].trim();
  if (font) next.font = font;
  const size = /font-size\s*:\s*([^;]+)/i.exec(style)?.[1];
  if (size) {
    const twips = cssLengthToTwips(size);
    if (twips > 0) next.size = Math.max(8, Math.round((twips / 20) * 2));
  }
  const color = /(?:^|;)\s*color\s*:\s*(#[0-9a-f]{3,8}|rgb\([^)]*\))/i.exec(style)?.[1];
  if (color) {
    const rgb = color.match(/\d+/g);
    next.color = color.startsWith('#') ? color.replace('#', '').slice(0, 6).toUpperCase() : (rgb || []).slice(0, 3).map((part) => Number(part).toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  return next;
};

const docxRuns = (node, inherited, TextRun, Tab, runs = []) => {
  if (node.nodeType === 3) {
    const options = { font: inherited.font || DOC_FONT, size: inherited.size || 24 };
    ['bold', 'italics', 'underline', 'strike', 'subScript', 'superScript', 'color'].forEach((key) => { if (inherited[key]) options[key] = key === 'underline' ? { type: 'single' } : inherited[key]; });
    String(node.nodeValue || '').split('\t').forEach((part, index, pieces) => {
      if (part) runs.push(new TextRun({ ...options, text: part }));
      if (index < pieces.length - 1) runs.push(new TextRun({ ...options, children: [new Tab()] }));
    });
    return runs;
  }
  if (node.nodeType !== 1) return runs;
  const tag = node.tagName.toLowerCase();
  if (tag === 'br') { runs.push(new TextRun({ break: 1 })); return runs; }
  const style = runStyleFor(node, inherited);
  Array.from(node.childNodes).forEach((child) => docxRuns(child, style, TextRun, Tab, runs));
  if (tag === 'td' || tag === 'th') runs.push(new TextRun({ children: [new Tab()] }));
  return runs;
};

export const htmlToDocxParagraphs = (html, TextRun, Paragraph, Tab, AlignmentType) => {
  const root = document.createElement('div');
  root.innerHTML = normalizeParagraphSpacing(html);
  return htmlBlocks(root).map(({ node, list, listIndex }) => {
    const runs = [];
    if (list === 'ol') runs.push(new TextRun({ text: `${listIndex}. `, font: DOC_FONT, size: 24 }));
    docxRuns(node, { font: DOC_FONT, size: 24 }, TextRun, Tab, runs);
    if (!runs.length) runs.push(new TextRun({ text: '' }));
    const rawStyle = node.getAttribute?.('style') || '';
    const align = /text-align\s*:\s*(center|right|justify|left)/i.exec(rawStyle)?.[1]?.toLowerCase();
    const alignment = align === 'center' ? AlignmentType.CENTER : align === 'right' ? AlignmentType.RIGHT : align === 'justify' ? AlignmentType.JUSTIFIED : AlignmentType.LEFT;
    const indent = /text-indent\s*:\s*([^;]+)/i.exec(rawStyle)?.[1];
    const paragraphOptions = {
      children: runs,
      alignment,
      spacing: { before: 0, after: 0, line: 240 },
      ...(indent ? { indent: { firstLine: Math.max(0, cssLengthToTwips(indent)) } } : {}),
      ...(list === 'ul' ? { bullet: { level: 0 } } : {}),
    };
    return new Paragraph(paragraphOptions);
  });
};

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

export const downloadDocx = async (text, baseName = 'transcript', html = '') => {
  const { Document, Packer, Paragraph, TextRun, Tab, AlignmentType } = await import('docx');
  let paragraphs = html ? htmlToDocxParagraphs(html, TextRun, Paragraph, Tab, AlignmentType) : [];
  if (!paragraphs.length) {
    paragraphs = String(text || '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').split('\n').map((line) => {
      const tabs = (/^\t*/.exec(line) || [''])[0].length;
      const body = line.slice(tabs);
      const children = [];
      for (let i = 0; i < tabs; i += 1) children.push(new TextRun({ children: [new Tab()] }));
      if (body) children.push(new TextRun({ text: body }));
      if (!children.length) children.push(new TextRun({ text: '' }));
      return new Paragraph({ children, spacing: { before: 0, after: 0, line: 240 } });
    });
  }
  const doc = new Document({
    defaultTabStop: 720,
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
