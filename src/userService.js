import { db } from './firebase';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, orderBy, limit, getDocs, deleteDoc } from 'firebase/firestore';

const USERS_COLLECTION = 'users';
const TRANSCRIPTIONS_COLLECTION = 'transcriptions'; // New collection for transcriptions

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
      monthlyMinutes: 0,
      createdAt: new Date(),
      lastAccessed: new Date(),
    });
    console.log("User profile created for:", email, "with plan:", userPlan);
  } else {
    // If profile exists, ensure admin accounts always have business plan
    if (ADMIN_EMAILS.includes(email) && docSnap.data().plan !== 'business') {
      await updateDoc(userRef, {
        plan: 'business', // Upgrade to business if admin and not already
        lastAccessed: new Date(),
      });
      console.log("Admin user profile updated to business plan:", email);
    } else {
      await updateDoc(userRef, {
        lastAccessed: new Date(),
      });
      console.log("User profile updated for:", email);
    }
  }
};

// Get user profile
export const getUserProfile = async (uid) => {
  const docSnap = await getDoc(getUserProfileRef(uid));
  if (docSnap.exists()) {
    const profileData = docSnap.data();
    // Ensure admin accounts always return business plan
    if (ADMIN_EMAILS.includes(profileData.email) && profileData.plan !== 'business') {
      // This ensures the frontend sees 'business' immediately even if DB is not updated yet
      return { ...profileData, plan: 'business' };
    }
    return profileData;
  }
  return null;
};

// Check if user can transcribe based on limits
export const canUserTranscribe = async (uid, estimatedDuration) => {
  const userProfile = await getUserProfile(uid);
  if (!userProfile) return false;

  if (userProfile.plan === 'business') {
    return true; // Business plan has unlimited transcription
  }

  const currentMonth = new Date().getMonth();
  const lastAccessedDate = userProfile.lastAccessed ? userProfile.lastAccessed.toDate() : new Date(0); // Default to epoch for safety
  const lastUpdatedMonth = lastAccessedDate.getMonth();

  // Reset monthlyMinutes if new month
  if (currentMonth !== lastUpdatedMonth) {
    await updateDoc(getUserProfileRef(uid), { monthlyMinutes: 0, lastAccessed: new Date() });
    userProfile.monthlyMinutes = 0; // Update local object for current check
  }

  return (userProfile.monthlyMinutes || 0) + estimatedDuration <= 30; // Free tier limit is 30 minutes
};

// Update user usage after transcription
export const updateUserUsage = async (uid, duration) => {
  const userRef = getUserProfileRef(uid);
  const userProfile = await getUserProfile(uid);

  if (userProfile && userProfile.plan === 'free') {
    await updateDoc(userRef, {
      monthlyMinutes: (userProfile.monthlyMinutes || 0) + duration,
      lastAccessed: new Date(),
    });
  } else if (userProfile && userProfile.plan === 'business') {
    // For business plan (admins), we don't update monthlyMinutes for limits
    await updateDoc(userRef, {
      lastAccessed: new Date(),
    });
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

// NOTE: For automatic 24-hour deletion, you would typically use Firebase Cloud Functions
// triggered by a scheduled job or by document creation/update. This client-side code
// only sets the 'expiresAt' field and filters based on it.