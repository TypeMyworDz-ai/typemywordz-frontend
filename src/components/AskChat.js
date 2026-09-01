import React, { useState, useRef, useEffect, useCallback } from 'react';

// The conversation itself. Used in two places: the standalone Ask TypeMyworDz
// page, and the panel beside a finished transcript. Everything about how a
// conversation looks and behaves lives here, so the two never drift apart.

const RAILWAY_BACKEND_URL =
  process.env.REACT_APP_RAILWAY_BACKEND_URL ||
  'https://backendforrailway-production-7128.up.railway.app';

const MAX_FILES = 8;
const MAX_FILE_MB = 20;

const fileLabel = (f) => {
  const kb = f.size / 1024;
  return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`;
};

// ---------------------------------------------------------------------------
// Turning the answer into something readable.
//
// The reply arrives as plain text with light markdown. It is rendered as TEXT,
// never as HTML, so nothing in an answer can inject markup into the page. We
// understand bold, italic, bullet lists and numbered lists, and we quietly
// drop stray asterisks, which otherwise leak into the answer and look broken.
// ---------------------------------------------------------------------------

export const parseInline = (s) => {
  const out = [];
  const re = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g;
  let last = 0;
  let m;
  const plain = (t) => t.replace(/\*\*/g, '');
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ text: plain(s.slice(last, m.index)) });
    const t = m[0];
    if (t.startsWith('**')) out.push({ text: t.slice(2, -2), bold: true });
    else if (t.startsWith('`')) out.push({ text: t.slice(1, -1), code: true });
    else out.push({ text: t.slice(1, -1), italic: true });
    last = m.index + t.length;
  }
  if (last < s.length) out.push({ text: plain(s.slice(last)) });
  return out.filter((r) => r.text !== '');
};

