import { db } from './firebase';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, orderBy, getDocs, deleteDoc } from 'firebase/firestore';

const USERS_COLLECTION = 'users';
const TRANSCRIPTIONS_COLLECTION = 'transcriptions';

// Admin emails - these users will always have 'pro' plan without payment/expiry
const ADMIN_EMAILS = ['typemywordz@gmail.com', 'gracenyaitara@gmail.com']; 

// Helper to get user profile document reference
const getUserProfileRef = (uid) => doc(db, USERS_COLLECTION, uid);

// Helper to get user transcriptions collection reference
const getUserTranscriptionsCollectionRef = (uid) => collection(db, USERS_COLLECTION, uid, TRANSCRIPTIONS_COLLECTION);

// Create or update user profile
export const createUserProfile = async (uid, email, name = '') => {
  const userRef = getUserProfileRef(uid);
  const docSnap = await getDoc(userRef);

  const userPlan = ADMIN_EMAILS.includes(email) ? 'pro' : 'free';

  if (!docSnap.exists()) {
    await setDoc(userRef, {
      uid,
      email,
      name,
      plan: userPlan,
      totalMinutesUsed: 0, // Changed from totalMinutesUsedForFreeTrial
      hasReceivedInitialFreeMinutes: ADMIN_EMAILS.includes(email) ? false : false, // KEY CHANGE: Start as false, grant only on first login
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

    // Ensure admin users always have 'pro' plan with null expiry
    if (ADMIN_EMAILS.includes(email)) {
      if (existingData.plan !== 'pro' || existingData.expiresAt !== null) {
        updates.plan = 'pro';
        updates.expiresAt = null;
        updates.subscriptionStartDate = new Date(); 
        updates.totalMinutesUsed = 0; 
        updates.hasReceivedInitialFreeMinutes = false; // Admins don't get/need free minutes
        console.log(`DEBUG: createUserProfile - Admin ${email} profile forced to PRO (unlimited).`);
      }
    } else {
      // Initialize new fields for existing users
      if (existingData.totalMinutesUsed === undefined) {
        updates.totalMinutesUsed = existingData.totalMinutesUsedForFreeTrial || 0;
      }
      if (existingData.hasReceivedInitialFreeMinutes === undefined) {
        // KEY CHANGE: Only grant free minutes if user has NEVER used any minutes AND has no subscription history
        const hasUsedAnyMinutes = (existingData.totalMinutesUsedForFreeTrial || 0) > 0 || (existingData.totalMinutesUsed || 0) > 0;
        const hasSubscriptionHistory = existingData.subscriptionStartDate || existingData.expiresAt;
        updates.hasReceivedInitialFreeMinutes = hasUsedAnyMinutes || hasSubscriptionHistory;
      }
    }

    // Only update if there are actual changes
    if (Object.keys(updates).length > 1) {
        await updateDoc(userRef, updates);
        console.log("User profile updated for:", email);
    }
  }
};

// Get user profile (UPDATED for correct expiry logic)
export const getUserProfile = async (uid) => {
  const userRef = getUserProfileRef(uid);
  const docSnap = await getDoc(userRef);
  if (docSnap.exists()) {
    let profileData = docSnap.data();
    console.log("DEBUG: getUserProfile - Raw profileData from Firestore:", JSON.parse(JSON.stringify(profileData)));

    // Initialize new fields if they don't exist (for existing users)
    profileData.totalMinutesUsed = typeof profileData.totalMinutesUsed === 'number' ? profileData.totalMinutesUsed : (profileData.totalMinutesUsedForFreeTrial || 0);
    profileData.hasReceivedInitialFreeMinutes = typeof profileData.hasReceivedInitialFreeMinutes === 'boolean' ? profileData.hasReceivedInitialFreeMinutes : false; // KEY CHANGE: Default to false

    if (profileData.expiresAt && typeof profileData.expiresAt.toDate === 'function') {
        profileData.expiresAt = profileData.expiresAt.toDate();
    }
    if (profileData.subscriptionStartDate && typeof profileData.subscriptionStartDate.toDate === 'function') {
        profileData.subscriptionStartDate = profileData.subscriptionStartDate.toDate();
    }

    const currentTime = new Date();

    // Admin logic: always 'pro', no expiry, no usage tracking
    if (ADMIN_EMAILS.includes(profileData.email)) {
      if (profileData.plan !== 'pro' || profileData.expiresAt !== null) {
        await updateDoc(userRef, {
          plan: 'pro',
          expiresAt: null,
          subscriptionStartDate: new Date(),
          totalMinutesUsed: 0, 
          hasReceivedInitialFreeMinutes: false,
        });
        profileData = { ...profileData, plan: 'pro', expiresAt: null, subscriptionStartDate: new Date(), totalMinutesUsed: 0, hasReceivedInitialFreeMinutes: false };
        console.log(`DEBUG: getUserProfile - Admin ${profileData.email} profile forced to PRO (unlimited).`);
      }
      return profileData;
    }

    // KEY FIX: Expiry logic for temporary paid plans
    if (['24 Hours Pro Access', '5 Days Pro Access', '5 Minutes Pro Access'].includes(profileData.plan) && profileData.expiresAt && profileData.expiresAt < currentTime) {
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

// Update user plan after successful payment
export const updateUserPlan = async (uid, newPlan, referenceId = null) => {
  const userRef = getUserProfileRef(uid);
  const updates = {
    plan: newPlan,
    lastAccessed: new Date(),
    paystackReferenceId: referenceId, 
  };
  
  let planDurationMinutes = 0; 
  if (newPlan === '5 Minutes Pro Access') {
      planDurationMinutes = 5;
  } else if (newPlan === '24 Hours Pro Access') {
      planDurationMinutes = 24 * 60;
  } else if (newPlan === '5 Days Pro Access') {
      planDurationMinutes = 5 * 24 * 60;
  } else if (newPlan === 'pro') {
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

// Check if user can transcribe
export const canUserTranscribe = async (uid, estimatedDurationSeconds) => {
  try {
    console.log("🔍 canUserTranscribe called with:", { uid, estimatedDurationSeconds });
    
    const userProfile = await getUserProfile(uid);
    console.log("👤 canUserTranscribe - User profile retrieved:", JSON.parse(JSON.stringify(userProfile)));
    
    if (!userProfile) {
      console.warn("❌ canUserTranscribe: User profile not found for uid:", uid);
      return false;
    }

    // Admins always have access
    if (ADMIN_EMAILS.includes(userProfile.email)) {
        console.log(`✅ Admin user ${userProfile.email} - unlimited transcription.`);
        return true;
    }

    // Check expiry for temporary paid plans
    if (['pro', '24 Hours Pro Access', '5 Days Pro Access', '5 Minutes Pro Access'].includes(userProfile.plan)) {
        if (userProfile.expiresAt === null && userProfile.plan === 'pro') {
            console.log(`✅ ${userProfile.plan} plan user - unlimited transcription.`);
            return true;
        }
        if (userProfile.expiresAt && userProfile.expiresAt > new Date()) {
            console.log(`✅ ${userProfile.plan} plan user - plan active. Allowing transcription.`);
            return true;
        } else {
            console.log(`❌ ${userProfile.plan} plan user - plan expired. Blocking transcription.`);
            return false;
        }
    }

    // KEY FIX: Free plan logic - only if user hasn't received their initial 30 minutes yet
    if (userProfile.plan === 'free') {
      const remainingFreeMinutes = userProfile.freeMinutesRemaining || 0;
      const estimatedDurationMinutes = Math.ceil(estimatedDurationSeconds / 60);

      if (estimatedDurationMinutes <= remainingFreeMinutes && !userProfile.hasReceivedInitialFreeMinutes) {
        console.log(`✅ Free plan user - ${estimatedDurationMinutes} minutes within ${remainingFreeMinutes} remaining. Allowing transcription.`);
        return true;
      } else {
        console.log(`❌ Free plan user - ${estimatedDurationMinutes} minutes exceeds ${remainingFreeMinutes} remaining or already used trial. Blocking transcription.`);
        return false;
      }
    }
    
    console.log("❌ canUserTranscribe: User plan not eligible for transcription. Current plan:", userProfile.plan);
    return false;
    
  } catch (error) {
    console.error("❌ Error in canUserTranscribe:", error);
    return false;
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
    console.log(`📊 User ${uid} (free plan): Updated totalMinutesUsed by ${durationMinutes} mins to ${newTotalMinutesUsed} mins.`);
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

//Testing if it will trigger Vercel deployment