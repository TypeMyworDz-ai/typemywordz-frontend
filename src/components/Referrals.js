import React, { useState, useEffect, useCallback } from 'react';

// Give credits, get credits. Every account has its own short code; sharing
// it and having someone sign up tops both people up once. This talks to the
// same simple, no-token pattern the rest of the credits endpoints already
// use, keyed by uid/email.

const RAILWAY_BACKEND_URL =
  process.env.REACT_APP_RAILWAY_BACKEND_URL ||
  'https://backendforrailway-production-7128.up.railway.app';

const Referrals = ({ userId = '', userEmail = '' }) => {
  const [state, setState] = useState('loading');
  const [code, setCode] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const [bonusCredits, setBonusCredits] = useState(100);
  const [completed, setCompleted] = useState(0);
  const [earned, setEarned] = useState(0);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!userId && !userEmail) return;
    setState('loading');
    try {
      const url = `${RAILWAY_BACKEND_URL}/referrals/code?user_id=${encodeURIComponent(userId)}&user_email=${encodeURIComponent(userEmail)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('failed');
      const data = await res.json();
      setCode(data.code || '');
      setShareUrl(data.share_url || '');
      setBonusCredits(data.referral_bonus_credits || 100);
      setCompleted(data.referrals_completed || 0);
      setEarned(data.credits_earned || 0);
      setState('ready');
    } catch {
      setState('error');
    }
  }, [userId, userEmail]);

  useEffect(() => { load(); }, [load]);

  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard access can fail quietly on some browsers; the link is
      // still shown as selectable text below.
    }
  };

  return (
    <div className="tm-referrals">
      <div className="tm-referrals-head">
        <h1>Give {bonusCredits} credits, get {bonusCredits} credits</h1>
        <p>Share your link. The moment someone signs up with it, you both get {bonusCredits} credits &mdash; no purchase needed on either side.</p>
      </div>

      {state === 'loading' && <p className="tm-referrals-note">Loading your link&hellip;</p>}
      {state === 'error' && <p className="tm-referrals-note">Could not load your referral link right now. Reload the page to try again.</p>}

      {state === 'ready' && (
        <>
          <div className="tm-referrals-linkbox">
            <input type="text" readOnly value={shareUrl} onFocus={(e) => e.target.select()} aria-label="Your referral link" />
            <button type="button" onClick={copyLink}>{copied ? 'Copied!' : 'Copy link'}</button>
          </div>
          <p className="tm-referrals-code">Your code: <strong>{code}</strong></p>

          <div className="tm-referrals-stats">
            <div>
              <div className="tm-referrals-stat-n">{completed}</div>
              <div className="tm-referrals-stat-label">{completed === 1 ? 'friend joined' : 'friends joined'}</div>
            </div>
            <div>
              <div className="tm-referrals-stat-n">{earned}</div>
              <div className="tm-referrals-stat-label">credits earned</div>
            </div>
          </div>

          <h2>How it works</h2>
          <ul>
            <li>Share your link by text, email, or on social &mdash; however you'd normally tell someone about a tool you like.</li>
            <li>When they create a new account through your link, you both get {bonusCredits} credits automatically.</li>
            <li>Referral credits work exactly like bought credits: they last a year and never expire mid-job.</li>
            <li>There's no limit on how many friends you can refer.</li>
          </ul>
        </>
      )}
    </div>
  );
};

export default Referrals;
