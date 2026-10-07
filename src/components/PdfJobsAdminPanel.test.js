import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PdfJobsAdminPanel from './PdfJobsAdminPanel';
import { setCurrentUserForTest } from '../contexts/AuthContext';

jest.mock('../contexts/AuthContext', () => {
  let currentUser = { uid: 'admin-1', email: 'typemywordz@gmail.com', getIdToken: async () => 'test-token' };
  return {
    useAuth: () => ({ currentUser }),
    setCurrentUserForTest: (nextUser) => { currentUser = nextUser; },
  };
});

const response = (payload = {}, ok = true) => ({
  ok,
  json: async () => payload,
  blob: async () => new Blob(['combined pdf'], { type: 'application/pdf' }),
});

const uploadJobs = (category, status = 'approved') => [
  {
    id: 'image-job-2', category, batch_id: 'source-file-2', upload_batch_id: 'upload-batch-1',
    upload_page_number: 2, page_number: 1, has_text: status === 'submitted',
    upload_batch_name: 'conversation.png + 1 more', upload_download_name: 'conversation-combined',
    source_filename: 'follow-up.png', name: 'follow-up.jpg', status,
  },
  {
    id: 'image-job-1', category, batch_id: 'source-file-1', upload_batch_id: 'upload-batch-1',
    upload_page_number: 1, page_number: 1, has_text: status === 'submitted',
    upload_batch_name: 'conversation.png + 1 more', upload_download_name: 'conversation-combined',
    source_filename: 'conversation.png', name: 'conversation.jpg', status,
  },
];

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

beforeEach(() => {
  setCurrentUserForTest({ uid: 'admin-1', email: 'typemywordz@gmail.com', getIdToken: async () => 'test-token' });
  global.fetch = jest.fn((url) => {
    if (String(url).endsWith('/human-transcription/admin/pdf-jobs')) return Promise.resolve(response({ jobs: [] }));
    if (String(url).endsWith('/human-transcription/admin/worker-options')) return Promise.resolve(response({ workers: [], scheduled_now: true }));
    return Promise.resolve(response());
  });
  URL.createObjectURL = jest.fn(() => 'blob:combined-pdf');
  URL.revokeObjectURL = jest.fn();
  jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
});

test.each([
  ['pdf', 'images'],
  ['text_messages', 'screenshots'],
])('admins can download all %s upload images together before workers claim them', async (category, downloadLabel) => {
  global.fetch = jest.fn((url) => {
    const address = String(url);
    if (address.endsWith('/human-transcription/admin/pdf-jobs')) return Promise.resolve(response({ jobs: uploadJobs(category) }));
    if (address.endsWith('/human-transcription/admin/worker-options')) return Promise.resolve(response({ workers: [], scheduled_now: true }));
    if (address.includes('/batches/upload-batch-1/download')) return Promise.resolve(response());
    return Promise.resolve(response());
  });

  render(<PdfJobsAdminPanel category={category} />);

  const downloadButton = await screen.findByRole('button', { name: `Download all ${downloadLabel} as PDF` });
  expect(downloadButton).toBeEnabled();
  expect(screen.getAllByRole('button', { name: `Download all ${downloadLabel} as PDF` })).toHaveLength(1);
  fireEvent.click(downloadButton);

  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining('/human-transcription/admin/pdf-jobs/batches/upload-batch-1/download'),
    expect.objectContaining({ headers: { Authorization: 'Bearer test-token' }, cache: 'no-store' }),
  ));
  await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
  expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
});

