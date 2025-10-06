import { db } from './firebase';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, orderBy, getDocs, deleteDoc, addDoc, runTransaction } from 'firebase/firestore'; // Keep serverTimestamp just in case for other uses, but we'll manually set for this fix

const USERS_COLLECTION = 'users';
const TRANSCRIPTIONS_COLLECTION = 'transcriptions'; // Top-level collection for all transcriptions
const FEEDBACK_COLLECTION = 'feedback'; // NEW: New collection for feedback
const ADMIN_STATS_DOC = 'admin_stats/current'; // NEW: Document to store admin statistics

// Helper to get user profile document reference
const getUserProfileRef = (uid) => doc(db, USERS_COLLECTION, uid);

// Create or update user profile
export const createUserProfile = async (uid, email, name = '') => {
  const userRef = getUserProfileRef(uid);
  const docSnap = await getDoc(userRef);

  const userPlan = 'free'; // All new users start with 'free' plan
  const currentTime = new Date(); // Get current time once

  if (!docSnap.exists()) {
    await setDoc(userRef, {
      uid,
      email,
      name,
      plan: userPlan,
      totalMinutesUsed: 0,
      hasReceivedInitialFreeMinutes: false, // New users start with 30 free minutes available
      createdAt: currentTime, // Use concrete Date object
      lastAccessed: currentTime, // Use concrete Date object
      expiresAt: null, 
      subscriptionStartDate: null,
    });
    console.log("User profile created for:", email, "with plan:", userPlan);
  } else {
    const existingData = docSnap.data();
    const updates = {
      lastAccessed: currentTime, // Use concrete Date object
    };

    // Initialize new fields for existing users if they don't exist
    if (existingData.totalMinutesUsed === undefined) {
      updates.totalMinutesUsed = 0; // Reset or initialize to 0
    }
    if (existingData.hasReceivedInitialFreeMinutes === undefined) {
      // If they had any usage before, assume they've received their initial minutes
      updates.hasReceivedInitialFreeMinutes = (existingData.totalMinutesUsed || 0) > 0;
    }
    if (existingData.plan === undefined) { // Ensure plan is set for older users
      updates.plan = 'free';
    }
    if (existingData.expiresAt === undefined) { // Ensure expiresAt is set
      updates.expiresAt = null;
    }
    if (existingData.subscriptionStartDate === undefined) { // Ensure subscriptionStartDate is set
      updates.subscriptionStartDate = null;
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

    // Ensure all date fields are Date objects
    const convertToDate = (field) => {
      if (profileData[field] && typeof profileData[field].toDate === 'function') {
        return profileData[field].toDate();
      } else if (profileData[field] && !(profileData[field] instanceof Date)) {
        return new Date(profileData[field]);
      }
      return profileData[field]; // Already a Date or null
    };

    profileData.createdAt = convertToDate('createdAt');
    profileData.lastAccessed = convertToDate('lastAccessed');
    profileData.expiresAt = convertToDate('expiresAt');
    profileData.subscriptionStartDate = convertToDate('subscriptionStartDate');

    // Initialize new fields if they don't exist (for existing users)
    profileData.totalMinutesUsed = typeof profileData.totalMinutesUsed === 'number' ? profileData.totalMinutesUsed : 0;
    profileData.hasReceivedInitialFreeMinutes = typeof profileData.hasReceivedInitialFreeMinutes === 'boolean' ? profileData.hasReceivedInitialFreeMinutes : false;
    profileData.plan = profileData.plan || 'free'; // Ensure plan is never undefined

    const currentTime = new Date();

    // KEY FIX: Expiry logic for temporary paid plans (updated plan names)
    const temporaryPlans = ['One-Day Plan', 'Three-Day Plan', 'One-Week Plan'];
    const premiumPlans = ['Monthly Plan', 'Yearly Plan']; // NEW: Define premium plans (now one-time purchase with fixed duration)

    // Handle expiry for temporary plans
    if (temporaryPlans.includes(profileData.plan) && profileData.expiresAt && profileData.expiresAt < currentTime) {
      console.log(`User ${uid} plan '${profileData.plan}' expired on ${profileData.expiresAt}. Downgrading to FREE.`);
      await updateDoc(userRef, {
        plan: 'free',
        expiresAt: null,
        subscriptionStartDate: null,
        totalMinutesUsed: 0, // Reset usage for expired plan type
        hasReceivedInitialFreeMinutes: true, // Mark as having received trial if plan expired
      });
      profileData = { ...profileData, plan: 'free', expiresAt: null, subscriptionStartDate: null, hasReceivedInitialFreeMinutes: true, totalMinutesUsed: 0 };
    }
    // For Monthly/Yearly plans (now one-time purchases with fixed duration), they also have an expiry
    else if (premiumPlans.includes(profileData.plan) && profileData.expiresAt && profileData.expiresAt < currentTime) {
      console.log(`User ${uid} premium plan '${profileData.plan}' expired on ${profileData.expiresAt}. Downgrading to FREE.`);
      await updateDoc(userRef, {
        plan: 'free',
        expiresAt: null,
        subscriptionStartDate: null,
        totalMinutesUsed: 0, // Reset usage for expired plan type
        hasReceivedInitialFreeMinutes: true, // Mark as having received trial if plan expired
      });
      profileData = { ...profileData, plan: 'free', expiresAt: null, subscriptionStartDate: null, hasReceivedInitialFreeMinutes: true, totalMinutesUsed: 0 };
    }
    
    // Calculate remaining free minutes - KEY CHANGE: only 30 minutes if user hasn't received them yet
    if (profileData.plan === 'free' && !profileData.hasReceivedInitialFreeMinutes) {
      profileData.freeMinutesRemaining = Math.max(0, 30 - profileData.totalMinutesUsed);
    } else {
      profileData.freeMinutesRemaining = 0; // No free minutes for users who already got their trial or paid users
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
    lastAccessed: new Date(), // Use concrete Date object
    paystackReferenceId: referenceId, 
  };
  
  let planDurationDays = 0; 
  const currentTime = new Date();

  // Handle duration for all one-time purchase plans
  if (newPlan === 'One-Day Plan') {
      planDurationDays = 1;
  } else if (newPlan === 'Three-Day Plan') {
      planDurationDays = 3;
  } else if (newPlan === 'One-Week Plan') {
      planDurationDays = 7;
  } else if (newPlan === 'Monthly Plan') { // NEW: Monthly Plan (one-time purchase for 30 days)
      planDurationDays = 30;
  } else if (newPlan === 'Yearly Plan') { // NEW: Yearly Plan (one-time purchase for 365 days)
      planDurationDays = 365;
  }

  // Set expiresAt for all plans with a fixed duration
  if (planDurationDays > 0) {
      updates.expiresAt = new Date(currentTime.getTime() + planDurationDays * 24 * 60 * 60 * 1000);
      updates.subscriptionStartDate = currentTime;
      console.log(`updateUserPlan: User ${uid} ${newPlan} plan will expire on: ${updates.expiresAt}`);
  } else { // For 'free' or unexpected plans, ensure expiry is null
      updates.expiresAt = null;
      updates.subscriptionStartDate = null;
  }
  
  // Mark hasReceivedInitialFreeMinutes as true upon any paid plan purchase
  updates.hasReceivedInitialFreeMinutes = true;
  // Reset totalMinutesUsed for paid plans, as they get unlimited
  updates.totalMinutesUsed = 0; 

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

    // Check expiry for ALL paid plans (temporary and premium one-time purchases)
    const allPaidPlans = ['One-Day Plan', 'Three-Day Plan', 'One-Week Plan', 'Monthly Plan', 'Yearly Plan'];
    
    if (allPaidPlans.includes(userProfile.plan)) {
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
      console.log(`✅ Free plan user - ${estimatedDurationMinutes} minutes within ${remainingFreeMinutes} remaining. Allowing transcription. `);
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

  const currentTime = new Date(); // Get current time once

  // Only track usage for 'free' plans who haven't exhausted their initial free minutes yet
  if (userProfile.plan === 'free' && !userProfile.hasReceivedInitialFreeMinutes) {
    const durationMinutes = Math.ceil(durationSeconds / 60);
    const newTotalMinutesUsed = (userProfile.totalMinutesUsed || 0) + durationMinutes;

    await updateDoc(userRef, {
      totalMinutesUsed: newTotalMinutesUsed,
      // Mark as received if they've used 30+ minutes or if the new total reaches 30
      hasReceivedInitialFreeMinutes: newTotalMinutesUsed >= 30, 
      lastAccessed: currentTime, // Use concrete Date object
    });
    console.log(`📊 User ${uid} (free plan): Updated totalMinutesUsed by ${durationMinutes} mins to ${newTotalMinutesUsed} mins. Remaining: ${Math.max(0, 30 - newTotalMinutesUsed)} mins.`);
  } else if (userProfile.plan !== 'free') { // For paid plans, just update lastAccessed
    await updateDoc(userRef, {
      lastAccessed: currentTime, // Use concrete Date object
    });
    console.log(`📊 User ${uid} (${userProfile.plan} plan): Usage not tracked for this plan type. Updating lastAccessed.`);
  }
};

// Save transcription to Firestore (UPDATED to save to top-level collection with userId)
export const saveTranscription = async (uid, fileName, transcriptionText, duration, jobId, ownerUid) => {
  // Use the top-level 'transcriptions' collection directly
  const transcriptionsCollectionRef = collection(db, TRANSCRIPTIONS_COLLECTION); 
  const newTranscriptionRef = doc(transcriptionsCollectionRef, jobId); // Use jobId as document ID
  
  const currentTime = new Date(); // Get current time once

  const transcriptionData = {
    fileName,
    transcriptionText, // Changed 'text' to 'transcriptionText' for consistency
    duration,
    userId: ownerUid, // Use the passed ownerUid here
    createdAt: currentTime, // Use concrete Date object
    expiresAt: new Date(currentTime.getTime() + 7 * 24 * 60 * 60 * 1000) // Transcriptions expire in 7 days
  };

  await setDoc(newTranscriptionRef, transcriptionData);
  console.log("Transcription saved to Firestore with ID: ", newTranscriptionRef.id);
  return newTranscriptionRef.id;
};

// Fetch user's transcriptions (UPDATED to query top-level collection by userId)
export const fetchUserTranscriptions = async (uid) => {
  const transcriptionsCollectionRef = collection(db, TRANSCRIPTIONS_COLLECTION); // Query top-level collection
  const q = query(
    transcriptionsCollectionRef,
    where("userId", "==", uid), // Filter by userId
    where("expiresAt", ">", new Date()),
    orderBy("createdAt", "desc")
  );
  const querySnapshot = await getDocs(q);
  const transcriptions = [];
  querySnapshot.forEach((document) => { // Renamed doc to document to avoid conflict with doc import
    const data = document.data();
    if (data.createdAt && typeof data.createdAt.toDate === 'function') {
        data.createdAt = data.createdAt.toDate();
    } else if (data.createdAt && !(data.createdAt instanceof Date)) { // Handle non-Firestore Timestamp dates
      data.createdAt = new Date(data.createdAt);
    }
    if (data.expiresAt && typeof data.expiresAt.toDate === 'function') {
        data.expiresAt = data.expiresAt.toDate();
    } else if (data.expiresAt && !(data.expiresAt instanceof Date)) { // Handle non-Firestore Timestamp dates
      data.expiresAt = new Date(data.expiresAt);
    }
    transcriptions.push({ id: document.id, ...data });
  });
  return transcriptions;
};

// NEW: Fetch all transcriptions for admin dashboard
export const fetchAllTranscriptions = async () => {
  const transcriptionsCollectionRef = collection(db, TRANSCRIPTIONS_COLLECTION);
  const q = query(transcriptionsCollectionRef, orderBy("createdAt", "desc"));
  const querySnapshot = await getDocs(q);
  const allTranscriptions = {}; // Object to store aggregated data by userId
  
  querySnapshot.forEach((document) => {
    const data = document.data();
    const userId = data.userId;

    if (!allTranscriptions[userId]) {
      allTranscriptions[userId] = {
        totalMinutesTranscribed: 0,
        totalTranscripts: 0
      };
    }
    allTranscriptions[userId].totalMinutesTranscribed += Math.ceil((data.duration || 0) / 60);
    allTranscriptions[userId].totalTranscripts += 1;
  });
  return allTranscriptions; // Returns an object where keys are userIds and values are aggregated stats
};


// Update a specific transcription (UPDATED to work with top-level collection)
export const updateTranscription = async (uid, transcriptionId, newData) => {
  // Directly reference the document in the top-level 'transcriptions' collection
  const transcriptionRef = doc(db, TRANSCRIPTIONS_COLLECTION, transcriptionId); 
  await updateDoc(transcriptionRef, newData);
  console.log("Transcription updated:", transcriptionId);
};

// Delete a specific transcription (UPDATED to work with top-level collection)
export const deleteTranscription = async (uid, transcriptionId) => {
  // Directly reference the document in the top-level 'transcriptions' collection
  const transcriptionRef = doc(db, TRANSCRIPTIONS_COLLECTION, transcriptionId); 
  await deleteDoc(transcriptionRef);
  console.log("Transcription deleted:", transcriptionId);
};

// NEW: Save user feedback to Firestore
export const saveFeedback = async (name, email, feedbackText) => {
  const feedbackCollectionRef = collection(db, FEEDBACK_COLLECTION);
  await addDoc(feedbackCollectionRef, { // Use addDoc to auto-generate ID
    name: name || 'Anonymous', // Name is optional
    email: email,
    feedback: feedbackText,
    createdAt: new Date(),
  });
  console.log("Feedback saved to Firestore.");
};

// NEW: Update Monthly Revenue (called by backend webhook)
export const updateMonthlyRevenue = async (amount) => {
  const adminStatsRef = doc(db, ADMIN_STATS_DOC);
  
  try {
    await runTransaction(db, async (transaction) => {
      const adminStatsDoc = await transaction.get(adminStatsRef);
      let currentMonthlyRevenue = 0;
      if (adminStatsDoc.exists()) {
        currentMonthlyRevenue = adminStatsDoc.data().monthlyRevenue || 0;
      }
      const newMonthlyRevenue = currentMonthlyRevenue + amount;
      transaction.set(adminStatsRef, { monthlyRevenue: newMonthlyRevenue, lastUpdated: new Date() }, { merge: true });
      console.log(`📊 Monthly Revenue updated by ${amount} to ${newMonthlyRevenue}`);
    });
    return { success: true };
  } catch (e) {
    console.error("Error updating monthly revenue:", e);
    return { success: false, error: e.message };
  }
};

// NEW: Get Monthly Revenue for Admin Dashboard
export const getMonthlyRevenue = async () => {
  const adminStatsRef = doc(db, ADMIN_STATS_DOC);
  try {
    const docSnap = await getDoc(adminStatsRef);
    if (docSnap.exists()) {
      return docSnap.data().monthlyRevenue || 0;
    }
    return 0; // Default if document doesn't exist
  } catch (e) {
    console.error("Error fetching monthly revenue:", e);
    return 0;
  }
};

// NEW: Fetch all users with their aggregated transcription data
export const fetchAllUsers = async () => {
  const usersRef = collection(db, USERS_COLLECTION);
  const usersSnapshot = await getDocs(usersRef);
  const usersData = [];

  const allTranscriptions = await fetchAllTranscriptions(); // Fetch aggregated transcription data

  usersSnapshot.forEach((doc) => {
    const userData = doc.data();
    // Ensure createdAt is a Date object for sorting/filtering
    if (userData.createdAt && typeof userData.createdAt.toDate === 'function') {
      userData.createdAt = userData.createdAt.toDate();
    } else if (userData.createdAt && !(userData.createdAt instanceof Date)) {
      userData.createdAt = new Date(userData.createdAt);
    }
    // Also ensure totalMinutesUsed and hasReceivedInitialFreeMinutes are present
    userData.totalMinutesUsed = typeof userData.totalMinutesUsed === 'number' ? userData.totalMinutesUsed : 0;
    userData.hasReceivedInitialFreeMinutes = typeof userData.hasReceivedInitialFreeMinutes === 'boolean' ? userData.hasReceivedInitialFreeMinutes : false;
    
    // Augment user data with transcription stats
    const userTranscriptionStats = allTranscriptions[userData.uid] || { totalMinutesTranscribed: 0, totalTranscripts: 0 };
    
    usersData.push({ 
      id: doc.id, 
      ...userData,
      totalMinutesTranscribedByUser: userTranscriptionStats.totalMinutesTranscribed,
      totalTranscriptsByUser: userTranscriptionStats.totalTranscripts
    });
  });
  return usersData;
};
