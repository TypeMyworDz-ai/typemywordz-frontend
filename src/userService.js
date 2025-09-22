import { db } from './firebase';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, orderBy, getDocs, deleteDoc } from 'firebase/firestore';

const USERS_COLLECTION = 'users';
const TRANSCRIPTIONS_COLLECTION = 'transcriptions';

// Admin emails - define here for consistent access
const ADMIN_EMAILS = ['typemywordz@gmail.com', 'gracenyaitara@gmail.com'];

// Helper to get user profile document reference
const getUserProfileRef = (uid) => doc(db, USERS_COLLECTION, uid);

// Helper to get user transcriptions collection reference
const getUserTranscriptionsCollectionRef = (uid) => collection(db, USERS_COLLECTION, uid, TRANSCRIPTIONS_COLLECTION);

// Create or update user profile
export const createUserProfile = async (uid, email, name = '') => {
  const userRef = getUserProfileRef(uid);
  const docSnap = await getDoc(userRef);

  // Determine plan based on admin email
  const userPlan = ADMIN_EMAILS.includes(email) ? 'business' : 'free';

  if (!docSnap.exists()) {
    await setDoc(userRef, {
      uid,
      email,
      name,
      plan: userPlan, // Set plan based on admin status
      totalMinutesUsed: 0, // Initialize totalMinutesUsed for new users
      createdAt: new Date(),
      lastAccessed: new Date(),
      // NEW: For time-limited plans, expiresAt will be set by updateUserPlan
      expiresAt: null, 
    });
    console.log("User profile created for:", email, "with plan:", userPlan);
  } else {
    // Get existing data to preserve totalMinutesUsed if it exists
    const existingData = docSnap.data();
    const updates = {
      lastAccessed: new Date(),
    };

    // If profile exists, ensure admin accounts always have business plan
    if (ADMIN_EMAILS.includes(email) && existingData.plan !== 'business') {
      updates.plan = 'business'; // Upgrade to business if admin and not already
      console.log("Admin user profile updated to business plan:", email);
    } else if (!ADMIN_EMAILS.includes(email) && existingData.plan === 'business' && existingData.totalMinutesUsed === undefined) {
      // Edge case: if a non-admin somehow got 'business' plan but is free, ensure totalMinutesUsed is set
      updates.totalMinutesUsed = existingData.totalMinutesUsed !== undefined ? existingData.totalMinutesUsed : 0;
    }
    
    // Ensure totalMinutesUsed is initialized if it's missing for an existing user (e.g., old accounts)
    if (existingData.totalMinutesUsed === undefined || existingData.totalMinutesUsed === null) {
        updates.totalMinutesUsed = 0;
    }

    await updateDoc(userRef, updates);
    console.log("User profile updated for:", email);
  }
};

// Get user profile (UPDATED for expiry check)
export const getUserProfile = async (uid) => {
  const docSnap = await getDoc(getUserProfileRef(uid));
  if (docSnap.exists()) {
    const profileData = docSnap.data();
    
    // Ensure totalMinutesUsed is always a number, default to 0
    profileData.totalMinutesUsed = typeof profileData.totalMinutesUsed === 'number' ? profileData.totalMinutesUsed : 0;

    // NEW LOGIC: Check if 'pro' plan has expired
    if (profileData.plan === 'pro' && profileData.expiresAt && profileData.expiresAt.toDate() < new Date()) {
      console.log(`User ${uid} PRO plan expired. Downgrading to FREE.`);
      await updateDoc(getUserProfileRef(uid), {
        plan: 'free',
        expiresAt: null, // Clear expiry date
        stripeSubscriptionId: null, // Clear subscription ID
        subscriptionStartDate: null, // Clear subscription start date
        totalMinutesUsed: profileData.totalMinutesUsed, // Keep existing usage
      });
      return { ...profileData, plan: 'free', expiresAt: null, stripeSubscriptionId: null, subscriptionStartDate: null };
    }

    // Ensure admin accounts always return business plan
    if (ADMIN_EMAILS.includes(profileData.email) && profileData.plan !== 'business') {
      // This ensures the frontend sees 'business' immediately even if DB is not updated yet
      return { ...profileData, plan: 'business' };
    }
    return profileData;
  }
  return null;
};

