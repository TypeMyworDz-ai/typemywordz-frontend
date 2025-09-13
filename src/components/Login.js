import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom'; // Assuming you use react-router-dom

const Login = () => {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signInWithGoogle, signInWithMicrosoft } = useAuth(); // Destructure signInWithMicrosoft

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
    } finally {
      setLoading(false);
    }
  };

  const handleMicrosoftLogin = async () => {
    setLoading(true);
    setError('');
    try {
      await signInWithMicrosoft();
      navigate('/'); // Redirect to home/transcribe page on successful login
    } catch (err) {
      console.error("Microsoft login error:", err);
      setError(err.message || "Failed to sign in with Microsoft.");
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
      <h2 style={{ color: '#6c5ce7', marginBottom: '30px', fontSize: '2rem' }}>Login to TypeMyworDz</h2>
      {error && <p style={{ color: '#dc3545', marginBottom: '20px' }}>{error}</p>}
      
      <button
        onClick={handleGoogleLogin}
        disabled={loading}
        style={{
          width: '100%',
          padding: '12px 20px',
          backgroundColor: '#db4437', // Google red
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '16px',
          fontWeight: 'bold',
          marginBottom: '15px',
          boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
          transition: 'background-color 0.3s ease'
        }}
      >
        Continue with Google
      </button>

      <button
        onClick={handleMicrosoftLogin}
        disabled={loading}
        style={{
          width: '100%',
          padding: '12px 20px',
          backgroundColor: '#0078d4', // Microsoft blue
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '16px',
          fontWeight: 'bold',
          marginBottom: '15px',
          boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
          transition: 'background-color 0.3s ease'
        }}
      >
        Continue with Microsoft
      </button>

      {/* Removed Email and Password fields */}
    </div>
  );
};

export default Login;