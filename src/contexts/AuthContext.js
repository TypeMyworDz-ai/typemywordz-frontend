// src/contexts/AuthContext.js

// Import React tools and Firebase auth functions
import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth } from '../firebase';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { createUserProfile, getUserProfile } from '../userService';

// Create a context (like a shared notebook everyone can read)
const AuthContext = createContext();

// Custom hook to use our auth context easily
export const useAuth = () => {
  return useContext(AuthContext);
};

// Main component that provides authentication to the whole app
export const AuthProvider = ({ children }) => {
  // State to track current user and their profile data
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Function to create new user account
  const signup = async (email, password, name) => { // Added name parameter
    try {
      // Create Firebase auth account
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Create user profile in Firestore with name
      await createUserProfile(user.uid, email, name); // Pass name to createUserProfile
      
      return userCredential;
    } catch (error) {
      console.error('Error in signup:', error);
      throw error;
    }
  };

  // Function to sign in with Google
  const signInWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);
      const user = userCredential.user;
      
      // Check if user profile exists, if not create it
      const existingProfile = await getUserProfile(user.uid);
      if (!existingProfile) {
        await createUserProfile(user.uid, user.email, user.displayName || user.email.split('@')[0]); // Pass Google Display Name
      }
      
      return userCredential;
    } catch (error) {
      console.error('Error in Google sign-in:', error);
      throw error;
    }
  };

  // Function to log in existing user
  const login = (email, password) => {
    return signInWithEmailAndPassword(auth, email, password);
  };

  // Function to log out user
  const logout = () => {
    setUserProfile(null); 
    return signOut(auth);
  };

  // Function to refresh user profile data
  const refreshUserProfile = async () => {
    if (currentUser) {
      try {
        const profile = await getUserProfile(currentUser.uid);
        setUserProfile(profile);
      } catch (error) {
        console.error('Error refreshing user profile:', error);
      }
    }
  };

  // Listen for authentication changes (login/logout)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      
      if (user) {
        try {
          const profile = await getUserProfile(user.uid);
          setUserProfile(profile);
        } catch (error) {
          console.error('Error getting user profile:', error);
          setUserProfile(null);
        }
      } else {
        setUserProfile(null);
      }
      
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // What we're sharing with the rest of the app
  const value = {
    currentUser,
    userProfile,
    signup,
    login,
    logout,
    signInWithGoogle,
    refreshUserProfile,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};