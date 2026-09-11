import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { paymentCountryCode } from './Pricing';
import './HumanRequest.css';

const BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL ||
  'https://backendforrailway-production-7128.up.railway.app';

const formatDuration = (seconds) => {
  const value = Number(seconds) || 0;
  const minutes = Math.floor(value / 60);
  const remaining = Math.round(value % 60);
  return `${minutes}:${String(remaining).padStart(2, '0')}`;
};

const formatCredits = (value) => `${Math.max(0, Math.round(value)).toLocaleString()} credits`;

function estimateTotal(baseQuote, options) {
  if (!baseQuote) return 0;
  let total = Number(baseQuote.credits) || 0;
  if (options.service === 'proofread') total *= 1.2;
  if (options.service === 'formatted') total *= 1.3;
  if (options.speakers === '3+') total *= 1.1;
  if (options.timestamps) total *= 1.05;
  if (options.formatting === 'advanced') total *= 1.1;
  return Math.ceil(total);
}

export default function HumanRequest({ fileName = 'Transcript', durationSeconds = 0, onClose }) {
  const { currentUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [service, setService] = useState('standard');
  const [speakers, setSpeakers] = useState('1-2');
  const [difficulty, setDifficulty] = useState('standard');
  const [timestamps, setTimestamps] = useState(true);
  const [formatting, setFormatting] = useState('standard');
  const [turnaround, setTurnaround] = useState('standard');
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState('');
  const [loading, setLoading] = useState(false);

  const options = useMemo(() => ({ service, speakers, difficulty, timestamps, formatting, turnaround }), [
    service, speakers, difficulty, timestamps, formatting, turnaround
  ]);
  const estimate = estimateTotal(quote, options);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        onClose?.();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const close = () => {
    setOpen(false);
    onClose?.();
  };

  const prepareQuote = async () => {
    if (!currentUser) {
      setQuoteError('Please sign in before preparing a human-transcription quote.');
      return;
    }
    setLoading(true);
    setQuoteError('');
    setQuote(null);
    try {
      const token = await currentUser.getIdToken();
      const body = new FormData();
      body.append('seconds', String(Math.round(Number(durationSeconds) || 0)));
      body.append('turnaround', turnaround);
      body.append('difficulty', difficulty);
      body.append('country_code', paymentCountryCode());
      const response = await fetch(`${BACKEND_URL}/human-transcription/quote`, {
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
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="tm-human-request-button"
        onClick={() => setOpen(true)}
        title="See the price for a trained human transcription"
      >
        Human transcription
      </button>

      {open && (
        <div className="tm-human-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) close();
        }}>
          <section className="tm-human-modal" role="dialog" aria-modal="true" aria-labelledby="tm-human-modal-title">
            <div className="tm-human-modal-head">
              <div>
                <p className="tm-human-modal-kicker">Human review</p>
                <h2 id="tm-human-modal-title">When every word needs a second pair of eyes</h2>
                <p className="tm-human-modal-subtitle">
                  Get a clear credit estimate for <strong>{fileName}</strong>. Nothing is uploaded or deducted while you are checking the price.
                </p>
              </div>
              <button type="button" className="tm-human-modal-close" onClick={close} aria-label="Close human transcription calculator">×</button>
            </div>

            <div className="tm-human-modal-summary">
              <span>Recording length</span>
              <strong>{formatDuration(durationSeconds)}</strong>
            </div>

            <div className="tm-human-modal-grid">
              <label>
                <span>Service</span>
                <select value={service} onChange={(event) => setService(event.target.value)}>
                  <option value="standard">Standard human transcript</option>
                  <option value="proofread">Proofread and corrected</option>
                  <option value="formatted">Formatted for delivery</option>
                </select>
              </label>
              <label>
                <span>Speaker count</span>
                <select value={speakers} onChange={(event) => setSpeakers(event.target.value)}>
                  <option value="1-2">One or two speakers</option>
                  <option value="3+">Three or more speakers</option>
                </select>
              </label>
              <label>
                <span>Audio difficulty</span>
                <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
                  <option value="standard">Clear and steady</option>
                  <option value="difficult">Difficult audio</option>
                </select>
              </label>
              <label>
                <span>Turnaround</span>
                <select value={turnaround} onChange={(event) => setTurnaround(event.target.value)}>
                  <option value="standard">Standard delivery</option>
                  <option value="rush">Rush delivery</option>
                </select>
              </label>
              <label>
                <span>Formatting</span>
                <select value={formatting} onChange={(event) => setFormatting(event.target.value)}>
                  <option value="standard">Standard paragraphs</option>
                  <option value="advanced">Detailed formatting</option>
                </select>
              </label>
              <label className="tm-human-modal-check">
                <input type="checkbox" checked={timestamps} onChange={(event) => setTimestamps(event.target.checked)} />
                <span>Include timestamps</span>
              </label>
            </div>

            {quoteError && <p className="tm-human-modal-error" role="alert">{quoteError}</p>}

            {quote && (
              <div className="tm-human-modal-result" role="status">
                <div>
                  <span className="tm-human-modal-result-label">Estimated total</span>
                  <strong>{formatCredits(quote.exempt ? 0 : estimate)}</strong>
                </div>
                <p>
                  This is a price preview based on the recording length and the options above. Credits are only considered after you review the completed work and approve it.
                </p>
              </div>
            )}

            <div className="tm-human-modal-foot">
              <span>Powered by your TypeMyworDz credit balance. Checkout and Admin review will follow in the next release.</span>
              <button type="button" className="tm-human-modal-primary" onClick={prepareQuote} disabled={loading || !durationSeconds}>
                {loading ? 'Preparing…' : quote ? 'Refresh estimate' : 'Calculate price'}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
