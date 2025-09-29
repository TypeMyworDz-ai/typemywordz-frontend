import { db } from './firebase';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, orderBy, getDocs, deleteDoc } from 'firebase/firestore';

const USERS_COLLECTION = 'users';
const TRANSCRIPTIONS_COLLECTION = 'transcriptions';

// Helper to get user profile document reference
const getUserProfileRef = (uid) => doc(db, USERS_COLLECTION, uid);

// Helper to get user transcriptions collection reference
const getUserTranscriptionsCollectionRef = (uid) => collection(db, USERS_COLLECTION, uid, TRANSCRIPTIONS_COLLECTION);

// Create or update user profile
export const createUserProfile = async (uid, email, name = '') => {
  const userRef = getUserProfileRef(uid);
  const docSnap = await getDoc(userRef);

  const userPlan = 'free'; // All new users start with 'free' plan

  if (!docSnap.exists()) {
    await setDoc(userRef, {
      uid,
      email,
      name,
      plan: userPlan,
      totalMinutesUsed: 0,
      hasReceivedInitialFreeMinutes: false, // New users start with 30 free minutes available
      createdAt: new Date(),
      lastAccessed: new Date(),
      expiresAt: null, 
      subscriptionStartDate: null,
    });
    console.log("User profile created for:", email, "with plan:", userPlan);
  } else {
    const existingData = docSnap.data();
    const updates = {
      lastAccessed: new Date(),
    };

    // Initialize new fields for existing users if they don't exist
    if (existingData.totalMinutesUsed === undefined) {
      updates.totalMinutesUsed = 0; // Reset or initialize to 0
    }
    if (existingData.hasReceivedInitialFreeMinutes === undefined) {
      // If they had any usage before, assume they've received their initial minutes
      updates.hasReceivedInitialFreeMinutes = (existingData.totalMinutesUsed || 0) > 0;
    }

    // Only update if there are actual changes (more than just lastAccessed)
    if (Object.keys(updates).length > 1 || (Object.keys(updates).length === 1 && updates.lastAccessed)) {
        await updateDoc(userRef, updates);
        console.log("User profile updated for:", email);
    }
  }
};

// Get user profile (UPDATED for correct expiry logic and new plan names)
export const getUserProfile = async (uid) => {
  const userRef = getUserProfileRef(uid);
  const docSnap = await getDoc(userRef);
  if (docSnap.exists()) {
    let profileData = docSnap.data();
    console.log("DEBUG: getUserProfile - Raw profileData from Firestore:", JSON.parse(JSON.stringify(profileData)));

    // Initialize new fields if they don't exist (for existing users)
    profileData.totalMinutesUsed = typeof profileData.totalMinutesUsed === 'number' ? profileData.totalMinutesUsed : 0;
    profileData.hasReceivedInitialFreeMinutes = typeof profileData.hasReceivedInitialFreeMinutes === 'boolean' ? profileData.hasReceivedInitialFreeMinutes : false;

    if (profileData.createdAt && typeof profileData.createdAt.toDate === 'function') {
      profileData.createdAt = profileData.createdAt.toDate();
    }
    if (profileData.lastAccessed && typeof profileData.lastAccessed.toDate === 'function') {
      profileData.lastAccessed = profileData.lastAccessed.toDate();
    }
    if (profileData.expiresAt && typeof profileData.expiresAt.toDate === 'function') {
        profileData.expiresAt = profileData.expiresAt.toDate();
    }
    if (profileData.subscriptionStartDate && typeof profileData.subscriptionStartDate.toDate === 'function') {
        profileData.subscriptionStartDate = profileData.subscriptionStartDate.toDate();
    }

    const currentTime = new Date();

    // KEY FIX: Expiry logic for temporary paid plans (updated plan names)
    const temporaryPlans = ['One-Day Plan', 'Three-Day Plan', 'One-Week Plan'];
    if (temporaryPlans.includes(profileData.plan) && profileData.expiresAt && profileData.expiresAt < currentTime) {
      console.log(`User ${uid} plan '${profileData.plan}' expired on ${profileData.expiresAt}. Downgrading to FREE.`);
      await updateDoc(userRef, {
        plan: 'free',
        expiresAt: null,
        subscriptionStartDate: null,
        // CRITICAL FIX: User has already received their initial free minutes, so they get 0 minutes after expiry
        hasReceivedInitialFreeMinutes: true, // Mark as having received trial if plan expired
      });
      profileData = { ...profileData, plan: 'free', expiresAt: null, subscriptionStartDate: null, hasReceivedInitialFreeMinutes: true, totalMinutesUsed: 0 };
    }
    
    // Calculate remaining free minutes - KEY CHANGE: only 30 minutes if user hasn't received them yet
    if (profileData.plan === 'free' && !profileData.hasReceivedInitialFreeMinutes) {
      profileData.freeMinutesRemaining = Math.max(0, 30 - profileData.totalMinutesUsed);
    } else {
      profileData.freeMinutesRemaining = 0; // No free minutes for users who already got their trial or expired users
    }

    console.log("DEBUG: getUserProfile - Final profileData returned:", JSON.parse(JSON.stringify(profileData)));
    return profileData;
  }
  return null;
};

