import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { copyPlainText, copyRich, downloadDocx, nodeToWordHtml, safeFileName } from '../utils/transcriptExport';

// A plain, familiar writing surface for workers. It behaves like a word
// processor: text pasted from Word keeps its bold, italics, underline,
// indents, tabs and double spaces, and nothing is reflowed.
//
// It has two modes:
//   * single: one document (a whole job, or one part of a job)
//   * combined: the proofreader's view, where every part sits in the same
//     document, separated by a dotted line that says "Part N by Worker N".

const ALLOWED_TAGS = new Set(['p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'sub', 'sup', 'span', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'hr', 'blockquote', 'pre', 'font', 'caption', 'colgroup', 'col', 'tfoot', 'a', 'small', 'big', 'mark', 'code']);
const DROP_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'form', 'input', 'button', 'textarea', 'select', 'svg', 'math', 'head', 'title', 'xml', 'img']);
const STYLE_PROPS = new Set(['font-weight', 'font-style', 'text-decoration', 'text-align', 'text-indent', 'margin', 'padding', 'margin-left', 'margin-right', 'margin-top', 'margin-bottom', 'padding-left', 'line-height', 'font-family', 'font-size', 'color', 'background-color', 'white-space', 'text-transform', 'letter-spacing', 'vertical-align', 'border', 'border-collapse', 'border-top', 'border-bottom', 'border-left', 'border-right', 'width', 'text-align-last', 'list-style-type']);

const escapeHtml = (value) => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const plainTextToHtml = (text) => {
  const value = String(text || '');
  if (!value) return '';
  return value.split('\n').map((line) => `<div>${line ? escapeHtml(line) : '<br>'}</div>`).join('');
};

const cleanStyle = (style) => {
  const kept = [];
  String(style || '').split(';').forEach((chunk) => {
    const at = chunk.indexOf(':');
    if (at < 0) return;
    const prop = chunk.slice(0, at).trim().toLowerCase();
    const value = chunk.slice(at + 1).trim();
    if (!STYLE_PROPS.has(prop) || !value || /url\(|expression|javascript|@import|[<>]/i.test(value)) return;
    kept.push(`${prop}:${value}`);
  });
  return kept.join('; ');
};

// Turns the HTML Word puts on the clipboard into clean, safe markup.
export const sanitizePastedHtml = (html) => {
  const source = String(html || '')
    .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const doc = new DOMParser().parseFromString(source, 'text/html');
  const out = document.createElement('div');
  const walk = (from, to) => {
    from.childNodes.forEach((node) => {
      if (node.nodeType === 3) {
        // Word wraps long paragraphs in the source with newlines; those are
        // not line breaks in the document.
        to.appendChild(document.createTextNode(node.nodeValue.replace(/\s*[\r\n]+\s*/g, ' ').replace(/\u00a0/g, ' ')));
        return;
      }
      if (node.nodeType !== 1) return;
      const tag = node.tagName.toLowerCase();
      if (DROP_TAGS.has(tag)) return;
      const style = node.getAttribute('style') || '';
      const tabMatch = /mso-tab-count:\s*(\d+)/i.exec(style);
      if (tag === 'span' && tabMatch) {
        to.appendChild(document.createTextNode('\t'.repeat(Math.max(1, Number(tabMatch[1]) || 1))));
        return;
      }
      if (/mso-spacerun:\s*yes/i.test(style)) {
        to.appendChild(document.createTextNode(node.textContent.replace(/\u00a0/g, ' ')));
        return;
      }
      if (!ALLOWED_TAGS.has(tag)) { walk(node, to); return; }
      const el = document.createElement(tag);
      const cleaned = cleanStyle(style);
      if (cleaned) el.setAttribute('style', cleaned);
      if (tag === 'br') { to.appendChild(el); return; }
      ['colspan', 'rowspan'].forEach((name) => { if (/^\d+$/.test(node.getAttribute(name) || '')) el.setAttribute(name, node.getAttribute(name)); });
      walk(node, el);
      to.appendChild(el);
    });
  };
  walk(doc.body, out);
  return out.innerHTML;
};

const BLOCK_TAGS = new Set(['DIV', 'P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TR', 'BLOCKQUOTE', 'PRE', 'UL', 'OL', 'TABLE', 'HR']);

// Plain text with the line breaks a person would expect, skipping anything
// marked as a divider or placeholder.
export const domToPlainText = (root) => {
  let out = '';
  const endLine = () => { if (out && !out.endsWith('\n')) out += '\n'; };
  const walk = (node) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === 3) { out += child.nodeValue; return; }
      if (child.nodeType !== 1) return;
      if (child.hasAttribute('data-tm-skip')) return;
      if (child.tagName === 'BR') { out += '\n'; return; }
      if (child.tagName === 'TD' || child.tagName === 'TH') { walk(child); out += '\t'; return; }
      const block = BLOCK_TAGS.has(child.tagName);
      if (block) endLine();
      walk(child);
      if (block) endLine();
    });
  };
  walk(root);
  return out.replace(/\n{3,}/g, '\n\n').replace(/\s+$/g, '');
};

