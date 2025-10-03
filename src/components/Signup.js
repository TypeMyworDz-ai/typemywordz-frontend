import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom'; 
import { auth } from '../firebase'; 
import { createUserWithEmailAndPassword } from 'firebase/auth'; 

const Signup = () => {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // FIX: Destructure showMessage from useAuth()
  const { signInWithGoogle, signInWithMicrosoft, showMessage } = useAuth(); 

  const navigate = useNavigate();

  const handleGoogleSignup = async () => {
    setLoading(true);
    setError('');
    try {
      await signInWithGoogle();
      navigate('/'); 
    } catch (err) {
      console.error("Google signup error:", err);
      setError(err.message || "Failed to sign up with Google.");
      showMessage(`❌ Failed to sign up with Google: ${err.message}`); // FIX: Use showMessage
    } finally {
      setLoading(false);
    }
  };

  const handleMicrosoftSignup = async () => {
    setLoading(true);
    setError('');
    try {
      await signInWithMicrosoft();
      navigate('/'); 
    } catch (err) {
      console.error("Microsoft signup error:", err);
      setError(err.message || "Failed to sign up with Microsoft.");
      showMessage(`❌ Failed to sign up with Microsoft: ${err.message}`); // FIX: Use showMessage
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSignUp = async () => {
    if (!email || !password) {
      showMessage('Please enter both email and password.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      showMessage(`✅ Account created for ${user.email}! Please log in.`);
      
      setEmail('');
      setPassword('');

    } catch (err) {
      console.error('Error signing up with email:', err);
      let errorMessage = 'Failed to create account.';
      if (err.code === 'auth/email-already-in-use') {
        errorMessage = 'Email already in use. Please try logging in or use a different email.';
      } else if (err.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address.';
      } else if (err.code === 'auth/weak-password') {
        errorMessage = 'Password should be at least 6 characters.';
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
      <h2 style={{ color: '#6c5ce7', marginBottom: '30px', fontSize: '2rem' }}>Sign Up for TypeMyworDz</h2>
      {error && <p style={{ color: '#dc3545', marginBottom: '20px' }}>{error}</p>}
      
      {/* Google Sign-up */}
      <button
        onClick={handleGoogleSignup}
        disabled={loading}
        style={{
          width: '100%',
          padding: '12px 20px',
          backgroundColor: '#db4437', 
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
        Sign up with Google
      </button>

      {/* Microsoft Sign-up */}
      <button
        onClick={handleMicrosoftSignup}
        disabled={loading}
        style={{
          width: '100%',
          padding: '12px 20px',
          backgroundColor: '#0078d4', 
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
        Sign up with Microsoft
      </button>

      <div style={{ margin: '20px 0', color: '#6b7280', position: 'relative' }}>
        <hr style={{ borderTop: '1px solid #e5e7eb', position: 'absolute', width: '100%', top: '50%', zIndex: 0 }} />
        <span style={{ backgroundColor: 'white', padding: '0 10px', position: 'relative', zIndex: 1 }}>OR</span>
      </div>

      {/* NEW: Email and Password fields for Signup */}
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
          placeholder="Password (min 6 characters)"
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
          onClick={handleEmailSignUp} 
          disabled={loading}
          style={{
            backgroundColor: '#28a745', 
            color: 'white',
            padding: '12px 25px',
            borderRadius: '10px',
            border: 'none',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: 'bold',
            width: '100%',
            boxShadow: '0 4px 15px rgba(40, 167, 69, 0.4)',
            transition: 'all 0.3s ease'
          }}
          onMouseEnter={(e) => e.target.style.backgroundColor = '#218838'}
          onMouseLeave={(e) => e.target.style.backgroundColor = '#28a745'}
        >
          {loading ? 'Creating Account...' : 'Sign Up with Email'}
        </button>
      </div>

      {/* NEW: Link to Login page */}
      <p style={{ marginTop: '20px', color: '#6b7280', fontSize: '1rem' }}>
        Already have an account? {' '}
        <button
          onClick={() => navigate('/login')} // Navigate to the login route
          style={{
            background: 'none',
            border: 'none',
            color: '#007bff', // Blue link color
            textDecoration: 'underline',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: 'bold',
            padding: 0
          }}
        >
          Log In
        </button>
      </p>

    </div>
  );
};

export default Signup;
