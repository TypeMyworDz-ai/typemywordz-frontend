import React, { useContext, useState, useEffect, createContext, useCallback } from 'react';
import { auth, db, googleProvider, microsoftProvider } from '../firebase'; // Import microsoftProvider
import { signInWithPopup, signOut } from 'firebase/auth';
import { doc, onSnapshot, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { createUserProfile } from '../userService';

const AuthContext = createContext();

export const useAuth = () => {
  return useContext(AuthContext);
};

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Sign in with Google
  const signInWithGoogle = useCallback(async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      await createUserProfile(result.user.uid, result.user.email, result.user.displayName);
      return result.user;
    } catch (error) {
      console.error("Error in Google sign-in:", error);
      throw error;
    }
  }, []);

  // Sign in with Microsoft
  const signInWithMicrosoft = useCallback(async () => {
    try {
      const result = await signInWithPopup(auth, microsoftProvider);
      await createUserProfile(result.user.uid, result.user.email, result.user.displayName);
      return result.user;
    } catch (error) {
      console.error("Error in Microsoft sign-in:", error);
      throw error;
    }
  }, []);

  // Log out
  const logout = useCallback(() => {
    return signOut(auth);
  }, []);

  // Refresh User Profile
  const refreshUserProfile = useCallback(async () => {
    if (currentUser) {
      const userDocRef = doc(db, 'users', currentUser.uid);
      const docSnap = await getDoc(userDocRef);
      if (docSnap.exists()) {
        setUserProfile(docSnap.data());
      } else {
        // If profile doesn't exist, create it (e.g., for new sign-ups)
        await createUserProfile(currentUser.uid, currentUser.email, currentUser.displayName);
        const newDocSnap = await getDoc(userDocRef);
        if (newDocSnap.exists()) {
          setUserProfile(newDocSnap.data());
        }
      }
    } else {
      setUserProfile(null);
    }
  }, [currentUser]);

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      setCurrentUser(user);
      setLoading(false);
      if (user) {
        // Fetch or create user profile in Firestore
        await refreshUserProfile();
      } else {
        setUserProfile(null);
      }
    });

    return unsubscribeAuth;
  }, [refreshUserProfile]);

  const value = {
    currentUser,
    userProfile,
    loading,
    signInWithGoogle,
    signInWithMicrosoft, // Added to context
    logout,
    refreshUserProfile,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};