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

export const isPaidAIUser = (userProfile, email, creditBalance) => {
  // The admin and any complimentary account always have it. The plan check
  // alone used to lock the team out of their own assistant, the same way it
  // locked them out of transcribing.
  if (hasFreeAccess(email) || hasFreeAccess(userProfile && userProfile.email)) return true;

  // Credits are a plan. Someone who has bought credits has paid us, and the
  // server already answers their questions; refusing them here only put a
  // locked door in front of a client who was entitled to walk through it.
  if (creditBalance && !creditBalance.exempt) {
    const spendable = Number(creditBalance.spendable);
    if (Number.isFinite(spendable) && spendable > 0) return true;
  }

  if (!userProfile || !userProfile.plan) return false;
  return PAID_PLANS_FOR_AI.includes(userProfile.plan);
};

export default isPaidAIUser;
