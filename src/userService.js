import { db } from './firebase';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, orderBy, getDocs, deleteDoc } from 'firebase/firestore';

const USERS_COLLECTION = 'users';
const TRANSCRIPTIONS_COLLECTION = 'transcriptions';

// Admin emails - these users will have admin panel access but their plan is managed like regular users
const ADMIN_EMAILS = ['typemywordz@gmail.com']; 

// Helper to get user profile document reference
const getUserProfileRef = (uid) => doc(db, USERS_COLLECTION, uid);

// Helper to get user transcriptions collection reference
const getUserTranscriptionsCollectionRef = (uid) => collection(db, USERS_COLLECTION, uid, TRANSCRIPTIONS_COLLECTION);

// Create or update user profile
export const createUserProfile = async (uid, email, name = '') => {
  const userRef = getUserProfileRef(uid);
  const docSnap = await getDoc(userRef);

  // Default plan is 'free' for all new users, even if they are in ADMIN_EMAILS
  const userPlan = 'free'; 

  if (!docSnap.exists()) {
    await setDoc(userRef, {
      uid,
      email,
      name,
      plan: userPlan,
      totalMinutesUsed: 0,
      hasReceivedInitialFreeMinutes: false, // All new users start with free minutes
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

    // No special 'pro' plan logic for ADMIN_EMAILS here. They are treated as regular users plan-wise.
    // Initialize new fields for existing users if they don't exist
    if (existingData.totalMinutesUsed === undefined) {
      updates.totalMinutesUsed = existingData.totalMinutesUsedForFreeTrial || 0;
    }
    if (existingData.hasReceivedInitialFreeMinutes === undefined) {
      const hasUsedAnyMinutes = (existingData.totalMinutesUsedForFreeTrial || 0) > 0 || (existingData.totalMinutesUsed || 0) > 0;
      const hasSubscriptionHistory = existingData.subscriptionStartDate || existingData.expiresAt;
      updates.hasReceivedInitialFreeMinutes = hasUsedAnyMinutes || hasSubscriptionHistory;
    }

    // Only update if there are actual changes
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
    profileData.totalMinutesUsed = typeof profileData.totalMinutesUsed === 'number' ? profileData.totalMinutesUsed : (profileData.totalMinutesUsedForFreeTrial || 0);
    profileData.hasReceivedInitialFreeMinutes = typeof profileData.hasReceivedInitialFreeMinutes === 'boolean' ? profileData.hasReceivedInitialFreeMinutes : false;

    if (profileData.expiresAt && typeof profileData.expiresAt.toDate === 'function') {
        profileData.expiresAt = profileData.expiresAt.toDate();
    }
    if (profileData.subscriptionStartDate && typeof profileData.subscriptionStartDate.toDate === 'function') {
        profileData.subscriptionStartDate = profileData.subscriptionStartDate.toDate();
    }

    const currentTime = new Date();

    // No special 'pro' plan logic for ADMIN_EMAILS here. They are treated as regular users plan-wise.

    // KEY FIX: Expiry logic for temporary paid plans (updated plan names)
    const temporaryPlans = ['One-Day Plan', 'Three-Day Plan', 'One-Week Plan'];
    if (temporaryPlans.includes(profileData.plan) && profileData.expiresAt && profileData.expiresAt < currentTime) {
      console.log(`User ${uid} plan '${profileData.plan}' expired on ${profileData.expiresAt}. Downgrading to FREE with 0 minutes.`);
      await updateDoc(userRef, {
        plan: 'free',
        expiresAt: null,
        subscriptionStartDate: null,
        // CRITICAL FIX: User has already received their initial free minutes, so they get 0 minutes after expiry
        hasReceivedInitialFreeMinutes: true,
      });
      profileData = { ...profileData, plan: 'free', expiresAt: null, subscriptionStartDate: null, hasReceivedInitialFreeMinutes: true };
    }
    
    // Calculate remaining free minutes - KEY CHANGE: only 30 minutes if user hasn't received them yet
    if (profileData.plan === 'free' && !profileData.hasReceivedInitialFreeMinutes) {
      profileData.freeMinutesRemaining = Math.max(0, 30 - profileData.totalMinutesUsed);
    } else {
      profileData.freeMinutesRemaining = 0; // No free minutes for users who already got their trial or expired users
    }

    // For backward compatibility, set totalMinutesUsed as the display field
    profileData.totalMinutesUsed = profileData.totalMinutesUsed || 0;

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
  } else if (newPlan === 'pro') { // 'pro' plan is now treated as a paid subscription with no expiry.
      updates.expiresAt = null; 
      updates.subscriptionStartDate = new Date();
      console.log(`updateUserPlan: Generic 'pro' plan received for ${uid}. Treating as effectively unlimited.`);
  }

  if (planDurationMinutes > 0 && newPlan !== 'pro') {
      updates.expiresAt = new Date(Date.now() + planDurationMinutes * 60 * 1000);
      updates.subscriptionStartDate = new Date();
      console.log(`User ${uid} ${newPlan} plan will expire on: ${updates.expiresAt}`);
  } else if (newPlan === 'free') {
      updates.expiresAt = null;
      updates.subscriptionStartDate = null;
  }
  
  await updateDoc(userRef, updates);
  console.log(`User ${uid} plan updated to: ${newPlan}`);
};

// Check recording permissions
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
// FIXED: Check if user can transcribe with proper validation and automatic pricing redirect (updated plan names)
export const canUserTranscribe = async (uid, estimatedDurationSeconds) => {
  try {
    console.log("🔍 canUserTranscribe called with:", { uid, estimatedDurationSeconds });
    
    const userProfile = await getUserProfile(uid);
    console.log("👤 canUserTranscribe - User profile retrieved:", JSON.parse(JSON.stringify(userProfile)));
    
    if (!userProfile) {
      console.warn("❌ canUserTranscribe: User profile not found for uid:", uid);
      return { canTranscribe: false, reason: 'profile_not_found' };
    }

    // Admins only get admin panel access, their transcription limits are handled like regular users.
    // No special 'admin_unlimited' transcription here.

    // Check expiry for temporary paid plans (updated plan names)
    const temporaryPlans = ['pro', 'One-Day Plan', 'Three-Day Plan', 'One-Week Plan'];
    if (temporaryPlans.includes(userProfile.plan)) {
        if (userProfile.expiresAt === null && userProfile.plan === 'pro') {
            console.log(`✅ ${userProfile.plan} plan user - unlimited transcription.`);
            return { canTranscribe: true, reason: 'pro_unlimited' };
        }
        if (userProfile.expiresAt && userProfile.expiresAt > new Date()) {
            console.log(`✅ ${userProfile.plan} plan user - plan active. Allowing transcription.`);
            return { canTranscribe: true, reason: 'paid_plan_active' };
        } else {
            console.log(`❌ ${userProfile.plan} plan user - plan expired. Blocking transcription.`);
            return { canTranscribe: false, reason: 'plan_expired', redirectToPricing: true };
        }
    }

    // FIXED: Free plan logic with precise validation
    if (userProfile.plan === 'free') {
      const remainingFreeMinutes = userProfile.freeMinutesRemaining || 0;
      const estimatedDurationMinutes = Math.ceil(estimatedDurationSeconds / 60);

      // Check if user has already used their free trial
      if (userProfile.hasReceivedInitialFreeMinutes) {
        console.log(`❌ Free plan user - already used their 30-minute trial. Blocking transcription.`);
        return { canTranscribe: false, reason: 'free_trial_exhausted', redirectToPricing: true };
      }

      // Check if the audio duration exceeds remaining minutes (even by seconds)
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
  const userProfile = await getUserProfile(uid);

  if (!userProfile) {
    console.warn(`⚠️ User ${uid}: Profile not found for usage update.`);
    return;
  }

  // KEY FIX: Only track usage for 'free' plans who haven't received their initial free minutes yet
  if (userProfile.plan === 'free' && !userProfile.hasReceivedInitialFreeMinutes) {
    const durationMinutes = Math.ceil(durationSeconds / 60);
    const newTotalMinutesUsed = (userProfile.totalMinutesUsed || 0) + durationMinutes;

    await updateDoc(userRef, {
      totalMinutesUsed: newTotalMinutesUsed,
      hasReceivedInitialFreeMinutes: newTotalMinutesUsed >= 30, // Mark as received if they've used 30+ minutes
      lastAccessed: new Date(),
    });
    console.log(`📊 User ${uid} (free plan): Updated totalMinutesUsed by ${durationMinutes} mins to ${newTotalMinutesUsed} mins. Remaining: ${Math.max(0, 30 - newTotalMinutesUsed)} mins.`);
  } else {
    // For paid plans or users who've used their trial, just update lastAccessed
    await updateDoc(userRef, {
      lastAccessed: new Date(),
    });
    console.log(`📊 User ${uid} (${userProfile.plan} plan): Usage not tracked.`);
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
