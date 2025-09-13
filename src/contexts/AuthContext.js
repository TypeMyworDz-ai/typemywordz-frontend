import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { createUserProfile, getUserProfile } from '../userService';

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

  const refreshUserProfile = async () => {
    if (currentUser) {
      setProfileLoading(true);
      try {
        const profile = await getUserProfile(currentUser.uid);
        setUserProfile(profile);
      } catch (error) {
        console.error('Error refreshing user profile:', error);
      } finally {
        setProfileLoading(false);
      }
    }
  };

  const signInWithGoogle = async () => {
    const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    
    // Ensure profile is created and loaded immediately
    setProfileLoading(true);
    try {
      await createUserProfile(result.user.uid, result.user.email, result.user.displayName);
      const profile = await getUserProfile(result.user.uid);
      setUserProfile(profile);
    } catch (error) {
      console.error('Error creating/loading profile after Google sign-in:', error);
    } finally {
      setProfileLoading(false);
    }
    
    return result;
  };

  const signInWithMicrosoft = async () => {
    const { OAuthProvider, signInWithPopup } = await import('firebase/auth');
    const provider = new OAuthProvider('microsoft.com');
    const result = await signInWithPopup(auth, provider);
    
    // Ensure profile is created and loaded immediately
    setProfileLoading(true);
    try {
      await createUserProfile(result.user.uid, result.user.email, result.user.displayName);
      const profile = await getUserProfile(result.user.uid);
      setUserProfile(profile);
    } catch (error) {
      console.error('Error creating/loading profile after Microsoft sign-in:', error);
    } finally {
      setProfileLoading(false);
    }
    
    return result;
  };

  const logout = async () => {
    const { signOut } = await import('firebase/auth');
    await signOut(auth);
    setUserProfile(null);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        setProfileLoading(true);
        try {
          // Ensure profile exists
          await createUserProfile(user.uid, user.email, user.displayName);
          const profile = await getUserProfile(user.uid);
          setUserProfile(profile);
        } catch (error) {
          console.error('Error loading user profile:', error);
        } finally {
          setProfileLoading(false);
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    userProfile,
    loading,
    profileLoading,
    signInWithGoogle,
    signInWithMicrosoft,
    logout,
    refreshUserProfile
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};