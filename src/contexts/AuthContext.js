import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, googleProvider, microsoftProvider } from '../firebase'; // Import providers
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'; // Import signInWithPopup and signOut
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
  const [message, setMessage] = useState(''); // NEW: State for global messages

  // NEW: Function to display messages globally
  const showMessage = (msg) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 5000); // Clear message after 5 seconds
  };
  
  // This function is key. It refetches the user profile.
  const refreshUserProfile = async () => {
    if (currentUser) {
      setProfileLoading(true);
      try {
        const profile = await getUserProfile(currentUser.uid);
        setUserProfile(profile);
      } catch (error) {
        console.error('Error refreshing user profile:', error);
        showMessage(`❌ Error refreshing profile: ${error.message}`); // Use showMessage
      } finally {
        setProfileLoading(false);
      }
    }
  };

  const signInWithGoogle = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider); // Use imported googleProvider
      
      setProfileLoading(true);
      try {
        await createUserProfile(result.user.uid, result.user.email, result.user.displayName);
        const profile = await getUserProfile(result.user.uid);
        setUserProfile(profile);
        showMessage(`✅ Signed in as ${result.user.email}`); // Use showMessage
      } catch (error) {
        console.error('Error creating/loading profile after Google sign-in:', error);
        showMessage(`❌ Error with profile after Google sign-in: ${error.message}`); // Use showMessage
      } finally {
        setProfileLoading(false);
      }
      
      return result;
    } catch (error) {
      console.error('Google sign-in error:', error);
      showMessage(`❌ Google sign-in failed: ${error.message}`); // Use showMessage
      throw error; // Re-throw to be caught by Login/Signup
    }
  };

  // NEW: signInWithMicrosoft function
  const signInWithMicrosoft = async () => {
    try {
      const result = await signInWithPopup(auth, microsoftProvider); // Use imported microsoftProvider
      
      setProfileLoading(true);
      try {
        await createUserProfile(result.user.uid, result.user.email, result.user.displayName);
        const profile = await getUserProfile(result.user.uid);
        setUserProfile(profile);
        showMessage(`✅ Signed in as ${result.user.email}`); // Use showMessage
      } catch (error) {
        console.error('Error creating/loading profile after Microsoft sign-in:', error);
        showMessage(`❌ Error with profile after Microsoft sign-in: ${error.message}`); // Use showMessage
      } finally {
        setProfileLoading(false);
      }
      
      return result;
    } catch (error) {
      console.error('Microsoft sign-in error:', error);
      showMessage(`❌ Microsoft sign-in failed: ${error.message}`); // Use showMessage
      throw error; // Re-throw to be caught by Login/Signup
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setUserProfile(null);
      showMessage('👋 Logged out successfully!'); // Use showMessage
    } catch (error) {
      console.error('Error logging out:', error);
      showMessage(`❌ Error logging out: ${error.message}`); // Use showMessage
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
          showMessage(`❌ Error loading profile: ${error.message}`); // Use showMessage
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
    signInWithMicrosoft, // NEW: Provide signInWithMicrosoft
    logout,
    refreshUserProfile,
    showMessage // NEW: Provide showMessage
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      {message && <ToastNotification message={message} onClose={() => setMessage('')} />} {/* NEW: Render ToastNotification here */}
    </AuthContext.Provider>
  );
};