const dividerHtml = (part) => `<div data-tm-skip="1" data-tm-divider="${escapeHtml(part.id)}" contenteditable="false" style="user-select:none;margin:18px 0 10px;padding:6px 0;border-top:2px dotted #8a94a6;color:#5b6472;font:600 12px system-ui,sans-serif;letter-spacing:.04em;text-transform:uppercase">Part ${part.index} by ${escapeHtml(part.author_label || 'worker')}</div>`;
const pendingHtml = (part) => `<div data-tm-skip="1" data-tm-pending="${escapeHtml(part.id)}" contenteditable="false" style="user-select:none;margin:0 0 12px;padding:10px 12px;background:#f7f4ea;border:1px dashed #d8c98e;border-radius:6px;color:#7a5f1b;font:13px system-ui,sans-serif">Part ${part.index} is still being transcribed. It will appear here once it is submitted.</div>`;
const bodyHtml = (part) => `<div data-tm-part="${escapeHtml(part.id)}">${part.transcript_html || plainTextToHtml(part.transcript) || '<div><br></div>'}</div>`;

export const combinedPartsHtml = (parts) => (parts || []).map((part) => dividerHtml(part) + (part.pending ? pendingHtml(part) : bodyHtml(part))).join('');


const FONTS = ['Century Gothic', 'Times New Roman', 'Arial', 'Calibri', 'Cambria', 'Courier New', 'Georgia', 'Verdana', 'Tahoma'];
const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36];

const Btn = ({ title, label, onClick, active, wide, style }) => (
  <button type="button" title={title} aria-label={title} aria-pressed={active ? 'true' : undefined} onMouseDown={(event) => event.preventDefault()} onClick={onClick} className={`tm-we-btn${active ? ' is-on' : ''}${wide ? ' is-wide' : ''}`} style={style}>{label}</button>
);

