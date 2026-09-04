import { db } from './firebase';
import { isAdminEmail, isCompAccessEmail } from './adminEmails';
import { usableTopUpCredits } from './creditsService';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, orderBy, getDocs, deleteDoc, addDoc, runTransaction } from 'firebase/firestore'; // Keep serverTimestamp just in case for other uses, but we'll manually set for this fix

// Length of the free trial, in minutes. Kept small deliberately: it is
// enough for a new client to judge the quality, and not enough to be worth
// abusing with throwaway accounts.
export const FREE_TRIAL_MINUTES = 5;

// How much transcription each paid plan includes, in minutes.
//
// Until now every paid plan was unlimited, which meant a single heavy user
// could cost more than they paid. These allowances are set well above what a
// normal client uses in the life of the plan, so ordinary use is unaffected;
// they only stop the rare case that loses money.
export const PLAN_ALLOWANCE_MINUTES = {
  'One-Day Plan': 4 * 60,
  'Three-Day Plan': 8 * 60,
  'One-Week Plan': 15 * 60,
  'Monthly Plan': 25 * 60,
  'Yearly Plan': 25 * 60, // per month, rolled over below
};

// The yearly plan's allowance is monthly, but its expiry is a year away, so
// the counter has to be rolled forward every 30 days. Rather than run a
// scheduled job, we work it out whenever we look at the profile: if the
// current period started more than 30 days ago, the used counter is treated
// as zero and reset the next time usage is written.
const ALLOWANCE_PERIOD_DAYS = 30;
const PERIOD_PLANS = ['Yearly Plan'];

const toDate = (v) => (v && typeof v.toDate === 'function' ? v.toDate() : v ? new Date(v) : null);

// Has the yearly plan's 30-day window rolled over since we last counted?
export const allowancePeriodElapsed = (profile, now = new Date()) => {
  if (!profile || !PERIOD_PLANS.includes(profile.plan)) return false;
  const start = toDate(profile.allowancePeriodStart) || toDate(profile.subscriptionStartDate);
  if (!start) return false;
  const days = (now.getTime() - start.getTime()) / 86400000;
  return days >= ALLOWANCE_PERIOD_DAYS;
};

// Minutes included with this profile's plan. A minutesAllowance field on the
// profile wins if present, which is how a top-up purchase adds minutes
// without needing any change to the plan itself. Returns null for a plan with
// no cap at all.
export const allowanceForProfile = (profile) => {
  if (!profile) return null;
  if (typeof profile.minutesAllowance === 'number' && profile.minutesAllowance > 0) {
    return profile.minutesAllowance;
  }
  const base = PLAN_ALLOWANCE_MINUTES[profile.plan];
  return typeof base === 'number' ? base : null;
};

// Minutes already used against the current allowance.
export const usedMinutesForProfile = (profile, now = new Date()) => {
  if (!profile) return 0;
  if (allowancePeriodElapsed(profile, now)) return 0;
  return profile.totalMinutesUsed || 0;
};

// Minutes still available. Returns null when the plan has no cap.
export const remainingMinutesForProfile = (profile, now = new Date()) => {
  const allowance = allowanceForProfile(profile);
  if (allowance === null) return null;
  return Math.max(0, allowance - usedMinutesForProfile(profile, now));
};

