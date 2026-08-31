// src/contexts/AuthContext.js
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { auth, googleProvider, microsoftProvider } from '../firebase'; // Removed db import
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { createUserProfile, getUserProfile } from '../userService';
import Toaster, { durationForType } from '../components/Toaster';

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
  // The fourth argument is for presentation only, e.g. { icon: 'brand' }.
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
        icon: options && options.icon ? options.icon : null,
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

  const signInWithGoogle = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider); 
      
      setProfileLoading(true);
      try {
        await createUserProfile(result.user.uid, result.user.email, result.user.displayName);
        const profile = await getUserProfile(result.user.uid);
        setUserProfile(profile);
        showMessage(`Signed in as ${result.user.email}`,'success');
      } catch (error) {
        console.error('Error creating/loading profile after Google sign-in:', error);
        showMessage(`Error with profile after Google sign-in: ${error.message}`,'error');
      } finally {
        setProfileLoading(false);
      }
      
      return result;
    } catch (error) {
      console.error('Google sign-in error:', error);
      showMessage(`Google sign-in failed: ${error.message}`,'error');
      throw error;
    }
  };

  const signInWithMicrosoft = async () => {
    try {
      const result = await signInWithPopup(auth, microsoftProvider); 
      
      setProfileLoading(true);
      try {
        await createUserProfile(result.user.uid, result.user.email, result.user.displayName);
        const profile = await getUserProfile(result.user.uid);
        setUserProfile(profile);
        showMessage(`Signed in as ${result.user.email}`,'success');
      } catch (error) {
        console.error('Error creating/loading profile after Microsoft sign-in:', error);
        showMessage(`Error with profile after Microsoft sign-in: ${error.message}`,'error');
      } finally {
        setProfileLoading(false);
      }
      
      return result;
    } catch (error) {
      console.error('Microsoft sign-in error:', error);
      showMessage(`Microsoft sign-in failed: ${error.message}`,'error');
      throw error;
    }
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
          await createUserProfile(user.uid, user.email, user.displayName);
          const profile = await getUserProfile(user.uid);
          setUserProfile(profile);
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

