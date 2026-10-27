import React, { useState, useEffect, useCallback, useRef } from 'react';

// ---------------------------------------------------------------------------
// The announcements strip.
//
// This used to be a centred carousel of slogans that faded past on a timer with
// no way to stop it, go back, or act on anything it said. It looked like
// decoration, so people stopped reading it.
//
// Three changes make it useful:
//   1. Every message is labelled, so you know at a glance whether you are being
//      given a tip, told about something new, or shown an offer.
//   2. Messages can carry an action. A line about pricing now takes you to
//      pricing. That turns the strip from noise into a shortcut.
//   3. You are in control: it pauses when you hover or focus it, you can step
//      through with the arrows or the dots, and it honours the operating
//      system's "reduce motion" setting.
// ---------------------------------------------------------------------------

const BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';

// The messages are managed by the admin (Broadcasts tab, "Homepage tips").
// This single message is shown until they load, or if they cannot be reached.
const FALLBACK = [{
  id: 'typescribe', kind: 'tip', title: '', link_label: 'Download our main tool, TypeScribe',
  link_url: 'https://typemywordz.ai/tools/audio-recorder.html',
  text: ', and enjoy all-in-one transcription platform with Playback/Recording features.'
}];

const KIND_LABEL = { tip: 'Tip', new: 'New', feature: 'Feature' };

const ROTATE_MS = 6500;

const AnimatedBroadcastBoard = ({ onNavigate }) => {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const touchX = useRef(null);
  const [messages, setMessages] = useState(FALLBACK);
  const MESSAGES = messages;

  useEffect(() => {
    let cancelled = false;
    fetch(`${BACKEND_URL}/api/public/home-tips`)
      .then((r) => (r.ok ? r.json() : null))
      .then((payload) => {
        if (cancelled || !payload || !Array.isArray(payload.items)) return;
        setMessages(payload.items.map((item) => ({ ...item, kind: 'tip' })));
        setIndex(0);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduceMotion(mq.matches);
    apply();
    mq.addEventListener ? mq.addEventListener('change', apply) : mq.addListener(apply);
    return () => {
      mq.removeEventListener ? mq.removeEventListener('change', apply) : mq.removeListener(apply);
    };
  }, []);

  const go = useCallback((next) => {
    setIndex(() => (next + MESSAGES.length) % MESSAGES.length);
  }, [MESSAGES.length]);

  useEffect(() => {
    if (paused) return undefined;
    const t = setTimeout(() => go(index + 1), ROTATE_MS);
    return () => clearTimeout(t);
  }, [index, paused, go]);

  const onKeyDown = (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1); }
  };

  if (!MESSAGES.length) return null;
  const message = MESSAGES[index % MESSAGES.length];
  const many = MESSAGES.length > 1;
  const text = message.text || '';
  const gap = /^[,.;:!?]/.test(text) ? '' : ' ';

  const handleAction = () => {
    if (message.action && typeof onNavigate === 'function') {
      onNavigate(message.action.view);
    }
  };

  return (
    <div
      className="tm-ann"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={onKeyDown}
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
        touchX.current = null;
      }}
      tabIndex={0}
      role="region"
      aria-label="Announcements"
    >
      <span className={'tm-ann-kind tm-ann-' + message.kind}>
        {KIND_LABEL[message.kind]}
      </span>

      <div
        className={'tm-ann-body' + (reduceMotion ? '' : ' tm-ann-anim')}
        key={index}
        aria-live="polite"
      >
        {message.image && (
          <img src={message.image} alt={message.imageAlt || ''} className="tm-ann-logo" />
        )}
        <span className="tm-ann-text">
          {message.title ? <strong>{message.title}{' '}</strong> : null}
          {message.link_url ? <a href={message.link_url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600, textDecoration: 'underline' }}>{message.link_label || 'Open link'}</a> : null}
          {message.link_url && text ? gap : ''}{text}
        </span>
        {message.action && (
          <button type="button" className="tm-ann-action" onClick={handleAction}>
            {message.action.label}
            <svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 7h8M7.5 3.5L11 7l-3.5 3.5" />
            </svg>
          </button>
        )}
      </div>

      {many && <div className="tm-ann-nav">
        <button type="button" className="tm-ann-arrow" onClick={() => go(index - 1)} aria-label="Previous announcement">
          <svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7.5 2.5L4 6l3.5 3.5" /></svg>
        </button>

        <div className="tm-ann-dots">
          {MESSAGES.map((m, i) => (
            <button
              key={i}
              type="button"
              className={'tm-ann-dot' + (i === index ? ' tm-ann-dot-on' : '')}
              onClick={() => go(i)}
              aria-label={'Announcement ' + (i + 1) + ' of ' + MESSAGES.length}
              aria-current={i === index}
            />
          ))}
        </div>

        <button type="button" className="tm-ann-arrow" onClick={() => go(index + 1)} aria-label="Next announcement">
          <svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 2.5L8 6l-3.5 3.5" /></svg>
        </button>
      </div>}
    </div>
  );
};

export default AnimatedBroadcastBoard;
