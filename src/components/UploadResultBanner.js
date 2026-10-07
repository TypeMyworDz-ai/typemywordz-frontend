import React from 'react';

// Tells every open Human Work view to reload its job list straight away.
export function announceJobsChanged() {
  try { window.dispatchEvent(new Event('tm-human-jobs-changed')); } catch { /* not in a browser */ }
}

const base = { borderRadius: 10, padding: '14px 16px', margin: '0 0 14px', display: 'flex', gap: 12, alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', lineHeight: 1.45 };
const palette = {
  working: { background: '#fff8e1', border: '1px solid #f0c24b', color: '#5a4300' },
  success: { background: '#e8f6ec', border: '1px solid #3aa55d', color: '#14532d' },
  error: { background: '#fdecec', border: '1px solid #d64545', color: '#7a1212' },
};
const btn = { border: '1px solid currentColor', background: 'transparent', color: 'inherit', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', font: 'inherit', fontWeight: 600 };

/**
 * A message that stays on the upload panel until the next upload starts or it is
 * dismissed, so a successful (or failed) upload can never be missed.
 */
export default function UploadResultBanner({ working = '', result = null, onDismiss, onOpenQueue }) {
  if (working) {
    return (
      <div role="status" aria-live="polite" className="tm-upload-banner tm-upload-banner-working" style={{ ...base, ...palette.working }}>
        <div><strong>{working}</strong><div>Please keep this page open and do not upload again. Larger files can take a minute.</div></div>
      </div>
    );
  }
  if (!result) return null;
  const ok = result.kind === 'success';
  return (
    <div role={ok ? 'status' : 'alert'} aria-live="polite" className={`tm-upload-banner tm-upload-banner-${ok ? 'success' : 'error'}`} style={{ ...base, ...(ok ? palette.success : palette.error) }}>
      <div style={{ flex: '1 1 320px' }}>
        <strong>{ok ? `Upload complete: ${result.title}` : `Upload did not go through: ${result.title || 'please try again'}`}</strong>
        {result.detail && <div>{result.detail}</div>}
        <small>{result.at ? new Date(result.at).toLocaleTimeString() : ''}{ok ? ' · You do not need to upload this again.' : ' · Nothing was created. Your files are still here, so you can try again.'}</small>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {ok && onOpenQueue && <button type="button" style={btn} onClick={onOpenQueue}>View in Job Queue</button>}
        {onDismiss && <button type="button" style={btn} onClick={onDismiss}>Dismiss</button>}
      </div>
    </div>
  );
}
