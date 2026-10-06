import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import LetterJobsAdminPanel from './LetterJobsAdminPanel';
import { setCurrentUserForTest } from '../contexts/AuthContext';

jest.mock('../contexts/AuthContext', () => {
  let currentUser = { uid: 'admin-1', email: 'typemywordz@gmail.com', getIdToken: async () => 'test-token' };
  return {
    useAuth: () => ({ currentUser }),
    setCurrentUserForTest: (nextUser) => { currentUser = nextUser; },
  };
});

const response = (payload, ok = true) => ({ ok, json: async () => payload });
const availableJob = {
  id: 'letter-1', status: 'approved', job_type: 'letter_job', job_name: 'Letter 1', minutes: 3,
  audio: { name: 'letter.mp3' }, split_mode: 'single', segments: [], letter_agent_status: 'available',
  createdAt: '2026-10-05T00:00:00Z',
};

beforeEach(() => {
  setCurrentUserForTest({ uid: 'admin-1', email: 'typemywordz@gmail.com', getIdToken: async () => 'test-token' });
  global.fetch = jest.fn((url) => {
    if (String(url).includes('/admin/letter-jobs')) return Promise.resolve(response({ jobs: [] }));
    if (String(url).includes('/worker-options')) return Promise.resolve(response({ workers: [] }));
    return Promise.resolve(response({ status: 'queued' }));
  });
});

afterEach(() => jest.clearAllMocks());

test('shows the separate Letter Jobs upload section and unsplit workflow', async () => {
  render(<LetterJobsAdminPanel />);
  expect(await screen.findByRole('heading', { name: 'Letter Jobs' })).toBeInTheDocument();
  expect(screen.getByText(/No letter is split into slices/)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Letter Job queue' })).toBeInTheDocument();
});

test('creates one whole Letter Job from a complete recording', async () => {
  global.fetch = jest.fn((url) => {
    if (String(url).includes('/admin/letter-jobs')) return Promise.resolve(response({ jobs: [] }));
    if (String(url).includes('/worker-options')) return Promise.resolve(response({ workers: [] }));
    return Promise.resolve(response({ job: { id: 'new-letter' } }));
  });
  render(<LetterJobsAdminPanel />);
  const audio = new File(['synthetic audio'], 'dictated-letter.mp3', { type: 'audio/mpeg' });
  fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [audio] } });
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '3' } });
  fireEvent.change(screen.getByLabelText('Job name'), { target: { value: 'Sample letter' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create complete Letter Job' }));
  await waitFor(() => expect(global.fetch.mock.calls.some(([url, callOptions]) => String(url).endsWith('/admin/letter-jobs') && callOptions?.method === 'POST')).toBe(true));
  const [, options] = global.fetch.mock.calls.find(([url, callOptions]) => String(url).includes('/admin/letter-jobs') && callOptions?.method === 'POST');
  expect(options.body.get('audio').name).toBe('dictated-letter.mp3');
  expect(options.body.get('seconds')).toBe('180');
  expect(options.body.get('title')).toBe('Sample letter');
  expect(options.headers['Content-Type']).toBeUndefined();
});

test('off-shift Letter assignment includes only workers who are clocked in and online', async () => {
  global.fetch = jest.fn((url) => {
    const address = String(url);
    if (address.includes('/admin/letter-jobs')) return Promise.resolve(response({ jobs: [availableJob] }));
    if (address.includes('/worker-options')) return Promise.resolve(response({
      scheduled_now: false,
      workers: [
        { uid: 'ready-worker', name: 'Ready Worker', email: 'worker@example.com', available: true, call_in_active: true, online: true, clocked_in: true },
        { uid: 'online-only-worker', name: 'Online Only', email: 'online@example.com', available: true, call_in_active: true, online: true, clocked_in: false },
        { uid: 'not-called-in', name: 'Not Called In', email: 'not-called@example.com', available: true, call_in_active: false, online: true, clocked_in: true },
      ],
    }));
    return Promise.resolve(response({ status: 'queued' }));
  });
  render(<LetterJobsAdminPanel />);
  const select = await screen.findByRole('combobox', { name: 'Choose a worker for Letter 1' });
  expect(Array.from(select.options).some((option) => option.value === 'ready-worker')).toBe(true);
  expect(Array.from(select.options).some((option) => option.value === 'online-only-worker')).toBe(false);
  expect(Array.from(select.options).some((option) => option.value === 'not-called-in')).toBe(false);
});

test('assigns the complete recording to the dedicated Letter Agent', async () => {
  global.fetch = jest.fn((url) => {
    if (String(url).includes('/admin/letter-jobs')) return Promise.resolve(response({ jobs: [availableJob] }));
    if (String(url).includes('/worker-options')) return Promise.resolve(response({ workers: [] }));
    return Promise.resolve(response({ status: 'queued' }));
  });
  render(<LetterJobsAdminPanel />);
  fireEvent.click(await screen.findByRole('button', { name: 'Assign Letter Agent' }));
  await waitFor(() => expect(global.fetch.mock.calls.some(([url, options]) => String(url).endsWith('/letter-agent/assign') && options?.method === 'POST')).toBe(true));
  const [, options] = global.fetch.mock.calls.find(([url, callOptions]) => String(url).endsWith('/letter-agent/assign') && callOptions?.method === 'POST');
  expect(options.headers.Authorization).toBe('Bearer test-token');
  expect(options.body).toBeUndefined();
});
