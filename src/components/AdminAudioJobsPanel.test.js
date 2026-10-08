import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdminAudioJobsPanel from './AdminAudioJobsPanel';
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
  global.fetch = jest.fn(() => Promise.resolve(response({ jobs: [] })));
});

afterEach(() => jest.clearAllMocks());

test('Template Jobs require one Word template before an upload can be created', async () => {
  render(<AdminAudioJobsPanel category="template" />);
  expect(await screen.findByRole('heading', { name: 'Template Jobs' })).toBeInTheDocument();
  expect(screen.getByText(/No client quote or credits/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Create Template Job' })).toBeDisabled();
});

test('creates an admin General Job without a client quote or credit field', async () => {
  global.fetch = jest.fn((url, options) => {
    if (String(url).includes('/human-transcription/jobs?scope=admin')) return Promise.resolve(response({ jobs: [] }));
    if (String(url).endsWith('/human-transcription/admin/audio-jobs') && options?.method === 'POST') {
      return Promise.resolve(response({ job: { id: 'general-1' }, parts_count: 2, worker_pay_kes_per_minute: 100 }));
    }
    return Promise.resolve(response({ jobs: [] }));
  });
  render(<AdminAudioJobsPanel category="general" />);
  await screen.findByRole('heading', { name: 'General Jobs' });
  fireEvent.change(screen.getByLabelText('Recording'), { target: { files: [new File(['synthetic audio'], 'sample.mp3', { type: 'audio/mpeg' })] } });
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '7' } });
  fireEvent.change(screen.getByLabelText('Job name'), { target: { value: 'Synthetic General QA' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create General Job' }));

  await waitFor(() => expect(global.fetch.mock.calls.some(([url, options]) => String(url).endsWith('/human-transcription/admin/audio-jobs') && options?.method === 'POST')).toBe(true));
  const [, options] = global.fetch.mock.calls.find(([url, callOptions]) => String(url).endsWith('/human-transcription/admin/audio-jobs') && callOptions?.method === 'POST');
  expect(options.headers.Authorization).toBe('Bearer test-token');
  expect(options.headers['Content-Type']).toBeUndefined();
  expect(options.body.get('audio').name).toBe('sample.mp3');
  expect(options.body.get('seconds')).toBe('420');
  expect(options.body.get('title')).toBe('Synthetic General QA');
  expect(options.body.get('category')).toBe('general');
  expect(options.body.get('quote_credits')).toBeNull();
});

test('creates a Template Job with its job-specific Word template attached', async () => {
  global.fetch = jest.fn((url, options) => {
    if (String(url).includes('/human-transcription/jobs?scope=admin')) return Promise.resolve(response({ jobs: [] }));
    if (String(url).endsWith('/human-transcription/admin/audio-jobs') && options?.method === 'POST') return Promise.resolve(response({ job: { id: 'template-1' }, parts_count: 0 }));
    return Promise.resolve(response({ jobs: [] }));
  });
  render(<AdminAudioJobsPanel category="template" />);
  await screen.findByRole('heading', { name: 'Template Jobs' });
  fireEvent.change(screen.getByLabelText('Recording'), { target: { files: [new File(['synthetic audio'], 'sample.mp3', { type: 'audio/mpeg' })] } });
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '1.5' } });
  fireEvent.change(screen.getByLabelText('Job name'), { target: { value: 'Synthetic Template QA' } });
  const template = new File(['synthetic template'], 'client-template.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  const supportingDoc = new File(['supporting reference'], 'background-reference.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  fireEvent.change(screen.getByLabelText('Job-specific Word template'), { target: { files: [template] } });
  fireEvent.change(screen.getByLabelText('Supporting files'), { target: { files: [supportingDoc] } });
  fireEvent.click(screen.getByRole('button', { name: 'Create Template Job' }));

  await waitFor(() => expect(global.fetch.mock.calls.some(([url, options]) => String(url).endsWith('/human-transcription/admin/audio-jobs') && options?.method === 'POST')).toBe(true));
  const [, options] = global.fetch.mock.calls.find(([url, callOptions]) => String(url).endsWith('/human-transcription/admin/audio-jobs') && callOptions?.method === 'POST');
  expect(options.body.get('seconds')).toBe('90');
  expect(options.body.get('category')).toBe('template');
  expect(options.body.get('template_file').name).toBe('client-template.docx');
  expect(options.body.getAll('attachments').map((file) => file.name)).toContain('background-reference.docx');
});


