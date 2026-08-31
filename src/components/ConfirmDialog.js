// src/components/ConfirmDialog.js
// A proper in-app "are you sure?" dialog, used instead of the browser's
// window.confirm box. Browser confirm boxes look like the operating system,
// not like the app, and they cannot be styled or made accessible.
//
// Use it for anything the client cannot undo: deleting a transcript,
// cancelling a transcription that is already running, signing out with
// unsaved edits.

import React, { useEffect, useRef } from 'react';

const ConfirmDialog = ({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default', // 'default' | 'danger'
  busy = false,
  onConfirm,
  onCancel,
}) => {
  const cancelRef = useRef(null);

  // Focus the safe option first, so pressing Enter by reflex does nothing harmful.
  useEffect(() => {
    if (open && cancelRef.current) cancelRef.current.focus();
  }, [open]);

  // Escape closes. Tab is trapped inside the dialog.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) {
        e.preventDefault();
        onCancel();
      }
      if (e.key === 'Tab') {
        const focusables = document.querySelectorAll('.tm-dialog [data-focusable]');
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      className="tm-dialog-back"
      onMouseDown={(e) => {
        // Clicking the dark area outside cancels, but only if nothing is in flight.
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        className="tm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="tm-dialog-title"
      >
        <h3 className="tm-dialog-title" id="tm-dialog-title">{title}</h3>
        {body ? <p className="tm-dialog-body">{body}</p> : null}
        <div className="tm-dialog-actions">
          <button
            type="button"
            ref={cancelRef}
            data-focusable
            className="tm-dialog-cancel"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            data-focusable
            className={tone === 'danger' ? 'tm-dialog-go tm-dialog-danger' : 'tm-dialog-go'}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
