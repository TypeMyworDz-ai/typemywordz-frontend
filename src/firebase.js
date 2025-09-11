// src/firebase.js

// Import Firebase tools we need
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Paste your config from Firebase console
const firebaseConfig = {
  apiKey: "AIzaSyBjt0S_qKV7tM2VQ3o-6I-29NhL1TCzr1I", // Your actual values here
  authDomain: "typemywordz-d7344.firebaseapp.com",
  projectId: "typemywordz-d7344",
  storageBucket: "typemywordz-d7344.firebasestorage.app",
  messagingSenderId: "807780122415",
  appId: "1:807780122415:web:6c3c271955c13b53926bda"
};

// Initialize Firebase (like turning on the engine)
const app = initializeApp(firebaseConfig);

// Set up authentication (login system)
export const auth = getAuth(app);

// Set up database (where we'll store user info)
export const db = getFirestore(app);