// src/components/Toaster.js
// One notification system for the whole app.
//
// Design rules this follows:
//  - Every toast dismisses itself. Timers live on the toast, not on a global,
//    so a toast can never be left behind by a lost timer id.
//  - Hovering or focusing a toast pauses its timer, so it cannot vanish mid-read.
//  - Several toasts stack instead of overwriting one another.
//  - Colour follows the house rule: green for something the client did,
//    amber for a warning, red only for a genuine error, neutral grey otherwise.
//    Purple is reserved for AI and is never used here.
//  - Text is rendered as text, never as HTML.

import React, { useCallback, useEffect, useRef, useState } from 'react';

// How long each kind of message stays, in milliseconds.
// Errors and warnings stay longer because people need longer to read bad news.
export const TOAST_DURATIONS = {
  success: 4000,
  info: 4000,
  warning: 7000,
  error: 9000,
};

export const durationForType = (type) =>
  TOAST_DURATIONS[type] != null ? TOAST_DURATIONS[type] : TOAST_DURATIONS.info;

const Toast = ({ toast, onDismiss }) => {
  const { id, text, type, duration } = toast;
  const [leaving, setLeaving] = useState(false);
  const timerRef = useRef(null);
  const remainingRef = useRef(duration);
  const startedAtRef = useRef(0);

  const close = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setLeaving(true);
    // Let the exit animation finish before the toast is removed from the list.
    window.setTimeout(() => onDismiss(id), 180);
  }, [id, onDismiss]);

  const resume = useCallback(() => {
    if (duration <= 0) return; // duration 0 means "stay until dismissed"
    if (timerRef.current) return;
    startedAtRef.current = Date.now();
    timerRef.current = window.setTimeout(close, remainingRef.current);
  }, [close, duration]);

  const pause = useCallback(() => {
    if (!timerRef.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
    remainingRef.current = Math.max(
      600,
      remainingRef.current - (Date.now() - startedAtRef.current)
    );
  }, []);

  useEffect(() => {
    resume();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [resume]);

  return (
    <div
      className={'tm-toast tm-toast-' + type + (leaving ? ' tm-toast-out' : '')}
      role={type === 'error' || type === 'warning' ? 'alert' : 'status'}
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
    >
      <span className="tm-toast-dot" aria-hidden="true" />
      <span className="tm-toast-text">{text}</span>
      <button
        type="button"
        className="tm-toast-x"
        onClick={close}
        aria-label="Dismiss notification"
      >
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none"
             stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};

// A flash is not a notification card. It is a few words that rise from the
// bottom edge of the screen, give one small hop with a short burst of
// confetti, and fade out. Nothing to read, nothing to close: it is there to
// confirm something finished, and then it is gone.
const Flash = ({ toast, onDismiss }) => {
  const { id, text } = toast;
  useEffect(() => {
    const t = window.setTimeout(() => onDismiss(id), 1600);
    return () => clearTimeout(t);
  }, [id, onDismiss]);
  return (
    <div className="tm-flash" role="status" aria-live="polite">
      <span className="tm-flash-text">
        <span className="tm-flash-pop" aria-hidden="true">
          <i className="tm-flash-bit" />
          <i className="tm-flash-bit" />
          <i className="tm-flash-bit" />
          <i className="tm-flash-bit" />
          <i className="tm-flash-bit" />
          <i className="tm-flash-bit" />
          <i className="tm-flash-bit" />
          <i className="tm-flash-bit" />
        </span>
        {text}
      </span>
    </div>
  );
};

const Toaster = ({ toasts, onDismiss }) => {
  // Escape dismisses the most recent notification card.
  useEffect(() => {
    if (!toasts.length) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      const cards = toasts.filter((t) => t.variant !== 'flash');
      if (cards.length) onDismiss(cards[cards.length - 1].id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toasts, onDismiss]);

  if (!toasts.length) return null;

  const flashes = toasts.filter((t) => t.variant === 'flash');
  const cards = toasts.filter((t) => t.variant !== 'flash');

  return (
    <>
      {flashes.map((t) => (
        <Flash key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
      {cards.length > 0 && (
        <div className="tm-toaster" aria-live="polite" aria-atomic="false">
          {cards.map((t) => (
            <Toast key={t.id} toast={t} onDismiss={onDismiss} />
          ))}
        </div>
      )}
    </>
  );
};

export default Toaster;