// Update user plan after successful payment (updated plan names and durations)
export const updateUserPlan = async (uid, newPlan, referenceId = null) => {
  const userRef = getUserProfileRef(uid);
  const updates = {
    plan: newPlan,
    lastAccessed: new Date(),
    paystackReferenceId: referenceId, 
  };
  
  let planDurationMinutes = 0; 
  if (newPlan === 'One-Day Plan') {
      planDurationMinutes = 1 * 24 * 60; // 1 day in minutes
  } else if (newPlan === 'Three-Day Plan') {
      planDurationMinutes = 3 * 24 * 60; // 3 days in minutes
  } else if (newPlan === 'One-Week Plan') {
      planDurationMinutes = 7 * 24 * 60; // 7 days in minutes
  } else if (newPlan === 'Pro') { // 'Pro' plan is now treated as a paid subscription with no expiry.
      updates.expiresAt = null; 
      updates.subscriptionStartDate = new Date();
      console.log(`updateUserPlan: Generic 'Pro' plan received for ${uid}. Treating as effectively unlimited.`);
  }

  if (planDurationMinutes > 0 && newPlan !== 'Pro') { // Only set expiry for temporary plans
      updates.expiresAt = new Date(Date.now() + planDurationMinutes * 60 * 1000);
      updates.subscriptionStartDate = new Date();
      console.log(`User ${uid} ${newPlan} plan will expire on: ${updates.expiresAt}`);
  } else if (newPlan === 'free') {
      updates.expiresAt = null;
      updates.subscriptionStartDate = null;
  }
  
  // Mark hasReceivedInitialFreeMinutes as true upon any paid plan purchase
  updates.hasReceivedInitialFreeMinutes = true;

  await updateDoc(userRef, updates);
  console.log(`User ${uid} plan updated to: ${newPlan}`);
};

// Check recording permissions (no changes needed)
export const canUserRecord = async (uid) => {
  try {
    const userProfile = await getUserProfile(uid);
    if (!userProfile) return false;
    
    return true;
  } catch (error) {
    console.error("Error checking recording permissions:", error);
    return false;
  }
};

// UPDATED: Check if user can transcribe with proper validation and automatic pricing redirect
export const canUserTranscribe = async (uid, estimatedDurationSeconds) => {
  try {
    console.log("🔍 canUserTranscribe called with:", { uid, estimatedDurationSeconds });
    
    const userProfile = await getUserProfile(uid);
    console.log("👤 canUserTranscribe - User profile retrieved:", JSON.parse(JSON.stringify(userProfile)));
    
    if (!userProfile) {
      console.warn("❌ canUserTranscribe: User profile not found for uid:", uid);
      return { canTranscribe: false, reason: 'profile_not_found' };
    }

    // Check expiry for paid plans
    const paidPlans = ['Pro', 'One-Day Plan', 'Three-Day Plan', 'One-Week Plan'];
    if (paidPlans.includes(userProfile.plan)) {
        if (userProfile.plan === 'Pro' && userProfile.expiresAt === null) {
            console.log(`✅ ${userProfile.plan} plan user - unlimited transcription. Allowing transcription.`);
            return { canTranscribe: true, reason: 'pro_unlimited' };
        }
        if (userProfile.expiresAt && userProfile.expiresAt > new Date()) {
            console.log(`✅ ${userProfile.plan} plan user - plan active. Allowing transcription.`);
            return { canTranscribe: true, reason: 'paid_plan_active' };
        } else {
            console.log(`❌ ${userProfile.plan} plan user - plan expired. Blocking transcription.`);
            // Automatically downgrade happens in getUserProfile, so this is just a final check
            return { canTranscribe: false, reason: 'plan_expired', redirectToPricing: true };
        }
    }

    // Free plan logic
    if (userProfile.plan === 'free') {
      const remainingFreeMinutes = userProfile.freeMinutesRemaining || 0;
      const estimatedDurationMinutes = Math.ceil(estimatedDurationSeconds / 60);

      // Check if user has already used their free trial
      if (userProfile.hasReceivedInitialFreeMinutes) {
        console.log(`❌ Free plan user - already used their 30-minute trial. Blocking transcription.`);
        return { canTranscribe: false, reason: 'free_trial_exhausted', redirectToPricing: true };
      }

      // Check if the audio duration exceeds remaining minutes
      if (estimatedDurationMinutes > remainingFreeMinutes) {
        console.log(`❌ Free plan user - ${estimatedDurationMinutes} minutes exceeds ${remainingFreeMinutes} remaining. Blocking transcription.`);
        return { 
          canTranscribe: false, 
          reason: 'exceeds_free_limit', 
          remainingMinutes: remainingFreeMinutes, 
          requiredMinutes: estimatedDurationMinutes,
          redirectToPricing: true
        };
      }

      // User can transcribe
      console.log(`✅ Free plan user - ${estimatedDurationMinutes} minutes within ${remainingFreeMinutes} remaining. Allowing transcription.`);
      return { 
        canTranscribe: true, 
        reason: 'within_free_limit', 
        remainingMinutes: remainingFreeMinutes, 
        requiredMinutes: estimatedDurationMinutes 
      };
    }
    
    console.log("❌ canUserTranscribe: User plan not eligible for transcription. Current plan:", userProfile.plan);
    return { canTranscribe: false, reason: 'plan_not_eligible', redirectToPricing: true };
    
  } catch (error) {
    console.error("❌ Error in canUserTranscribe:", error);
    return { canTranscribe: false, reason: 'error', error: error.message };
  }
};