test.each([
  ['pdf', 'pdf-gemini', 'PDF Agent (Gemini 3.8)'],
  ['text_messages', 'text-messages-gemini', 'Text Messages Agent'],
])('assigns a whole %s upload to its image agent in original upload order', async (category, agentId, agentLabel) => {
  const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true);
  global.fetch = jest.fn((url) => {
    const address = String(url);
    if (address.endsWith('/human-transcription/admin/pdf-jobs')) return Promise.resolve(response({ jobs: uploadJobs(category) }));
    if (address.endsWith('/human-transcription/admin/worker-options')) return Promise.resolve(response({ workers: [], scheduled_now: true }));
    return Promise.resolve(response());
  });

  render(<PdfJobsAdminPanel category={category} />);
  const batchButton = await screen.findByRole('button', { name: `Draft all 2 images together with ${agentLabel}` });
  expect(batchButton).toHaveClass('tm-pdf-jobs-btn-ai');
  fireEvent.click(batchButton);

  await waitFor(() => {
    const assignmentCalls = global.fetch.mock.calls.filter(([url, options]) => String(url).includes('/ai-agent/assign') && options?.method === 'POST');
    expect(assignmentCalls).toHaveLength(2);
    assignmentCalls.forEach(([, options]) => {
      const body = JSON.parse(options.body);
      expect(body.agent_id).toBe(agentId);
      expect(body.upload_batch_id).toBe('upload-batch-1');
      expect(body.batch_job_ids).toEqual(['image-job-1', 'image-job-2']);
    });
  });
  expect(confirm).toHaveBeenCalled();
});

test.each([
  ['pdf'],
  ['text_messages'],
])('creates an ordered whole-upload %s proofreading job after every image has text', async (category) => {
  global.fetch = jest.fn((url) => {
    const address = String(url);
    if (address.endsWith('/human-transcription/admin/pdf-jobs')) return Promise.resolve(response({ jobs: uploadJobs(category, 'submitted') }));
    if (address.endsWith('/human-transcription/admin/worker-options')) return Promise.resolve(response({ workers: [], scheduled_now: true }));
    return Promise.resolve(response());
  });

  render(<PdfJobsAdminPanel category={category} />);
  const reviewButton = await screen.findByRole('button', { name: 'Create whole-upload proofread job' });
  expect(reviewButton).toHaveClass('tm-pdf-jobs-btn-ai');
  fireEvent.click(reviewButton);
  await waitFor(() => {
    const reviewCall = global.fetch.mock.calls.find(([url, options]) => String(url).endsWith('/human-transcription/admin/pdf-jobs/file-review') && options?.method === 'POST');
    expect(reviewCall).toBeTruthy();
    const body = JSON.parse(reviewCall[1].body);
    expect(body.job_ids).toEqual(['image-job-1', 'image-job-2']);
    expect(body.upload_batch_id).toBe('upload-batch-1');
  });
});

test.each([
  ['pdf', 'pdf-gemini', 'PDF Agent (Gemini 3.8)'],
  ['text_messages', 'text-messages-gemini', 'Text Messages Agent'],
])('keeps individual %s image assignment available', async (category, agentId, agentLabel) => {
  global.fetch = jest.fn((url) => {
    const address = String(url);
    if (address.endsWith('/human-transcription/admin/pdf-jobs')) return Promise.resolve(response({ jobs: uploadJobs(category) }));
    if (address.endsWith('/human-transcription/admin/worker-options')) return Promise.resolve(response({ workers: [], scheduled_now: true }));
    return Promise.resolve(response());
  });

  render(<PdfJobsAdminPanel category={category} />);
  const singleImageButtons = await screen.findAllByRole('button', { name: `Assign ${agentLabel} draft` });
  expect(singleImageButtons[0]).toHaveClass('tm-pdf-jobs-btn-ai');
  fireEvent.click(singleImageButtons[0]);
  await waitFor(() => {
    const call = global.fetch.mock.calls.find(([url, options]) => String(url).includes('/ai-agent/assign') && options?.method === 'POST');
    expect(call).toBeTruthy();
    const body = JSON.parse(call[1].body);
    expect(body.agent_id).toBe(agentId);
    expect(body.batch_job_ids).toBeUndefined();
    expect(body.upload_batch_id).toBeUndefined();
  });
});
