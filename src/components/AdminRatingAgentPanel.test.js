import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminRatingAgentPanel from './AdminRatingAgentPanel';

const user = { getIdToken: async () => 'token' };
const json = (body, ok = true) => Promise.resolve({ ok, json: async () => body });
const row = { id: 'j1_w1_transcriber_main', job_id: 'job12345xyz', worker_uid: 'w1', worker_name: 'Wanjiru', worker_email: 'w@example.com', role: 'transcriber', submission_number: 3, status: 'applied', applied_by: 'Rating Agent', ai_rating: 4, rating: 4, comments: 'Followed the guidelines.', model: 'gemini-3.8-flash', dispute_status: 'open', dispute_reason: 'Paragraphs were marked down.' };

afterEach(() => { jest.restoreAllMocks(); });

test('admin can change an auto-applied rating and see the worker dispute', async () => {
  const calls = [];
  global.fetch = jest.fn((url, options = {}) => {
    calls.push([String(url), options.method || 'GET', options.body]);
    if (String(url).includes('?status=')) return json({ ratings: [row], open_disputes: 1 });
    return json({ status: 'ok' });
  });
  render(<AdminRatingAgentPanel currentUser={user} showMessage={() => {}} />);
  expect(await screen.findByText('Wanjiru')).toBeInTheDocument();
  expect(screen.getByText('Paragraphs were marked down.')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Rating out of 5'), { target: { value: '5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Change rating' }));
  await waitFor(() => expect(calls.some(([u, m]) => u.endsWith('/j1_w1_transcriber_main') && m === 'PUT')).toBe(true));
  const put = calls.find(([u, m]) => u.endsWith('/j1_w1_transcriber_main') && m === 'PUT');
  expect(JSON.parse(put[2]).rating).toBe(5);
});

test('shows an empty state explaining every third job', async () => {
  global.fetch = jest.fn(() => json({ ratings: [] }));
  render(<AdminRatingAgentPanel currentUser={user} showMessage={() => {}} />);
  expect(await screen.findByText(/third, sixth, ninth job/)).toBeInTheDocument();
});

test('super admin can open the instructions editor', async () => {
  global.fetch = jest.fn((url) => String(url).includes('rating-agent-instructions')
    ? json({ text: 'Judge only four things.', default_text: 'x', using_default: true, fixed_rules: 'never rate paragraphing' })
    : json({ ratings: [] }));
  render(<AdminRatingAgentPanel currentUser={user} showMessage={() => {}} />);
  fireEvent.click(await screen.findByRole('tab', { name: 'Agent instructions' }));
  expect(await screen.findByDisplayValue('Judge only four things.')).toBeInTheDocument();
});
