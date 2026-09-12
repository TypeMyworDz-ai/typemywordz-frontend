import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { looksLikeAnEmail, usesPlusAlias, isDisposableEmail, friendlyAuthError, MIN_PASSWORD_LENGTH } from '../utils/emailChecks';

const BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';
const PAID_INTENT_KEY = 'tmwd_trainee_paid_intent';
const DRAFT_KEY = 'tmwd_trainee_checkout_draft';

const PasswordEye = ({ hidden }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2.2 12s3.5-6 9.8-6 9.8 6 9.8 6-3.5 6-9.8 6-9.8-6-9.8-6Z" />
    <circle cx="12" cy="12" r="2.5" />
    {hidden && <path d="m4 4 16 16" />}
  </svg>
);

const readSession = (key) => {
  try { return JSON.parse(window.sessionStorage.getItem(key) || 'null'); } catch (error) { return null; }
};
const removeSession = (key) => { try { window.sessionStorage.removeItem(key); } catch (error) { /* ignore */ } };
const writeSession = (key, value) => { try { window.sessionStorage.setItem(key, JSON.stringify(value)); } catch (error) { /* ignore */ } };

export default function TraineeSignup() {
  const navigate = useNavigate();
  const { currentUser, userProfile, signUpWithEmail, logout } = useAuth();
  const [officialName, setOfficialName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [paymentReference, setPaymentReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const removeOldPendingAccount = useCallback(async (user) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      await fetch(`${BACKEND_URL}/api/trainee/cancel-pending`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ force_pending_cleanup: true }),
      });
    } catch (cleanupError) {
      console.warn('Old pending trainee cleanup failed:', cleanupError);
    }
    await logout();
  }, [logout]);

  useEffect(() => {
    const oldPending = currentUser && userProfile?.trainingPaymentStatus === 'pending' && userProfile?.trainingRoomAccess !== true;
    if (oldPending) removeOldPendingAccount(currentUser);
  }, [currentUser, removeOldPendingAccount, userProfile]);

  useEffect(() => {
    const draft = readSession(DRAFT_KEY);
    const paid = readSession(PAID_INTENT_KEY);
    if (draft) {
      setEmail(draft.email || '');
      setOfficialName(draft.officialName || '');
    }
    if (paid?.reference) {
      setPaymentConfirmed(true);
      setPaymentReference(paid.reference);
      setEmail(paid.email || draft?.email || '');
      setOfficialName(paid.officialName || draft?.officialName || '');
      setNotice('Payment confirmed. Create your account below to open the Training Room.');
    } else if (userProfile?.officialIdName) {
      setOfficialName(userProfile.officialIdName);
    } else if (userProfile?.name) {
      setOfficialName(userProfile.name);
    }
  }, [userProfile]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get('reference');
    const isTrainee = params.get('trainee') === '1';
    const paymentStatus = params.get('payment') || '';
    const koraState = params.get('kora') || '';
    if (!isTrainee || (!reference && !paymentStatus && !koraState) || currentUser) return;

    let cancelled = false;
    const verify = async () => {
      setBusy(true);
      setError('');
      try {
        if (['failed', 'cancelled'].includes(paymentStatus) || ['failed', 'cancelled'].includes(koraState)) {
          removeSession(PAID_INTENT_KEY);
          removeSession(DRAFT_KEY);
          setError('Payment was not completed. No trainee account was created.');
          window.history.replaceState({}, document.title, '/trainee-signup');
          return;
        }
        const endpoint = koraState ? '/api/verify-kora-payment' : '/api/verify-payment';
        const response = await fetch(`${BACKEND_URL}${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reference }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.status !== 'success') throw new Error(data.detail || data.message || 'Payment verification failed.');
        const paidData = data.data || {};
        if (paidData.plan !== 'trainee-training') throw new Error('This payment is not a trainee enrollment.');
        const draft = readSession(DRAFT_KEY) || {};
        writeSession(PAID_INTENT_KEY, { reference, email: paidData.email || draft.email || '', officialName: draft.officialName || '' });
        if (!cancelled) {
          setPaymentConfirmed(true);
          setPaymentReference(reference);
          setEmail(paidData.email || draft.email || '');
          setOfficialName(draft.officialName || '');
          setNotice('Payment confirmed. Create your account below to open the Training Room.');
          window.history.replaceState({}, document.title, '/trainee-signup');
        }
      } catch (verificationError) {
        if (!cancelled) {
          removeSession(PAID_INTENT_KEY);
          setError(friendlyAuthError(verificationError));
          window.history.replaceState({}, document.title, '/trainee-signup');
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    };
    verify();
    return () => { cancelled = true; };
  }, [currentUser]);

  const startPayment = async (provider) => {
    setError('');
    setNotice('');
    const address = (currentUser?.email || email).trim().toLowerCase();
    if (!looksLikeAnEmail(address)) return setError('Please enter a valid email address.');
    if (!currentUser && usesPlusAlias(address)) return setError('Please use your plain email address, without a plus alias.');
    if (!currentUser && await isDisposableEmail(address)) return setError('Please use a permanent email address. Temporary inboxes are not accepted.');
    if (!officialName.trim() || officialName.trim().length < 2) return setError('Enter your full official name exactly as it appears on your ID.');
    if (!confirmed) return setError('Please confirm that you are using your official ID names.');
    setBusy(true);
    try {
      writeSession(DRAFT_KEY, { email: address, officialName: officialName.trim() });
      const response = await fetch(`${BACKEND_URL}/api/initialize-trainee-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: address, official_name: officialName.trim(), country_code: 'KE', provider, callback_url: `${window.location.origin}/trainee-signup?payment=success&trainee=1` }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.status || !(data.authorization_url || data.checkout_url)) throw new Error(data.detail || data.message || 'Checkout could not be started.');
      window.location.href = data.authorization_url || data.checkout_url;
    } catch (paymentError) {
      setError(friendlyAuthError(paymentError));
      setBusy(false);
    }
  };

  const completeSignup = async () => {
    if (!paymentReference) return setError('The paid enrollment could not be found.');
    if (currentUser) {
      setBusy(true);
      try {
        const token = await currentUser.getIdToken();
        const response = await fetch(`${BACKEND_URL}/api/trainee/complete-signup`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ reference: paymentReference, official_name: officialName.trim() }) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) throw new Error(data.detail || 'The Training Room could not be opened.');
        removeSession(PAID_INTENT_KEY); removeSession(DRAFT_KEY); navigate('/');
      } catch (completeError) { setError(friendlyAuthError(completeError)); } finally { setBusy(false); }
      return;
    }
    const address = email.trim().toLowerCase();
    if (!looksLikeAnEmail(address)) return setError('Please enter a valid email address.');
    if (password.length < MIN_PASSWORD_LENGTH) return setError(`Please choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
    setBusy(true);
    try {
      const result = await signUpWithEmail(address, password, officialName.trim());
      const token = await result.user.getIdToken();
      const response = await fetch(`${BACKEND_URL}/api/trainee/complete-signup`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ reference: paymentReference, official_name: officialName.trim() }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.detail || 'The Training Room could not be opened.');
      removeSession(PAID_INTENT_KEY); removeSession(DRAFT_KEY); navigate('/');
    } catch (completeError) {
      setError(friendlyAuthError(completeError));
      setBusy(false);
    }
  };

  return (
    <main className="tm-trainee-page">
      <div className="tm-trainee-card">
        <button type="button" className="tm-trainee-back" onClick={() => navigate('/')}>Back to TypeMyworDz</button>
        <div className="tm-trainee-mark"><img src="/android-chrome-192x192.png" alt="" /></div>
        <p className="tm-lp-eyebrow">Training Room enrollment</p>
        <h1>Become a Skilled Transcriber</h1>
        <p className="tm-trainee-lede">Enrollment is currently open to Kenyan applicants only. Use your official ID names so we can keep your training and work records accurate.</p>
        <img className="tm-trainee-illustration" src="/trainee-african-headphones.png" alt="African transcription trainee working with headphones" />
        <div className="tm-trainee-price"><strong>$1.50 USD</strong><span>Temporary test price. Paystack shows the final Kenyan charge at checkout.</span></div>
        {error && <p className="tm-auth-error" role="alert">{error}</p>}
        {notice && <p className="tm-auth-notice" role="status">{notice}</p>}
        <label className="tm-auth-label" htmlFor="trainee-official-name">Full official ID name</label>
        <input id="trainee-official-name" className="tm-auth-input" value={officialName} onChange={(e) => setOfficialName(e.target.value)} placeholder="As shown on your official ID" disabled={busy || paymentConfirmed} />
        {!currentUser && <label className="tm-auth-label" htmlFor="trainee-email">Email</label>}
        {!currentUser && <input id="trainee-email" className="tm-auth-input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy || paymentConfirmed} />}
        {paymentConfirmed && !currentUser && <><label className="tm-auth-label" htmlFor="trainee-password">Create a password</label><div className="tm-auth-pwwrap"><input id="trainee-password" className="tm-auth-input" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} /><button type="button" className="tm-auth-peek" onClick={() => setShowPassword((value) => !value)} disabled={busy} aria-label={showPassword ? 'Hide password' : 'Show password'} title={showPassword ? 'Hide password' : 'Show password'}><PasswordEye hidden={!showPassword} /></button></div></>}
        {!paymentConfirmed && <label className="tm-trainee-check"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={busy} /> <span>I confirm that these are my official ID names.</span></label>}
        <div className="tm-trainee-actions">{paymentConfirmed ? <button type="button" className="tm-auth-submit" onClick={completeSignup} disabled={busy}>{busy ? 'Creating your account…' : 'Create account and open Training Room'}</button> : <><button type="button" className="tm-auth-submit" onClick={() => startPayment('paystack')} disabled={busy}>{busy ? 'Opening secure checkout…' : 'Pay with Paystack'}</button><button type="button" className="tm-trainee-kora" onClick={() => startPayment('kora')} disabled={busy}>Use Kora instead</button></>}</div>
        <p className="tm-trainee-promise">This programme is designed to build your transcription skills. Completing the training does not guarantee employment or paid work; any future opportunity is assessed separately.</p>
        {currentUser && !paymentConfirmed && <p className="tm-trainee-signed">Signed in as {currentUser.email}</p>}
      </div>
    </main>
  );
}
