import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import TypingSpeedTest from './TypingSpeedTest';

const LESSONS = [
  { id: 'home', title: 'Home row', summary: 'Learn where your fingers return after every key.', keys: 'asdfjkl;', target: 'asdf jkl; asdf jkl; fall ask; lad; flask; all; sad; ask; a fall; a flask.', tip: 'Rest your left fingers on A, S, D and F; your right fingers on J, K, L and semicolon. Keep both thumbs near the space bar.' },
  { id: 'top', title: 'Top row', summary: 'Reach up, then bring each finger home again.', keys: 'qwertyuiop', target: 'were you ready to write your report? quiet work is easier when your hands return home.', tip: 'Move one finger at a time to the upper row. Do not lift your whole hand; return to the home row after each reach.' },
  { id: 'bottom', title: 'Bottom row', summary: 'Reach down without losing your hand position.', keys: 'zxcvbnm', target: 'move your fingers with care. keep the next word in view and let your hands return to their home keys.', tip: 'Reach down from the home row, press lightly, and reset. The F and J key marks help you find your position without looking.' },
  { id: 'rhythm', title: 'Steady rhythm', summary: 'Build an even pace with useful work-related sentences.', keys: 'all', target: 'A careful typist listens for meaning, keeps the speaker\'s words in order, and checks every name before sending a transcript.', tip: 'Aim for an even pace rather than a burst of speed. A short daily practice session is easier to sustain.' },
];
const KEY_ROWS = ['qwertyuiop', 'asdfghjkl;', 'zxcvbnm'];

export default function TypingPractice() {
  const [lessonId, setLessonId] = useState('home');
  const [typed, setTyped] = useState('');
  const [showTest, setShowTest] = useState(false);
  const lesson = useMemo(() => LESSONS.find((item) => item.id === lessonId) || LESSONS[0], [lessonId]);
  const progress = lesson.target.length ? Math.min(100, Math.round((typed.length / lesson.target.length) * 100)) : 0;
  const nextCharacter = lesson.target[typed.length]?.toLowerCase() || '';

  const chooseLesson = (id) => {
    setLessonId(id);
    setTyped('');
  };

  const updatePractice = (event) => setTyped(event.target.value.slice(0, lesson.target.length));

  return (
    <main className="tm-typing-page">
      <header className="tm-typing-header">
        <Link className="tm-typing-brand" to="/" aria-label="TypeMyworDz home">
          <img src="/android-chrome-192x192.png" alt="" />
          <span><b><i>Type</i><em>My</em><i>worDz</i></b><small>Typing practice</small></span>
        </Link>
        <nav aria-label="Typing practice links"><Link to="/" target="_blank" rel="noopener noreferrer">Home</Link><Link to="/trainee-signup" target="_blank" rel="noopener noreferrer">Transcriber training</Link></nav>
      </header>

      <section className="tm-typing-hero">
        <div className="tm-typing-hero-copy">
          <p className="tm-typing-eyebrow">Free practice · no account needed</p>
          <h1>Build a typing rhythm that lasts.</h1>
          <p>Start with the home row, learn to reach without looking, then practise on short passages. Your fingers should do the moving; your eyes should stay with the words.</p>
          <a className="tm-typing-primary" href="#lessons">Start a lesson</a>
        </div>
        <div className="tm-typing-keyboard-card" aria-label="Home row keyboard guide">
          <div className="tm-typing-hand-labels"><span>Left hand</span><span>Right hand</span></div>
          {KEY_ROWS.map((row, rowIndex) => (
            <div className={`tm-typing-key-row tm-typing-key-row-${rowIndex}`} key={row}>
              {row.split('').map((key) => <span key={key} className={`${'asdfjkl;'.includes(key) ? 'tm-key-home' : ''}${key === 'f' || key === 'j' ? ' tm-key-anchor' : ''}`}>{key.toUpperCase()}</span>)}
            </div>
          ))}
          <div className="tm-typing-space-key">SPACE · thumbs</div>
          <p>Raised marks on <strong>F</strong> and <strong>J</strong> are your quiet compass.</p>
        </div>
      </section>

      <section className="tm-typing-lessons" id="lessons">
        <div className="tm-typing-section-title"><div><p className="tm-typing-eyebrow">Pick up where you are</p><h2>Short lessons, real keyboard.</h2></div><span>Practise at your own pace</span></div>
        <div className="tm-typing-layout">
          <nav className="tm-typing-lesson-list" aria-label="Typing lessons">
            {LESSONS.map((item, index) => (
              <button type="button" key={item.id} className={item.id === lesson.id ? 'is-selected' : ''} onClick={() => chooseLesson(item.id)}>
                <span className="tm-typing-lesson-index">{String(index + 1).padStart(2, '0')}</span><span><strong>{item.title}</strong><small>{item.summary}</small></span>
              </button>
            ))}
          </nav>
          <article className="tm-typing-practice-card">
            <div className="tm-typing-practice-head"><div><p className="tm-typing-eyebrow">Lesson · {lesson.title}</p><h3>{lesson.tip}</h3></div><span>{progress}%</span></div>
            <div className="tm-typing-progress"><i style={{ width: `${progress}%` }} /></div>
            <div className="tm-typing-target" aria-label="Practice passage">
              {lesson.target.split('').map((character, index) => {
                const isTyped = index < typed.length;
                const isCorrect = isTyped && typed[index] === character;
                const isWrong = isTyped && typed[index] !== character;
                return <span className={`${isCorrect ? 'is-correct' : ''}${isWrong ? ' is-wrong' : ''}${index === typed.length ? ' is-current' : ''}`} key={`${index}-${character}`}>{character}</span>;
              })}
            </div>
            <label htmlFor="tm-typing-practice-input">Type the passage</label>
            <textarea id="tm-typing-practice-input" value={typed} onChange={updatePractice} placeholder="Start typing here…" spellCheck="false" autoCapitalize="off" autoCorrect="off" />
            <div className="tm-typing-next-key">Next key <strong>{nextCharacter ? nextCharacter.toUpperCase() : 'Done'}</strong></div>
            <div className="tm-typing-mini-keyboard" aria-label="Keyboard with the next key highlighted">
              {KEY_ROWS.map((row) => <div key={row}>{row.split('').map((key) => <span key={key} className={`${'asdfjkl;'.includes(key) ? 'is-home' : ''}${key === nextCharacter ? ' is-next' : ''}`}>{key.toUpperCase()}</span>)}</div>)}
            </div>
            <button className="tm-typing-reset" type="button" onClick={() => setTyped('')}>Start this lesson again</button>
          </article>
        </div>
      </section>

      <section className="tm-typing-test-section">
        <div className="tm-typing-test-intro"><p className="tm-typing-eyebrow">Measure your pace</p><h2>Try the 30-second speed test.</h2><p>It uses the same net-WPM calculation as the TypeMyworDz transcriber application check. Take it for practice, then retry to see your progress.</p><button type="button" onClick={() => setShowTest((value) => !value)}>{showTest ? 'Hide speed test' : 'Open speed test'}</button></div>
        {showTest && <TypingSpeedTest compact />}
      </section>

      <footer className="tm-typing-footer"><span>TypeMyworDz · Free typing practice</span><Link to="/" target="_blank" rel="noopener noreferrer">Try transcription with 30 free credits</Link><Link to="/trainee-signup" target="_blank" rel="noopener noreferrer">Interested in transcription training?</Link></footer>
    </main>
  );
}
