import React, { useEffect, useRef, useState } from 'react';

const TEST_SECONDS = 30;
const MINIMUM_WPM = 50;
const TEST_TEXT = 'A steady typing rhythm begins with relaxed hands and eyes on the screen. Keep your fingers close to the home row, press each key lightly, and return to your starting position. Accuracy comes from control, not force. Read ahead by a few words, keep your shoulders loose, and let your hands move at a pace you can sustain. When a name or number appears, take the time to type it carefully. A clear transcript depends on careful listening and consistent work. Practise a little each day, and your speed will grow without making your typing harder.';

export const correctCharacterCount = (typed, target) => {
  let total = 0;
  for (let index = 0; index < Math.min(typed.length, target.length); index += 1) {
    if (typed[index] === target[index]) total += 1;
  }
  return total;
};

export const calculateNetWpm = (correctCharacters, elapsedSeconds = TEST_SECONDS) =>
  Math.floor(Math.max(0, Number(correctCharacters) || 0) / 5 / (Math.max(1, Number(elapsedSeconds) || TEST_SECONDS) / 60));

export default function TypingSpeedTest({ onPass, compact = false }) {
  const [startedAt, setStartedAt] = useState(0);
  const [timeLeft, setTimeLeft] = useState(TEST_SECONDS);
  const [typed, setTyped] = useState('');
  const [complete, setComplete] = useState(false);
  const [passReported, setPassReported] = useState(false);
  const inputRef = useRef(null);
  const correctCharacters = correctCharacterCount(typed, TEST_TEXT);
  const wpm = calculateNetWpm(correctCharacters, TEST_SECONDS);
  const passed = complete && wpm >= MINIMUM_WPM;

  useEffect(() => {
    if (!startedAt || complete) return undefined;
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((startedAt + TEST_SECONDS * 1000 - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0) setComplete(true);
    }, 100);
    return () => window.clearInterval(timer);
  }, [startedAt, complete]);

  useEffect(() => {
    if (passed && !passReported) {
      setPassReported(true);
      onPass?.({ wpm, correctCharacters, seconds: TEST_SECONDS });
    }
  }, [passed, passReported, onPass, wpm, correctCharacters]);

  const start = () => {
    setTyped('');
    setTimeLeft(TEST_SECONDS);
    setComplete(false);
    setPassReported(false);
    setStartedAt(Date.now());
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const updateTyped = (event) => {
    if (!startedAt || complete) return;
    const value = event.target.value.slice(0, TEST_TEXT.length);
    setTyped(value);
    if (Date.now() >= startedAt + TEST_SECONDS * 1000) {
      setTimeLeft(0);
      setComplete(true);
    }
  };

  return (
    <section className={`tm-speed-test${compact ? ' tm-speed-test-compact' : ''}`} aria-labelledby="tm-speed-test-title">
      <div className="tm-speed-test-head">
        <div>
          <p className="tm-speed-test-kicker">30-second check</p>
          <h2 id="tm-speed-test-title">How fast do you type?</h2>
          <p>Type the passage below for 30 seconds. To pass, at least 125 characters must match the passage. There is no separate accuracy cutoff.</p>
        </div>
        <div className={`tm-speed-test-clock${startedAt && !complete ? ' is-running' : ''}`} aria-live="polite">
          <strong>{startedAt ? `00:${String(timeLeft).padStart(2, '0')}` : '00:30'}</strong>
          <span>{complete ? 'Time' : startedAt ? 'Remaining' : 'Ready'}</span>
        </div>
      </div>

      <div className="tm-speed-test-passage" aria-label="Typing passage">
        {TEST_TEXT.split('').map((character, index) => {
          const isTyped = index < typed.length;
          const isCorrect = isTyped && typed[index] === character;
          const isCurrent = index === typed.length && !complete;
          return <span className={`${isCorrect ? 'is-correct' : isTyped ? 'is-wrong' : ''}${isCurrent ? ' is-current' : ''}`} key={`${index}-${character}`}>{character}</span>;
        })}
      </div>

      <label className="tm-speed-test-input-label" htmlFor="tm-speed-test-input">Your typing</label>
      <textarea
        id="tm-speed-test-input"
        ref={inputRef}
        value={typed}
        onChange={updateTyped}
        disabled={!startedAt || complete}
        placeholder={startedAt ? 'Keep going until the timer ends…' : 'Select Start test when you are ready.'}
        spellCheck="false"
        autoCapitalize="off"
        autoCorrect="off"
        aria-describedby="tm-speed-test-help"
      />
      <div className="tm-speed-test-footer">
        <span id="tm-speed-test-help">WPM is calculated as correctly matched characters ÷ 5 ÷ 0.5 minutes.</span>
        {!startedAt && <button type="button" onClick={start}>Start test</button>}
        {complete && <button type="button" onClick={start}>Try again</button>}
      </div>
      {complete && (
        <div className={`tm-speed-test-result${passed ? ' is-pass' : ' is-retry'}`} role="status">
          <strong>{passed ? `Passed — ${wpm} WPM` : `${wpm} WPM — try again`}</strong>
          <span>{passed ? 'Your typing speed meets the 50 WPM requirement.' : 'You need 50 WPM. You can repeat the test as many times as needed.'}</span>
        </div>
      )}
    </section>
  );
}
