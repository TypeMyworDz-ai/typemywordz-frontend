import { hasFreeAccess } from './adminEmails';

// Who may use Ask TypeMyworDz.
//
// This lives in its own file because three different screens need to agree on
// the answer: the sidebar button, the panel beside a transcript, and the
// transcript opened from My files. When this rule was copied into each of
// them it drifted, and a One-Day client was told they could not use the
// assistant even though the server was happy to answer them.
//
// The server makes the real decision. This is only for deciding what to show,
// so it must match the server's list exactly.
export const PAID_PLANS_FOR_AI = [
  'One-Day Plan',
  'Three-Day Plan',
  'One-Week Plan',
  'Monthly Plan',
  'Yearly Plan',
];

export const isPaidAIUser = (userProfile, email) => {
  // The admin and any complimentary account always have it. The plan check
  // alone used to lock the team out of their own assistant, the same way it
  // locked them out of transcribing.
  if (hasFreeAccess(email) || hasFreeAccess(userProfile && userProfile.email)) return true;
  if (!userProfile || !userProfile.plan) return false;
  return PAID_PLANS_FOR_AI.includes(userProfile.plan);
};

export default isPaidAIUser;
