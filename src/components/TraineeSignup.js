import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { looksLikeAnEmail, usesPlusAlias, isDisposableEmail, friendlyAuthError, MIN_PASSWORD_LENGTH } from '../utils/emailChecks';

const BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';

export default function TraineeSignup() {
  const navigate = useNavigate();
  const { currentUser, userProfile, signUpWithEmail } = useAuth();
  const [officialName, setOfficialName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (userProfile?.officialIdName) setOfficialName(userProfile.officialIdName);
    else if (userProfile?.name) setOfficialName(userProfile.name);
  }, [userProfile]);

  const registerAndPay = async (provider) => {
    setError('');
    setNotice('');
    if (!officialName.trim() || officialName.trim().length < 2) return setError('Enter your full official name exactly as it appears on your ID.');
    if (!confirmed) return setError('Please confirm that you are using your official ID names.');

    setBusy(true);
    try {
      let user = currentUser;
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
        body: JSON.stringify({ official_name: officialName.trim(), country_code: 'KE' }),
      });
      const registrationData = await registration.json().catch(() => ({}));
      if (!registration.ok) throw new Error(registrationData.detail || 'We could not save your trainee registration.');

      const endpoint = provider === 'kora' ? '/api/initialize-kora-trainee-payment' : '/api/initialize-paystack-payment';
      const body = provider === 'kora'
        ? { official_name: officialName.trim(), country_code: 'KE', redirect_url: `${window.location.origin}/?kora=success` }
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
      window.location.href = data.authorization_url || data.checkout_url;
    } catch (err) {
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
        <h1>Train for paid proofreading work</h1>
        <p className="tm-trainee-lede">Enrollment is currently open to Kenyan applicants only. Use your official ID names so we can keep your training and work records accurate.</p>
        <div className="tm-trainee-price"><strong>$30 USD</strong><span>Paystack shows the final Kenyan charge at checkout.</span></div>
        {error && <p className="tm-auth-error" role="alert">{error}</p>}
        {notice && <p className="tm-auth-notice" role="status">{notice}</p>}
        <label className="tm-auth-label" htmlFor="trainee-official-name">Full official ID name</label>
        <input id="trainee-official-name" className="tm-auth-input" value={officialName} onChange={(e) => setOfficialName(e.target.value)} placeholder="As shown on your official ID" disabled={busy} />
        {!currentUser && <>
          <label className="tm-auth-label" htmlFor="trainee-email">Email</label>
          <input id="trainee-email" className="tm-auth-input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
          <label className="tm-auth-label" htmlFor="trainee-password">Password</label>
          <input id="trainee-password" className="tm-auth-input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
        </>}
        <label className="tm-trainee-check"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={busy} /> <span>I confirm that these are my official ID names.</span></label>
        <div className="tm-trainee-actions">
          <button type="button" className="tm-auth-submit" onClick={() => registerAndPay('paystack')} disabled={busy}>{busy ? 'Opening secure checkout…' : 'Pay with Paystack'}</button>
          <button type="button" className="tm-trainee-kora" onClick={() => registerAndPay('kora')} disabled={busy}>Use Kora instead</button>
        </div>
        <p className="tm-trainee-promise">Complete all training modules and practicals successfully, and you may be considered for paid TypeMyworDz proofreading work. Becoming a worker is selective, not automatic.</p>
        {currentUser && <p className="tm-trainee-signed">Signed in as {currentUser.email}</p>}
      </div>
    </main>
  );
}
