// The app no longer uses Google's Firebase. Sign-in and data go through our own
// backend (see lib/ownauth.js and lib/ownstore.js). This file keeps the old
// import path working for the few screens that still import { auth, db }.
import { auth, googleProvider } from './lib/ownauth';
import { db } from './lib/ownstore';

export { auth, db, googleProvider };
