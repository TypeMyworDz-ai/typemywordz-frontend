// src/components/Signup.js

import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const Signup = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const { signup, signInWithGoogle } = useAuth();

  // NEW: Allowed email domains for signup
  const ALLOWED_DOMAINS = ['gmail.com', 'outlook.com', 'hotmail.com', 'live.com']; // Add/remove as needed

  const validateEmailDomain = (userEmail) => {
    const domain = userEmail.split('@')[1];
    return ALLOWED_DOMAINS.includes(domain);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!name || !email || !password || !confirmPassword) {
      setError('Please fill in all fields');
      return;
    }

    if (!validateEmailDomain(email)) { // NEW: Validate email domain
      setError(`Only emails from allowed domains (${ALLOWED_DOMAINS.join(', ')}) are accepted.`);
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    try {
      setError('');
      setLoading(true);
      await signup(email, password, name);
    } catch (error) {
      setError('Failed to create account: ' + error.message);
    }
    
    setLoading(false);
  };

  const handleGoogleSignIn = async () => {
    try {
      setError('');
      setGoogleLoading(true);
      const userCredential = await signInWithGoogle();
      const userEmail = userCredential.user.email;

      if (!validateEmailDomain(userEmail)) { // NEW: Validate Google email domain
        // If Google email is not allowed, sign out immediately
        await userCredential.user.delete(); // Delete the Firebase Auth user if not allowed
        setError(`Google Sign-In failed: Only emails from allowed domains (${ALLOWED_DOMAINS.join(', ')}) are accepted.`);
        setGoogleLoading(false);
        return;
      }
      // If allowed, the rest of the sign-in/profile creation continues as normal in AuthContext
    } catch (error) {
      if (error.code === 'auth/popup-closed-by-user') {
        setError('Sign-in was cancelled. Please try again.');
      } else {
        setError('Failed to sign in with Google: ' + error.message);
      }
    }
    
    setGoogleLoading(false);
  };

  return (
    <div style={{ 
      maxWidth: '400px', 
      margin: '50px auto', 
      padding: '30px', 
      border: '1px solid #ddd', 
      borderRadius: '10px',
      backgroundColor: '#f8f9fa'
    }}>
      <h2 style={{ textAlign: 'center', marginBottom: '30px' }}>Sign Up for TypeMyworDz</h2>
      
      {error && (
        <div style={{ 
          color: 'red', 
          marginBottom: '20px', 
          textAlign: 'center',
          padding: '10px',
          backgroundColor: '#ffe6e6',
          borderRadius: '5px'
        }}>
          {error}
        </div>
      )}

      {/* Beautiful Google Sign-In Button */}
      <button
        onClick={handleGoogleSignIn}
        disabled={googleLoading || loading}
        style={{
          width: '100%',
          padding: '12px',
          backgroundColor: 'white',
          color: '#757575',
          border: '1px solid #dadce0',
          borderRadius: '8px',
          fontSize: '16px',
          cursor: 'pointer',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          transition: 'all 0.2s ease',
          fontWeight: '500'
        }}
        onMouseOver={(e) => {
          e.target.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
          e.target.style.backgroundColor = '#f8f9fa';
        }}
        onMouseOut={(e) => {
          e.target.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
          e.target.style.backgroundColor = 'white';
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        {googleLoading ? 'Signing in...' : 'Continue with Google'}
      </button>

      <div style={{ 
        textAlign: 'center', 
        margin: '20px 0', 
        color: '#666',
        position: 'relative'
      }}>
        <span style={{ 
          backgroundColor: '#f8f9fa', 
          padding: '0 15px',
          position: 'relative',
          zIndex: 1
        }}>
          or
        </span>
        <div style={{
          position: 'absolute',
          top: '50%',
          left: 0,
          right: 0,
          height: '1px',
          backgroundColor: '#dadce0',
          zIndex: 0
        }}></div>
      </div>
      
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>Name:</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: '5px',
              border: '1px solid #ccc',
              fontSize: '16px'
            }}
            placeholder="Enter your name"
          />
        </div>
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>Email:</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: '5px',
              border: '1px solid #ccc',
              fontSize: '16px'
            }}
            placeholder="Enter your email"
          />
        </div>
        
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>Password:</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: '5px',
              border: '1px solid #ccc',
              fontSize: '16px'
            }}
            placeholder="Enter your password (min 6 characters)"
          />
        </div>
        
        <div style={{ marginBottom: '30px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>Confirm Password:</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: '5px',
              border: '1px solid #ccc',
              fontSize: '16px'
            }}
            placeholder="Confirm your password"
          />
        </div>
        
        <button
          type="submit"
          disabled={loading || googleLoading}
          style={{
            width: '100%',
            padding: '12px',
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            fontSize: '16px',
            cursor: 'pointer'
          }}
        >
          {loading ? 'Creating Account...' : 'Create Account'}
        </button>
      </form>
    </div>
  );
};

export default Signup;