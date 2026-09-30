import React, { useEffect, useRef, useState } from 'react';

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

// A steady audio player for job recordings. It never reloads the recording
// while someone is listening: the parent passes a stable address, and this
// component keeps one <audio> element alive for as long as it is on screen.
export default function WorkerAudioPlayer({ src, filename, title = 'Source recording', note, loading = false, error = '' }) {
  const audioRef = useRef(null);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed, src]);

  const skip = (seconds) => {
    const el = audioRef.current;
    if (!el) return;
    const length = Number.isFinite(el.duration) ? el.duration : Infinity;
    el.currentTime = Math.max(0, Math.min(length, el.currentTime + seconds));
  };

  return (
    <div className="tm-human-audio-card">
      <strong>{title}</strong>
      {note && <span>{note}</span>}
      {src ? (
        <>
          <audio ref={audioRef} controls preload="auto" src={src} onLoadedMetadata={() => { if (audioRef.current) audioRef.current.playbackRate = speed; }} />
          <div className="tm-audio-tools">
            <button type="button" onClick={() => skip(-5)} aria-label="Back 5 seconds">Back 5s</button>
            <button type="button" onClick={() => skip(5)} aria-label="Forward 5 seconds">Forward 5s</button>
            <label>
              Speed
              <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
                {SPEEDS.map((value) => <option key={value} value={value}>{value}x</option>)}
              </select>
            </label>
            <a href={src} download={filename || 'recording.mp3'}>Download audio</a>
          </div>
        </>
      ) : (
        <span>{error || (loading ? 'Preparing the recording. This can take a few seconds for a part.' : 'The recording is not available right now.')}</span>
      )}
    </div>
  );
}