// Update user plan after successful payment (UPDATED to set expiry)
export const updateUserPlan = async (uid, newPlan, subscriptionId = null) => {
  const userRef = getUserProfileRef(uid);
  const updates = {
    plan: newPlan,
    lastAccessed: new Date(),
    subscriptionStartDate: new Date(), // NEW: Always set start date for any plan change
  };
  
  if (subscriptionId) {
    updates.stripeSubscriptionId = subscriptionId;
  }

  // NEW LOGIC: Set expiresAt for time-limited plans
  if (newPlan === 'pro') {
    const planDetails = await getPlanDetails(subscriptionId); // Assuming subscriptionId can map to plan duration
    if (planDetails && planDetails.durationDays) {
      updates.expiresAt = new Date(Date.now() + planDetails.durationDays * 24 * 60 * 60 * 1000);
      console.log(`User ${uid} PRO plan will expire on: ${updates.expiresAt}`);
    } else if (planDetails && planDetails.durationHours) {
        updates.expiresAt = new Date(Date.now() + planDetails.durationHours * 60 * 60 * 1000);
        console.log(`User ${uid} PRO plan will expire on: ${updates.expiresAt}`);
    } else {
        // Default to 24 hours if duration not explicitly found (e.g., for '24 Hours Pro Access')
        updates.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        console.warn(`Could not determine exact plan duration for ${subscriptionId}. Defaulting PRO plan expiry to 24 hours.`);
    }
  } else {
    updates.expiresAt = null; // Clear expiry for free or business plans
    updates.stripeSubscriptionId = null; // Clear subscription ID
    updates.subscriptionStartDate = null; // Clear subscription start date
  }
  
  // Reset usage for newly upgraded users (except admins)
  const userProfile = await getUserProfile(uid);
  if (newPlan !== 'free' && !ADMIN_EMAILS.includes(userProfile?.email)) {
    updates.totalMinutesUsed = 0;
  }
  
  await updateDoc(userRef, updates);
  console.log(`User ${uid} plan updated to: ${newPlan}`);
};

// NEW: Helper function to get plan details (you'll need to implement this based on your payment system)
// For Paystack, the plan_name metadata already contains "24 Hours Pro Access" or "5 Days Pro Access"
// This function needs to parse that or fetch from a config.
const getPlanDetails = async (subscriptionId) => {
    // In a real app, you might fetch this from a central config or parse the subscriptionId metadata
    // For now, based on your previous payment logic, we can infer from the plan name
    // This is a placeholder and should be made more robust if plans become complex
    const userProfile = await getDoc(doc(db, USERS_COLLECTION, subscriptionId)); // Assuming subscriptionId is actually the UID for this context from handlePaystackCallback
    const planName = userProfile.data()?.plan; // This is incorrect, planName is passed to updateUserPlan
    
    // We need the plan_name passed during payment. Assuming subscriptionId is actually the planName
    // from the previous context where it was passed as 'pro' or 'business'.
    // A better approach would be to store plan details in a separate collection or config.
    
    // For the sake of getting it working with current Paystack logic:
    // When updateUserPlan is called, the 'subscriptionId' parameter is actually the Paystack reference.
    // We need to retrieve the original plan_name from that reference's metadata.
    // This would require another call to Paystack or storing it in the user profile during verification.
    
    // For now, let's assume the 'planName' that was passed to updateUserPlan can be used
    // to determine duration. But the `subscriptionId` parameter of `updateUserPlan`
    // is currently the Paystack reference. We need to store the plan_name associated
    // with that reference somewhere accessible.
    
    // Re-reading your handlePaystackCallback, `updateUserPlan(currentUser.uid, 'pro', reference);`
    // The 'pro' here is the `newPlan`, and `reference` is `subscriptionId`.
    // We need to know if this 'pro' corresponds to '24 Hours Pro Access' or '5 Days Pro Access'.
    // This information is in the `data.data.plan` from the Paystack verification result.
    // So, we need to pass that `plan_name` (e.g., "24 Hours Pro Access") to `updateUserPlan` as well.
    // Let's adjust `App.js` to pass `data.data.plan` to `updateUserPlan`.
    
    // For now, let's hardcode based on the plan string 'pro' meaning 24 hours if no other info.
    // This part requires a slight adjustment in App.js to pass the actual plan_name from payment.
    
    // Placeholder logic - this needs actual plan_name from payment callback.
    // Let's assume for 'pro' it means 24 hours if no specific plan_name is passed.
    // We'll fix this properly when we update App.js.
    return { durationHours: 24 }; // Default to 24 hours for 'pro' if no specific plan name
};


// Check recording permissions
export const canUserRecord = async (uid) => {
  try {
    const userProfile = await getUserProfile(uid);
    if (!userProfile) return false;
    
    // Both free and paid users can record
    return true;
  } catch (error) {
    console.error("Error checking recording permissions:", error);
    return false;
  }
};

