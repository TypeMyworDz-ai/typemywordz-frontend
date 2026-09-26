import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import HumanJobWorkspace from './HumanJobWorkspace';

jest.mock('../contexts/AuthContext', () => {
  const currentUser = { uid: 'worker-1', getIdToken: async () => 'test-token' };
  return { useAuth: () => ({ currentUser }) };
});

jest.mock('./TranscriptEditor', () => function TranscriptEditorMock() {
  return <div>Transcript editor</div>;
});

const response = (payload) => ({ ok: true, text: async () => JSON.stringify(payload) });

beforeEach(() => {
  global.fetch = jest.fn((url) => {
    const address = String(url);
    if (address.includes('/human-transcription/jobs?scope=available')) {
      return Promise.resolve(response({
        jobs: [{
          id: 'open-job', status: 'split_assigned', audio: { name: 'open-audio.mp3' }, minutes: 5,
          claimable_parts: [{ id: 'part-1', label: 'Part 1', minutes: 5 }], can_claim: true,
          claim_block_reason: '', claimable_full_job: false,
        }],
        worker_rating_summary: { average: 4.25, count: 2 },
        worker_can_view_available: true, worker_active_assignment: false,
        worker_available: true, worker_can_claim: true, worker_claim_block_reason: '',
      }));
    }
    if (address.includes('/human-transcription/jobs?scope=assigned')) {
      return Promise.resolve(response({
        jobs: [{
          id: 'job-1', status: 'in_progress', audio: null, transcript: '', minutes: 5,
          worker_assignment: { id: 'part-2', role: 'transcriber', status: 'in_progress', label: 'Part 2' },
          time_remaining_seconds: 240,
        }],
        worker_rating_summary: { average: 4.25, count: 2 },
        worker_can_view_available: true, worker_active_assignment: true,
        worker_available: true, worker_can_claim: false,
        worker_claim_block_reason: 'Finish your current assignment before claiming another.',
      }));
    }
    if (address.endsWith('/human-transcription/worker/availability')) return Promise.resolve(response({ available: true }));
    if (address.endsWith('/human-transcription/worker/payment-history')) return Promise.resolve(response({ pending_payouts: [], paid: [], accruing: [] }));
    if (address.includes('/messages')) return Promise.resolve(response({ messages: [], thread: 'worker' }));
    return Promise.resolve(response({}));
  });
});

test('worker can open Available Jobs after an initial job link without being bounced back', async () => {
  render(<HumanJobWorkspace mode="worker" initialJobId="job-1" />);

  const inProgressTab = await screen.findByRole('tab', { name: 'In Progress' });
  await waitFor(() => expect(inProgressTab).toHaveAttribute('aria-selected', 'true')); 
  await screen.findByText('Part 2');

  global.fetch.mockClear();
  const availableTab = screen.getByRole('tab', { name: 'Available Jobs' });
  fireEvent.click(availableTab);

  await waitFor(() => expect(availableTab).toHaveAttribute('aria-selected', 'true'));
  expect(await screen.findByText('Claim this work')).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining('/human-transcription/jobs?scope=available'),
    expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer test-token' }) }),
  );
});
