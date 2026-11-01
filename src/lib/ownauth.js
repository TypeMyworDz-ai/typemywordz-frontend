// Sign-in that runs on our own servers (no Google or Firebase involved).
//
// It keeps the same shape the rest of the app already uses, so screens that
// call signInWithEmailAndPassword, onAuthStateChanged, currentUser.getIdToken()
// and friends keep working unchanged.

const API = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';
const STORAGE_KEY = 'tmwd_session_v1';
const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;

export class AuthError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

const readSession = () => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
};

const decodeToken = (token) => {
  try {
    const body = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(window.atob(body));
  } catch (error) {
    return {};
  }
};

let session = typeof window !== 'undefined' ? readSession() : null;
let currentUserObject = null;
let refreshing = null;
const listeners = new Set();

const post = async (path, body, token) => {
  let response;
  try {
    response = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body || {}),
    });
  } catch (error) {
    throw new AuthError('auth/network-request-failed', 'Could not reach the server.');
  }
  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
    payload = null;
  }
  if (!response.ok) {
    const detail = payload && payload.detail;
    if (detail && typeof detail === 'object' && detail.code) throw new AuthError(detail.code, detail.message);
    throw new AuthError(response.status === 429 ? 'auth/too-many-requests' : 'auth/internal-error',
      typeof detail === 'string' ? detail : 'Something went wrong.');
  }
  return payload;
};

const notify = () => {
  const user = auth.currentUser;
  listeners.forEach((callback) => {
    try {
      callback(user);
    } catch (error) {
      console.error('Auth listener failed:', error);
    }
  });
};

const buildUser = (data) => {
  const user = {
    uid: data.uid,
    email: data.email,
    displayName: data.displayName || null,
    emailVerified: !!data.emailVerified,
    photoURL: data.photoURL || null,
    providerData: [],
    isAnonymous: false,
    getIdToken: (force) => getToken(!!force),
    reload: async () => {
      const fresh = await getToken(true);
      return fresh;
    },
  };
  return user;
};

const applySession = (next, announce) => {
  const hadUser = !!(session && session.user);
  const previousUid = session && session.user ? session.user.uid : null;
  session = next;
  try {
    if (next) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    // Private browsing can refuse storage; the session then lasts until the tab closes.
  }
  if (!next) {
    currentUserObject = null;
  } else if (!currentUserObject || currentUserObject.uid !== next.user.uid) {
    currentUserObject = buildUser(next.user);
  } else {
    Object.assign(currentUserObject, {
      email: next.user.email,
      displayName: next.user.displayName || null,
      emailVerified: !!next.user.emailVerified,
      photoURL: next.user.photoURL || null,
    });
  }
  const nowUid = next ? next.user.uid : null;
  if (announce || hadUser !== !!next || previousUid !== nowUid) notify();
};

const getToken = async (force) => {
  if (!session) throw new AuthError('auth/no-current-user', 'Nobody is signed in.');
  const claims = decodeToken(session.token);
  const issued = (claims.iat || 0) * 1000;
  const expires = (claims.exp || 0) * 1000;
  const stale = force || Date.now() - issued > REFRESH_AFTER_MS;
  if (!stale && expires - Date.now() > 60 * 1000) return session.token;
  if (!refreshing) {
    const tokenAtStart = session.token;
    refreshing = fetch(`${API}/auth/refresh`, { method: 'POST', headers: { Authorization: `Bearer ${tokenAtStart}` } })
      .then(async (response) => {
        if (response.status === 401) {
          applySession(null);
          return null;
        }
        if (!response.ok) return null;
        const payload = await response.json();
        applySession({ token: payload.token, user: payload.user });
        return payload.token;
      })
      .catch(() => null)
      .finally(() => { refreshing = null; });
  }
  const fresh = await refreshing;
  if (fresh) return fresh;
  if (session && expires - Date.now() > 0) return session.token;
  throw new AuthError('auth/user-token-expired', 'Your sign-in has expired.');
};

if (typeof window !== 'undefined') {
  // Keep several open tabs in step: signing out in one signs out the rest.
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    applySession(readSession(), true);
  });
  if (session && session.user) currentUserObject = buildUser(session.user);
}

export const auth = {
  get currentUser() {
    return currentUserObject;
  },
};

export class GoogleAuthProvider {
  constructor() {
    this.providerId = 'google.com';
  }
}

