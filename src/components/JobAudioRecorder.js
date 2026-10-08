import React, { useCallback, useEffect, useRef, useState } from 'react';
import './JobAudioRecorder.css';

const RECORDING_FORMATS = [
  { mimeType: 'audio/webm;codecs=opus', extension: 'webm', bitrate: 32000 },
  { mimeType: 'audio/ogg;codecs=opus', extension: 'ogg', bitrate: 32000 },
  { mimeType: 'audio/mp4;codecs=mp4a.40.2', extension: 'm4a', bitrate: 64000 },
  { mimeType: 'audio/mp4', extension: 'm4a', bitrate: 64000 },
  { mimeType: 'audio/webm', extension: 'webm', bitrate: 32000 },
];

const clock = (totalSeconds) => {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};

export default function JobAudioRecorder({ onRecordingReady, onRecordingError }) {
  const [phase, setPhase] = useState('idle');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const activeSinceRef = useRef(0);
  const elapsedMsRef = useRef(0);

  const stopTracks = useCallback(() => {
    (streamRef.current?.getTracks?.() || []).forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const refreshClock = () => {
    const runningMs = activeSinceRef.current ? Date.now() - activeSinceRef.current : 0;
    setElapsed(Math.floor((elapsedMsRef.current + runningMs) / 1000));
  };

  const start = async () => {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia || typeof window.MediaRecorder !== 'function') {
      const message = 'This browser cannot record audio here. Choose a recording file instead.';
      setError(message);
      onRecordingError?.(message);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const supported = typeof window.MediaRecorder.isTypeSupported === 'function'
        ? RECORDING_FORMATS.find((format) => window.MediaRecorder.isTypeSupported(format.mimeType))
        : null;
      const options = supported ? { mimeType: supported.mimeType, audioBitsPerSecond: supported.bitrate } : undefined;
      const recorder = options ? new window.MediaRecorder(stream, options) : new window.MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      elapsedMsRef.current = 0;
      activeSinceRef.current = Date.now();
      setElapsed(0);
      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        clearInterval(timerRef.current);
        timerRef.current = null;
        activeSinceRef.current = 0;
        stopTracks();
        setPhase('idle');
        const message = 'The browser could not record this audio. Check microphone access and try again.';
        setError(message);
        onRecordingError?.(message);
      };
      recorder.onstop = () => {
        clearInterval(timerRef.current);
        timerRef.current = null;
        if (activeSinceRef.current) elapsedMsRef.current += Date.now() - activeSinceRef.current;
        activeSinceRef.current = 0;
        const seconds = Math.max(1, Math.round(elapsedMsRef.current / 1000));
        const mimeType = recorder.mimeType || supported?.mimeType || 'audio/webm';
        const extension = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'm4a' : 'webm';
        const blob = new Blob(chunksRef.current, { type: mimeType });
        stopTracks();
        recorderRef.current = null;
        if (blob.size < 2048) {
          setPhase('idle');
          setError('This recording is too short or empty. Record it again, or choose a file.');
          return;
        }
        const file = new File([blob], `recording-${Date.now()}.${extension}`, { type: mimeType });
        setElapsed(seconds);
        setPhase('ready');
        onRecordingReady?.(file, seconds);
      };
      recorder.start(1000);
      setPhase('recording');
      clearInterval(timerRef.current);
      timerRef.current = setInterval(refreshClock, 250);
    } catch (caught) {
      clearInterval(timerRef.current);
      timerRef.current = null;
      activeSinceRef.current = 0;
      stopTracks();
      setPhase('idle');
      const message = caught?.name === 'NotAllowedError'
        ? 'Microphone access was blocked. Allow microphone access in your browser, then try again.'
        : 'The microphone could not be opened. Check that it is connected and not being used by another app.';
      setError(message);
      onRecordingError?.(message);
    }
  };

  const pause = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'recording') return;
    elapsedMsRef.current += Date.now() - activeSinceRef.current;
    activeSinceRef.current = 0;
    recorder.pause();
    setPhase('paused');
    refreshClock();
  };

  const resume = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'paused') return;
    activeSinceRef.current = Date.now();
    recorder.resume();
    setPhase('recording');
  };

  const stop = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    recorder.stop();
  };

  useEffect(() => () => {
    clearInterval(timerRef.current);
    if (recorderRef.current) {
      recorderRef.current.onstop = null;
      try { if (recorderRef.current.state !== 'inactive') recorderRef.current.stop(); } catch { /* releasing the stream is sufficient */ }
    }
    stopTracks();
  }, [stopTracks]);

  return (
    <section className="tm-job-audio-recorder" aria-label="Record audio for this job">
      <div className="tm-job-audio-recorder-copy">
        <strong>Record directly into this job</strong>
        <span>Stop recording to attach it here automatically. Your browser will ask for microphone access.</span>
      </div>
      <div className="tm-job-audio-recorder-controls">
        {phase === 'idle' && <button type="button" className="tm-job-recorder-button" onClick={start}>Record audio</button>}
        {phase === 'ready' && <button type="button" className="tm-job-recorder-button" onClick={start}>Record another</button>}
        {phase === 'recording' && <>
          <span className="tm-job-recorder-live" role="status">Recording · {clock(elapsed)}</span>
          <button type="button" className="tm-job-recorder-button" onClick={pause}>Pause</button>
          <button type="button" className="tm-job-recorder-button tm-job-recorder-stop" onClick={stop}>Stop recording</button>
        </>}
        {phase === 'paused' && <>
          <span className="tm-job-recorder-live" role="status">Paused · {clock(elapsed)}</span>
          <button type="button" className="tm-job-recorder-button" onClick={resume}>Resume</button>
          <button type="button" className="tm-job-recorder-button tm-job-recorder-stop" onClick={stop}>Stop recording</button>
        </>}
        {phase === 'ready' && <span className="tm-job-recorder-ready" role="status">Recording ready · {clock(elapsed)}</span>}
      </div>
      {error && <p className="tm-job-recorder-error" role="alert">{error}</p>}
    </section>
  );
}
