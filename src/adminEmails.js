// Single source of truth for admin accounts.
// This list must stay in step with ADMIN_EMAILS in the backend (main.py).
export const ADMIN_EMAILS = [
  'typemywordz@gmail.com',
  'gracenyaitara@gmail.com',
  'kagochi12@gmail.com',
];

// Case-insensitive, whitespace-tolerant check, matching the backend's behaviour.
export const isAdminEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  const needle = email.trim().toLowerCase();
  return ADMIN_EMAILS.some((a) => a.toLowerCase() === needle);
};
