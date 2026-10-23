import React, { useEffect, useRef, useState } from 'react';

// Shown in place of the Work Room when a worker has missed three deadlines in a row.
// The passage, the clock and the score are all decided by the server.
export default function WorkerSpeedTestGate({ request, minWpm = 60, seconds = 30, onPassed }) {
  const [phase, setPhase] = useState('intro');
  const [passage, setPassage] = useState('');
  const [typed, setTyped] = useState('');
  const [left, setLeft] = useState(seconds);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const startedRef = useRef(0);
  const typedRef = useRef('');
  const inputRef = useRef(null);

  const finish = async () => {
    setPhase('checking');
    try {
      const outcome = await request('/human-transcription/worker/speed-test/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ typed: typedRef.current }),
      });
      setResult(outcome);
      setPhase('done');
      if (outcome.passed) window.setTimeout(() => onPassed?.(), 1800);
    } catch (submitError) { setError(submitError.message); setPhase('intro'); }
  };

  useEffect(() => {
    if (phase !== 'running') return undefined;
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((startedRef.current + seconds * 1000 - Date.now()) / 1000));
      setLeft(remaining);
      if (remaining === 0) { window.clearInterval(timer); finish(); }
    }, 200);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, seconds]);

  const start = async () => {
    setError(''); setResult(null); setTyped(''); typedRef.current = '';
    try {
      const payload = await request('/human-transcription/worker/speed-test/start', { method: 'POST' });
      setPassage(payload.passage || '');
      startedRef.current = Date.now();
      setLeft(seconds);
      setPhase('running');
      window.setTimeout(() => inputRef.current?.focus(), 0);
    } catch (startError) { setError(startError.message); }
  };

  const onChange = (event) => {
    const value = event.target.value.slice(0, passage.length);
    typedRef.current = value;
    setTyped(value);
  };

  return (
    <section className="tm-speed-gate" aria-labelledby="tm-speed-gate-title" style={{ maxWidth: 760, margin: '32px auto', padding: 28, border: '1px solid #d9dfda', borderRadius: 12, background: '#fff' }}>
      <h2 id="tm-speed-gate-title" style={{ marginTop: 0 }}>Speed test required</h2>
      <p>You have missed three deadlines in a row. Before you return to the Work Room, pass a {seconds}-second typing test at {minWpm} WPM or faster. That is at least {Math.ceil(minWpm * 5 * seconds / 60)} correct characters. You can repeat the test until you pass.</p>
      {error && <p role="alert" style={{ color: '#9a2b2b' }}>{error}</p>}
      {phase === 'intro' && <button type="button" className="tm-admin-btn" onClick={start}>Start the test</button>}
      {(phase === 'running' || phase === 'checking') && (
        <>
          <div aria-live="off" style={{ fontSize: 28, fontWeight: 700, margin: '8px 0' }}>00:{String(left).padStart(2, '0')}</div>
          <div style={{ font: '17px/1.7 Georgia, serif', padding: 14, background: '#f6f8f6', borderRadius: 8, userSelect: 'none' }} aria-label="Typing passage">
            {passage.split('').map((character, index) => {
              const done = index < typed.length;
              const ok = done && typed[index] === character;
              return <span key={index} style={{ color: ok ? '#267b40' : done ? '#b3261e' : '#2b332d', background: index === typed.length ? '#e6d9f7' : 'transparent' }}>{character}</span>;
            })}
          </div>
          <textarea ref={inputRef} value={typed} onChange={onChange} disabled={phase !== 'running'} spellCheck="false" autoCapitalize="off" autoCorrect="off"
            onPaste={(event) => event.preventDefault()} onDrop={(event) => event.preventDefault()} aria-label="Type the passage here"
            style={{ width: '100%', minHeight: 110, marginTop: 12, padding: 12, borderRadius: 8, border: '1px solid #cfd6d1', font: '16px/1.5 inherit' }} />
        </>
      )}
      {phase === 'done' && result && (
        <div role="status" style={{ marginTop: 12 }}>
          <strong>{result.passed ? `Passed at ${result.wpm} WPM.` : `${result.wpm} WPM. You need ${minWpm}.`}</strong>
          <p>{result.passed ? 'Opening the Work Room...' : 'Take a breath and try again.'}</p>
          {!result.passed && <button type="button" className="tm-admin-btn" onClick={start}>Try again</button>}
        </div>
      )}
    </section>
  );
}
