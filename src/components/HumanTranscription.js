import React, { useMemo, useState } from 'react';
import './HumanTranscription.css';

const ACCEPTED_AUDIO = '.mp3,.wav,.m4a,.mp4,.mov,.avi,.aac,.flac,.ogg,.webm';

function formatFileSize(bytes) {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}

export default function HumanTranscription({ onBack, onOpenFiles, showMessage }) {
  const [file, setFile] = useState(null);
  const [turnaround, setTurnaround] = useState('standard');
  const [difficulty, setDifficulty] = useState('standard');
  const [timestamps, setTimestamps] = useState(true);
  const [speakers, setSpeakers] = useState(true);
  const [notes, setNotes] = useState('');
  const [requested, setRequested] = useState(false);

  const fileLabel = useMemo(() => {
    if (!file) return 'Choose an audio or video file';
    return `${file.name} · ${formatFileSize(file.size)}`;
  }, [file]);

  const handleFileChange = (event) => {
    const nextFile = event.target.files?.[0] || null;
    setFile(nextFile);
    setRequested(false);
  };

  const handleRequest = (event) => {
    event.preventDefault();
    if (!file) {
      showMessage?.('Choose an audio or video file first.');
      return;
    }

    // The secure quote and credit reservation are deliberately added in the next release.
    // This first release establishes the customer-facing flow without uploading or charging.
    setRequested(true);
  };

  return (
    <section className="tm-human-page" aria-labelledby="human-transcription-title">
      <div className="tm-human-heading-row">
        <button type="button" className="tm-human-back" onClick={onBack}>
          <span aria-hidden="true">←</span> Back to workspace
        </button>
        <span className="tm-human-kicker">Human transcription</span>
      </div>

      <div className="tm-human-intro">
        <div>
          <h1 id="human-transcription-title">When every word matters.</h1>
          <p>
            Send difficult or high-stakes audio to a trained transcriber without leaving TypeMyworDz.
            Your finished transcript will return to your account with the same files and export tools you already use.
          </p>
        </div>
        <div className="tm-human-mark" aria-hidden="true">
          <span className="tm-human-mark-line tm-human-mark-line-one" />
          <span className="tm-human-mark-line tm-human-mark-line-two" />
          <span className="tm-human-mark-line tm-human-mark-line-three" />
        </div>
      </div>

      <div className="tm-human-notice">
        <span className="tm-human-notice-dot" aria-hidden="true" />
        You will see the exact credit quote before you confirm. Credits are only deducted after you approve the order.
      </div>

      <form className="tm-human-card" onSubmit={handleRequest}>
        <div className="tm-human-card-top">
          <div>
            <p className="tm-human-eyebrow">1 · Add your recording</p>
            <h2>Start with the file you want reviewed</h2>
          </div>
          <span className="tm-human-step-note">Audio and video up to 500 MB</span>
        </div>

        <label className={`tm-human-dropzone ${file ? 'tm-human-dropzone-selected' : ''}`}>
          <input type="file" accept={ACCEPTED_AUDIO} onChange={handleFileChange} />
          <span className="tm-human-upload-icon" aria-hidden="true">↑</span>
          <span className="tm-human-file-label">{fileLabel}</span>
          <span className="tm-human-file-help">MP3, WAV, M4A, MP4, MOV and more</span>
        </label>

        <div className="tm-human-divider" />

        <div className="tm-human-card-top tm-human-options-heading">
          <div>
            <p className="tm-human-eyebrow">2 · Set the brief</p>
            <h2>Tell us what good looks like</h2>
          </div>
          <span className="tm-human-step-note">You can add detail later</span>
        </div>

        <div className="tm-human-grid">
          <label className="tm-human-field">
            <span>Turnaround</span>
            <select value={turnaround} onChange={(event) => setTurnaround(event.target.value)}>
              <option value="standard">Standard delivery</option>
              <option value="rush">Rush delivery</option>
            </select>
          </label>
          <label className="tm-human-field">
            <span>Audio difficulty</span>
            <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
              <option value="standard">Clear and steady</option>
              <option value="difficult">Difficult audio</option>
            </select>
          </label>
        </div>

        <div className="tm-human-checks" role="group" aria-label="Transcript requirements">
          <label className="tm-human-check">
            <input type="checkbox" checked={timestamps} onChange={(event) => setTimestamps(event.target.checked)} />
            <span>Include timestamps</span>
          </label>
          <label className="tm-human-check">
            <input type="checkbox" checked={speakers} onChange={(event) => setSpeakers(event.target.checked)} />
            <span>Separate speakers</span>
          </label>
        </div>

        <label className="tm-human-field tm-human-notes">
          <span>Notes for the transcriber <em>optional</em></span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Names, spellings, formatting preferences, or context that will help the transcriber"
            rows={4}
          />
        </label>

        {requested && (
          <div className="tm-human-quote-placeholder" role="status">
            <strong>Your file is ready for a quote.</strong>
            <span>The secure quote and confirmation step are being connected next. Nothing has been uploaded or charged.</span>
          </div>
        )}

        <div className="tm-human-footer">
          <p>Nothing is uploaded or deducted until you review and confirm the quote.</p>
          <button type="submit" className="tm-human-quote-button">Prepare my quote</button>
        </div>
      </form>

      <div className="tm-human-lower-links">
        <button type="button" onClick={onOpenFiles}>View completed transcripts</button>
        <span>Need help? Contact info@typemywordz.ai</span>
      </div>
    </section>
  );
}
