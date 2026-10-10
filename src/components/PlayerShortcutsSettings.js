import React, { useEffect, useState } from 'react';
import {
  PLAYER_ACTIONS, formatPlayerShortcut, playerShortcutFromEvent, readPlayerShortcuts,
  resetPlayerShortcuts, savePlayerShortcut, validatePlayerShortcut,
} from '../playerShortcuts';
import { isModifierOnlyKey, readRecorderShortcut } from '../recorderShortcut';

export default function PlayerShortcutsSettings({ userId }) {
  const [shortcuts, setShortcuts] = useState(() => readPlayerShortcuts(userId));
  const [capturing, setCapturing] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setShortcuts(readPlayerShortcuts(userId));
    setCapturing('');
    setMessage('');
  }, [userId]);

  useEffect(() => {
    if (!capturing) return undefined;
    const onKey = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') {
        setCapturing('');
        setMessage('Shortcut change cancelled.');
        return;
      }
      if (isModifierOnlyKey(event.key)) return;
      const next = playerShortcutFromEvent(event);
      const problem = validatePlayerShortcut(capturing, next, shortcuts, readRecorderShortcut(userId));
      if (problem) {
        setMessage(problem);
        return;
      }
      if (!savePlayerShortcut(userId, capturing, next)) {
        setMessage('The shortcut could not be saved in this browser. Check your browser storage settings and try again.');
        setCapturing('');
        return;
      }
      setShortcuts(readPlayerShortcuts(userId));
      setCapturing('');
      setMessage(`Saved ${formatPlayerShortcut(next)} for this browser.`);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capturing, shortcuts, userId]);

  const begin = (id) => {
    setMessage('Press the key or key combination you want. Press Esc to cancel.');
    setCapturing(id);
  };

  const reset = () => {
    if (resetPlayerShortcuts(userId)) {
      setShortcuts(readPlayerShortcuts(userId));
      setMessage('Playback shortcuts are back to their defaults.');
    } else {
      setMessage('The defaults could not be restored in this browser.');
    }
    setCapturing('');
  };

  return (
    <section className="tm-set-section tm-recorder-shortcut-section" aria-labelledby="tm-player-shortcuts-h">
      <h3 className="tm-set-h" id="tm-player-shortcuts-h">Playback shortcuts</h3>
      <p className="tm-set-sub">
        Control the player that appears after you record. They work while the Recorder page is open and this tab is active.
      </p>
      {PLAYER_ACTIONS.map(({ id, label }) => (
        <div className="tm-recorder-shortcut-controls" key={id}>
          <div className="tm-recorder-shortcut-current">
            <span>{label}</span>
            <kbd>{formatPlayerShortcut(shortcuts[id])}</kbd>
          </div>
          <div className="tm-recorder-shortcut-actions">
            <button type="button" className="tm-recorder-shortcut-change" onClick={() => begin(id)} disabled={!userId} aria-label={`Change shortcut for ${label}`}>
              {capturing === id ? 'Press a key…' : 'Change shortcut'}
            </button>
          </div>
        </div>
      ))}
      <div className="tm-recorder-shortcut-actions" style={{ marginTop: 10 }}>
        <button type="button" className="tm-recorder-shortcut-reset" onClick={reset} disabled={!userId}>Use defaults</button>
      </div>
      <p className="tm-recorder-shortcut-message" aria-live="polite">{message}</p>
    </section>
  );
}
