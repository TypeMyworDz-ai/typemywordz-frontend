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

// Get user profile
export const getUserProfile = async (uid) => {
  const docSnap = await getDoc(getUserProfileRef(uid));
  if (docSnap.exists()) {
    const profileData = docSnap.data();
    
    // Ensure totalMinutesUsed is always a number, default to 0
    profileData.totalMinutesUsed = typeof profileData.totalMinutesUsed === 'number' ? profileData.totalMinutesUsed : 0;

    // Ensure admin accounts always return business plan
    if (ADMIN_EMAILS.includes(profileData.email) && profileData.plan !== 'business') {
      // This ensures the frontend sees 'business' immediately even if DB is not updated yet
      return { ...profileData, plan: 'business' };
    }
    return profileData;
  }
  return null;
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

// FIXED: Check if user can transcribe - now includes free trial logic and correct unit conversion
export const canUserTranscribe = async (uid, estimatedDurationSeconds) => { // Renamed param for clarity
  try {
    console.log("🔍 canUserTranscribe called with:", { uid, estimatedDurationSeconds });
    
    const userProfile = await getUserProfile(uid);
    console.log("👤 User profile retrieved:", userProfile);
    
    if (!userProfile) {
      console.warn("❌ canUserTranscribe: User profile not found for uid:", uid);
      return false;
    }

    if (userProfile.plan === 'business') {
      console.log("✅ Business plan user - unlimited transcription");
      return true;
    }

    // NEW LOGIC: Free users get 30 minutes
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
// FIXED: Update user usage after transcription - now correctly converts duration to minutes
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
  } else if (userProfile && userProfile.plan === 'business') {
    // For business plan, we don't update totalMinutesUsed for limits
    await updateDoc(userRef, {
      lastAccessed: new Date(),
    });
    console.log(`📊 User ${uid} (business plan): Usage not tracked for limits.`);
  } else {
    console.warn(`⚠️ User ${uid}: Profile not found or plan not recognized for usage update.`);
  }
};

// Save transcription to Firestore
export const saveTranscription = async (uid, transcriptionData) => {
  const transcriptionsCollectionRef = getUserTranscriptionsCollectionRef(uid);
  const newTranscriptionRef = doc(transcriptionsCollectionRef); // Let Firestore generate ID

  await setDoc(newTranscriptionRef, {
    ...transcriptionData,
    userId: uid,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // Expires in 24 hours
  });
  console.log("Transcription saved with ID:", newTranscriptionRef.id);
  return newTranscriptionRef.id;
};

// Fetch user's transcriptions (for Dashboard)
export const fetchUserTranscriptions = async (uid) => {
  const transcriptionsCollectionRef = getUserTranscriptionsCollectionRef(uid);
  // Query for active transcriptions, ordered by creation date
  const q = query(
    transcriptionsCollectionRef,
    where("expiresAt", ">", new Date()), // Only fetch non-expired transcriptions
    orderBy("expiresAt", "desc") // Order by expiry to show newer first (or createdAt)
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