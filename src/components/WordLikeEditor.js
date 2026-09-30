import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';

// A plain, familiar writing surface for workers. It behaves like a word
// processor: text pasted from Word keeps its bold, italics, underline,
// indents, tabs and double spaces, and nothing is reflowed.
//
// It has two modes:
//   * single: one document (a whole job, or one part of a job)
//   * combined: the proofreader's view, where every part sits in the same
//     document, separated by a dotted line that says "Part N by Worker N".

const ALLOWED_TAGS = new Set(['p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'sub', 'sup', 'span', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'hr', 'blockquote', 'pre', 'font']);
const DROP_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'form', 'input', 'button', 'textarea', 'select', 'svg', 'math', 'head', 'title', 'xml', 'img']);
const STYLE_PROPS = new Set(['font-weight', 'font-style', 'text-decoration', 'text-align', 'text-indent', 'margin', 'padding', 'margin-left', 'margin-right', 'margin-top', 'margin-bottom', 'padding-left', 'line-height', 'font-family', 'font-size', 'color', 'background-color', 'white-space', 'text-transform', 'letter-spacing', 'vertical-align']);

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
        to.appendChild(document.createTextNode(node.nodeValue.replace(/\s*[\r\n]+\s*/g, ' ')));
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

const TOOLBAR = [
  ['bold', 'B', 'Bold', { fontWeight: 700 }],
  ['italic', 'I', 'Italic', { fontStyle: 'italic' }],
  ['underline', 'U', 'Underline', { textDecoration: 'underline' }],
  ['undo', 'Undo', 'Undo', {}],
  ['redo', 'Redo', 'Redo', {}],
];

const WordLikeEditor = forwardRef(function WordLikeEditor({ initialHtml = '', initialText = '', parts = null, onChange, disabled = false, minHeight = 420 }, ref) {
  const rootRef = useRef(null);
  const [loadable, setLoadable] = useState([]);
  const combined = Array.isArray(parts);
  const seedRef = useRef(null);
  if (seedRef.current === null) seedRef.current = combined ? combinedPartsHtml(parts) : (initialHtml || plainTextToHtml(initialText));

  const emit = useCallback(() => {
    const root = rootRef.current;
    if (!root || !onChange) return;
    const clone = root.cloneNode(true);
    clone.querySelectorAll('[data-tm-skip]').forEach((node) => node.remove());
    const html = combined
      ? Array.from(clone.querySelectorAll('[data-tm-part]')).map((node) => node.innerHTML).join('<div><br></div>')
      : clone.innerHTML;
    onChange(domToPlainText(root), html);
  }, [combined, onChange]);

  useEffect(() => {
    if (rootRef.current) { rootRef.current.innerHTML = seedRef.current; emit(); }
    // The seed is applied once per mount; the parent remounts with a key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(ref, () => ({
    insertText: (text) => {
      const root = rootRef.current;
      if (!root) return;
      root.focus();
      const value = String(text || '');
      if (!document.execCommand('insertText', false, value)) {
        root.appendChild(document.createTextNode(value));
      }
      emit();
    },
  }), [emit]);

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

  const onPaste = (event) => {
    if (disabled) return;
    const data = event.clipboardData;
    if (!data) return;
    const html = data.getData('text/html');
    event.preventDefault();
    if (html && html.trim()) {
      const clean = sanitizePastedHtml(html);
      if (clean.trim()) { document.execCommand('insertHTML', false, clean); emit(); return; }
    }
    document.execCommand('insertText', false, data.getData('text/plain'));
    emit();
  };

  const command = (name) => { rootRef.current?.focus(); document.execCommand(name, false, null); emit(); };

  return (
    <div className="tm-word-editor" style={{ border: '1px solid #d9dfda', borderRadius: 8, background: '#fff' }}>
      <div role="toolbar" aria-label="Formatting" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, padding: '8px 10px', borderBottom: '1px solid #e5e9e5', background: '#fafbfa', borderRadius: '8px 8px 0 0' }}>
        {TOOLBAR.map(([name, label, title, style]) => (
          <button key={name} type="button" title={title} aria-label={title} disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => command(name)} style={{ minWidth: 32, height: 28, border: '1px solid #d9dfda', borderRadius: 5, background: '#fff', cursor: 'pointer', font: '13px system-ui,sans-serif', ...style }}>{label}</button>
        ))}
        <span style={{ marginLeft: 'auto', color: '#7b857d', fontSize: 12 }}>Paste from Word and the formatting stays as it is.</span>
      </div>
      {combined && loadable.length > 0 && (
        <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#eef7f0', borderBottom: '1px solid #d6e9da', fontSize: 13 }}>
          <span>{loadable.length === 1 ? 'A new part has been submitted.' : `${loadable.length} new parts have been submitted.`}</span>
          <button type="button" onClick={loadNewParts} style={{ border: '1px solid #2da653', background: '#2da653', color: '#fff', borderRadius: 5, padding: '5px 10px', cursor: 'pointer' }}>Load newly submitted parts</button>
        </div>
      )}
      <div
        ref={rootRef}
        className="tm-word-editor-surface"
        contentEditable={!disabled}
        suppressContentEditableWarning
        spellCheck
        role="textbox"
        aria-multiline="true"
        aria-label="Transcript editor"
        onInput={emit}
        onPaste={onPaste}
        style={{ minHeight, padding: '22px 28px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', outline: 'none', fontFamily: '"Century Gothic", Calibri, system-ui, sans-serif', fontSize: 15, lineHeight: 1.5, tabSize: 4, color: '#1f2721' }}
      />
    </div>
  );
});

export default WordLikeEditor;
