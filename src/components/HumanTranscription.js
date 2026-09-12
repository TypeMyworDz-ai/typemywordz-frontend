import React, { useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { paymentCountryCode } from './Pricing';
import './HumanTranscription.css';

const ACCEPTED_AUDIO = '.mp3,.wav,.m4a,.mp4,.mov,.avi,.aac,.flac,.ogg,.webm';

function formatFileSize(bytes) {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}

export default function HumanTranscription({ onBack, onOpenFiles, onTopUp, showMessage }) {
  const { currentUser } = useAuth();
  const [file, setFile] = useState(null);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [durationLoading, setDurationLoading] = useState(false);
  const [turnaround, setTurnaround] = useState('standard');
  const [difficulty, setDifficulty] = useState('standard');
  const [service, setService] = useState('standard');
  const [formatting, setFormatting] = useState('standard');
  const [timestamps, setTimestamps] = useState(true);
  const [speakers, setSpeakers] = useState('1-2');
  const [notes, setNotes] = useState('');
  const [instructionFiles, setInstructionFiles] = useState([]);
  const [quote, setQuote] = useState(null);
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState('');

  const backendUrl = process.env.REACT_APP_RAILWAY_BACKEND_URL ||
    'https://backendforrailway-production-7128.up.railway.app';

  const fileLabel = useMemo(() => {
    if (!file) return 'Choose an audio or video file';
    return `${file.name} · ${formatFileSize(file.size)}`;
  }, [file]);

  const handleFileChange = (event) => {
    const nextFile = event.target.files?.[0] || null;
    setFile(nextFile);
    setDurationSeconds(0);
    setQuote(null);
    setQuoteError('');
    if (!nextFile) return;

    setDurationLoading(true);
    const media = document.createElement(nextFile.type.startsWith('video/') ? 'video' : 'audio');
    const objectUrl = URL.createObjectURL(nextFile);
    media.preload = 'metadata';
    media.onloadedmetadata = () => {
      setDurationSeconds(Number.isFinite(media.duration) ? media.duration : 0);
      setDurationLoading(false);
      URL.revokeObjectURL(objectUrl);
    };
    media.onerror = () => {
      setDurationLoading(false);
      setQuoteError('We could not read the recording length. Please choose another file.');
      URL.revokeObjectURL(objectUrl);
    };
    media.src = objectUrl;
  };

  const handleCreateJob = async () => {
    if (!quote?.affordable && !quote?.exempt) return;
    setRequestLoading(true);
    setQuoteError('');
    try {
      const token = await currentUser.getIdToken();
      const body = new FormData();
      body.append('audio', file);
      instructionFiles.forEach((item) => body.append('attachments', item));
      body.append('seconds', String(Math.round(durationSeconds)));
      body.append('turnaround', turnaround);
      body.append('difficulty', difficulty);
      body.append('service', service);
      body.append('formatting', formatting);
      body.append('timestamps', String(timestamps));
      body.append('speakers', speakers);
      body.append('instructions', notes);
      body.append('source_type', 'human_transcription');
      const response = await fetch(`${backendUrl}/human-transcription/jobs`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'The request could not be sent.');
      setRequestSent(true);
      showMessage?.('Your request is with the TypeMyworDz admin team.', 'success');
    } catch (error) {
      setQuoteError(error.message || 'The request could not be sent.');
    } finally { setRequestLoading(false); }
  };

  const handleRequest = async (event) => {
    event.preventDefault();
    if (!file) {
      showMessage?.('Choose an audio or video file first.');
      return;
    }
    if (durationLoading || !durationSeconds) {
      showMessage?.('We are still reading the recording length. Try again in a moment.');
      return;
    }
    if (!currentUser) {
      showMessage?.('Please sign in before requesting a quote.', 'warning');
      return;
    }

    setQuoteLoading(true);
    setQuoteError('');
    setQuote(null);
    try {
      const token = await currentUser.getIdToken();
      const body = new FormData();
      body.append('seconds', String(Math.round(durationSeconds)));
      body.append('turnaround', turnaround);
      body.append('difficulty', difficulty);
      body.append('service', service);
      body.append('speakers', speakers);
      body.append('timestamps', String(timestamps));
      body.append('formatting', formatting);
      body.append('country_code', paymentCountryCode());
      const response = await fetch(`${backendUrl}/human-transcription/quote`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'The quote could not be prepared.');
      setQuote(data);
    } catch (error) {
      setQuoteError(error.message || 'The quote could not be prepared.');
    } finally {
      setQuoteLoading(false);
    }
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
            <span>Service</span>
            <select value={service} onChange={(event) => setService(event.target.value)}>
              <option value="standard">Standard transcript</option>
              <option value="proofread">Proofread and corrected</option>
              <option value="formatted">Formatted for delivery</option>
            </select>
          </label>
          <label className="tm-human-field">
            <span>Speakers</span>
            <select value={speakers} onChange={(event) => setSpeakers(event.target.value)}>
              <option value="1-2">One or two speakers</option>
              <option value="3+">Three or more speakers</option>
            </select>
          </label>
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
          <label className="tm-human-field">
            <span>Formatting</span>
            <select value={formatting} onChange={(event) => setFormatting(event.target.value)}>
              <option value="standard">Standard paragraphs</option>
              <option value="advanced">Detailed formatting</option>
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
          <div className="tm-human-instruction-attach">
            <span>Attach instructions or reference files</span>
            <input type="file" multiple onChange={(event) => setInstructionFiles(Array.from(event.target.files || []))} />
            <small>{instructionFiles.length ? instructionFiles.map((item) => item.name).join(', ') : 'PDF, Word, images, audio, video, or any other supporting file'}</small>
          </div>
        </label>

        {quoteError && (
          <div className="tm-human-quote-placeholder tm-human-quote-error" role="alert">
            <strong>Quote unavailable</strong>
            <span>{quoteError}</span>
          </div>
        )}

        {quote && (
          <div className="tm-human-quote-placeholder" role="status">
            <strong>{quote.exempt ? 'Admin test quote' : `Estimated quote: ${Number(quote.cost || 0).toLocaleString()} credits`}</strong>
            <span>
              {quote.minutes} minute{quote.minutes === 1 ? '' : 's'} · {quote.pricing_region === 'africa' ? 'African regional' : 'international'} {quote.pricing_tier === 'standard' ? 'standard' : 'rush or difficult'} rate.
            </span>
            <span>
              {quote.exempt
                ? 'This account is exempt from credit charges.'
                : `Available credits: ${Number(quote.spendable || 0).toLocaleString()}. ${quote.affordable ? 'Your balance covers this quote.' : `You need ${Number(quote.short_by || 0).toLocaleString()} more credits before human work can begin.`}`}
            </span>
            {!quote.exempt && !quote.affordable && (
              <button type="button" className="tm-human-topup-button" onClick={onTopUp}>
                Top up {Number(quote.short_by || 0).toLocaleString()} credits
              </button>
            )}
            <small>{requestSent ? 'Request sent for admin approval.' : 'Nothing has been uploaded, reserved, or deducted until you send the request.'}</small>
            {!requestSent && (quote.affordable || quote.exempt) && (
              <button type="button" className="tm-human-send-request" onClick={handleCreateJob} disabled={requestLoading}>
                {requestLoading ? 'Sending request…' : 'Send to admin for approval'}
              </button>
            )}
          </div>
        )}

        <div className="tm-human-footer">
          <p>We calculate the quote from the recording length on the server. Nothing is uploaded or deducted at this step.</p>
          <button type="submit" className="tm-human-quote-button" disabled={quoteLoading || durationLoading}>
            {quoteLoading ? 'Calculating quote…' : durationLoading ? 'Reading recording…' : 'Prepare my quote'}
          </button>
        </div>
      </form>

      <div className="tm-human-lower-links">
        <button type="button" onClick={onOpenFiles}>View completed transcripts</button>
        <span>Need help? Contact info@typemywordz.ai</span>
      </div>
    </section>
  );
}
