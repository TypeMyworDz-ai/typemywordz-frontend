import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  // Use Firebase's native auth domain for the OAuth callback. The custom
  // auth.typemywordz.ai handler currently returns to the app without
  // restoring the Firebase session in this browser. Provider branding still
  // comes from the TypeMyworDz OAuth consent configuration.
  authDomain: 'typemywordz-d7344.firebaseapp.com',
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID, // Optional
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Providers
// Microsoft sign-in was removed (2026-09-20) until the app is verified with
// Microsoft; showing an "unverified" warning to clients mid-signup was
// undermining trust. Google and email/password remain the two sign-in
// options. See googleProvider below.
const googleProvider = new GoogleAuthProvider();

export { auth, db, googleProvider };