const textStats = (text) => {
  const value = String(text || '');
  const words = (value.match(/\S+/g) || []).length;
  const tabs = (value.match(/\t/g) || []).length;
  const oneSpace = (value.match(/[.!?]["')\]]? (?=[A-Z])/g) || []).length;
  return { words, chars: value.length, tabs, oneSpace };
};

const WordLikeEditor = forwardRef(function WordLikeEditor({ initialHtml = '', initialText = '', parts = null, onChange, disabled = false, minHeight = 420, fileName = 'transcript' }, ref) {
  const rootRef = useRef(null);
  const [loadable, setLoadable] = useState([]);
  const [stats, setStats] = useState({ words: 0, chars: 0, tabs: 0, oneSpace: 0 });
  const [formats, setFormats] = useState({});
  const [note, setNote] = useState('');
  const [marks, setMarks] = useState(false);
  const [zoom, setZoom] = useState(100);
  const combined = Array.isArray(parts);
  const seedRef = useRef(null);
  if (seedRef.current === null) seedRef.current = combined ? combinedPartsHtml(parts) : (initialHtml || plainTextToHtml(initialText));

  const flash = (message) => { setNote(message); window.setTimeout(() => setNote(''), 3500); };

  const emit = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const text = domToPlainText(root);
    setStats(textStats(text));
    if (!onChange) return;
    const clone = root.cloneNode(true);
    clone.querySelectorAll('[data-tm-skip]').forEach((node) => node.remove());
    const partNodes = Array.from(clone.querySelectorAll('[data-tm-part]'));
    const html = combined && partNodes.length
      ? partNodes.map((node) => node.innerHTML).join('<div><br></div>')
      : clone.innerHTML;
    onChange(text, html);
  }, [combined, onChange]);

  useEffect(() => {
    if (rootRef.current) { rootRef.current.innerHTML = seedRef.current; emit(); }
    // The seed is applied once per mount; the parent remounts with a key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(ref, () => ({
    insertText: (text) => {
      const root = rootRef.current;
      if (!root || disabled) return;
      root.focus();
      const value = String(text || '');
      if (!document.execCommand('insertText', false, value)) {
        root.appendChild(document.createTextNode(value));
      }
      emit();
    },
    replaceContent: (text, html = '') => {
      const root = rootRef.current;
      if (!root || disabled) return;
      root.innerHTML = html ? sanitizePastedHtml(html) : plainTextToHtml(text);
      root.focus();
      emit();
    },
    getParts: () => {
      const root = rootRef.current;
      if (!root) return [];
      return Array.from(root.querySelectorAll('[data-tm-part]')).map((node) => ({
        id: node.getAttribute('data-tm-part') || '',
        transcript: domToPlainText(node),
        transcript_html: node.innerHTML,
      })).filter((part) => part.id);
    },
  }), [disabled, emit]);

  // Combined mode: notice parts that were submitted after the editor opened.
  useEffect(() => {
    if (!combined || !rootRef.current) return;
    const waiting = (parts || []).filter((part) => !part.pending && rootRef.current.querySelector(`[data-tm-pending="${CSS.escape(String(part.id))}"]`));
    setLoadable((current) => (current.length === waiting.length && current.every((id, index) => id === waiting[index].id) ? current : waiting.map((part) => part.id)));
  }, [combined, parts]);

  const loadNewParts = () => {
    const root = rootRef.current;
    if (!root) return;
    (parts || []).forEach((part) => {
      const placeholder = root.querySelector(`[data-tm-pending="${CSS.escape(String(part.id))}"]`);
      if (placeholder && !part.pending) {
        const holder = document.createElement('div');
        holder.innerHTML = bodyHtml(part);
        placeholder.replaceWith(holder.firstChild);
      }
    });
    setLoadable([]);
    emit();
  };

  const refreshFormats = () => {
    if (disabled || !rootRef.current || !rootRef.current.contains(document.getSelection()?.anchorNode || null)) return;
    const next = {};
    ['bold', 'italic', 'underline', 'strikeThrough', 'subscript', 'superscript', 'insertUnorderedList', 'insertOrderedList', 'justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull'].forEach((name) => {
      try { next[name] = document.queryCommandState(name); } catch { next[name] = false; }
    });
    setFormats(next);
  };
  useEffect(() => {
    document.addEventListener('selectionchange', refreshFormats);
    return () => document.removeEventListener('selectionchange', refreshFormats);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  const insertHtmlOrText = (html, plain) => {
    if (html && html.trim()) {
      const clean = sanitizePastedHtml(html);
      if (clean.trim()) { document.execCommand('insertHTML', false, clean); return; }
    }
    document.execCommand('insertText', false, plain || '');
  };

  const onPaste = (event) => {
    if (disabled) return;
    const data = event.clipboardData;
    if (!data) return;
    event.preventDefault();
    insertHtmlOrText(data.getData('text/html'), data.getData('text/plain'));
    emit();
  };

  // Whatever is selected leaves the editor with its tabs and double spaces
  // written the way Word reads them, plus a plain-text version with real tabs.
  const onCopy = (event) => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !rootRef.current?.contains(selection.anchorNode)) return;
    const holder = document.createElement('div');
    holder.appendChild(selection.getRangeAt(0).cloneContents());
    holder.querySelectorAll('[data-tm-skip]').forEach((node) => node.remove());
    event.clipboardData.setData('text/html', nodeToWordHtml(holder));
    event.clipboardData.setData('text/plain', domToPlainText(holder));
    event.preventDefault();
    if (event.type === 'cut' && !disabled) { document.execCommand('delete'); emit(); }
  };

  const onKeyDown = (event) => {
    if (disabled) return;
    if (event.key === 'Tab') {
      event.preventDefault();
      if (event.shiftKey) {
        const selection = window.getSelection();
        if (selection && selection.isCollapsed && selection.anchorNode?.nodeType === 3) {
          const text = selection.anchorNode.nodeValue;
          const at = selection.anchorOffset;
          if (at > 0 && text[at - 1] === '\t') { selection.modify('extend', 'backward', 'character'); document.execCommand('delete'); emit(); }
        }
        return;
      }
      document.execCommand('insertText', false, '\t');
      emit();
    }
  };

  const command = (name, value = null) => { rootRef.current?.focus(); document.execCommand(name, false, value); emit(); refreshFormats(); };

  const setSize = (pt) => {
    rootRef.current?.focus();
    document.execCommand('fontSize', false, '7');
    rootRef.current?.querySelectorAll('font[size="7"]').forEach((node) => {
      const span = document.createElement('span');
      span.style.fontSize = `${pt}pt`;
      span.innerHTML = node.innerHTML;
      node.replaceWith(span);
    });
    emit();
  };

  const clearFormatting = () => { command('removeFormat'); };

  const insertTab = () => command('insertText', '\t');

  const blockText = () => domToPlainText(rootRef.current);
  const copyAs = async (kind) => {
    const root = rootRef.current;
    if (!root) return;
    const holder = root.cloneNode(true);
    holder.querySelectorAll('[data-tm-skip]').forEach((node) => node.remove());
    try {
      if (kind === 'word') { await copyRich(nodeToWordHtml(holder), blockText()); flash('Copied for Word. Indents and double spaces will stay.'); }
      else if (kind === 'plain') { await copyPlainText(blockText()); flash('Copied as plain text with real tabs.'); }
      else { await copyPlainText(holder.innerHTML); flash('Copied the markup (HTML).'); }
    } catch { flash('Copying was blocked by the browser.'); }
  };
  const downloadPlain = () => {
    const blob = new Blob([blockText()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'transcript.txt'; document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 20000);
  };
  const downloadWord = async () => {
    const root = rootRef.current;
    const holder = root?.cloneNode(true);
    holder?.querySelectorAll('[data-tm-skip]').forEach((node) => node.remove());
    try { await downloadDocx(blockText(), safeFileName(fileName), holder?.innerHTML || ''); flash('Word document downloaded.'); }
    catch { flash('The Word document could not be created.'); }
  };

  const fontChange = (event) => { if (event.target.value) command('fontName', event.target.value); event.target.value = ''; };
  const sizeChange = (event) => { if (event.target.value) setSize(Number(event.target.value)); event.target.value = ''; };

  return (
    <div className="tm-word-editor" style={{ border: '1px solid #d9dfda', borderRadius: 10, background: '#fff' }}>
      <style>{`
        .tm-we-bar{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px 10px;border-bottom:1px solid #e5e9e5;background:#f8f9fb;border-radius:10px 10px 0 0;position:sticky;top:0;z-index:5}
        .tm-we-group{display:flex;align-items:center;gap:3px;padding-right:8px;margin-right:2px;border-right:1px solid #e1e5ea}
        .tm-we-group:last-child{border-right:0}
        .tm-we-btn{min-width:30px;height:28px;padding:0 7px;border:1px solid transparent;border-radius:6px;background:transparent;color:#2b2f38;cursor:pointer;font:13px system-ui,sans-serif}
        .tm-we-btn:hover{background:#ece8f6}
        .tm-we-btn.is-on{background:#e3d9f7;border-color:#c9b8ee;color:#4b2a8a}
        .tm-we-btn.is-wide{padding:0 10px}
        .tm-we-select{height:28px;border:1px solid #d9dfda;border-radius:6px;background:#fff;font:12.5px system-ui,sans-serif;color:#2b2f38;padding:0 4px;max-width:132px}
        .tm-we-color{width:26px;height:26px;padding:0;border:1px solid #d9dfda;border-radius:6px;background:#fff;cursor:pointer}
        .tm-we-status{display:flex;flex-wrap:wrap;align-items:center;gap:14px;padding:7px 14px;border-top:1px solid #e5e9e5;background:#f8f9fb;border-radius:0 0 10px 10px;font:12px system-ui,sans-serif;color:#5b6472}
        .tm-we-status .warn{color:#8a5a00}
        .tm-we-page{background:#eef0f4;padding:18px 12px;border-radius:0}
        .tm-we-sheet{max-width:816px;margin:0 auto;background:#fff;box-shadow:0 1px 4px rgba(20,24,40,.18);transform-origin:top center}
        .tm-we-surface table{border-collapse:collapse}
        .tm-we-surface td,.tm-we-surface th{border:1px solid #c9ced6;padding:4px 8px;vertical-align:top}
        .tm-we-surface.marks div::after,.tm-we-surface.marks p::after{content:"\\00b6";color:#9aa3b2;font-size:.85em}
      `}</style>
      {!disabled && <div role="toolbar" aria-label="Formatting" className="tm-we-bar">
        <div className="tm-we-group">
          <Btn title="Undo (Ctrl+Z)" label="Undo" wide onClick={() => command('undo')} />
          <Btn title="Redo (Ctrl+Y)" label="Redo" wide onClick={() => command('redo')} />
        </div>
        <div className="tm-we-group">
          <select className="tm-we-select" aria-label="Font" defaultValue="" onChange={fontChange}><option value="">Font</option>{FONTS.map((font) => <option key={font} value={font}>{font}</option>)}</select>
          <select className="tm-we-select" aria-label="Font size" defaultValue="" onChange={sizeChange} style={{ maxWidth: 64 }}><option value="">Size</option>{SIZES.map((size) => <option key={size} value={size}>{size}</option>)}</select>
        </div>
        <div className="tm-we-group">
          <Btn title="Bold (Ctrl+B)" label={<b>B</b>} active={formats.bold} onClick={() => command('bold')} />
          <Btn title="Italic (Ctrl+I)" label={<i>I</i>} active={formats.italic} onClick={() => command('italic')} />
          <Btn title="Underline (Ctrl+U)" label={<u>U</u>} active={formats.underline} onClick={() => command('underline')} />
          <Btn title="Strikethrough" label={<s>S</s>} active={formats.strikeThrough} onClick={() => command('strikeThrough')} />
          <Btn title="Subscript" label={<span>x<sub>2</sub></span>} active={formats.subscript} onClick={() => command('subscript')} />
          <Btn title="Superscript" label={<span>x<sup>2</sup></span>} active={formats.superscript} onClick={() => command('superscript')} />
        </div>
        <div className="tm-we-group">
          <label title="Text colour" className="tm-we-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>A<input className="tm-we-color" type="color" aria-label="Text colour" defaultValue="#000000" onChange={(event) => command('foreColor', event.target.value)} /></label>
          <label title="Highlight" className="tm-we-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>Hi<input className="tm-we-color" type="color" aria-label="Highlight colour" defaultValue="#ffff00" onChange={(event) => command('hiliteColor', event.target.value)} /></label>
        </div>
        <div className="tm-we-group">
          <Btn title="Align left" label="Left" wide active={formats.justifyLeft} onClick={() => command('justifyLeft')} />
          <Btn title="Centre" label="Centre" wide active={formats.justifyCenter} onClick={() => command('justifyCenter')} />
          <Btn title="Align right" label="Right" wide active={formats.justifyRight} onClick={() => command('justifyRight')} />
          <Btn title="Justify" label="Justify" wide active={formats.justifyFull} onClick={() => command('justifyFull')} />
        </div>
        <div className="tm-we-group">
          <Btn title="Bulleted list" label="Bullets" wide active={formats.insertUnorderedList} onClick={() => command('insertUnorderedList')} />
          <Btn title="Numbered list" label="Numbers" wide active={formats.insertOrderedList} onClick={() => command('insertOrderedList')} />
          <Btn title="Insert a tab character (Tab key)" label="Tab" wide onClick={insertTab} />
          <Btn title="Block indent" label="Indent" wide onClick={() => command('indent')} />
          <Btn title="Remove block indent" label="Outdent" wide onClick={() => command('outdent')} />
        </div>
        <div className="tm-we-group">
          <Btn title="Clear formatting" label="Clear" wide onClick={clearFormatting} />
          <Btn title="Show paragraph marks" label="Marks" wide active={marks} onClick={() => setMarks((value) => !value)} />
        </div>
        <div className="tm-we-group" style={{ borderRight: 0 }}>
          <Btn title="Copy with Word formatting" label="Copy for Word" wide onClick={() => copyAs('word')} />
          <Btn title="Download as a Word document" label="Download Word" wide onClick={downloadWord} />
          <Btn title="Copy as plain text" label="Copy plain" wide onClick={() => copyAs('plain')} />
          <Btn title="Copy the HTML markup" label="Copy markup" wide onClick={() => copyAs('markup')} />
          <Btn title="Download plain text" label="Save .txt" wide onClick={downloadPlain} />
        </div>
      </div>}
      {combined && loadable.length > 0 && (
        <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#eef7f0', borderBottom: '1px solid #d6e9da', fontSize: 13 }}>
          <span>{loadable.length === 1 ? 'A new part has been submitted.' : `${loadable.length} new parts have been submitted.`}</span>
          <button type="button" onClick={loadNewParts} style={{ border: '1px solid #2da653', background: '#2da653', color: '#fff', borderRadius: 5, padding: '5px 10px', cursor: 'pointer' }}>Load newly submitted parts</button>
        </div>
      )}
      <div className="tm-we-page">
        <div className="tm-we-sheet">
          <div
            ref={rootRef}
            className={`tm-word-editor-surface tm-we-surface${marks ? ' marks' : ''}`}
            contentEditable={!disabled}
            suppressContentEditableWarning
            spellCheck
            role="textbox"
            aria-multiline="true"
            aria-label="Transcript editor"
            onInput={emit}
            onPaste={onPaste}
            onCopy={onCopy}
            onCut={onCopy}
            onKeyDown={onKeyDown}
            style={{ minHeight, padding: '48px 56px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', outline: 'none', fontFamily: '"Century Gothic", Calibri, system-ui, sans-serif', fontSize: (15 * zoom) / 100, lineHeight: 1.5, tabSize: 8, color: '#1f2721' }}
          />
        </div>
      </div>
      <div className="tm-we-status">
        <span>{stats.words.toLocaleString()} words</span>
        <span>{stats.chars.toLocaleString()} characters</span>
        <span>{stats.tabs} tab{stats.tabs === 1 ? '' : 's'}</span>
        {stats.oneSpace > 0 && !disabled && <span className="warn">{stats.oneSpace} sentence{stats.oneSpace === 1 ? '' : 's'} with a single space after the full stop</span>}
        {note && <span style={{ color: '#267b40' }}>{note}</span>}
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>Zoom <select className="tm-we-select" aria-label="Zoom" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} style={{ maxWidth: 74 }}>{[80, 90, 100, 110, 125].map((value) => <option key={value} value={value}>{value}%</option>)}</select></span>
      </div>
      {!disabled && <div style={{ padding: '6px 14px 10px', color: '#7b857d', fontSize: 12 }}>Paste from Word and the formatting stays. The Tab key types a real tab. Copy for Word keeps tabs and double spaces.</div>}
    </div>
  );
});

export default WordLikeEditor;
