import React, { useCallback, useEffect, useRef, useState } from 'react';
import { matchesPlayerShortcut, readPlayerShortcuts, formatPlayerShortcut } from '../playerShortcuts';
import './RecordingPlayer.css';

export const REWIND_SECONDS = 5;
export const MIN_SPEED = 0.5;
export const MAX_SPEED = 3;

export const formatClock = (value) => {
  const total = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
};

const inTextField = (target) => {
  const tag = (target?.tagName || '').toLowerCase();
  return tag === 'textarea' || tag === 'select' || target?.isContentEditable
    || (tag === 'input' && !['range', 'checkbox', 'button'].includes((target.type || '').toLowerCase()));
};

export default function RecordingPlayer({ src, durationHint = 0, userId = '' }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(durationHint > 0 ? durationHint : 0);
  const [volume, setVolume] = useState(1);
  const [speed, setSpeed] = useState(1);
  const shortcuts = readPlayerShortcuts(userId);

  useEffect(() => {
    setPlaying(false);
    setCurrent(0);
    setDuration(durationHint > 0 ? durationHint : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.playbackRate = speed;
  }, [speed, src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.volume = volume;
  }, [volume, src]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      const attempt = audio.play();
      if (attempt && typeof attempt.catch === 'function') attempt.catch(() => setPlaying(false));
    } else {
      audio.pause();
    }
  }, []);

  const rewind = useCallback(() => {
    const audio = audioRef.current;
    if (audio) audio.currentTime = Math.max(0, (audio.currentTime || 0) - REWIND_SECONDS);
  }, []);

  const restart = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    setCurrent(0);
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if (inTextField(event.target)) return;
      const keys = readPlayerShortcuts(userId);
      const handlers = { playPause: togglePlay, rewind, restart };
      const action = Object.keys(handlers).find((id) => matchesPlayerShortcut(event, keys[id]));
      if (!action) return;
      event.preventDefault();
      handlers[action]();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [userId, togglePlay, rewind, restart]);

  const onMeta = () => {
    const audio = audioRef.current;
    if (audio && Number.isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration);
  };

  const seek = (event) => {
    const audio = audioRef.current;
    const next = Number(event.target.value);
    if (audio && Number.isFinite(next)) audio.currentTime = next;
    setCurrent(next);
  };

  const limit = duration > 0 ? duration : Math.max(current, 1);

  return (
    <div className="tm-rp" role="group" aria-label="Recording playback">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={onMeta}
        onDurationChange={onMeta}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime || 0)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      <div className="tm-rp-row">
        <button type="button" className="tm-rp-main" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'} title={`${playing ? 'Pause' : 'Play'} (${formatPlayerShortcut(shortcuts.playPause)})`}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <button type="button" className="tm-rp-btn" onClick={rewind} title={`Rewind ${REWIND_SECONDS} seconds (${formatPlayerShortcut(shortcuts.rewind)})`}>
          Rewind {REWIND_SECONDS}s
        </button>
        <button type="button" className="tm-rp-btn" onClick={restart} title={`Go to the start (${formatPlayerShortcut(shortcuts.restart)})`}>
          Go to 00:00:00
        </button>
        <span className="tm-rp-time" aria-live="off">{formatClock(current)} / {formatClock(duration)}</span>
      </div>
      <input
        className="tm-rp-seek"
        type="range"
        min="0"
        max={limit}
        step="0.1"
        value={Math.min(current, limit)}
        onChange={seek}
        aria-label="Playback position"
      />
      <div className="tm-rp-sliders">
        <label className="tm-rp-slider">
          <span>Volume {Math.round(volume * 100)}%</span>
          <input type="range" min="0" max="1" step="0.01" value={volume} onChange={(e) => setVolume(Number(e.target.value))} aria-label="Volume" />
        </label>
        <label className="tm-rp-slider">
          <span>Speed {Math.round(speed * 100)}%</span>
          <input type="range" min={MIN_SPEED} max={MAX_SPEED} step="0.05" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Speed" />
        </label>
      </div>
      <p className="tm-rp-hint">
        Shortcuts: {formatPlayerShortcut(shortcuts.playPause)} play or pause, {formatPlayerShortcut(shortcuts.rewind)} rewind, {formatPlayerShortcut(shortcuts.restart)} back to the start. You can change them in Settings.
      </p>
    </div>
  );
}
