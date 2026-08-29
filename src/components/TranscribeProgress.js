import React, { useState, useEffect, useMemo } from 'react';

// ---------------------------------------------------------------------------
// What is happening to your file, while it happens.
//
// The old version was a purple bar that filled the whole width and pulsed,
// with the word "Processing..." underneath. It told you nothing: you could not
// tell a stuck job from a slow one, and it looked the same after two seconds
// as it did after two minutes.
//
// This shows three named stages and a bar that actually moves. Two different
// kinds of number go into that bar, and they are deliberately worded
// differently:
//
//   Uploading    - a real measurement. The browser reports exactly how many
//                  bytes have gone, so the percentage is the truth.
//
//   Transcribing - an estimate. The service does not report progress, so we
//                  work from how long a file this length usually takes. It is
//                  always phrased as "about", and the bar eases towards the
//                  end without ever pretending to arrive. A job that runs long
//                  says so instead of freezing at 99%.
// ---------------------------------------------------------------------------

const STEPS = [
  { id: 'uploading',    label: 'Upload' },
  { id: 'transcribing', label: 'Transcribe' },
  { id: 'ready',        label: 'Ready' }
];

const shortTime = (seconds) => {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} second${s === 1 ? '' : 's'}`;
  const m = Math.round(s / 60);
  return `${m} minute${m === 1 ? '' : 's'}`;
};

const TranscribeProgress = ({
  phase = 'uploading',       // 'uploading' | 'transcribing'
  uploadPercent = 0,         // real, measured
  expectedSeconds = 30,      // how long transcription usually takes for this file
  onCancel = null
}) => {
  const [elapsed, setElapsed] = useState(0);

  // Reset the clock when the transcription stage begins.
  useEffect(() => {
    if (phase !== 'transcribing') { setElapsed(0); return undefined; }
    const started = Date.now();
    const tick = setInterval(() => setElapsed((Date.now() - started) / 1000), 500);
    return () => clearInterval(tick);
  }, [phase]);

  const expected = Math.max(8, Number(expectedSeconds) || 30);
  const overrunning = phase === 'transcribing' && elapsed > expected;

  const percent = useMemo(() => {
    if (phase === 'uploading') {
      // The upload is the first third of the journey.
      return 2 + (Math.min(100, Math.max(0, uploadPercent)) / 100) * 33;
    }
    // Ease towards the end. This curve always keeps moving, so a long job
    // still looks alive, but it never reaches the end before the job does.
    const eased = 1 - Math.exp(-elapsed / expected);
    return 35 + eased * 58;
  }, [phase, uploadPercent, elapsed, expected]);

  const headline = phase === 'uploading' ? 'Uploading your file' : 'Transcribing';

  const detail = phase === 'uploading'
    ? `${Math.round(uploadPercent)}%`
    : overrunning
      ? 'Still working — this one is taking a little longer than usual'
      : `about ${shortTime(expected - elapsed)} left`;

  const currentStep = phase === 'uploading' ? 0 : 1;

  return (
    <div className="tm-prog">
      <ol className="tm-prog-steps">
        {STEPS.map((step, i) => (
          <li
            key={step.id}
            className={
              'tm-prog-step' +
              (i < currentStep ? ' tm-prog-done' : '') +
              (i === currentStep ? ' tm-prog-now' : '')
            }
          >
            <span className="tm-prog-dot" aria-hidden="true">
              {i < currentStep && (
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.6"
                     strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8.5l3 3 6-6.5" /></svg>
              )}
            </span>
            <span className="tm-prog-name">{step.label}</span>
          </li>
        ))}
      </ol>

      <div
        className="tm-prog-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={phase === 'uploading' ? Math.round(uploadPercent) : undefined}
        aria-valuetext={phase === 'uploading' ? `${Math.round(uploadPercent)}% uploaded` : 'Transcribing'}
      >
        <div className="tm-prog-fill" style={{ width: percent.toFixed(1) + '%' }} />
      </div>

      <div className="tm-prog-say">
        <span className="tm-prog-head">{headline}</span>
        <span className="tm-prog-detail">{detail}</span>
      </div>

      {onCancel && (
        <button type="button" className="tm-prog-cancel" onClick={onCancel}>
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          Cancel
        </button>
      )}
    </div>
  );
};

export default TranscribeProgress;
