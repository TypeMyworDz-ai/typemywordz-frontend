import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminRatingAgentPanel from './AdminRatingAgentPanel';

const user = { getIdToken: async () => 'token' };
const json = (body, ok = true) => Promise.resolve({ ok, json: async () => body });
const row = { id: 'j1_w1_transcriber_main', job_id: 'job12345xyz', worker_uid: 'w1', worker_name: 'Wanjiru', worker_email: 'w@example.com', role: 'transcriber', submission_number: 3, status: 'pending', ai_rating: 4, ai_comments: 'Followed the guidelines.', rating: 4, comments: 'Followed the guidelines.', model: 'gemini-3.8-flash' };

afterEach(() => { jest.restoreAllMocks(); });

test('super admin can edit the AI rating and comments, then apply it', async () => {
  const calls = [];
  global.fetch = jest.fn((url, options = {}) => {
    calls.push([String(url), options.method || 'GET', options.body]);
    if (String(url).includes('?status=')) return json({ ratings: [row] });
    return json({ status: 'ok' });
  });
  render(<AdminRatingAgentPanel currentUser={user} showMessage={() => {}} />);
  expect(await screen.findByText('Wanjiru')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Rating out of 5'), { target: { value: '3' } });
  fireEvent.change(screen.getByLabelText('Rating comments'), { target: { value: 'Missed one instruction.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes and apply' }));
  await waitFor(() => expect(calls.some(([u, m]) => u.endsWith('/j1_w1_transcriber_main/apply') && m === 'POST')).toBe(true));
  const put = calls.find(([u, m]) => u.endsWith('/j1_w1_transcriber_main') && m === 'PUT');
  expect(JSON.parse(put[2])).toEqual({ rating: 3, comments: 'Missed one instruction.' });
});

test('shows an empty state explaining every third job', async () => {
  global.fetch = jest.fn(() => json({ ratings: [] }));
  render(<AdminRatingAgentPanel currentUser={user} showMessage={() => {}} />);
  expect(await screen.findByText(/third, sixth, ninth job/)).toBeInTheDocument();
});
