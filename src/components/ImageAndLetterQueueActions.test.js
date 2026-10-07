import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ImageJobQueueActions, LetterJobQueueActions } from './ImageAndLetterQueueActions';

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ currentUser: { uid: 'admin-1', email: 'typemywordz@gmail.com', getIdToken: async () => 'test-token' } }),
}));

const response = (payload, ok = true) => ({ ok, json: async () => payload });
const letter = { id: 'letter-1', status: 'approved', job_type: 'letter_job', job_name: 'Letter 1', letter_agent_status: 'available' };

beforeEach(() => {
  global.fetch = jest.fn((url) => {
    if (String(url).includes('/worker-options')) return Promise.resolve(response({
      scheduled_now: false,
      workers: [
        { uid: 'ready', name: 'Ready Proof', email: 'r@example.com', call_in_active: true, online: true, clocked_in: true, can_proofread: true, rating: 4.8 },
        { uid: 'offline', name: 'Offline', email: 'o@example.com', call_in_active: true, online: false, clocked_in: true, can_proofread: true, rating: 4.9 },
      ],
    }));
    return Promise.resolve(response({ status: 'queued' }));
  });
});
afterEach(() => jest.clearAllMocks());

test('assigns the complete letter to the Letter Agent from the queue', async () => {
  const onChanged = jest.fn();
  render(<LetterJobQueueActions job={letter} showMessage={jest.fn()} onChanged={onChanged} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Assign Letter Agent' }));
  await waitFor(() => expect(global.fetch.mock.calls.some(([url, options]) => String(url).endsWith('/letter-agent/assign') && options?.method === 'POST')).toBe(true));
  await waitFor(() => expect(onChanged).toHaveBeenCalled());
});

test('submitted letters offer AI proofreading and only clocked-in qualified human proofreaders', async () => {
  render(<LetterJobQueueActions job={{ ...letter, status: 'submitted' }} showMessage={jest.fn()} onChanged={jest.fn()} />);
  expect(await screen.findByRole('button', { name: 'Run AI proofreading' })).toBeInTheDocument();
  const select = await screen.findByRole('combobox');
  await waitFor(() => expect(Array.from(select.options).some((option) => option.value === 'ready')).toBe(true));
  expect(Array.from(select.options).some((option) => option.value === 'offline')).toBe(false);
});

const imageJob = (id, page, status) => ({ id, job_type: 'pdf_job', status, pdf_upload_batch_id: 'batch-1', pdf_upload_page_number: page });

test('whole-upload proofreading unlocks only when every part is submitted', async () => {
  const jobs = [imageJob('a', 1, 'submitted'), imageJob('b', 2, 'assigned')];
  const { rerender } = render(<ImageJobQueueActions job={jobs[0]} jobs={jobs} showMessage={jest.fn()} onChanged={jest.fn()} />);
  expect(screen.getByRole('button', { name: 'Create whole-upload proofread job' })).toBeDisabled();
  const done = [imageJob('a', 1, 'submitted'), imageJob('b', 2, 'submitted')];
  rerender(<ImageJobQueueActions job={done[0]} jobs={done} showMessage={jest.fn()} onChanged={jest.fn()} />);
  const button = screen.getByRole('button', { name: 'Create whole-upload proofread job' });
  expect(button).toBeEnabled();
  fireEvent.click(button);
  await waitFor(() => expect(global.fetch.mock.calls.some(([url]) => String(url).endsWith('/admin/pdf-jobs/file-review'))).toBe(true));
  const [, options] = global.fetch.mock.calls.find(([url]) => String(url).endsWith('/admin/pdf-jobs/file-review'));
  expect(JSON.parse(options.body)).toEqual({ job_ids: ['a', 'b'], upload_batch_id: 'batch-1' });
});
