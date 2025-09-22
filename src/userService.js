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
      totalMinutesUsed: 0,
      createdAt: new Date(),
      lastAccessed: new Date(),
      expiresAt: ADMIN_EMAILS.includes(email) ? null : null, 
      subscriptionStartDate: ADMIN_EMAILS.includes(email) ? new Date() : null,
      // stripeSubscriptionId: ADMIN_EMAILS.includes(email) ? 'ADMIN_UNLIMITED' : null, // REMOVED Stripe reference
    });
    console.log("User profile created for:", email, "with plan:", userPlan);
  } else {
    const existingData = docSnap.data();
    const updates = {
      lastAccessed: new Date(),
    };

    if (ADMIN_EMAILS.includes(email) && existingData.plan !== 'pro') {
      updates.plan = 'pro';
      updates.expiresAt = null;
      updates.subscriptionStartDate = new Date();
      // updates.stripeSubscriptionId = 'ADMIN_UNLIMITED'; // REMOVED Stripe reference
      console.log(`Admin user profile ${email} updated to PRO plan (unlimited).`);
    } else if (ADMIN_EMAILS.includes(email) && existingData.plan === 'pro' && existingData.stripeSubscriptionId !== 'ADMIN_UNLIMITED') {
        // Ensure existing admin pro accounts are correctly marked as ADMIN_UNLIMITED
        // updates.stripeSubscriptionId = 'ADMIN_UNLIMITED'; // REMOVED Stripe reference
        updates.expiresAt = null;
        console.log(`Admin user profile ${email} corrected to PRO plan (ADMIN_UNLIMITED).`);
    }
    
    if (existingData.totalMinutesUsed === undefined || existingData.totalMinutesUsed === null) {
        updates.totalMinutesUsed = 0;
    }
    if (!ADMIN_EMAILS.includes(email) && existingData.plan === 'free' && (existingData.expiresAt || existingData.stripeSubscriptionId || existingData.subscriptionStartDate)) {
        updates.expiresAt = null;
        // updates.stripeSubscriptionId = null; // REMOVED Stripe reference
        updates.subscriptionStartDate = null;
        console.log(`DEBUG: createUserProfile - Resetting expiry fields for non-admin user ${uid} on free plan.`);
    }

    await updateDoc(userRef, updates);
    console.log("User profile updated for:", email);
  }
};

// Get user profile (UPDATED for expiry check and admin 'pro' override)
export const getUserProfile = async (uid) => {
  const userRef = getUserProfileRef(uid);
  const docSnap = await getDoc(userRef);
  if (docSnap.exists()) {
    let profileData = docSnap.data();
    console.log("DEBUG: getUserProfile - Raw profileData from Firestore:", JSON.parse(JSON.stringify(profileData)));

    profileData.totalMinutesUsed = typeof profileData.totalMinutesUsed === 'number' ? profileData.totalMinutesUsed : 0;

    if (profileData.expiresAt && typeof profileData.expiresAt.toDate === 'function') {
        profileData.expiresAt = profileData.expiresAt.toDate();
    }
    if (profileData.subscriptionStartDate && typeof profileData.subscriptionStartDate.toDate === 'function') {
        profileData.subscriptionStartDate = profileData.subscriptionStartDate.toDate();
    }

    const currentTime = new Date();

    if (ADMIN_EMAILS.includes(profileData.email)) {
      if (profileData.plan !== 'pro' || profileData.stripeSubscriptionId !== 'ADMIN_UNLIMITED' || profileData.expiresAt !== null) {
        await updateDoc(userRef, {
          plan: 'pro',
          expiresAt: null,
          subscriptionStartDate: new Date(),
          stripeSubscriptionId: 'ADMIN_UNLIMITED',
        });
        profileData = { ...profileData, plan: 'pro', expiresAt: null, subscriptionStartDate: new Date(), stripeSubscriptionId: 'ADMIN_UNLIMITED' };
        console.log(`DEBUG: getUserProfile - Admin ${profileData.email} profile forced to PRO (ADMIN_UNLIMITED).`);
      } else {
        console.log(`DEBUG: getUserProfile - Admin ${profileData.email} is already PRO (ADMIN_UNLIMITED).`);
      }
      return profileData;
    }

    if (['pro', '24 Hours Pro Access', '5 Days Pro Access'].includes(profileData.plan) && profileData.expiresAt && profileData.expiresAt < currentTime) {
      console.log(`User ${uid} plan '${profileData.plan}' expired on ${profileData.expiresAt}. Downgrading to FREE.`);
      await updateDoc(userRef, {
        plan: 'free',
        expiresAt: null,
        // stripeSubscriptionId: null, // REMOVED Stripe reference
        subscriptionStartDate: null,
        totalMinutesUsed: profileData.totalMinutesUsed,
      });
      return { ...profileData, plan: 'free', expiresAt: null, stripeSubscriptionId: null, subscriptionStartDate: null };
    }
    
    console.log("DEBUG: getUserProfile - Final profileData returned (non-admin):", JSON.parse(JSON.stringify(profileData)));
    return profileData;
  }
  return null;
};