test('uses the last admin recording as the General Job source', async () => {
  global.fetch = jest.fn((url, options) => {
    if (String(url).includes('/human-transcription/jobs?scope=admin')) return Promise.resolve(response({ jobs: [] }));
    if (String(url).endsWith('/human-transcription/admin/audio-jobs') && options?.method === 'POST') return Promise.resolve(response({ job: { id: 'general-recorded' }, parts_count: 1 }));
    return Promise.resolve(response({ jobs: [] }));
  });
  const recorded = new File(['recorded voice'], 'recording-123.webm', { type: 'audio/webm' });
  render(<AdminAudioJobsPanel category="general" recordedAudioFile={recorded} />);
  await screen.findByRole('heading', { name: 'General Jobs' });
  fireEvent.click(screen.getByRole('button', { name: 'Use recorded audio' }));
  expect(screen.getByText('Last recording: recording-123.webm')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create General Job' }));
  await waitFor(() => expect(global.fetch.mock.calls.some(([url, options]) => String(url).endsWith('/human-transcription/admin/audio-jobs') && options?.method === 'POST')).toBe(true));
  const [, options] = global.fetch.mock.calls.find(([url, callOptions]) => String(url).endsWith('/human-transcription/admin/audio-jobs') && callOptions?.method === 'POST');
  expect(options.body.get('audio').name).toBe('recording-123.webm');
  expect(options.body.get('seconds')).toBe('120');
});


test('Stop recording attaches the new audio to the General Job upload form', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(window, 'MediaRecorder');
  const devices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
  class FakeRecorder {
    static isTypeSupported = () => true;
    constructor(stream, options = {}) { this.stream = stream; this.mimeType = options.mimeType; this.state = 'inactive'; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable({ data: new Blob([new Uint8Array(4096)], { type: this.mimeType }) }); this.onstop(); }
  }
  Object.defineProperty(window, 'MediaRecorder', { configurable: true, writable: true, value: FakeRecorder });
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: jest.fn().mockResolvedValue({ getTracks: () => [{ stop: jest.fn() }] }) } });
  global.fetch = jest.fn((url, options) => {
    if (String(url).includes('/human-transcription/jobs?scope=admin')) return Promise.resolve(response({ jobs: [] }));
    if (String(url).endsWith('/human-transcription/admin/audio-jobs') && options?.method === 'POST') return Promise.resolve(response({ job: { id: 'recorded-job' }, parts_count: 1 }));
    return Promise.resolve(response({ jobs: [] }));
  });
  try {
    render(<AdminAudioJobsPanel category="general" />);
    await screen.findByRole('heading', { name: 'General Jobs' });
    fireEvent.click(screen.getByRole('button', { name: 'Record audio' }));
    await screen.findByRole('button', { name: 'Stop recording' });
    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }));
    expect(await screen.findByText(/Audio attached to this job: recording-/)).toBeInTheDocument();
    expect(screen.getByRole('spinbutton')).toHaveValue(0.02);
    fireEvent.click(screen.getByRole('button', { name: 'Create General Job' }));
    await waitFor(() => expect(global.fetch.mock.calls.some(([url, options]) => String(url).endsWith('/human-transcription/admin/audio-jobs') && options?.method === 'POST')).toBe(true));
    const [, options] = global.fetch.mock.calls.find(([url, callOptions]) => String(url).endsWith('/human-transcription/admin/audio-jobs') && callOptions?.method === 'POST');
    expect(options.body.get('audio').name).toMatch(/^recording-\d+\.webm$/);
    expect(options.body.get('seconds')).toBe('1.2');
  } finally {
    if (descriptor) Object.defineProperty(window, 'MediaRecorder', descriptor); else delete window.MediaRecorder;
    if (devices) Object.defineProperty(navigator, 'mediaDevices', devices); else delete navigator.mediaDevices;
  }
});
