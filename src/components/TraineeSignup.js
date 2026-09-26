import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import TypingSpeedTest from './TypingSpeedTest';
import { looksLikeAnEmail, usesPlusAlias, isDisposableEmail, friendlyAuthError, MIN_PASSWORD_LENGTH } from '../utils/emailChecks';

const BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';
const PAID_INTENT_KEY = 'tmwd_trainee_paid_intent';
const DRAFT_KEY = 'tmwd_trainee_checkout_draft';
const TEST_PASSED_KEY = 'tmwd_trainee_test_passed';

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
  const [feeAcknowledged, setFeeAcknowledged] = useState(false);
  const [typingPassed, setTypingPassed] = useState(false);
  const [typingTestResult, setTypingTestResult] = useState(null);
  const [mpesaRegisteredName, setMpesaRegisteredName] = useState('');
  const [mpesaNumber, setMpesaNumber] = useState('');
  const [mpesaConfirmed, setMpesaConfirmed] = useState(false);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [paymentReference, setPaymentReference] = useState('');
  const [koraFallback, setKoraFallback] = useState(false);
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
    const speedTest = readSession(TEST_PASSED_KEY);
    if (speedTest?.passed && speedTest?.result) {
      setTypingPassed(true);
      setTypingTestResult(speedTest.result);
    }
    if (draft) {
      setEmail(draft.email || '');
      setOfficialName(draft.officialName || '');
    }
    if (paid?.reference) {
      setTypingPassed(true);
      setPaymentConfirmed(true);
      setPaymentReference(paid.reference);
      setEmail(paid.email || draft?.email || '');
      setOfficialName(paid.officialName || draft?.officialName || '');
      setNotice('Payment confirmed. Add your M-Pesa details to open the Training Room.');
    } else if (userProfile?.officialIdName) {
      setOfficialName(userProfile.officialIdName);
    } else if (userProfile?.name) {
      setOfficialName(userProfile.name);
    }
    if (userProfile?.mpesaRegisteredName) setMpesaRegisteredName(userProfile.mpesaRegisteredName);
    if (userProfile?.mpesaNumber) setMpesaNumber(userProfile.mpesaNumber);
  }, [userProfile]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get('reference');
    const isTrainee = params.get('trainee') === '1';
    const paymentStatus = params.get('payment') || '';
    const koraState = params.get('kora') || '';
    if (!isTrainee || (!reference && !paymentStatus && !koraState)) return;

    let cancelled = false;
    const verify = async () => {
      setBusy(true);
      setError('');
      try {
        if (['failed', 'cancelled'].includes(paymentStatus) || ['failed', 'cancelled'].includes(koraState)) {
          removeSession(PAID_INTENT_KEY);
          if (['failed', 'cancelled'].includes(koraState)) {
            setKoraFallback(true);
            setError('Kora payment was not completed. Your details are still here if you want to use Paystack instead.');
          } else {
            removeSession(DRAFT_KEY);
            setError('Payment was not completed. No trainee account was created.');
          }
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
        writeSession(TEST_PASSED_KEY, { passed: true, recordedAt: Date.now() });
        if (!cancelled) {
          setTypingPassed(true);
          setPaymentConfirmed(true);
          setPaymentReference(reference);
          setEmail(paidData.email || draft.email || '');
          setOfficialName(draft.officialName || '');
          setNotice('Payment confirmed. Add your M-Pesa details to open the Training Room.');
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
    if (provider === 'kora') setKoraFallback(false);
    if (!typingPassed || !typingTestResult) return setError('Pass the 30-second typing test before continuing.');
    if (!feeAcknowledged) return setError('Please confirm that you understand the training-fee terms.');
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
        body: JSON.stringify({ email: address, official_name: officialName.trim(), country_code: 'KE', provider, typing_test: typingTestResult, callback_url: `${window.location.origin}/trainee-signup?payment=success&trainee=1` }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.status || !(data.authorization_url || data.checkout_url)) throw new Error(data.detail || data.message || 'Checkout could not be started.');
      window.location.href = data.authorization_url || data.checkout_url;
    } catch (paymentError) {
      if (provider === 'kora') setKoraFallback(true);
      setError(provider === 'kora' ? 'Kora could not start checkout. Want to pay with Paystack instead?' : friendlyAuthError(paymentError));
      setBusy(false);
    }
  };

  const finalizeEnrollment = async (user) => {
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const token = await user.getIdToken(true);
      const response = await fetch(`${BACKEND_URL}/api/trainee/complete-signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reference: paymentReference, official_name: officialName.trim(), mpesa_registered_name: mpesaRegisteredName.trim(), mpesa_number: mpesaNumber.trim(), mpesa_confirmed: mpesaConfirmed }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.success) return data;
      lastError = new Error(data.detail || 'The Training Room could not be opened.');
      if (response.status !== 409 || attempt === 2) break;
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
    throw lastError || new Error('The Training Room could not be opened.');
  };

  const completeSignup = async () => {
    if (!paymentReference) return setError('The paid enrollment could not be found.');
    if (!mpesaRegisteredName.trim() || !mpesaNumber.trim()) return setError('Enter both your M-Pesa registered name and number.');
    if (!mpesaConfirmed) return setError('Confirm that these details are registered to your M-Pesa account.');
    const clearEnrollmentDraft = () => { removeSession(PAID_INTENT_KEY); removeSession(DRAFT_KEY); removeSession(TEST_PASSED_KEY); };
    if (currentUser) {
      setBusy(true);
      try {
        await finalizeEnrollment(currentUser);
        clearEnrollmentDraft();
        window.location.assign('/?open=training-room');
      } catch (completeError) {
        setError(friendlyAuthError(completeError));
        setBusy(false);
      }
      return;
    }
    const address = email.trim().toLowerCase();
    if (!looksLikeAnEmail(address)) return setError('Please enter a valid email address.');
    if (password.length < MIN_PASSWORD_LENGTH) return setError(`Please choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
    setBusy(true);
    try {
      const result = await signUpWithEmail(address, password, officialName.trim());
      await finalizeEnrollment(result.user);
      clearEnrollmentDraft();
      window.location.assign('/?open=training-room');
    } catch (completeError) {
      setError(friendlyAuthError(completeError));
      setBusy(false);
    }
  };

  return (
    <main className="tm-trainee-page">
      <div className={`tm-trainee-card${!typingPassed && !paymentConfirmed ? ' tm-trainee-card-test' : ''}`}>
        <button type="button" className="tm-trainee-back" onClick={() => navigate('/')}>Back to TypeMyworDz</button>
        <div className="tm-trainee-mark"><img src="/android-chrome-192x192.png" alt="" /></div>
        <p className="tm-lp-eyebrow">Training Room enrollment</p>
        <h1>Become a Skilled Transcriber</h1>
        <p className="tm-trainee-lede">Enrollment is currently open to Kenyan applicants. Use your official ID name so your training and work records match.</p>
        {!typingPassed && !paymentConfirmed && (
          <div className="tm-trainee-test-gate">
            <p><strong>First, check your typing speed.</strong> Pass a 30-second test at 50 WPM or faster to continue to the application and checkout.</p>
            <TypingSpeedTest compact onPass={({ correctCharacters, seconds, wpm }) => { const result = { correct_chars: correctCharacters, elapsed_ms: seconds * 1000, wpm }; setTypingPassed(true); setTypingTestResult(result); writeSession(TEST_PASSED_KEY, { passed: true, result, recordedAt: Date.now() }); setNotice('Typing requirement met. Your enrollment details are now available below.'); }} />
            <p className="tm-trainee-practice-link">Want to warm up first? <Link to="/typing-practice">Try the free typing lessons</Link>.</p>
          </div>
        )}
        {typingPassed && !paymentConfirmed && (
          <>
            <img className="tm-trainee-illustration" src="/trainee-african-headphones.png" alt="Transcription trainee working with headphones" />
            <div className="tm-trainee-price"><strong>$1 USD</strong><span>One-time enrollment fee, converted to local checkout currency. Kora is the primary checkout; Paystack appears if Kora cannot complete payment.</span></div>
            {error && <p className="tm-auth-error" role="alert">{error}</p>}
            {notice && <p className="tm-auth-notice" role="status">{notice}</p>}
            <label className="tm-auth-label" htmlFor="trainee-official-name">Full official ID name</label>
            <input id="trainee-official-name" className="tm-auth-input" value={officialName} onChange={(e) => setOfficialName(e.target.value)} placeholder="As shown on your official ID" disabled={busy} />
            {!currentUser && <><label className="tm-auth-label" htmlFor="trainee-email">Email</label><input id="trainee-email" className="tm-auth-input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} /></>}
            <label className="tm-trainee-check"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={busy} /> <span>I confirm that this is my official ID name.</span></label>
            <div className="tm-trainee-fee-disclosure">
              <strong>About the one-time fee</strong>
              <p>The $1 fee covers collecting and confirming the M-Pesa payout details you provide for future payments if you are hired. The fee is non-refundable once Training Room access is provided, subject to applicable law and our <Link to="/refund-policy">Refund Policy</Link> for service failures.</p>
              <p>We check the Kenyan phone-number format only; we do not verify details through Safaricom. Make sure the name and number you provide after payment are registered to your M-Pesa account.</p>
            </div>
            <label className="tm-trainee-check"><input type="checkbox" checked={feeAcknowledged} onChange={(e) => setFeeAcknowledged(e.target.checked)} disabled={busy} /> <span>I understand the one-time fee and M-Pesa details requirements.</span></label>
            <div className="tm-trainee-actions"><button type="button" className="tm-auth-submit" onClick={() => startPayment('kora')} disabled={busy}>{busy ? 'Opening secure checkout…' : 'Continue to secure checkout'}</button>{koraFallback && <button type="button" className="tm-trainee-kora" onClick={() => startPayment('paystack')} disabled={busy}>Use Paystack instead</button>}</div>
            {currentUser && <p className="tm-trainee-signed">Signed in as {currentUser.email}</p>}
          </>
        )}
        {paymentConfirmed && (
          <>
            {error && <p className="tm-auth-error" role="alert">{error}</p>}
            {notice && <p className="tm-auth-notice" role="status">{notice}</p>}
            <div className="tm-trainee-price"><strong>Payment confirmed</strong><span>Your one-time $1 enrollment fee is recorded. Add and confirm your payout details before the Training Room opens.</span></div>
            <label className="tm-auth-label" htmlFor="trainee-mpesa-name">M-Pesa registered name</label>
            <input id="trainee-mpesa-name" className="tm-auth-input" value={mpesaRegisteredName} onChange={(e) => setMpesaRegisteredName(e.target.value)} placeholder="Name registered to your M-Pesa account" disabled={busy} autoComplete="name" />
            <label className="tm-auth-label" htmlFor="trainee-mpesa-number">M-Pesa phone number</label>
            <input id="trainee-mpesa-number" className="tm-auth-input" type="tel" inputMode="tel" autoComplete="tel" value={mpesaNumber} onChange={(e) => setMpesaNumber(e.target.value)} placeholder="07… or 2547…" disabled={busy} />
            <label className="tm-trainee-check"><input type="checkbox" checked={mpesaConfirmed} onChange={(e) => setMpesaConfirmed(e.target.checked)} disabled={busy} /> <span>I confirm these details are registered to my M-Pesa account.</span></label>
            <p className="tm-trainee-payout-note">We validate the Kenyan number format and save your details to your profile. We do not check them against Safaricom. You can edit them later in Settings.</p>
            {!currentUser && <><label className="tm-auth-label" htmlFor="trainee-password">Create a password</label><div className="tm-auth-pwwrap"><input id="trainee-password" className="tm-auth-input" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} /><button type="button" className="tm-auth-peek" onClick={() => setShowPassword((value) => !value)} disabled={busy} aria-label={showPassword ? 'Hide password' : 'Show password'} title={showPassword ? 'Hide password' : 'Show password'}><PasswordEye hidden={!showPassword} /></button></div></>}
            {currentUser && <p className="tm-trainee-signed">Signed in as {currentUser.email}</p>}
            <div className="tm-trainee-actions"><button type="button" className="tm-auth-submit" onClick={completeSignup} disabled={busy}>{busy ? 'Saving details…' : currentUser ? 'Save details and open Training Room' : 'Create account and open Training Room'}</button></div>
          </>
        )}
        <p className="tm-trainee-promise">Training builds skills but does not guarantee employment or paid work. Every future opportunity is assessed separately.</p>
      </div>
    </main>
  );
}
