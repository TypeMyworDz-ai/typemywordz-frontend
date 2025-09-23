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
    });
    console.log("User profile created for:", email, "with plan:", userPlan);
  } else {
    const existingData = docSnap.data();
    const updates = {
      lastAccessed: new Date(),
    };

    // Ensure admin users always have 'pro' plan with null expiry and 0 minutes used
    if (ADMIN_EMAILS.includes(email)) {
      if (existingData.plan !== 'pro' || existingData.expiresAt !== null) {
        updates.plan = 'pro';
        updates.expiresAt = null;
        updates.subscriptionStartDate = new Date(); // Update start date to current for consistency
        updates.totalMinutesUsed = 0; // Admins don't use up minutes
        console.log(`Admin user profile ${email} updated to PRO plan (unlimited).`);
      } else {
        console.log(`Admin user profile ${email} is already PRO (unlimited).`);
      }
    } else {
        // For non-admin users, ensure totalMinutesUsed is initialized if missing
        if (existingData.totalMinutesUsed === undefined || existingData.totalMinutesUsed === null) {
            updates.totalMinutesUsed = 0;
        }
        // If a non-admin user is on 'free' plan but has old expiry data, reset it
        if (existingData.plan === 'free' && (existingData.expiresAt || existingData.subscriptionStartDate)) {
            updates.expiresAt = null;
            updates.subscriptionStartDate = null;
            console.log(`DEBUG: createUserProfile - Resetting expiry fields for non-admin user ${uid} on free plan.`);
        }
    }

    // Only update if there are actual changes
    if (Object.keys(updates).length > 1 || (Object.keys(updates).length === 1 && updates.lastAccessed)) {
        await updateDoc(userRef, updates);
        console.log("User profile updated for:", email);
    } else {
        console.log("User profile accessed, no significant updates needed for:", email);
    }
  }
};

// Get user profile (UPDATED for robust expiry check and admin 'pro' override)
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

    // Admin logic: always 'pro', no expiry
    if (ADMIN_EMAILS.includes(profileData.email)) {
      if (profileData.plan !== 'pro' || profileData.expiresAt !== null || profileData.totalMinutesUsed !== 0) {
        await updateDoc(userRef, {
          plan: 'pro',
          expiresAt: null,
          subscriptionStartDate: new Date(),
          totalMinutesUsed: 0, // Admins don't use up minutes
        });
        profileData = { ...profileData, plan: 'pro', expiresAt: null, subscriptionStartDate: new Date(), totalMinutesUsed: 0 };
        console.log(`DEBUG: getUserProfile - Admin ${profileData.email} profile forced to PRO (unlimited).`);
      } else {
        console.log(`DEBUG: getUserProfile - Admin ${profileData.email} is already PRO (unlimited).`);
      }
      return profileData;
    }

    // Expiry logic for temporary paid plans
    if (['24 Hours Pro Access', '5 Days Pro Access', '5 Minutes Pro Access'].includes(profileData.plan) && profileData.expiresAt && profileData.expiresAt < currentTime) {
      console.log(`User ${uid} plan '${profileData.plan}' expired on ${profileData.expiresAt}. Downgrading to FREE.`);
      await updateDoc(userRef, {
        plan: 'free',
        expiresAt: null,
        subscriptionStartDate: null,
        // When downgrading, keep existing totalMinutesUsed if they were on a free trial before upgrading
        // or reset if it's a fresh free trial. For now, we'll keep it as is, it's not directly affected by expiry.
      });
      return { ...profileData, plan: 'free', expiresAt: null, subscriptionStartDate: null };
    }
    
    console.log("DEBUG: getUserProfile - Final profileData returned (non-admin):", JSON.parse(JSON.stringify(profileData)));
    return profileData;
  }
  return null;
};

// Update user plan after successful payment
export const updateUserPlan = async (uid, newPlan, referenceId = null) => { // Renamed subscriptionId to referenceId for clarity
  const userRef = getUserProfileRef(uid);
  const updates = {
    plan: newPlan,
    lastAccessed: new Date(),
    paystackReferenceId: referenceId, // Store Paystack reference
  };
  
  let planDurationMinutes = 0; // Use minutes for consistency
  if (newPlan === '5 Minutes Pro Access') {
      planDurationMinutes = 5;
  } else if (newPlan === '24 Hours Pro Access') {
      planDurationMinutes = 24 * 60;
  } else if (newPlan === '5 Days Pro Access') {
      planDurationMinutes = 5 * 24 * 60;
  } else if (newPlan === 'pro') {
      updates.expiresAt = null; // 'pro' plan is typically unlimited
      updates.subscriptionStartDate = new Date();
      console.log(`updateUserPlan: Generic 'pro' plan received for ${uid}. Treating as effectively unlimited.`);
  }

  if (planDurationMinutes > 0 && newPlan !== 'pro') {
      updates.expiresAt = new Date(Date.now() + planDurationMinutes * 60 * 1000); // Calculate expiry in milliseconds
      updates.subscriptionStartDate = new Date();
      console.log(`User ${uid} ${newPlan} plan will expire on: ${updates.expiresAt}`);
      updates.totalMinutesUsed = 0; // Reset minutes used when a temporary paid plan is activated
  } else if (newPlan === 'free') {
      updates.expiresAt = null;
      updates.subscriptionStartDate = null;
      // totalMinutesUsed is handled by getUserProfile or auto-upload logic for free plans
  }
  
  // When upgrading from 'free' to any paid plan, reset totalMinutesUsed
  const userProfile = await getUserProfile(uid);
  if (userProfile?.plan === 'free' && newPlan !== 'free' && !ADMIN_EMAILS.includes(userProfile?.email)) {
    updates.totalMinutesUsed = 0;
    console.log(`User ${uid} upgraded from free, resetting totalMinutesUsed to 0.`);
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
    if (['24 Hours Pro Access', '5 Days Pro Access', '5 Minutes Pro Access'].includes(userProfile.plan)) {
        if (userProfile.expiresAt && userProfile.expiresAt > new Date()) {
            console.log(`✅ ${userProfile.plan} user - plan active. Allowing transcription.`);
            return true;
        } else {
            console.log(`❌ ${userProfile.plan} user - plan expired. Blocking transcription.`);
            // getUserProfile should have already downgraded, but adding this for explicit logging
            return false;
        }
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
  const userProfile = await getUserProfile(uid); // Re-fetch to ensure latest plan status

  if (!userProfile) {
    console.warn(`⚠️ User ${uid}: Profile not found for usage update.`);
    return;
  }

  // Only track usage for 'free' plans
  if (userProfile.plan === 'free') {
    const durationMinutes = Math.ceil(durationSeconds / 60);
    const newTotalMinutes = (userProfile.totalMinutesUsed || 0) + durationMinutes;

    await updateDoc(userRef, {
      totalMinutesUsed: newTotalMinutes,
      lastAccessed: new Date(),
    });
    console.log(`📊 User ${uid} (free plan): Updated totalMinutesUsed by ${durationMinutes} mins to ${newTotalMinutes} mins. Remaining: ${30 - newTotalMinutes} mins.`);
  } else {
    // For paid plans, just update lastAccessed
    await updateDoc(userRef, {
      lastAccessed: new Date(),
    });
    console.log(`📊 User ${uid} (${userProfile.plan} plan): Usage not tracked against free limits.`);
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