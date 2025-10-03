import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase'; // Import auth for email/password login
import { signInWithEmailAndPassword } from 'firebase/auth'; // Import Firebase Auth function

const Login = () => {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState(''); // State for email for login
  const [password, setPassword] = useState(''); // State for password for login
  const { signInWithGoogle, showMessage } = useAuth(); 

  const navigate = useNavigate();

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      await signInWithGoogle();
      navigate('/'); // Redirect to home/transcribe page on successful login
    } catch (err) {
      console.error("Google login error:", err);
      setError(err.message || "Failed to sign in with Google.");
      showMessage(`❌ Failed to sign in with Google: ${err.message}`); 
    } finally {
      setLoading(false);
    }
  };

  const handleEmailLogin = async () => {
    if (!email || !password) {
      showMessage('Please enter both email and password.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
      showMessage(`✅ Logged in as ${email}!`);
      navigate('/'); // Redirect to home/transcribe page on successful login
    } catch (err) {
      console.error('Error logging in with email:', err);
      let errorMessage = 'Failed to log in.';
      if (err.code === 'auth/invalid-email' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        errorMessage = 'Invalid email or password.';
      } else if (err.code === 'auth/too-many-requests') {
        errorMessage = 'Too many login attempts. Please try again later.';
      }
      setError(`❌ ${errorMessage}`);
      showMessage(`❌ ${errorMessage}`); 
    } finally {
      setLoading(false);
    }
  };


  return (
    <div style={{
      backgroundColor: 'white',
      padding: '40px',
      borderRadius: '15px',
      boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
      textAlign: 'center',
      maxWidth: '400px',
      width: '100%'
    }}>
      <h2 style={{ color: '#6c5ce7', marginBottom: '30px', fontSize: '2rem' }}>TypeMyworDz</h2>
      {error && <p style={{ color: '#dc3545', marginBottom: '20px' }}>{error}</p>}
      
      {/* Google Sign-in */}
      <button
        onClick={handleGoogleLogin}
        disabled={loading}
        style={{
          width: '100%',
          padding: '15px 20px', 
          backgroundColor: '#ffffff',
          color: '#3c4043',
          border: '1px solid #dadce0',
          borderRadius: '8px',
          cursor: loading ? 'not-allowed' : 'pointer',
          fontSize: '18px', 
          fontWeight: '500',
          boxShadow: '0 1px 2px 0 rgba(60,64,67,0.30), 0 1px 3px 1px rgba(60,64,67,0.15)',
          transition: 'box-shadow 0.3s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          opacity: loading ? 0.7 : 1
        }}
        onMouseEnter={(e) => {
          if (!loading) {
            e.target.style.boxShadow = '0 1px 3px 0 rgba(60,64,67,0.30), 0 4px 8px 3px rgba(60,64,67,0.15)';
          }
        }}
        onMouseLeave={(e) => {
          if (!loading) {
            e.target.style.boxShadow = '0 1px 2px 0 rgba(60,64,67,0.30), 0 1px 3px 1px rgba(60,64,67,0.15)';
          }
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        {loading ? 'Signing in...' : 'Continue with Google'}
      </button>

      <div style={{ margin: '20px 0', color: '#6b7280', position: 'relative' }}>
        <hr style={{ borderTop: '1px solid #e5e7eb', position: 'absolute', width: '100%', top: '50%', zIndex: 0 }} />
        <span style={{ backgroundColor: 'white', padding: '0 10px', position: 'relative', zIndex: 1 }}>OR</span>
      </div>

      {/* NEW: Email/Password Login Form */}
      <div style={{ marginBottom: '20px' }}>
        <input
          type="email"
          placeholder="Email Address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            width: '100%',
            padding: '12px 15px',
            marginBottom: '15px',
            border: '1px solid #d1d5db',
            borderRadius: '10px',
            fontSize: '1rem',
            boxSizing: 'border-box'
          }}
          disabled={loading}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{
            width: '100%',
            padding: '12px 15px',
            marginBottom: '20px',
            border: '1px solid #d1d5db',
            borderRadius: '10px',
            fontSize: '1rem',
            boxSizing: 'border-box'
          }}
          disabled={loading}
        />
        <button 
          onClick={handleEmailLogin} 
          disabled={loading}
          style={{
            backgroundColor: '#007bff', 
            color: 'white',
            padding: '12px 25px',
            borderRadius: '10px',
            border: 'none',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: 'bold',
            width: '100%',
            boxShadow: '0 4px 15px rgba(0, 123, 255, 0.4)',
            transition: 'all 0.3s ease'
          }}
          onMouseEnter={(e) => e.target.style.backgroundColor = '#0069d9'}
          onMouseLeave={(e) => e.target.style.backgroundColor = '#007bff'}
        >
          {loading ? 'Logging In...' : 'Log In with Email'}
        </button>
      </div>

      {/* Link to Signup page - ADDING DIAGNOSTIC LOG HERE */}
      <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '20px 0 0 0' }}>
        Don't have an account? {' '}
        <button
          onClick={() => {
            console.log("DEBUG: 'Sign Up' button clicked. Attempting navigation to /signup."); // NEW DIAGNOSTIC LOG
            navigate('/signup'); 
          }}
          style={{
            background: 'none',
            border: 'none',
            color: '#007bff', 
            textDecoration: 'underline',
            cursor: 'pointer',
            fontSize: '0.875rem', 
            fontWeight: 'bold',
            padding: 0
          }}
        >
          Sign Up
        </button>
      </p>
    </div>
  );
};

export default Login;
