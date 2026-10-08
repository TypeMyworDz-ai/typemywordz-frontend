import React from 'react';
import { render, screen } from '@testing-library/react';
import { AdminAiReviewPanel } from './AdminPartReview';

const baseJob = { id: 'job1', segments: [], proofreader_status: 'not_started' };

test('shows a progress bar and stage while the proofread runs in the background', () => {
  const job = { ...baseJob, ai_review_run: { status: 'processing', stage: 'Researching names and terms on the web', progress: 40, startedAt: new Date().toISOString() } };
  render(<AdminAiReviewPanel job={job} act={jest.fn()} busy={false} />);
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');
  expect(screen.getByText(/Researching names and terms on the web/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Proofreading/ })).toBeDisabled();
});

test('shows the reason when a background proofread failed and allows retry', () => {
  const job = { ...baseJob, ai_review_run: { status: 'failed', error: 'Deepgram could not finish.', startedAt: new Date().toISOString() } };
  render(<AdminAiReviewPanel job={job} act={jest.fn()} busy={false} />);
  expect(screen.getByRole('alert')).toHaveTextContent('Deepgram could not finish.');
  expect(screen.getByRole('button', { name: /Proofread and combine/ })).toBeEnabled();
});

test('ignores a run that has been stuck for more than 30 minutes', () => {
  const old = new Date(Date.now() - 45 * 60 * 1000).toISOString();
  const job = { ...baseJob, ai_review_run: { status: 'processing', progress: 50, startedAt: old } };
  render(<AdminAiReviewPanel job={job} act={jest.fn()} busy={false} />);
  expect(screen.queryByRole('progressbar')).toBeNull();
});
