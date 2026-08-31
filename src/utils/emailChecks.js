// Checks we run on an email address before letting somebody create an account.
//
// Why this exists: every new account is given five free minutes of transcription.
// Without any checks, one person can farm unlimited free minutes by signing up
// again and again with throwaway addresses.

// Deliberately simple. We are not trying to validate every address the RFC allows,
// we are trying to catch typos before somebody waits for an email that will never come.
const BASIC_SHAPE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export const looksLikeAnEmail = (email) =>
  BASIC_SHAPE.test(String(email || '').trim());

export const domainOf = (email) =>
  String(email || '').trim().toLowerCase().split('@')[1] || '';

// "someone+anything@gmail.com" delivers to "someone@gmail.com". It is a normal
// feature, but it is also the easiest way to claim the free trial over and over
// with what looks like a fresh address each time, so we ask people to sign up
// with their plain address instead.
export const usesPlusAlias = (email) =>
  String(email || '').split('@')[0].includes('+');

// The blocklist is large, so it is only fetched when somebody actually submits
// the create-account form. It is never part of the main download.
export const isDisposableEmail = async (email) => {
  const domain = domainOf(email);
  if (!domain) return false;

  let list;
  try {
    const mod = await import('./disposableDomains');
    list = mod.DISPOSABLE_DOMAINS;
  } catch (err) {
    // If the list cannot be fetched we let the signup through rather than
    // block a real client over a network hiccup.
    console.error('Could not load the disposable-domain list:', err);
    return false;
  }

  // Check the domain itself, then each parent domain, so that a subdomain of a
  // known throwaway host ("inbox.mailinator.com") is caught by "mailinator.com".
  const parts = domain.split('.');
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (list.has(parts.slice(i).join('.'))) return true;
  }
  return false;
};

// Firebase's own messages are written for developers ("auth/invalid-credential").
// Clients get told what actually happened and what to do about it.
export const friendlyAuthError = (error) => {
  const code = (error && error.code) || '';
  switch (code) {
    case 'auth/invalid-email':
      return 'That does not look like a valid email address.';
    case 'auth/email-already-in-use':
      return 'There is already an account with that email. Try signing in instead.';
    case 'auth/weak-password':
      return 'Please choose a password of at least 8 characters.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      // Firebase deliberately blurs these together so that nobody can use the
      // sign-in form to discover which email addresses have accounts. We keep that.
      return 'That email and password do not match an account.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a few minutes and try again.';
    case 'auth/network-request-failed':
      return 'We could not reach the server. Please check your connection and try again.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'The sign-in window was closed before it finished.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.';
    case 'auth/operation-not-allowed':
      return 'That sign-in method is not switched on for this app yet.';
    case 'auth/requires-recent-login':
      return 'Please sign in again before making this change.';
    default:
      return 'Something went wrong. Please try again.';
  }
};

export const MIN_PASSWORD_LENGTH = 8;
