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

const MESSAGES = [
  {
    kind: 'tip',
    text: 'Ask the Assistant to summarise any transcript for you.',
    action: { label: 'Open Assistant', view: 'ai_assistant' }
  },
  {
    kind: 'tip',
    text: 'English and No speaker tags are the defaults. Change them before you transcribe.'
  },
  {
    kind: 'new',
    text: 'Subscribers in Africa can now pay with Mobile Money.',
    action: { label: 'See plans', view: 'pricing' }
  },
  {
    kind: 'tip',
    text: 'The Assistant can separate speakers in a transcript that has none.',
    action: { label: 'Open Assistant', view: 'ai_assistant' }
  },
  {
    kind: 'feature',
    text: 'Work with your transcripts using Gemini.',
    image: '/gemini_logo.png',
    imageAlt: 'Google Gemini',
    action: { label: 'Open Assistant', view: 'ai_assistant' }
  },
  {
    kind: 'feature',
    text: 'Work with your transcripts using Claude Sonnet.',
    image: '/claude_logo.png',
    imageAlt: 'Claude',
    action: { label: 'Open Assistant', view: 'ai_assistant' }
  },
  {
    kind: 'feature',
    text: 'Translate a transcript into Spanish and other languages.',
    action: { label: 'Open Assistant', view: 'ai_assistant' }
  },
  {
    kind: 'tip',
    text: 'Record on your phone, transcribe, then pick it up on your computer.'
  },
  {
    kind: 'feature',
    text: 'Type up audio yourself, free, in the Transcription Editor.',
    action: { label: 'Open Editor', view: 'editor' }
  },
  {
    kind: 'feature',
    text: 'Need a person rather than a machine? We offer human transcription.',
    action: { label: 'Talk to us', view: 'feedback' }
  },
  {
    kind: 'tip',
    text: 'We never store your audio or video files. Your recordings stay yours.'
  }
];

const KIND_LABEL = { tip: 'Tip', new: 'New', feature: 'Feature' };

const ROTATE_MS = 6500;

const AnimatedBroadcastBoard = ({ onNavigate }) => {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const touchX = useRef(null);

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
    setIndex((i) => (next + MESSAGES.length) % MESSAGES.length);
  }, []);

  useEffect(() => {
    if (paused) return undefined;
    const t = setTimeout(() => go(index + 1), ROTATE_MS);
    return () => clearTimeout(t);
  }, [index, paused, go]);

  const onKeyDown = (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1); }
  };

  const message = MESSAGES[index];

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
        <span className="tm-ann-text">{message.text}</span>
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

      <div className="tm-ann-nav">
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
      </div>
    </div>
  );
};

export default AnimatedBroadcastBoard;
