// src/contexts/AuthContext.js
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'; // Added useCallback
import { auth, googleProvider, microsoftProvider, db } from '../firebase'; // Added db
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { createUserProfile, getUserProfile } from '../userService';
// REMOVED: import ToastNotification from '../components/ToastNotification'; // ToastNotification is now defined here

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [message, setMessage] = useState(null); // Changed to null for object messages
  const [messageType, setMessageType] = useState('info'); // 'info', 'success', 'error', 'warning'

  // UPDATED: showMessage to include automatic dismissal and message types
  const showMessage = useCallback((text, type = 'info', duration = 3000) => {
    setMessage({ text, type });
    setMessageType(type);
    if (duration > 0) {
      // Clear any existing timeout to prevent multiple messages from stacking up and dismissing incorrectly
      const currentTimeoutId = window.highlightMessageTimeout;
      if (currentTimeoutId) {
        clearTimeout(currentTimeoutId);
      }
      window.highlightMessageTimeout = setTimeout(() => {
        setMessage(null);
        window.highlightMessageTimeout = null; // Clear the stored timeout ID
      }, duration);
    }
  }, []);

  const clearMessage = useCallback(() => {
    setMessage(null);
    if (window.highlightMessageTimeout) {
      clearTimeout(window.highlightMessageTimeout);
      window.highlightMessageTimeout = null;
    }
  }, []);
  
  // This function is key. It refetches the user profile.
  const refreshUserProfile = useCallback(async () => { // Added useCallback
    if (currentUser) {
      setProfileLoading(true);
      try {
        const profile = await getUserProfile(currentUser.uid);
        setUserProfile(profile);
      } catch (error) {
        console.error('Error refreshing user profile:', error);
        showMessage(`❌ Error refreshing profile: ${error.message}`, 'error'); // Updated message type
      } finally {
        setProfileLoading(false);
      }
    }
  }, [currentUser, showMessage]); // Added dependencies

  const signInWithGoogle = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider); 
      
      setProfileLoading(true);
      try {
        await createUserProfile(result.user.uid, result.user.email, result.user.displayName);
        const profile = await getUserProfile(result.user.uid);
        setUserProfile(profile);
        showMessage(`✅ Signed in as ${result.user.email}`, 'success'); // Updated message type
      } catch (error) {
        console.error('Error creating/loading profile after Google sign-in:', error);
        showMessage(`❌ Error with profile after Google sign-in: ${error.message}`, 'error'); // Updated message type
      } finally {
        setProfileLoading(false);
      }
      
      return result;
    } catch (error) {
      console.error('Google sign-in error:', error);
      showMessage(`❌ Google sign-in failed: ${error.message}`, 'error'); // Updated message type
      throw error;
    }
  };

  // NEW: signInWithMicrosoft function
  const signInWithMicrosoft = async () => {
    try {
      const result = await signInWithPopup(auth, microsoftProvider); 
      
      setProfileLoading(true);
      try {
        await createUserProfile(result.user.uid, result.user.email, result.user.displayName);
        const profile = await getUserProfile(result.user.uid);
        setUserProfile(profile);
        showMessage(`✅ Signed in as ${result.user.email}`, 'success'); // Updated message type
      } catch (error) {
        console.error('Error creating/loading profile after Microsoft sign-in:', error);
        showMessage(`❌ Error with profile after Microsoft sign-in: ${error.message}`, 'error'); // Updated message type
      } finally {
        setProfileLoading(false);
      }
      
      return result;
    } catch (error) {
      console.error('Microsoft sign-in error:', error);
      showMessage(`❌ Microsoft sign-in failed: ${error.message}`, 'error'); // Updated message type
      throw error;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setUserProfile(null);
      showMessage('👋 Logged out successfully!', 'info'); // Updated message type
    } catch (error) {
      console.error('Error logging out:', error);
      showMessage(`❌ Error logging out: ${error.message}`, 'error'); // Updated message type
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        setProfileLoading(true);
        try {
          await createUserProfile(user.uid, user.email, user.displayName);
          const profile = await getUserProfile(user.uid);
          setUserProfile(profile);
        } catch (error) {
          console.error('Error loading user profile in AuthContext:', error);
          showMessage(`❌ Error loading profile: ${error.message}`, 'error'); // Updated message type
        } finally {
          setProfileLoading(false);
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, [showMessage]); // Added showMessage to dependencies

  const value = {
    currentUser,
    userProfile,
    loading,
    profileLoading,
    signInWithGoogle,
    signInWithMicrosoft, // Provide signInWithMicrosoft
    logout,
    refreshUserProfile,
    showMessage, // Provide showMessage
    clearMessage, // Provide clearMessage
    message,
    messageType,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      {message && <ToastNotification message={message} type={messageType} clearMessage={clearMessage} />}
    </AuthContext.Provider>
  );
};

// ToastNotification component (placed here as it's tightly coupled with AuthContext's message state)
const ToastNotification = ({ message, type, clearMessage }) => {
  if (!message) return null;

  let backgroundColor = '#333';
  let textColor = 'white';

  switch (type) {
    case 'success':
      backgroundColor = '#4CAF50';
      break;
    case 'error':
      backgroundColor = '#f44336';
      break;
    case 'warning':
      backgroundColor = '#ff9800';
      break;
    case 'info':
    default:
      backgroundColor = '#2196F3';
      break;
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: backgroundColor,
        color: textColor,
        padding: '12px 20px',
        borderRadius: '8px',
        boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        cursor: 'pointer',
      }}
      onClick={clearMessage}
    >
      <span dangerouslySetInnerHTML={{ __html: message.text }} />
      <button
        onClick={clearMessage}
        style={{
          background: 'none',
          border: 'none',
          color: 'white',
          fontSize: '1.2em',
          cursor: 'pointer',
        }}
      >
        &times;
      </button>
    </div>
  );
};