export const onAuthStateChanged = (_auth, callback) => {
  listeners.add(callback);
  let cancelled = false;
  Promise.resolve().then(() => {
    if (!cancelled) callback(auth.currentUser);
  });
  // Confirm the stored session in the background; a revoked account signs out.
  if (session && session.token) {
    fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${session.token}` } })
      .then(async (response) => {
        if (cancelled) return;
        if (response.status === 401) {
          applySession(null);
        } else if (response.ok) {
          const payload = await response.json();
          applySession({ token: payload.token, user: payload.user });
        }
      })
      .catch(() => {});
  }
  return () => {
    cancelled = true;
    listeners.delete(callback);
  };
};

export const getRedirectResult = async () => null;

export const signInWithEmailAndPassword = async (_auth, email, password) => {
  const payload = await post('/auth/login', { email, password });
  applySession({ token: payload.token, user: payload.user }, true);
  return { user: auth.currentUser };
};

export const createUserWithEmailAndPassword = async (_auth, email, password, name) => {
  const payload = await post('/auth/register', { email, password, name: name || '' });
  applySession({ token: payload.token, user: payload.user }, true);
  return { user: auth.currentUser };
};

export const signOut = async () => {
  applySession(null, true);
};

export const sendPasswordResetEmail = async (_auth, email) => {
  await post('/auth/forgot', { email });
};

export const sendEmailVerification = async (user) => {
  const token = await user.getIdToken();
  await post('/auth/send-verification', {}, token);
};

export const updateProfile = async (user, changes) => {
  const token = await user.getIdToken();
  const payload = await post('/auth/update-profile', { display_name: (changes && changes.displayName) || '' }, token);
  applySession({ token: payload.token, user: payload.user });
};

export const updatePassword = async (user, newPassword, currentPassword) => {
  const token = await user.getIdToken();
  const payload = await post('/auth/change-password', { current_password: currentPassword || '', new_password: newPassword }, token);
  applySession({ token: payload.token, user: payload.user });
};

// Links from emails: ?reset=TOKEN and ?verify=TOKEN.
export const completePasswordReset = async (token, password) => {
  const payload = await post('/auth/reset', { token, password });
  applySession({ token: payload.token, user: payload.user }, true);
  return { user: auth.currentUser };
};

export const confirmEmailVerification = async (token) => {
  const payload = await post('/auth/verify', { token });
  applySession({ token: payload.token, user: payload.user }, true);
  return { user: auth.currentUser };
};

// Google sign-in is added through signInWithGoogleCredential once the Google
// button is wired; it never blocks the password sign-in above.
export const signInWithGoogleCredential = async (credential) => {
  const payload = await post('/auth/google', { credential });
  applySession({ token: payload.token, user: payload.user }, true);
  return { user: auth.currentUser };
};

const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || '807780122415-p80lhuvfls4g1uce9b6eq5gqe3hp4adu.apps.googleusercontent.com';

const loadGoogleScript = () => new Promise((resolve, reject) => {
  if (window.google && window.google.accounts && window.google.accounts.oauth2) {
    resolve();
    return;
  }
  const existing = document.getElementById('gsi-client');
  if (existing) {
    existing.addEventListener('load', () => resolve());
    existing.addEventListener('error', () => reject(new AuthError('auth/network-request-failed')));
    return;
  }
  const tag = document.createElement('script');
  tag.id = 'gsi-client';
  tag.src = 'https://accounts.google.com/gsi/client';
  tag.async = true;
  tag.onload = () => resolve();
  tag.onerror = () => reject(new AuthError('auth/network-request-failed'));
  document.head.appendChild(tag);
});

// Opens Google's own sign-in window. Our server checks the answer; Google is
// only asked "who is this?" and nothing else depends on it.
export const signInWithGoogleWindow = async () => {
  if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID.startsWith('__')) {
    throw new AuthError('auth/operation-not-allowed', 'Google sign-in is not available right now.');
  }
  await loadGoogleScript();
  const accessToken = await new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: 'openid email profile',
      callback: (response) => {
        if (response && response.access_token) resolve(response.access_token);
        else reject(new AuthError('auth/popup-closed-by-user'));
      },
      error_callback: (err) => {
        reject(new AuthError(err && err.type === 'popup_failed_to_open' ? 'auth/popup-blocked' : 'auth/popup-closed-by-user'));
      },
    });
    client.requestAccessToken();
  });
  return signInWithGoogleCredential(accessToken);
};

export const signInWithPopup = async () => signInWithGoogleWindow();

export const googleProvider = new GoogleAuthProvider();
