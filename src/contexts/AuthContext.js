// src/contexts/AuthContext.js
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { auth, googleProvider, microsoftProvider } from '../firebase'; // Removed db import
import {
  onAuthStateChanged,
  signInWithRedirect,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile,
} from 'firebase/auth';
import { createUserProfile, getUserProfile } from '../userService';
import Toaster, { durationForType } from '../components/Toaster';

const AuthContext = createContext();
const PAID_TRAINEE_INTENT_KEY = 'tmwd_trainee_paid_intent';

const hasPendingPaidTraineeIntent = (email) => {
  try {
    const intent = JSON.parse(window.sessionStorage.getItem(PAID_TRAINEE_INTENT_KEY) || 'null');
    return Boolean(intent?.reference && intent?.email && intent.email.toLowerCase() === (email || '').toLowerCase());
  } catch (error) {
    return false;
  }
};

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
  // Notifications are a list, so two messages arriving together stack
  // instead of one silently replacing the other. Each toast owns its own
  // timer (see components/Toaster.js), which is why one can no longer be
  // stranded on screen by a lost timer id.
  const [toasts, setToasts] = useState([]);
  const toastSeq = useRef(0);

  const dismissToast = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  // Signature is unchanged so every existing call site keeps working.
  // Passing duration 0 means "stay until the client dismisses it".
  // The fourth argument is for presentation only, e.g. { variant: 'flash' }.
  // Message text is always rendered as text, never as HTML, so a message
  // can never inject markup into the page.
  const showMessage = useCallback((text, type = 'info', duration, options) => {
    if (text == null || text === '') return;
    const safeType = ['success', 'error', 'warning', 'info'].includes(type) ? type : 'info';
    toastSeq.current += 1;
    const id = toastSeq.current;
    const ms = duration === undefined ? durationForType(safeType) : duration;
    setToasts((list) => {
      // Never show the same message twice at once (repeated effects used to
      // re-trigger the same warning and keep it alive indefinitely).
      const duplicate = list.some((t) => t.text === String(text) && t.type === safeType);
      if (duplicate) return list;
      // Keep at most four on screen.
      const next = [...list, {
        id,
        text: String(text),
        type: safeType,
        duration: ms,
        variant: options && options.variant ? options.variant : 'card',
      }];
      return next.slice(-4);
    });
  }, []);

  const clearMessage = useCallback(() => {
    setToasts([]);
  }, []);
  
  const refreshUserProfile = useCallback(async () => {
    if (currentUser) {
      setProfileLoading(true);
      try {
        const profile = await getUserProfile(currentUser.uid);
        setUserProfile(profile);
      } catch (error) {
        console.error('Error refreshing user profile:', error);
        showMessage(`Error refreshing profile: ${error.message}`,'error');
      } finally {
        setProfileLoading(false);
      }
    }
  }, [currentUser, showMessage]);

  // Redirect is more reliable than a popup on the branded auth domain:
  // the popup callback can lose its opener/session state before Firebase
  // completes the OAuth exchange. The normal auth-state listener below loads
  // the profile after the provider redirects back to the app.
  const signInWithGoogle = async () => {
    try {
      await signInWithRedirect(auth, googleProvider);
    } catch (error) {
      console.error('Google sign-in error:', error);
      showMessage(`Google sign-in failed: ${error.message}`,'error');
      throw error;
    }
  };

  const signInWithMicrosoft = async () => {
    try {
      await signInWithRedirect(auth, microsoftProvider);
    } catch (error) {
      console.error('Microsoft sign-in error:', error);
      showMessage(`Microsoft sign-in failed: ${error.message}`,'error');
      throw error;
    }
  };

  const signUpWithEmail = async (email, password, name) => {
    const result = await createUserWithEmailAndPassword(auth, email, password);

    if (name && name.trim()) {
      try {
        await updateProfile(result.user, { displayName: name.trim() });
      } catch (error) {
        // A missing display name is not worth failing a signup over.
        console.error('Could not set display name:', error);
      }
    }

    // Do not send a verification email automatically during signup.
    // The user can request one later through resendVerificationEmail().
    return result;
  };

  const signInWithEmail = async (email, password) =>
    signInWithEmailAndPassword(auth, email, password);

  const sendPasswordReset = async (email) => sendPasswordResetEmail(auth, email);

  const resendVerificationEmail = async () => {
    if (!auth.currentUser) throw new Error('Nobody is signed in.');
    return sendEmailVerification(auth.currentUser);
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setUserProfile(null);
      showMessage('Logged out successfully!','info');
    } catch (error) {
      console.error('Error logging out:', error);
      showMessage(`Error logging out: ${error.message}`,'error');
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        setProfileLoading(true);
        try {
          // During paid trainee completion, never create a normal free profile
          // in the auth callback before the backend can promote the UID.
          if (hasPendingPaidTraineeIntent(user.email)) {
            setUserProfile(null);
          } else {
            await createUserProfile(user.uid, user.email, user.displayName);
            const profile = await getUserProfile(user.uid);
            setUserProfile(profile);
          }
        } catch (error) {
          console.error('Error loading user profile in AuthContext:', error);
          showMessage(`Error loading profile: ${error.message}`,'error');
        } finally {
          setProfileLoading(false);
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, [showMessage]);

  const value = {
    currentUser,
    userProfile,
    loading,
    profileLoading,
    signInWithGoogle,
    signInWithMicrosoft,
    signUpWithEmail,
    signInWithEmail,
    sendPasswordReset,
    resendVerificationEmail,
    logout,
    refreshUserProfile,
    showMessage,
    clearMessage,
    toasts,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismissToast} />
    </AuthContext.Provider>
  );
};

