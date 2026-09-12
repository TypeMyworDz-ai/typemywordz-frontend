import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { paymentCountryCode } from './Pricing';
import { fetchCreditBalance } from '../creditsService';
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

const availableCredits = (balance) => {
  if (!balance) return null;
  if (balance.exempt || balance.unlimited) return Number.POSITIVE_INFINITY;
  const value = Number(balance.spendable);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
};

export default function HumanRequest({
  fileName = 'Transcript',
  durationSeconds = 0,
  label = 'Want a human ear on this one?',
  placement = 'bottom',
  onTopUp,
  onClose,
  onOpenHumanTranscripts,
}) {
  const { currentUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [service, setService] = useState('standard');
  const [speakers, setSpeakers] = useState('1-2');
  const [difficulty, setDifficulty] = useState('standard');
  const [timestamps, setTimestamps] = useState(true);
  const [formatting, setFormatting] = useState('standard');
  const [turnaround, setTurnaround] = useState('standard');
  const [notes, setNotes] = useState('');
  const [instructionFiles, setInstructionFiles] = useState([]);
  const [quote, setQuote] = useState(null);
  const [balance, setBalance] = useState(null);
  const [quoteError, setQuoteError] = useState('');
  const [loading, setLoading] = useState(false);
  const [balanceLoading, setBalanceLoading] = useState(false);

  const options = useMemo(() => ({ service, speakers, difficulty, timestamps, formatting, turnaround }), [
    service, speakers, difficulty, timestamps, formatting, turnaround
  ]);
  const estimate = estimateTotal(quote, options);
  const spendable = availableCredits(balance);
  const shortBy = Number.isFinite(spendable) ? Math.max(0, estimate - spendable) : 0;
  const balanceCoversEstimate = quote && (quote.exempt || spendable === Number.POSITIVE_INFINITY || shortBy === 0);

  const refreshBalance = useCallback(async () => {
    if (!currentUser) return;
    setBalanceLoading(true);
    try {
      const nextBalance = await fetchCreditBalance(currentUser.uid, currentUser.email);
      setBalance(nextBalance);
    } finally {
      setBalanceLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    if (!open) return undefined;
    refreshBalance();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        onClose?.();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose, refreshBalance]);

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
      body.append('timestamps', String(timestamps));
      body.append('speakers', String(speakers !== 'none'));
      body.append('instructions', notes);
      const response = await fetch(`${BACKEND_URL}/human-transcription/quote`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'The quote could not be prepared.');
      setQuote(data);
      await refreshBalance();
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
        className={`tm-human-request-button tm-human-request-${placement}`}
        onClick={() => setOpen(true)}
        title="See the price and credit requirement for a trained human transcription"
      >
        {label}
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
                <select value={service} onChange={(event) => { setService(event.target.value); setQuote(null); }}>
                  <option value="standard">Standard human transcript</option>
                  <option value="proofread">Proofread and corrected</option>
                  <option value="formatted">Formatted for delivery</option>
                </select>
              </label>
              <label>
                <span>Speaker count</span>
                <select value={speakers} onChange={(event) => { setSpeakers(event.target.value); setQuote(null); }}>
                  <option value="1-2">One or two speakers</option>
                  <option value="3+">Three or more speakers</option>
                </select>
              </label>
              <label>
                <span>Audio difficulty</span>
                <select value={difficulty} onChange={(event) => { setDifficulty(event.target.value); setQuote(null); }}>
                  <option value="standard">Clear and steady</option>
                  <option value="difficult">Difficult audio</option>
                </select>
              </label>
              <label>
                <span>Turnaround</span>
                <select value={turnaround} onChange={(event) => { setTurnaround(event.target.value); setQuote(null); }}>
                  <option value="standard">Standard delivery</option>
                  <option value="rush">Rush delivery</option>
                </select>
              </label>
              <label>
                <span>Formatting</span>
                <select value={formatting} onChange={(event) => { setFormatting(event.target.value); setQuote(null); }}>
                  <option value="standard">Standard paragraphs</option>
                  <option value="advanced">Detailed formatting</option>
                </select>
              </label>
              <label className="tm-human-modal-check">
                <input type="checkbox" checked={timestamps} onChange={(event) => { setTimestamps(event.target.checked); setQuote(null); }} />
                <span>Include timestamps</span>
              </label>
            </div>

            <label className="tm-human-modal-notes">
              <span>Instructions or notes <em>optional</em></span>
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} placeholder="Names, spellings, formatting preferences, or context for the transcriber" />
              <span className="tm-human-modal-attach">Attach reference files
                <input type="file" multiple onChange={(event) => setInstructionFiles(Array.from(event.target.files || []))} />
              </span>
              {instructionFiles.length > 0 && <small>{instructionFiles.map((item) => item.name).join(', ')}</small>}
            </label>

            {quoteError && <p className="tm-human-modal-error" role="alert">{quoteError}</p>}

            {quote && (
              <div className="tm-human-modal-result" role="status">
                <div>
                  <span className="tm-human-modal-result-label">Estimated total</span>
                  <strong>{formatCredits(quote.exempt ? 0 : estimate)}</strong>
                </div>
                <div className="tm-human-modal-balance">
                  <span>Available credits</span>
                  <strong>
                    {balanceLoading ? 'Checking…' : spendable === Number.POSITIVE_INFINITY ? 'Complimentary access' : formatCredits(spendable || 0)}
                  </strong>
                </div>
                {balanceCoversEstimate ? (
                  <p className="tm-human-modal-balance-ok">Your current balance covers this estimate. Credits will only be deducted after you approve the completed work.</p>
                ) : (
                  <div className="tm-human-modal-balance-low">
                    <p>You need {formatCredits(shortBy)} more before this order can go ahead. Top up first; no human work will be started while the balance is short.</p>
                    <button type="button" className="tm-human-modal-topup" onClick={onTopUp}>
                      Top up {formatCredits(shortBy)}
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="tm-human-modal-foot">
              <span>We check your balance before any order is created. There is no charge, reservation, or file upload while you are checking the price.</span>
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
