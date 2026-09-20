// Single source of truth for admin accounts.
// This list must stay in step with ADMIN_EMAILS in the backend (main.py).
export const ADMIN_EMAILS = [
  'typemywordz@gmail.com',
];

// Complimentary accounts: free to use the app, but NOT admins.
//
// These accounts skip payment for transcription and for Ask TypeMyworDz, and
// they are never shown a subscribe prompt. They deliberately get none of the
// admin tooling: no Admin nav item, no admin dashboard, no admin-only models,
// no elevated access to anyone else's data. Keeping this list separate from
// ADMIN_EMAILS is the whole point, so that "does not pay" never quietly turns
// into "can see everything".
export const COMP_ACCESS_EMAILS = [];

// Case-insensitive, whitespace-tolerant check, matching the backend's behaviour.
export const isAdminEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  const needle = email.trim().toLowerCase();
  return ADMIN_EMAILS.some((a) => a.toLowerCase() === needle);
};

// Extra accounts that can run the human-transcription job queue solo --
// approve a request, assign it to a worker, and sign off finished work on a
// client's behalf -- without being a full admin anywhere else in the app.
// Must stay in step with HUMAN_JOB_ADMIN_EMAILS in the backend (main.py).
export const HUMAN_JOB_ADMIN_EMAILS = [
  ...ADMIN_EMAILS,
  'info@typemywordz.ai',
];

// Case-insensitive, whitespace-tolerant check, matching the backend's behaviour.
export const isHumanJobAdminEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  const needle = email.trim().toLowerCase();
  return HUMAN_JOB_ADMIN_EMAILS.some((a) => a.toLowerCase() === needle);
};

// Case-insensitive, whitespace-tolerant check, matching the backend's behaviour.
export const isCompAccessEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  const needle = email.trim().toLowerCase();
  return COMP_ACCESS_EMAILS.some((a) => a.toLowerCase() === needle);
};

// "Does this account get the app without paying?" Admins and complimentary
// accounts both do. Use this for paywalls and subscribe prompts. Use
// isAdminEmail on its own for anything that grants admin powers.
export const hasFreeAccess = (email) => isAdminEmail(email) || isCompAccessEmail(email);
