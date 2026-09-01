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

// The reply comes back as plain text with the occasional markdown flourish.
// We render it as text, never as HTML, and only turn **bold** into bold and
// blank lines into paragraphs. Anything else is shown exactly as written.
const renderAnswer = (text) => {
  const blocks = String(text || '').split(/\n{2,}/);
  return blocks.map((block, bi) => (
    <p key={bi} className="tm-ask-p">
      {block.split('\n').map((line, li) => (
        <React.Fragment key={li}>
          {li > 0 && <br />}
          {line.split(/(\*\*[^*]+\*\*)/g).map((part, pi) =>
            part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
              <strong key={pi}>{part.slice(2, -2)}</strong>
            ) : (
              <React.Fragment key={pi}>{part}</React.Fragment>
            )
          )}
        </React.Fragment>
      ))}
    </p>
  ));
};

const AskChat = ({
  messages,
  onMessagesChange,
  transcript = '',
  provider = 'claude',
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

  // Keep the newest message in view as the conversation grows.
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
      body.append('provider', provider);
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
  }, [draft, files, busy, messages, onMessagesChange, provider, transcript, userPlan, userEmail]);

  const onKeyDown = (e) => {
    // Enter sends, Shift+Enter starts a new line. Standard for a chat box.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className={'tm-ask' + (compact ? ' tm-ask-compact' : '')}>
      <div className="tm-ask-thread">
        {messages.length === 0 && (
          <div className="tm-ask-empty">
            <div className="tm-ask-empty-title">{emptyTitle}</div>
            <p className="tm-ask-empty-hint">{emptyHint}</p>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={'tm-ask-turn tm-ask-' + m.role}>
            <div className="tm-ask-who">{m.role === 'user' ? 'You' : 'TypeMyworDz'}</div>
            <div className="tm-ask-body">
              {m.role === 'assistant' ? renderAnswer(m.content) : <p className="tm-ask-p">{m.content}</p>}
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
              <p className="tm-ask-p tm-ask-thinking">Thinking{'\u2026'}</p>
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
          >
            Attach
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
          >
            {busy ? 'Sending' : 'Send'}
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
