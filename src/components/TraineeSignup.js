import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import { deleteUser, signOut } from 'firebase/auth';
import { useAuth } from '../contexts/AuthContext';
import { looksLikeAnEmail, usesPlusAlias, isDisposableEmail, friendlyAuthError, MIN_PASSWORD_LENGTH } from '../utils/emailChecks';

const BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';

const PasswordEye = ({ hidden }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2.2 12s3.5-6 9.8-6 9.8 6 9.8 6-3.5 6-9.8 6-9.8-6-9.8-6Z" />
    <circle cx="12" cy="12" r="2.5" />
    {hidden && <path d="m4 4 16 16" />}
  </svg>
);

export default function TraineeSignup() {
  const navigate = useNavigate();
  const { currentUser, userProfile, signUpWithEmail } = useAuth();
  const [officialName, setOfficialName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (userProfile?.officialIdName) setOfficialName(userProfile.officialIdName);
    else if (userProfile?.name) setOfficialName(userProfile.name);
  }, [userProfile]);

  const removeUnpaidAccount = async (user, deleteAuth = false) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      await fetch(`${BACKEND_URL}/api/trainee/cancel-pending`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ created_for_trainee: deleteAuth }) });
    } catch (cleanupError) {
      console.warn('Pending trainee cleanup could not reach the server:', cleanupError);
    }
    if (deleteAuth) {
      try { await deleteUser(user); } catch (deleteError) { console.warn('Pending trainee auth cleanup:', deleteError); }
      try { await signOut(auth); } catch (signOutError) { console.warn('Pending trainee sign-out:', signOutError); }
    }
    try { window.sessionStorage.removeItem('tmwd_trainee_checkout_started'); } catch (storageError) { /* ignore */ }
  };

  // Returning to this page after abandoning checkout must not leave a usable
  // Firebase account behind. A successful callback changes the profile before
  // this screen is shown, so this only applies to an unpaid pending account.
  useEffect(() => {
    const hasPaymentCallback = new URLSearchParams(window.location.search).has('reference') || window.location.search.includes('kora=') || window.location.search.includes('payment=');
    let started = false;
    try { started = window.sessionStorage.getItem('tmwd_trainee_checkout_started') === '1'; } catch (storageError) { /* ignore */ }
    if (currentUser && userProfile?.trainingPaymentStatus === 'pending' && started && !hasPaymentCallback) {
      removeUnpaidAccount(currentUser, Boolean(userProfile?.traineeAccountPendingDeletion));
    }
  }, [currentUser, userProfile]);

  const registerAndPay = async (provider) => {
    setError('');
    setNotice('');
    if (!officialName.trim() || officialName.trim().length < 2) return setError('Enter your full official name exactly as it appears on your ID.');
    if (!confirmed) return setError('Please confirm that you are using your official ID names.');

    setBusy(true);
    let user = currentUser;
    const createdForTrainee = !currentUser;
    try {
      if (!user) {
        const address = email.trim().toLowerCase();
        if (!looksLikeAnEmail(address)) throw new Error('Please enter a valid email address.');
        if (usesPlusAlias(address)) throw new Error('Please use your plain email address, without a plus alias.');
        if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`Please choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
        if (await isDisposableEmail(address)) throw new Error('Please use a permanent email address. Temporary inboxes are not accepted.');
        const result = await signUpWithEmail(address, password, officialName.trim());
        user = result.user;
      }

      const token = await user.getIdToken();
      const registration = await fetch(`${BACKEND_URL}/api/trainee/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ official_name: officialName.trim(), country_code: 'KE', created_for_trainee: createdForTrainee }),
      });
      const registrationData = await registration.json().catch(() => ({}));
      if (!registration.ok) throw new Error(registrationData.detail || 'We could not save your trainee registration.');

      const endpoint = provider === 'kora' ? '/api/initialize-kora-trainee-payment' : '/api/initialize-paystack-payment';
      const body = provider === 'kora'
        ? { official_name: officialName.trim(), country_code: 'KE', redirect_url: `${window.location.origin}/?kora=success&trainee=1` }
        : {
            email: user.email,
            amount: 0,
            plan_name: 'trainee-training',
            user_id: user.uid,
            country_code: 'KE',
            callback_url: `${window.location.origin}/?payment=success&trainee=1`,
            update_admin_revenue: true,
          };
      const response = await fetch(`${BACKEND_URL}${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.status) throw new Error(data.detail || data.message || 'Checkout could not be started.');
      try { window.sessionStorage.setItem('tmwd_trainee_checkout_started', '1'); } catch (storageError) { /* ignore */ }
      window.location.href = data.authorization_url || data.checkout_url;
    } catch (err) {
      await removeUnpaidAccount(user, createdForTrainee);
      setError(friendlyAuthError(err));
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
        <div className="tm-trainee-price"><strong>$1.50 USD</strong><span>Temporary test price. Paystack shows the final Kenyan charge at checkout.</span></div>
        {error && <p className="tm-auth-error" role="alert">{error}</p>}
        {notice && <p className="tm-auth-notice" role="status">{notice}</p>}
        <label className="tm-auth-label" htmlFor="trainee-official-name">Full official ID name</label>
        <input id="trainee-official-name" className="tm-auth-input" value={officialName} onChange={(e) => setOfficialName(e.target.value)} placeholder="As shown on your official ID" disabled={busy} />
        {!currentUser && <>
          <label className="tm-auth-label" htmlFor="trainee-email">Email</label>
          <input id="trainee-email" className="tm-auth-input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
          <label className="tm-auth-label" htmlFor="trainee-password">Password</label>
          <div className="tm-auth-pwwrap">
            <input id="trainee-password" className="tm-auth-input" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
            <button type="button" className="tm-auth-peek" onClick={() => setShowPassword((value) => !value)} disabled={busy} aria-label={showPassword ? 'Hide password' : 'Show password'} title={showPassword ? 'Hide password' : 'Show password'}>
              <PasswordEye hidden={!showPassword} />
            </button>
          </div>
        </>}
        <label className="tm-trainee-check"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={busy} /> <span>I confirm that these are my official ID names.</span></label>
        <div className="tm-trainee-actions">
          <button type="button" className="tm-auth-submit" onClick={() => registerAndPay('paystack')} disabled={busy}>{busy ? 'Opening secure checkout…' : 'Pay with Paystack'}</button>
          <button type="button" className="tm-trainee-kora" onClick={() => registerAndPay('kora')} disabled={busy}>Use Kora instead</button>
        </div>
        <p className="tm-trainee-promise">This programme is designed to build your transcription skills. Completing the training does not guarantee employment or paid work; any future opportunity is assessed separately.</p>
        {currentUser && <p className="tm-trainee-signed">Signed in as {currentUser.email}</p>}
      </div>
    </main>
  );
}
