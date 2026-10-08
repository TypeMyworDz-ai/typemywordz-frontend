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

beforeEach(() => {
  setCurrentUserForTest({ uid: 'admin-1', email: 'typemywordz@gmail.com', getIdToken: async () => 'test-token' });
  global.fetch = jest.fn((url) => {
    if (String(url).includes('/admin/letter-jobs')) return Promise.resolve(response({ jobs: [] }));
    if (String(url).includes('/worker-options')) return Promise.resolve(response({ workers: [] }));
    return Promise.resolve(response({ status: 'queued' }));
  });
});

afterEach(() => jest.clearAllMocks());

test('Letter Jobs tab is upload-only and points to the Job Queue', async () => {
  render(<LetterJobsAdminPanel />);
  expect(await screen.findByRole('heading', { name: 'Letter Jobs' })).toBeInTheDocument();
  expect(screen.getByText(/No letter is split into slices/)).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Letter Job queue' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Assign Letter Agent' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Go to Job Queue' })).toBeInTheDocument();
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


test('uses the last admin recording as the complete Letter Job source', async () => {
  global.fetch = jest.fn((url) => {
    if (String(url).includes('/admin/letter-jobs')) return Promise.resolve(response({ jobs: [] }));
    if (String(url).includes('/worker-options')) return Promise.resolve(response({ workers: [] }));
    return Promise.resolve(response({ job: { id: 'letter-recorded' } }));
  });
  const recorded = new File(['recorded voice'], 'recording-456.webm', { type: 'audio/webm' });
  render(<LetterJobsAdminPanel recordedAudioFile={recorded} />);
  await screen.findByRole('heading', { name: 'Letter Jobs' });
  fireEvent.click(screen.getByRole('button', { name: 'Use recorded audio' }));
  expect(screen.getByText('Last recording: recording-456.webm')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '1.5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create complete Letter Job' }));
  await waitFor(() => expect(global.fetch.mock.calls.some(([url, options]) => String(url).endsWith('/admin/letter-jobs') && options?.method === 'POST')).toBe(true));
  const [, options] = global.fetch.mock.calls.find(([url, callOptions]) => String(url).includes('/admin/letter-jobs') && callOptions?.method === 'POST');
  expect(options.body.get('audio').name).toBe('recording-456.webm');
  expect(options.body.get('seconds')).toBe('90');
});