export const parseAnswer = (text) => {
  const lines = String(text || '')
    .replace(/\r\n/g, '\n')
    .trim()
    .split('\n');
  const blocks = [];
  let para = [];
  let list = null;
  const flushP = () => {
    if (para.length) {
      blocks.push({ type: 'p', lines: para });
      para = [];
    }
  };
  const flushL = () => {
    if (list) {
      blocks.push(list);
      list = null;
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushP();
      flushL();
      continue;
    }
    // A line of nothing but punctuation is leftover markdown, not content.
    if (/^[*\s_-]+$/.test(line) && !/[A-Za-z0-9]/.test(line)) {
      flushP();
      flushL();
      continue;
    }
    const h = line.match(/^#{1,6}\s+(.*)$/);
    const ul = line.match(/^\s*[-*\u2022]\s+(.*)$/);
    const ol = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    if (h) {
      flushP();
      flushL();
      blocks.push({ type: 'h', text: h[1] });
      continue;
    }
    if (ul) {
      flushP();
      if (!list || list.type !== 'ul') {
        flushL();
        list = { type: 'ul', items: [] };
      }
      list.items.push(ul[1]);
      continue;
    }
    if (ol) {
      flushP();
      if (!list || list.type !== 'ol') {
        flushL();
        list = { type: 'ol', items: [] };
      }
      list.items.push(ol[2]);
      continue;
    }
    flushL();
    para.push(line);
  }
  flushP();
  flushL();
  return blocks;
};

const Runs = ({ text }) => (
  <>
    {parseInline(text).map((r, i) => {
      if (r.bold) return <strong key={i}>{r.text}</strong>;
      if (r.italic) return <em key={i}>{r.text}</em>;
      if (r.code) return <code key={i} className="tm-ask-code">{r.text}</code>;
      return <React.Fragment key={i}>{r.text}</React.Fragment>;
    })}
  </>
);

const Answer = ({ text }) => (
  <>
    {parseAnswer(text).map((b, i) => {
      if (b.type === 'h') {
        return (
          <p key={i} className="tm-ask-h">
            <Runs text={b.text} />
          </p>
        );
      }
      if (b.type === 'ul') {
        return (
          <ul key={i} className="tm-ask-ul">
            {b.items.map((it, j) => (
              <li key={j}>
                <Runs text={it} />
              </li>
            ))}
          </ul>
        );
      }
      if (b.type === 'ol') {
        return (
          <ol key={i} className="tm-ask-ol">
            {b.items.map((it, j) => (
              <li key={j}>
                <Runs text={it} />
              </li>
            ))}
          </ol>
        );
      }
      return (
        <p key={i} className="tm-ask-p">
          {b.lines.map((ln, j) => (
            <React.Fragment key={j}>
              {j > 0 && <br />}
              <Runs text={ln} />
            </React.Fragment>
          ))}
        </p>
      );
    })}
  </>
);

// While the answer is on its way, the logo turns. No words, no bouncing dots.
const Working = () => (
  <div className="tm-ask-working" role="status" aria-label="Working on your answer">
    <img src="/android-chrome-192x192.png" alt="" className="tm-ask-spin" width="30" height="30" />
  </div>
);

const AskChat = ({
  messages,
  onMessagesChange,
  transcript = '',
  model = '',
  userPlan = 'free',
  userEmail = '',
  placeholder = 'Ask anything, or attach a file',
  compact = false,
  emptyTitle = 'Ask TypeMyworDz',
  emptyHint = 'Ask a question, paste something in, or attach an image, PDF or Word document.',
}) => {
  const [draft, setDraft] = useState('');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef(null);
  const fileRef = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => {
    if (endRef.current) endRef.current.scrollIntoView({ block: 'end' });
  }, [messages, busy]);

  // Grow the box with the question instead of making people scroll a two-line
  // field. There is no length limit, so this matters.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, compact ? 160 : 260) + 'px';
  }, [draft, compact]);

  const addFiles = useCallback((picked) => {
    setError('');
    const incoming = Array.from(picked || []);
    if (!incoming.length) return;
    const tooBig = incoming.filter((f) => f.size > MAX_FILE_MB * 1024 * 1024);
    if (tooBig.length) {
      setError(`${tooBig[0].name} is larger than ${MAX_FILE_MB} MB.`);
    }
    const usable = incoming.filter((f) => f.size <= MAX_FILE_MB * 1024 * 1024);
    setFiles((prev) => {
      const room = MAX_FILES - prev.length;
      if (room <= 0) {
        setError(`You can attach up to ${MAX_FILES} files at a time.`);
        return prev;
      }
      return prev.concat(usable.slice(0, room));
    });
  }, []);

  const removeFile = (idx) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const send = useCallback(async () => {
    const question = draft.trim();
    if ((!question && !files.length) || busy) return;

    setError('');
    const shown = question || `(${files.length} file${files.length === 1 ? '' : 's'} attached)`;
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    const next = messages.concat([{ role: 'user', content: shown }]);
    onMessagesChange(next);
    setDraft('');
    const sending = files;
    setFiles([]);
    setBusy(true);

    try {
      const body = new FormData();
      body.append('user_prompt', question || 'Please look at what I have attached.');
      body.append('history', JSON.stringify(history));
      body.append('model', model || '');
      body.append('user_plan', userPlan || 'free');
      body.append('user_email', userEmail || '');
      if (transcript) body.append('transcript', transcript);
      sending.forEach((f) => body.append('files', f, f.name));

      const res = await fetch(`${RAILWAY_BACKEND_URL}/ai/ask`, { method: 'POST', body });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const detail =
          data.detail ||
          (res.status === 403
            ? 'Ask TypeMyworDz is available on any paid plan.'
            : 'Something went wrong. Please try again.');
        setError(detail);
        onMessagesChange(messages);
        setDraft(question);
        setFiles(sending);
        return;
      }

      const problems = Array.isArray(data.attachment_problems) ? data.attachment_problems : [];
      onMessagesChange(
        next.concat([{ role: 'assistant', content: data.ai_response || '', problems }])
      );
    } catch (e) {
      setError('Could not reach the assistant. Check your connection and try again.');
      onMessagesChange(messages);
      setDraft(question);
      setFiles(sending);
    } finally {
      setBusy(false);
    }
  }, [draft, files, busy, messages, onMessagesChange, model, transcript, userPlan, userEmail]);

  const onKeyDown = (e) => {
    // Enter sends, Shift and Enter starts a new line. Standard for a chat box.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className={'tm-ask' + (compact ? ' tm-ask-compact' : '')}>
      <div className="tm-ask-thread">
        {messages.length === 0 && !busy && (
          <div className="tm-ask-empty">
            <div className="tm-ask-empty-title">{emptyTitle}</div>
            <p className="tm-ask-empty-hint">{emptyHint}</p>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={'tm-ask-turn tm-ask-' + m.role}>
            <div className="tm-ask-who">{m.role === 'user' ? 'You' : 'TypeMyworDz'}</div>
            <div className="tm-ask-body">
              {m.role === 'assistant' ? (
                <Answer text={m.content} />
              ) : (
                <p className="tm-ask-p">{m.content}</p>
              )}
              {Array.isArray(m.problems) && m.problems.length > 0 && (
                <ul className="tm-ask-problems">
                  {m.problems.map((p, pi) => (
                    <li key={pi}>Could not read {p}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}

        {busy && (
          <div className="tm-ask-turn tm-ask-assistant">
            <div className="tm-ask-who">TypeMyworDz</div>
            <div className="tm-ask-body">
              <Working />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="tm-ask-composer">
        {error && <div className="tm-ask-error">{error}</div>}

        {files.length > 0 && (
          <ul className="tm-ask-files">
            {files.map((f, i) => (
              <li key={i} className="tm-ask-file">
                <span className="tm-ask-file-name">{f.name}</span>
                <span className="tm-ask-file-size">{fileLabel(f)}</span>
                <button
                  type="button"
                  className="tm-ask-file-x"
                  onClick={() => removeFile(i)}
                  aria-label={`Remove ${f.name}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="tm-ask-row">
          <input
            ref={fileRef}
            type="file"
            multiple
            className="tm-ask-fileinput"
            accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.docx,.doc,.txt,.csv,.md"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            className="tm-ask-attach"
            onClick={() => fileRef.current && fileRef.current.click()}
            disabled={busy}
            title="Attach an image, PDF or Word document"
            aria-label="Attach a file"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5l-8.6 8.6a5 5 0 0 1-7-7l8.5-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.3l7.9-7.9" />
            </svg>
          </button>

          <textarea
            ref={boxRef}
            className="tm-ask-input"
            rows={1}
            value={draft}
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={busy}
          />

          <button
            type="button"
            className="tm-ask-send"
            onClick={send}
            disabled={busy || (!draft.trim() && !files.length)}
            aria-label="Send"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12h15M13 6l6 6-6 6" />
            </svg>
          </button>
        </div>
        <div className="tm-ask-hint">
          Enter sends, Shift and Enter starts a new line. Images, PDFs and Word documents can be attached.
        </div>
      </div>
    </div>
  );
};

export default AskChat;
