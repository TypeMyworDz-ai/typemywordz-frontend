// src/userService.js

import { db } from './firebase';
import { 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs,
  serverTimestamp 
} from 'firebase/firestore';

// Admin emails with unlimited access
const ADMIN_EMAILS = [
  'typemywordz@gmail.com',
  'gracenyaitara@gmail.com'
];

// Get current billing cycle (YYYY-MM format)
const getCurrentBillingCycle = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

// Plan limits and features
export const PLAN_LIMITS = {
  free: { 
    monthlyMinutes: 30, 
    features: ['basic_transcription'],
    price: 0,
    name: 'Free Plan'
  },
  starter: { 
    monthlyMinutes: 300, 
    features: ['basic_transcription', 'download_formats'],
    price: 9.99,
    name: 'Starter Plan'
  },
  pro: { 
    monthlyMinutes: 1200, 
    features: ['basic_transcription', 'download_formats', 'priority_processing'],
    price: 19.99,
    name: 'Pro Plan'
  },
  business: { 
    monthlyMinutes: -1, // unlimited
    features: ['all'],
    price: 49.99,
    name: 'Business Plan'
  }
};

// NEW: Max audio duration for all users (5 minutes)
export const MAX_AUDIO_DURATION_SECONDS = 5 * 60; 

// Create user profile when they sign up
export const createUserProfile = async (userId, email, name = '') => { 
  try {
    const userRef = doc(db, 'users', userId);
    const userData = {
      uid: userId,
      email: email,
      name: name, // Store user's name
      plan: 'free',
      monthlyMinutes: 0,
      totalMinutes: 0,
      createdAt: serverTimestamp(),
      lastActive: serverTimestamp(),
      billingCycle: getCurrentBillingCycle()
    };
    
    await setDoc(userRef, userData);
    console.log('User profile created successfully');
    return userData;
  } catch (error) {
    console.error('Error creating user profile:', error);
    throw error;
  }
};

// Get user profile data
export const getUserProfile = async (userId) => {
  try {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      return userSnap.data();
    } else {
      console.log('No user profile found');
      return null;
    }
  } catch (error) {
    console.error('Error getting user profile:', error);
    throw error;
  }
};

// Update user's monthly usage
export const updateUserUsage = async (userId, durationSeconds) => {
  try {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      const userData = userSnap.data();
      const durationMinutes = Math.ceil(durationSeconds / 60);
      
      // Check if we need to reset monthly usage (new billing cycle)
      const currentCycle = getCurrentBillingCycle();
      const shouldReset = userData.billingCycle !== currentCycle;
      
      const newMonthlyMinutes = shouldReset ? durationMinutes : userData.monthlyMinutes + durationMinutes;
      const newTotalMinutes = userData.totalMinutes + durationMinutes;
      
      await updateDoc(userRef, {
        monthlyMinutes: newMonthlyMinutes,
        totalMinutes: newTotalMinutes,
        lastActive: serverTimestamp(),
        billingCycle: currentCycle
      });
      
      return {
        monthlyMinutes: newMonthlyMinutes,
        totalMinutes: newTotalMinutes,
        plan: userData.plan
      };
    }
  } catch (error) {
    console.error('Error updating user usage:', error);
    throw error;
  }
};

// Check if user can transcribe (within limits)
export const canUserTranscribe = async (userId, estimatedDurationSeconds) => {
  try {
    const userProfile = await getUserProfile(userId);
    if (!userProfile) return false;
    
    // Admin override - unlimited access for admin emails
    if (ADMIN_EMAILS.includes(userProfile.email)) {
      console.log('Admin access granted for:', userProfile.email);
      return true;
    }

    // NEW: Enforce 5-minute audio duration limit
    if (estimatedDurationSeconds > MAX_AUDIO_DURATION_SECONDS) {
        throw new Error(`Audio exceeds ${MAX_AUDIO_DURATION_SECONDS / 60} minutes limit.`);
    }
    
    const planLimits = PLAN_LIMITS[userProfile.plan];
    if (planLimits.monthlyMinutes === -1) return true; // unlimited
    
    const estimatedMinutes = Math.ceil(estimatedDurationSeconds / 60);
    const wouldExceedLimit = userProfile.monthlyMinutes + estimatedMinutes > planLimits.monthlyMinutes;
    
    return !wouldExceedLimit;
  } catch (error) {
    console.error('Error checking user limits:', error);
    // Re-throw the error so App.js can catch and display it
    throw error; 
  }
};

// Save transcription record
export const saveTranscription = async (userId, transcriptionData) => {
  try {
    const transcriptionRef = collection(db, 'transcriptions');
    const transcriptionRecord = {
      userId: userId,
      fileName: transcriptionData.fileName,
      duration: transcriptionData.duration,
      transcriptionText: transcriptionData.text,
      status: 'completed',
      createdAt: serverTimestamp()
    };
    
    await addDoc(transcriptionRef, transcriptionRecord);
    console.log('Transcription saved with ID:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('Error saving transcription:', error);
    throw error;
  }
};

// Get user's transcription history
export const getUserTranscriptions = async (userId) => {
  try {
    const transcriptionsRef = collection(db, 'transcriptions');
    const q = query(transcriptionsRef, where('userId', '==', userId));
    const querySnapshot = await getDocs(q);
    
    const transcriptions = [];
    querySnapshot.forEach((doc) => {
      transcriptions.push({ id: doc.id, ...doc.data() });
    });
    
    return transcriptions;
  } catch (error) {
    console.error('Error getting transcriptions:', error);
    throw error;
  }
};

// Upgrade user plan
export const upgradeUserPlan = async (userId, newPlan) => {
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      plan: newPlan,
      lastActive: serverTimestamp()
    });
    
    console.log(`User plan upgraded to ${newPlan}`);
    return true;
  } catch (error) {
    console.error('Error upgrading user plan:', error);
    throw error;
  }
};