// Update user usage after transcription
export const updateUserUsage = async (uid, durationSeconds) => {
  const userRef = getUserProfileRef(uid);
  const userProfile = await getUserProfile(uid); // Get the latest profile

  if (!userProfile) {
    console.warn(`⚠️ User ${uid}: Profile not found for usage update.`);
    return;
  }

  // Only track usage for 'free' plans who haven't exhausted their initial free minutes yet
  if (userProfile.plan === 'free' && !userProfile.hasReceivedInitialFreeMinutes) {
    const durationMinutes = Math.ceil(durationSeconds / 60);
    const newTotalMinutesUsed = (userProfile.totalMinutesUsed || 0) + durationMinutes;

    await updateDoc(userRef, {
      totalMinutesUsed: newTotalMinutesUsed,
      // Mark as received if they've used 30+ minutes or if the new total reaches 30
      hasReceivedInitialFreeMinutes: newTotalMinutesUsed >= 30, 
      lastAccessed: new Date(),
    });
    console.log(`📊 User ${uid} (free plan): Updated totalMinutesUsed by ${durationMinutes} mins to ${newTotalMinutesUsed} mins. Remaining: ${Math.max(0, 30 - newTotalMinutesUsed)} mins.`);
  } else {
    // For paid plans or users who've used their trial, just update lastAccessed
    await updateDoc(userRef, {
      lastAccessed: new Date(),
    });
    console.log(`📊 User ${uid} (${userProfile.plan} plan): Usage not tracked for this plan type.`);
  }
};

// Save transcription to Firestore
export const saveTranscription = async (uid, fileName, text, duration, audioUrl) => {
  const transcriptionsCollectionRef = getUserTranscriptionsCollectionRef(uid);
  const newTranscriptionRef = doc(transcriptionsCollectionRef);

  const transcriptionData = {
    fileName,
    text,
    duration,
    audioUrl,
    userId: uid,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // Transcriptions expire in 7 days
  };

  await setDoc(newTranscriptionRef, transcriptionData);
  console.log("Transcription saved with ID:", newTranscriptionRef.id);
  return newTranscriptionRef.id;
};

// Fetch user's transcriptions
export const fetchUserTranscriptions = async (uid) => {
  const transcriptionsCollectionRef = getUserTranscriptionsCollectionRef(uid);
  const q = query(
    transcriptionsCollectionRef,
    where("expiresAt", ">", new Date()),
    orderBy("createdAt", "desc")
  );
  const querySnapshot = await getDocs(q);
  const transcriptions = [];
  querySnapshot.forEach((doc) => {
    const data = doc.data();
    if (data.expiresAt && typeof data.expiresAt.toDate === 'function') {
        data.expiresAt = data.expiresAt.toDate();
    }
    transcriptions.push({ id: doc.id, ...data });
  });
  return transcriptions;
};

// Update a specific transcription
export const updateTranscription = async (uid, transcriptionId, newData) => {
  const transcriptionRef = doc(db, USERS_COLLECTION, uid, TRANSCRIPTIONS_COLLECTION, transcriptionId);
  await updateDoc(transcriptionRef, newData);
  console.log("Transcription updated:", transcriptionId);
};

// Delete a specific transcription
export const deleteTranscription = async (uid, transcriptionId) => {
  const transcriptionRef = doc(db, USERS_COLLECTION, uid, TRANSCRIPTIONS_COLLECTION, transcriptionId);
  await deleteDoc(transcriptionRef);
  console.log("Transcription deleted:", transcriptionId);
};
