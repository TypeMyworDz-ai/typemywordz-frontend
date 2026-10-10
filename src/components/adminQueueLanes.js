// Jobs left in Needs action or Submitted for more than 24 hours move to
// Finished on their own. In progress jobs never move automatically.
export const ADMIN_QUEUE_AUTO_FINISH_MS = 24 * 60 * 60 * 1000;
const latestTime = (job, fields) => fields.reduce((latest, field) => {
  const time = Date.parse(job?.[field]);
  return Number.isFinite(time) && time > latest ? time : latest;
}, 0);
export const adminQueueLaneFor = (job, now = Date.now()) => {
  const status = String(job?.status || '').toLowerCase();
  if (job?.admin_finishedAt) return 'finished';
  if (['released', 'cancelled'].includes(status)) return 'finished';
  let lane = 'needs_action';
  let enteredAt = 0;
  if (['submitted', 'client_review'].includes(status)) {
    lane = 'submitted';
    enteredAt = latestTime(job, ['submittedAt', 'reviewedAt', 'proofreader_completedAt', 'workerCompletedAt']) || latestTime(job, ['updatedAt', 'createdAt']);
  } else if (['assigned', 'in_progress', 'split_assigned', 'split_in_progress', 'proofreading_assigned', 'proofreading_in_progress'].includes(status) && job?.routing_status !== 'pending') {
    return 'in_progress';
  } else {
    enteredAt = latestTime(job, ['routingDecidedAt', 'returnedToQueueAt', 'createdAt']);
  }
  return enteredAt > 0 && now - enteredAt > ADMIN_QUEUE_AUTO_FINISH_MS ? 'finished' : lane;
};