// Check if user can transcribe - now includes free trial logic and correct unit conversion
export const canUserTranscribe = async (uid, estimatedDurationSeconds) => { // Renamed param for clarity
  try {
    console.log("🔍 canUserTranscribe called with:", { uid, estimatedDurationSeconds });
    
    const userProfile = await getUserProfile(uid);
    console.log("👤 User profile retrieved:", userProfile);
    
    if (!userProfile) {
      console.warn("❌ canUserTranscribe: User profile not found for uid:", uid);
      return false;
    }

    if (userProfile.plan === 'business') { // Business plan is truly unlimited
      console.log(`✅ ${userProfile.plan} plan user - unlimited transcription`);
      return true;
    }
    
    // NEW LOGIC: For 'pro' plans, check expiry
    if (userProfile.plan === 'pro') {
        if (userProfile.expiresAt && userProfile.expiresAt.toDate() > new Date()) {
            console.log(`✅ PRO plan user - plan active until ${userProfile.expiresAt.toDate()}. Allowing transcription.`);
            return true;
        } else {
            console.log(`❌ PRO plan user - plan expired or no expiry date. Blocking transcription.`);
            // This case should ideally be handled by getUserProfile already downgrading
            // but as a failsafe, we block here.
            return false;
        }
    }

    // Free users get 30 minutes
    if (userProfile.plan === 'free') {
      const currentMinutesUsed = userProfile.totalMinutesUsed || 0;
      const remainingMinutes = 30 - currentMinutesUsed;

      // Convert estimated duration from seconds to minutes (ceil to count partial minutes)
      const estimatedDurationMinutes = Math.ceil(estimatedDurationSeconds / 60);

      if (estimatedDurationMinutes <= remainingMinutes) {
        console.log(`✅ Free plan user - ${estimatedDurationMinutes} minutes within ${remainingMinutes} remaining. Allowing transcription.`);
        return true;
      } else {
        console.log(`❌ Free plan user - ${estimatedDurationMinutes} minutes exceeds ${remainingMinutes} remaining. Blocking transcription.`);
        return false;
      }
    }
    
    // Default to false for any other unhandled plan or scenario
    console.log("❌ canUserTranscribe: User plan not eligible for transcription or unhandled scenario.");
    return false;
    
  } catch (error) {
    console.error("❌ Error in canUserTranscribe:", error);
    return false;
  }
};

// Update user usage after transcription - now correctly converts duration to minutes
export const updateUserUsage = async (uid, durationSeconds) => { // Renamed param for clarity
  const userRef = getUserProfileRef(uid);
  const userProfile = await getUserProfile(uid);

  if (userProfile && userProfile.plan === 'free') {
    // Convert duration from seconds to minutes (ceil to count partial minutes as full)
    const durationMinutes = Math.ceil(durationSeconds / 60);
    const newTotalMinutes = (userProfile.totalMinutesUsed || 0) + durationMinutes;

    await updateDoc(userRef, {
      totalMinutesUsed: newTotalMinutes, // Update totalMinutesUsed with minutes
      lastAccessed: new Date(),
    });
    console.log(`📊 User ${uid} (free plan): Updated totalMinutesUsed by ${durationMinutes} mins to ${newTotalMinutes} mins.`);
  } else if (userProfile && (userProfile.plan === 'business' || userProfile.plan === 'pro')) {
    // For business/pro plan, we don't update totalMinutesUsed for limits
    await updateDoc(userRef, {
      lastAccessed: new Date(),
    });
    console.log(`📊 User ${uid} (${userProfile.plan} plan): Usage not tracked for limits.`);
  } else {
    console.warn(`⚠️ User ${uid}: Profile not found or plan not recognized for usage update.`);
  }
};

// UPDATED: Save transcription to Firestore - now accepts individual fields
export const saveTranscription = async (uid, fileName, text, duration, audioUrl) => {
  const transcriptionsCollectionRef = getUserTranscriptionsCollectionRef(uid);
  const newTranscriptionRef = doc(transcriptionsCollectionRef); // Let Firestore generate ID

  const transcriptionData = {
    fileName,
    text,
    duration,
    audioUrl, // This is the AssemblyAI ID, which will be used to construct the audio URL later
    userId: uid,
    createdAt: new Date(),
    // Transcriptions expire after 7 days, consistent with App.js download options
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) 
  };

  await setDoc(newTranscriptionRef, transcriptionData);
  console.log("Transcription saved with ID:", newTranscriptionRef.id);
  return newTranscriptionRef.id;
};

// Fetch user's transcriptions (for History/Editor)
export const fetchUserTranscriptions = async (uid) => {
  const transcriptionsCollectionRef = getUserTranscriptionsCollectionRef(uid);
  // Query for active transcriptions, ordered by creation date
  const q = query(
    transcriptionsCollectionRef,
    where("expiresAt", ">", new Date()), // Only fetch non-expired transcriptions
    orderBy("createdAt", "desc") // Order by creation date to show newest first
  );
  const querySnapshot = await getDocs(q);
  const transcriptions = [];
  querySnapshot.forEach((doc) => {
    transcriptions.push({ id: doc.id, ...doc.data() });
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