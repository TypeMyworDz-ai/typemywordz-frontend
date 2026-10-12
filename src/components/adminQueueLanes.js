// Flow of the admin job queue:
//   Needs action -> uploaded jobs waiting for the admin, and jobs that still need proofreading.
//   In progress  -> work being done by workers or proofreaders.
//   Submitted    -> proofread work that needs no further action.
//   Finished     -> Submitted internal jobs finish by themselves after 12 hours.
// Stale Needs action jobs still move to Finished after 24 hours. In progress jobs never move automatically.
export const ADMIN_QUEUE_AUTO_FINISH_MS = 24 * 60 * 60 * 1000;
export const ADMIN_QUEUE_SUBMITTED_FINISH_MS = 12 * 60 * 60 * 1000;
const latestTime = (job, fields) => fields.reduce((latest, field) => {
  const time = Date.parse(job?.[field]);
  return Number.isFinite(time) && time > latest ? time : latest;
}, 0);
const isInternalJob = (job) => Boolean(job?.admin_uploaded === true || ['pdf_job', 'letter_job'].includes(job?.job_type));
const proofreadDone = (job) => Boolean(
  job?.ai_review_applied === true || job?.proofreader_status === 'submitted' || job?.reviewer_status === 'completed'
  || job?.letter_ai_review_status === 'completed' || job?.admin_proofread_at,
);
export const adminQueueLaneFor = (job, now = Date.now()) => {
  const status = String(job?.status || '').toLowerCase();
  if (job?.admin_finishedAt) return 'finished';
  if (['released', 'cancelled'].includes(status)) return 'finished';
  let lane = 'needs_action';
  let enteredAt = 0;
  let limit = ADMIN_QUEUE_AUTO_FINISH_MS;
  if (['submitted', 'client_review'].includes(status)) {
    if (status === 'submitted' && isInternalJob(job) && !proofreadDone(job)) {
      // Submitted by a worker or agent but not proofread yet: back to Needs action.
      return 'needs_action';
    }
    lane = 'submitted';
    limit = ADMIN_QUEUE_SUBMITTED_FINISH_MS;
    enteredAt = latestTime(job, ['submittedAt', 'reviewedAt', 'proofreader_completedAt', 'ai_review_appliedAt', 'admin_proofread_at', 'workerCompletedAt']) || latestTime(job, ['updatedAt', 'createdAt']);
  } else if (['assigned', 'in_progress', 'split_assigned', 'split_in_progress', 'proofreading_assigned', 'proofreading_in_progress'].includes(status) && job?.routing_status !== 'pending') {
    return 'in_progress';
  } else {
    enteredAt = latestTime(job, ['routingDecidedAt', 'returnedToQueueAt', 'createdAt']);
  }
  return enteredAt > 0 && now - enteredAt > limit ? 'finished' : lane;
};
