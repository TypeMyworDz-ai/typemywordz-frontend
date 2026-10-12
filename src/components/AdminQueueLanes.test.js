import { adminQueueLaneFor } from './adminQueueLanes';

const NOW = Date.parse('2026-10-10T12:00:00Z');
const hoursAgo = (h) => new Date(NOW - h * 3600 * 1000).toISOString();

test('Needs action jobs move to Finished after 24 hours', () => {
  expect(adminQueueLaneFor({ status: 'approved', routing_status: 'pending', createdAt: hoursAgo(23) }, NOW)).toBe('needs_action');
  expect(adminQueueLaneFor({ status: 'approved', routing_status: 'pending', createdAt: hoursAgo(25) }, NOW)).toBe('finished');
  expect(adminQueueLaneFor({ status: 'approved', createdAt: hoursAgo(48), routingDecidedAt: hoursAgo(2) }, NOW)).toBe('needs_action');
});

test('Submitted jobs move to Finished 12 hours after submission', () => {
  expect(adminQueueLaneFor({ status: 'submitted', submittedAt: hoursAgo(5), createdAt: hoursAgo(90) }, NOW)).toBe('submitted');
  expect(adminQueueLaneFor({ status: 'submitted', submittedAt: hoursAgo(11) }, NOW)).toBe('submitted');
  expect(adminQueueLaneFor({ status: 'submitted', submittedAt: hoursAgo(13) }, NOW)).toBe('finished');
  expect(adminQueueLaneFor({ status: 'submitted', submittedAt: hoursAgo(30) }, NOW)).toBe('finished');
  expect(adminQueueLaneFor({ status: 'client_review', submittedAt: hoursAgo(30), reviewedAt: hoursAgo(1) }, NOW)).toBe('submitted');
});

test('In progress jobs never move automatically', () => {
  for (const status of ['assigned', 'in_progress', 'split_in_progress', 'proofreading_assigned']) {
    expect(adminQueueLaneFor({ status, createdAt: hoursAgo(500), submittedAt: hoursAgo(500) }, NOW)).toBe('in_progress');
  }
});

test('manually finished and released jobs stay Finished', () => {
  expect(adminQueueLaneFor({ status: 'submitted', admin_finishedAt: hoursAgo(1), submittedAt: hoursAgo(1) }, NOW)).toBe('finished');
  expect(adminQueueLaneFor({ status: 'released', createdAt: hoursAgo(1) }, NOW)).toBe('finished');
});

test('a job with no usable timestamp stays where it is', () => {
  expect(adminQueueLaneFor({ status: 'approved' }, NOW)).toBe('needs_action');
});

test('internal jobs that still need proofreading go back to Needs action', () => {
  const base = { status: 'submitted', admin_uploaded: true, submittedAt: hoursAgo(1) };
  expect(adminQueueLaneFor(base, NOW)).toBe('needs_action');
  expect(adminQueueLaneFor({ ...base, reviewer_status: 'completed' }, NOW)).toBe('submitted');
  expect(adminQueueLaneFor({ ...base, ai_review_applied: true }, NOW)).toBe('submitted');
  expect(adminQueueLaneFor({ ...base, proofreader_status: 'submitted' }, NOW)).toBe('submitted');
  expect(adminQueueLaneFor({ ...base, letter_ai_review_status: 'failed' }, NOW)).toBe('needs_action');
  expect(adminQueueLaneFor({ ...base, admin_proofread_at: hoursAgo(1) }, NOW)).toBe('submitted');
  expect(adminQueueLaneFor({ ...base, admin_proofread_at: hoursAgo(13), submittedAt: hoursAgo(13), reviewer_status: 'completed' }, NOW)).toBe('finished');
});
