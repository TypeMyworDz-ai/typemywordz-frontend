// Talking to the credit ledger on the server.
//
// The server is the only thing that decides what an account can spend. This
// module never works a balance out for itself; it asks, and shows the answer.
// That matters because the same numbers decide whether work gets done, and a
// balance calculated in the browser could be edited by anyone.

const BACKEND_URL =
  process.env.REACT_APP_RAILWAY_BACKEND_URL ||
  'https://backendforrailway-production-7128.up.railway.app';

const qs = (params) =>
  Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

// Move an account off the old hours system and onto credits. Safe to call on
// every sign-in: the server does the work once and ignores every call after.
export const runCreditBackfill = async (uid, email) => {
  try {
    const body = new FormData();
    if (uid) body.append('user_id', uid);
    if (email) body.append('user_email', email);
    const res = await fetch(`${BACKEND_URL}/credits/backfill`, {
      method: 'POST',
      body,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn('Credit conversion could not run:', e);
    return null;
  }
};

// What this account can spend right now.
export const fetchCreditBalance = async (uid, email) => {
  try {
    const res = await fetch(
      `${BACKEND_URL}/credits/balance?${qs({ user_id: uid, user_email: email })}`
    );
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn('Credit balance could not be read:', e);
    return null;
  }
};

// Can this account afford a recording of this length? Asked before an upload
// starts, so nobody waits for a transcript they were never going to get.
export const fetchCreditQuote = async (uid, email, seconds) => {
  try {
    const res = await fetch(
      `${BACKEND_URL}/credits/quote?${qs({
        seconds: Math.max(0, Math.round(seconds || 0)),
        user_id: uid,
        user_email: email,
      })}`
    );
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn('Credit quote could not be read:', e);
    return null;
  }
};

// Add a bundle of bought credits. The server decides how many credits the
// bundle is worth, so only its name is sent.
export const buyCreditTopUp = async (uid, email, bundleId, referenceId) => {
  const body = new FormData();
  body.append('bundle_id', bundleId);
  if (uid) body.append('user_id', uid);
  if (email) body.append('user_email', email);
  if (referenceId) body.append('reference_id', referenceId);
  const res = await fetch(`${BACKEND_URL}/credits/topup`, {
    method: 'POST',
    body,
  });
  if (!res.ok) {
    let detail = 'The credits could not be added.';
    try {
      const j = await res.json();
      if (j && j.detail) detail = j.detail;
    } catch (e) {
      /* keep the plain message */
    }
    throw new Error(detail);
  }
  return await res.json();
};

// One credit buys one minute of transcription or one ordinary question, so
// the friendliest way to describe a balance is in both.
export const describeCredits = (total) => {
  if (total === null || total === undefined) return '';
  const n = Number(total) || 0;
  if (n === 1) return '1 credit';
  return `${n.toLocaleString()} credits`;
};

// What the account can actually spend today, which is not always what it owns.
export const spendableCredits = (balance) => {
  if (!balance || balance.exempt || balance.unlimited) return null;
  return Number(balance.spendable) || 0;
};

// Credits the client owns but cannot use because their plan has lapsed. They
// are never taken away; they wait.
export const frozenCredits = (balance) => {
  if (!balance || balance.exempt || balance.unlimited) return 0;
  return Number(balance.frozen) || 0;
};

// True when the client has credits sitting there that a plan would unlock.
export const creditsAreFrozen = (balance) =>
  frozenCredits(balance) > 0 && balance && balance.planActive === false;

// Worth a gentle warning: enough left to work, not enough to relax. Sixty
// credits is an hour of transcription, which is about the point at which a
// working client wants to know rather than be surprised.
export const creditsRunningLow = (balance) => {
  const s = spendableCredits(balance);
  return s !== null && s > 0 && s <= 60;
};

export const creditsExhausted = (balance) => {
  const s = spendableCredits(balance);
  return s !== null && s <= 0;
};