// Update user plan after successful payment
export const updateUserPlan = async (uid, newPlan, subscriptionId = null) => {
  const userRef = getUserProfileRef(uid);
  const updates = {
    plan: newPlan,
    lastAccessed: new Date(),
  };
  
  // if (subscriptionId) { // REMOVED Stripe reference
  //   updates.stripeSubscriptionId = subscriptionId;
  // }

  let planDurationHours = 0;
  if (newPlan === '24 Hours Pro Access') {
      planDurationHours = 24;
  } else if (newPlan === '5 Days Pro Access') {
      planDurationHours = 5 * 24;
  } else if (newPlan === 'pro') {
      updates.expiresAt = null; 
      updates.subscriptionStartDate = new Date();
      console.log(`updateUserPlan: Generic 'pro' plan received for ${uid}. Treating as effectively unlimited.`);
  }

  if (planDurationHours > 0 && newPlan !== 'pro') {
      updates.expiresAt = new Date(Date.now() + planDurationHours * 60 * 60 * 1000);
      updates.subscriptionStartDate = new Date();
      console.log(`User ${uid} ${newPlan} plan will expire on: ${updates.expiresAt}`);
  } else if (newPlan === 'free') {
      updates.expiresAt = null;
      // updates.stripeSubscriptionId = null; // REMOVED Stripe reference
      updates.subscriptionStartDate = null;
  }
  
  const userProfile = await getUserProfile(uid);
  if (newPlan !== 'free' && !ADMIN_EMAILS.includes(userProfile?.email)) {
    updates.totalMinutesUsed = 0;
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

    if (userProfile.plan === 'pro') {
        console.log(`✅ ${userProfile.plan} plan user - unlimited transcription`);
        return true;
    }
    
    if (['24 Hours Pro Access', '5 Days Pro Access'].includes(userProfile.plan)) {
        console.log(`✅ ${userProfile.plan} plan user - plan active. Allowing transcription.`);
        return true;
    }

    if (userProfile.plan === 'free') {
      const currentMinutesUsed = userProfile.totalMinutesUsed || 0;
      const remainingMinutes = 30 - currentMinutesUsed;

      const estimatedDurationMinutes = Math.ceil(estimatedDurationSeconds / 60);

      if (estimatedDurationMinutes <= remainingMinutes) {
        console.log(`✅ Free plan user - ${estimatedDurationMinutes} minutes within ${remainingMinutes} remaining. Allowing transcription.`);
        return true;
      } else {
        console.log(`❌ Free plan user - ${estimatedDurationMinutes} minutes exceeds ${remainingMinutes} remaining. Blocking transcription.`);
        return false;
      }
    }
    
    console.log("❌ canUserTranscribe: User plan not eligible for transcription or unhandled scenario. Current plan:", userProfile.plan);
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

  if (userProfile && userProfile.plan === 'free') {
    const durationMinutes = Math.ceil(durationSeconds / 60);
    const newTotalMinutes = (userProfile.totalMinutesUsed || 0) + durationMinutes;

    await updateDoc(userRef, {
      totalMinutesUsed: newTotalMinutes,
      lastAccessed: new Date(),
    });
    console.log(`📊 User ${uid} (free plan): Updated totalMinutesUsed by ${durationMinutes} mins to ${newTotalMinutes} mins.`);
  } else if (userProfile && (userProfile.plan === 'pro' || ['24 Hours Pro Access', '5 Days Pro Access'].includes(userProfile.plan))) {
    await updateDoc(userRef, {
      lastAccessed: new Date(),
    });
    console.log(`📊 User ${uid} (${userProfile.plan} plan): Usage not tracked for limits.`);
  } else {
    console.warn(`⚠️ User ${uid}: Profile not found or plan not recognized for usage update. Current plan:`, userProfile?.plan);
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
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
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