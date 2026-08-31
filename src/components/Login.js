import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  looksLikeAnEmail,
  usesPlusAlias,
  isDisposableEmail,
  friendlyAuthError,
  MIN_PASSWORD_LENGTH,
} from '../utils/emailChecks';

const GoogleMark = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);

const MicrosoftMark = () => (
  <svg width="18" height="18" viewBox="0 0 23 23" aria-hidden="true">
    <path fill="#F25022" d="M1 1h10v10H1z" />
    <path fill="#7FBA00" d="M12 1h10v10H12z" />
    <path fill="#00A4EF" d="M1 12h10v10H1z" />
    <path fill="#FFB900" d="M12 12h10v10H12z" />
  </svg>
);

const Login = () => {
  // 'signin' | 'signup' | 'reset'
  const [mode, setMode] = useState('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [busy, setBusy] = useState('');       // which action is running
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');   // a calm, non-error confirmation

  const { signInWithGoogle, signInWithMicrosoft, signInWithEmail, signUpWithEmail, sendPasswordReset } = useAuth();
  const navigate = useNavigate();

  const switchTo = (next) => {
    setMode(next);
    setError('');
    setNotice('');
    setPassword('');
  };

  const handleGoogle = async () => {
    setBusy('google');
    setError('');
    setNotice('');
    try {
      await signInWithGoogle();
      navigate('/');
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy('');
    }
  };

  const handleMicrosoft = async () => {
    setBusy('microsoft');
    setError('');
    setNotice('');
    try {
      await signInWithMicrosoft();
      navigate('/');
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy('');
    }
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');

    if (!looksLikeAnEmail(email)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setBusy('email');
    try {
      await signInWithEmail(email.trim(), password);
      navigate('/');
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy('');
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');

    const address = email.trim().toLowerCase();

    if (!looksLikeAnEmail(address)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (usesPlusAlias(address)) {
      setError('Please sign up with your plain email address, without a "+" tag.');
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Please choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    setBusy('email');
    try {
      if (await isDisposableEmail(address)) {
        setError('Please use a permanent email address. Temporary inboxes are not accepted.');
        setBusy('');
        return;
      }

      await signUpWithEmail(address, password, name);
      navigate('/');
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy('');
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');

    if (!looksLikeAnEmail(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    setBusy('reset');
    try {
      await sendPasswordReset(email.trim());
    } catch (err) {
      // Anything other than a genuine outage is swallowed on purpose: telling
      // somebody "no account with that email" would let a stranger use this form
      // to find out who has an account here.
      if (err && err.code === 'auth/network-request-failed') {
        setError(friendlyAuthError(err));
        setBusy('');
        return;
      }
    }
    setNotice('If there is an account with that email, a reset link is on its way.');
    setBusy('');
  };

  const working = busy !== '';

  const title = mode === 'signup' ? 'Create your account'
    : mode === 'reset' ? 'Reset your password'
      : 'Sign in';

  const blurb = mode === 'signup' ? 'Five minutes of transcription free, no card needed.'
    : mode === 'reset' ? 'We will email you a link to set a new password.'
      : 'Welcome back.';

  return (
    <div className="tm-auth">
      <h2 className="tm-auth-title">{title}</h2>
      <p className="tm-auth-blurb">{blurb}</p>

      {error && <p className="tm-auth-error" role="alert">{error}</p>}
      {notice && <p className="tm-auth-notice" role="status">{notice}</p>}

      {mode === 'reset' ? (
        <form onSubmit={handleReset}>
          <label className="tm-auth-label" htmlFor="tm-reset-email">Email</label>
          <input
            id="tm-reset-email"
            className="tm-auth-input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            disabled={working}
          />
          <button type="submit" className="tm-auth-submit" disabled={working}>
            {busy === 'reset' ? 'Sending...' : 'Send the reset link'}
          </button>
          <button type="button" className="tm-auth-link" onClick={() => switchTo('signin')}>
            Back to sign in
          </button>
        </form>
      ) : (
        <>
          <button
            type="button"
            className="tm-auth-oauth tm-auth-google"
            onClick={handleGoogle}
            disabled={working}
          >
            <GoogleMark />
            {busy === 'google' ? 'Signing in...' : 'Continue with Google'}
          </button>

          <button
            type="button"
            className="tm-auth-oauth tm-auth-microsoft"
            onClick={handleMicrosoft}
            disabled={working}
          >
            <MicrosoftMark />
            {busy === 'microsoft' ? 'Signing in...' : 'Continue with Microsoft'}
          </button>

          <div className="tm-auth-or"><span>or</span></div>

          <form onSubmit={mode === 'signup' ? handleSignUp : handleSignIn}>
            {mode === 'signup' && (
              <>
                <label className="tm-auth-label" htmlFor="tm-auth-name">Your name</label>
                <input
                  id="tm-auth-name"
                  className="tm-auth-input"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(ev) => setName(ev.target.value)}
                  disabled={working}
                />
              </>
            )}

            <label className="tm-auth-label" htmlFor="tm-auth-email">Email</label>
            <input
              id="tm-auth-email"
              className="tm-auth-input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              disabled={working}
            />

            <label className="tm-auth-label" htmlFor="tm-auth-password">Password</label>
            <div className="tm-auth-pwwrap">
              <input
                id="tm-auth-password"
                className="tm-auth-input"
                type={showPassword ? 'text' : 'password'}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(ev) => setPassword(ev.target.value)}
                disabled={working}
              />
              <button
                type="button"
                className="tm-auth-peek"
                onClick={() => setShowPassword((v) => !v)}
                disabled={working}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {mode === 'signup' && (
              <p className="tm-auth-hint">At least {MIN_PASSWORD_LENGTH} characters.</p>
            )}

            <button type="submit" className="tm-auth-submit" disabled={working}>
              {busy === 'email'
                ? (mode === 'signup' ? 'Creating your account...' : 'Signing in...')
                : (mode === 'signup' ? 'Create account' : 'Sign in')}
            </button>
          </form>

          {mode === 'signin' && (
            <button type="button" className="tm-auth-link" onClick={() => switchTo('reset')}>
              Forgotten your password?
            </button>
          )}

          <p className="tm-auth-swap">
            {mode === 'signup' ? 'Already have an account?' : 'New to TypeMyworDz?'}
            <button
              type="button"
              className="tm-auth-swapbtn"
              onClick={() => switchTo(mode === 'signup' ? 'signin' : 'signup')}
            >
              {mode === 'signup' ? 'Sign in' : 'Create one'}
            </button>
          </p>
        </>
      )}
    </div>
  );
};

export default Login;