// Where the backend lives. Same source of truth as App.js.
const RAILWAY_BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';

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
      hasReceivedInitialFreeMinutes: false, // New users start with the free trial available
      createdAt: currentTime, // Use concrete Date object
      lastAccessed: currentTime, // Use concrete Date object
      expiresAt: null, 
      subscriptionStartDate: null,
    });
    console.log("User profile created for:", email, "with plan:", userPlan);

    // Brand new account, so send the one-off welcome email. This is
    // deliberately fire-and-forget: if the email provider is slow or down the
    // client still gets straight into the app, and nothing here can throw.
    try {
      fetch(`${RAILWAY_BACKEND_URL}/api/send-welcome-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name }),
      }).catch(() => {});
    } catch (e) {
      // Never let a welcome email get in the way of signing up.
    }
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
    
    // Calculate remaining free minutes - only granted if the user has not used the trial yet
    if (profileData.plan === 'free' && !profileData.hasReceivedInitialFreeMinutes) {
      profileData.freeMinutesRemaining = Math.max(0, FREE_TRIAL_MINUTES - profileData.totalMinutesUsed);
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
  // A new purchase starts the included minutes again from zero, and begins a
  // new 30-day window for the yearly plan. Any top-up minutes bought against
  // the previous plan are cleared with it.
  updates.totalMinutesUsed = 0;
  updates.allowancePeriodStart = new Date();
  updates.minutesAllowance = null; 

  await updateDoc(userRef, updates);
  console.log(`User ${uid} plan updated to: ${newPlan}`);
};

// Add extra minutes to a client whose plan allowance has run out, so that
// reaching the cap is something they can buy their way past rather than a
// wall. The extra minutes sit on top of whatever the plan already included
// and are cleared when a new plan is bought.
export const addTopUpMinutes = async (uid, extraMinutes) => {
  const minutes = Number(extraMinutes);
  if (!uid || !Number.isFinite(minutes) || minutes <= 0) {
    throw new Error('addTopUpMinutes needs a positive number of minutes.');
  }
  const userRef = getUserProfileRef(uid);
  const userProfile = await getUserProfile(uid);
  if (!userProfile) throw new Error('Profile not found.');

  const current = allowanceForProfile(userProfile);
  if (current === null) return; // no cap to top up

  await updateDoc(userRef, {
    minutesAllowance: current + minutes,
    lastAccessed: new Date(),
  });
  console.log(`User ${uid}: topped up by ${minutes} min, allowance now ${current + minutes} min.`);
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
export const canUserTranscribe = async (uid, estimatedDurationSeconds, userEmail = null) => {
  try {
    console.log("canUserTranscribe called with:", { uid, estimatedDurationSeconds, userEmail });

    // The admin account is never limited by plan or free-trial rules.
    if (isAdminEmail(userEmail)) {
      console.log("canUserTranscribe: admin account, bypassing plan checks.");
      return { canTranscribe: true, reason: 'admin' };
    }
    // Complimentary accounts also transcribe without paying. They are not
    // admins, so they are checked separately and get their own reason code.
    if (isCompAccessEmail(userEmail)) {
      console.log("canUserTranscribe: complimentary account, bypassing plan checks.");
      return { canTranscribe: true, reason: 'complimentary' };
    }
    
    const userProfile = await getUserProfile(uid);
    console.log("canUserTranscribe - User profile retrieved:", JSON.parse(JSON.stringify(userProfile)));
    
    if (!userProfile) {
      console.warn("canUserTranscribe: User profile not found for uid:", uid);
      return { canTranscribe: false, reason: 'profile_not_found' };
    }

    // Check expiry for ALL paid plans (temporary and premium one-time purchases)
    const allPaidPlans = ['One-Day Plan', 'Three-Day Plan', 'One-Week Plan', 'Monthly Plan', 'Yearly Plan'];
    
    if (allPaidPlans.includes(userProfile.plan)) {
        if (userProfile.expiresAt && userProfile.expiresAt > new Date()) {
            // The plan is live. Check what is left of the included minutes.
            const remaining = remainingMinutesForProfile(userProfile);
            const estimatedDurationMinutes = Math.ceil(estimatedDurationSeconds / 60);

            if (remaining !== null && estimatedDurationMinutes > remaining) {
              // Bought credits top the plan up, so spend those rather than blocking.
              const boughtSpare = usableTopUpCredits(userProfile);
              if (boughtSpare >= estimatedDurationMinutes) {
                console.log(` plan allowance short but ${boughtSpare} bought credits cover ${estimatedDurationMinutes}. Allowing.`);
                return {
                  canTranscribe: true,
                  reason: 'topup_credits',
                  remainingMinutes: boughtSpare,
                  requiredMinutes: estimatedDurationMinutes,
                };
              }
              console.log(` ${userProfile.plan} plan user - ${estimatedDurationMinutes} min needed, ${remaining} min left of the plan allowance. Blocking.`);
              return {
                canTranscribe: false,
                reason: 'plan_allowance_exhausted',
                remainingMinutes: remaining,
                requiredMinutes: estimatedDurationMinutes,
                allowanceMinutes: allowanceForProfile(userProfile),
                canTopUp: true,
                redirectToPricing: true,
              };
            }

            console.log(` ${userProfile.plan} plan user - plan active, ${remaining === null ? 'no cap' : remaining + ' min left'}. Allowing transcription.`);
            return {
              canTranscribe: true,
              reason: 'paid_plan_active',
              remainingMinutes: remaining,
              requiredMinutes: estimatedDurationMinutes,
            };
        } else {
            // The plan has run out, but bought credits outlive a plan, so
            // check those before turning anyone away.
            const boughtAfterExpiry = usableTopUpCredits(userProfile);
            const neededAfterExpiry = Math.ceil(estimatedDurationSeconds / 60);
            if (boughtAfterExpiry >= neededAfterExpiry) {
              console.log(` plan expired but ${boughtAfterExpiry} bought credits cover ${neededAfterExpiry}. Allowing.`);
              return {
                canTranscribe: true,
                reason: 'topup_credits',
                remainingMinutes: boughtAfterExpiry,
                requiredMinutes: neededAfterExpiry,
              };
            }
            console.log(` ${userProfile.plan} plan user - plan expired. Blocking transcription.`);
            // Automatically downgrade happens in getUserProfile, so this is just a final check
            return { canTranscribe: false, reason: 'plan_expired', redirectToPricing: true };
        }
    }

    // Free plan logic
    if (userProfile.plan === 'free') {
      const remainingFreeMinutes = userProfile.freeMinutesRemaining || 0;
      const estimatedDurationMinutes = Math.ceil(estimatedDurationSeconds / 60);

      // Someone with no plan may still have bought credits, and those are
      // theirs to spend. This is checked BEFORE the free-trial rules, because
      // a client who has paid must never be told their free trial is over.
      const boughtFree = usableTopUpCredits(userProfile);
      if (boughtFree >= estimatedDurationMinutes) {
        console.log(`No plan, but ${boughtFree} bought credits cover ${estimatedDurationMinutes}. Allowing.`);
        return {
          canTranscribe: true,
          reason: 'topup_credits',
          remainingMinutes: boughtFree,
          requiredMinutes: estimatedDurationMinutes,
        };
      }

      // Check if user has already used their free trial
      if (userProfile.hasReceivedInitialFreeMinutes) {
        console.log(`Free plan user - already used their ${FREE_TRIAL_MINUTES}-minute trial. Blocking transcription.`);
        return { canTranscribe: false, reason: 'free_trial_exhausted', redirectToPricing: true };
      }

      // Check if the audio duration exceeds remaining minutes
      if (estimatedDurationMinutes > remainingFreeMinutes) {
        console.log(`Free plan user - ${estimatedDurationMinutes} minutes exceeds ${remainingFreeMinutes} remaining. Blocking transcription.`);
        return { 
          canTranscribe: false, 
          reason: 'exceeds_free_limit', 
          remainingMinutes: remainingFreeMinutes, 
          requiredMinutes: estimatedDurationMinutes,
          redirectToPricing: true
        };
      }

      // User can transcribe
      console.log(`Free plan user - ${estimatedDurationMinutes} minutes within ${remainingFreeMinutes} remaining. Allowing transcription. `);
      return { 
        canTranscribe: true, 
        reason: 'within_free_limit', 
        remainingMinutes: remainingFreeMinutes, 
        requiredMinutes: estimatedDurationMinutes 
      };
    }
    
    // Last chance: an unusual plan value, but bought credits are still valid.
    const boughtLast = usableTopUpCredits(userProfile);
    const neededLast = Math.ceil(estimatedDurationSeconds / 60);
    if (boughtLast >= neededLast) {
      return {
        canTranscribe: true,
        reason: 'topup_credits',
        remainingMinutes: boughtLast,
        requiredMinutes: neededLast,
      };
    }
    console.log("canUserTranscribe: User plan not eligible for transcription. Current plan:", userProfile.plan);
    return { canTranscribe: false, reason: 'plan_not_eligible', redirectToPricing: true };
    
  } catch (error) {
    console.error("Error in canUserTranscribe:", error);
    return { canTranscribe: false, reason: 'error', error: error.message };
  }
};

// Update user usage after transcription
export const updateUserUsage = async (uid, durationSeconds) => {
  const userRef = getUserProfileRef(uid);
  const userProfile = await getUserProfile(uid); // Get the latest profile

  if (!userProfile) {
    console.warn(`User ${uid}: Profile not found for usage update.`);
    return;
  }

  const currentTime = new Date(); // Get current time once

  // Only track usage for 'free' plans who haven't exhausted their initial free minutes yet
  if (userProfile.plan === 'free' && !userProfile.hasReceivedInitialFreeMinutes) {
    const durationMinutes = Math.ceil(durationSeconds / 60);
    const newTotalMinutesUsed = (userProfile.totalMinutesUsed || 0) + durationMinutes;

    await updateDoc(userRef, {
      totalMinutesUsed: newTotalMinutesUsed,
      // Mark the trial as spent once the client reaches the free allowance
      hasReceivedInitialFreeMinutes: newTotalMinutesUsed >= FREE_TRIAL_MINUTES, 
      lastAccessed: currentTime, // Use concrete Date object
    });
    console.log(`User ${uid} (free plan): Updated totalMinutesUsed by ${durationMinutes} mins to ${newTotalMinutesUsed} mins. Remaining: ${Math.max(0, FREE_TRIAL_MINUTES - newTotalMinutesUsed)} mins.`);
  } else if (userProfile.plan !== 'free') {
    // Paid plans are no longer unlimited, so their minutes have to be counted
    // as well. If the yearly plan's 30-day window has rolled over, the counter
    // starts again from this job and the window is moved forward.
    const durationMinutes = Math.ceil(durationSeconds / 60);
    const rolled = allowancePeriodElapsed(userProfile, currentTime);
    const base = rolled ? 0 : (userProfile.totalMinutesUsed || 0);
    const newTotalMinutesUsed = base + durationMinutes;

    const updates = {
      totalMinutesUsed: newTotalMinutesUsed,
      lastAccessed: currentTime,
    };
    if (rolled) updates.allowancePeriodStart = currentTime;

    await updateDoc(userRef, updates);
    console.log(`User ${uid} (${userProfile.plan} plan): +${durationMinutes} min, now ${newTotalMinutesUsed} min used${rolled ? ' (new 30-day period)' : ''}.`);
  }
};

// Save transcription to Firestore (UPDATED to save to top-level collection with userId)
// How long a saved transcript is kept before it is cleaned up.
// These must match what the pricing page tells people they are buying:
// 30-day file storage on every plan, 365-day on the yearly one.
export const TRANSCRIPT_RETENTION_DAYS = 30;
export const TRANSCRIPT_RETENTION_DAYS_YEARLY = 365;

export const retentionDaysForPlan = (plan) =>
  plan === 'Yearly Plan' ? TRANSCRIPT_RETENTION_DAYS_YEARLY : TRANSCRIPT_RETENTION_DAYS;

export const saveTranscription = async (uid, fileName, transcriptionText, duration, jobId, ownerUid, segments = null, userPlan = null) => {
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
    // Kept for as long as the person's plan was sold for.
    expiresAt: new Date(
      currentTime.getTime() + retentionDaysForPlan(userPlan) * 24 * 60 * 60 * 1000
    )
  };

  // Keep the per-line timings the service returned, so the proofreading
  // editor can jump the audio to the right place later on. Firestore caps a
  // document at 1MB, so a very long transcript keeps the line starts and
  // drops the rest rather than failing the save outright.
  if (Array.isArray(segments) && segments.length > 0) {
    const lean = segments.map((seg) => ({
      start: Number(seg.start) || 0,
      end: Number(seg.end) || 0,
      speaker: seg.speaker || null,
      text: String(seg.text || ''),
      confidence: typeof seg.confidence === 'number' ? seg.confidence : null
    }));
    const bytes = JSON.stringify(lean).length;
    if (bytes < 700000) {
      transcriptionData.segments = lean;
      transcriptionData.timingsSource = 'service';
    } else {
      console.log('Timings too large to store alongside the transcript, keeping line starts only');
      transcriptionData.segments = lean.map((seg) => ({
        start: seg.start, end: seg.end, speaker: seg.speaker, text: seg.text, confidence: null
      })).filter((seg, i) => i % 2 === 0);
      transcriptionData.timingsSource = 'service-reduced';
    }
  }

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
      console.log(`Monthly Revenue updated by ${amount} to ${newMonthlyRevenue}`);
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

// ===================== Ask TypeMyworDz: saved conversations ================
// Chats are kept so a client can come back to them, the way Claude does.
// Each chat is one document with its messages inside it, which keeps reading a
// conversation to a single fetch.

const ASK_CHATS_COLLECTION = 'askChats';

const chatTitleFrom = (text) => {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  if (!t) return 'New chat';
  return t.length > 60 ? t.slice(0, 60).trimEnd() + '\u2026' : t;
};

// The list shown down the side of the Ask page. Titles and dates only.
export const listAskChats = async (uid) => {
  if (!uid) return [];
  try {
    const q = query(
      collection(db, ASK_CHATS_COLLECTION),
      where('userId', '==', uid),
      orderBy('updatedAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const v = d.data();
      return {
        id: d.id,
        title: v.title || 'New chat',
        updatedAt: v.updatedAt?.toDate ? v.updatedAt.toDate() : v.updatedAt || null,
        messageCount: Array.isArray(v.messages) ? v.messages.length : 0,
      };
    });
  } catch (error) {
    // An index may still be building. Falling back to an unordered read is far
    // better than showing the client an empty history that is not really empty.
    console.warn('listAskChats: ordered read failed, falling back.', error);
    try {
      const q2 = query(collection(db, ASK_CHATS_COLLECTION), where('userId', '==', uid));
      const snap2 = await getDocs(q2);
      return snap2.docs
        .map((d) => {
          const v = d.data();
          return {
            id: d.id,
            title: v.title || 'New chat',
            updatedAt: v.updatedAt?.toDate ? v.updatedAt.toDate() : v.updatedAt || null,
            messageCount: Array.isArray(v.messages) ? v.messages.length : 0,
          };
        })
        .sort((a, b) => (b.updatedAt?.getTime?.() || 0) - (a.updatedAt?.getTime?.() || 0));
    } catch (e2) {
      console.error('listAskChats failed:', e2);
      return [];
    }
  }
};

export const getAskChat = async (chatId) => {
  if (!chatId) return null;
  try {
    const snap = await getDoc(doc(db, ASK_CHATS_COLLECTION, chatId));
    if (!snap.exists()) return null;
    const v = snap.data();
    return { id: snap.id, title: v.title || 'New chat', messages: Array.isArray(v.messages) ? v.messages : [] };
  } catch (error) {
    console.error('getAskChat failed:', error);
    return null;
  }
};

// Create on the first exchange, update on every one after. Returns the id so
// the page can keep writing to the same conversation.
export const saveAskChat = async (uid, chatId, messages) => {
  if (!uid || !Array.isArray(messages) || !messages.length) return chatId || null;
  const firstFromClient = messages.find((m) => m.role === 'user');
  const now = new Date();
  const payload = {
    userId: uid,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    updatedAt: now,
  };
  try {
    if (chatId) {
      await updateDoc(doc(db, ASK_CHATS_COLLECTION, chatId), payload);
      return chatId;
    }
    const created = await addDoc(collection(db, ASK_CHATS_COLLECTION), {
      ...payload,
      title: chatTitleFrom(firstFromClient?.content),
      createdAt: now,
    });
    return created.id;
  } catch (error) {
    console.error('saveAskChat failed:', error);
    return chatId || null;
  }
};

// Rename a conversation. The client chose this name, so it is used exactly as
// typed, only trimmed and length-limited.
export const renameAskChat = async (chatId, title) => {
  const clean = String(title || '').trim().slice(0, 90);
  if (!chatId || !clean) return false;
  try {
    await updateDoc(doc(db, ASK_CHATS_COLLECTION, chatId), { title: clean });
    return true;
  } catch (error) {
    console.error('renameAskChat failed:', error);
    return false;
  }
};

export const deleteAskChat = async (chatId) => {
  if (!chatId) return false;
  try {
    await deleteDoc(doc(db, ASK_CHATS_COLLECTION, chatId));
    return true;
  } catch (error) {
    console.error('deleteAskChat failed:', error);
    return false;
  }
};
