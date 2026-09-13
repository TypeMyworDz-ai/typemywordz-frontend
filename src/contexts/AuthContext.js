// src/contexts/AuthContext.js
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { auth, googleProvider, microsoftProvider } from '../firebase'; // Removed db import
import {
  onAuthStateChanged,
  getRedirectResult,
  signInWithPopup,
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

  // Use the native Firebase auth domain with the popup flow. This preserves
  // the previously working sign-in behavior while avoiding the custom-domain
  // callback that fails to restore the browser session.
  const signInWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Google sign-in error:', error);
      showMessage(`Google sign-in failed: ${error.message}`,'error');
      throw error;
    }
  };

  const signInWithMicrosoft = async () => {
    try {
      await signInWithPopup(auth, microsoftProvider);
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

  const loadAuthenticatedUser = useCallback(async (user) => {
    setCurrentUser(user);
    if (!user) {
      setUserProfile(null);
      setProfileLoading(false);
      setLoading(false);
      return;
    }
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
      setLoading(false);
    }
  }, [showMessage]);

  useEffect(() => {
    let active = true;
    getRedirectResult(auth).then((result) => {
      if (active && result?.user) return loadAuthenticatedUser(result.user);
      return null;
    }).catch((error) => {
      // Firebase reports no-auth-event on ordinary page loads. Only surface
      // a real provider/callback failure to the client.
      if (!active || error?.code === 'auth/no-auth-event') return;
      console.error('OAuth redirect result error:', error);
      showMessage(`Sign-in could not be completed: ${error.message}`, 'error');
    });
    return () => { active = false; };
  }, [loadAuthenticatedUser, showMessage]);

  useEffect(() => onAuthStateChanged(auth, loadAuthenticatedUser), [loadAuthenticatedUser]);

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

