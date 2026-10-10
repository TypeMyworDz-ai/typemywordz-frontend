import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PdfJobsAdminPanel, { compressImageFile } from './PdfJobsAdminPanel';
import { setCurrentUserForTest } from '../contexts/AuthContext';

jest.mock('../contexts/AuthContext', () => {
  let currentUser = { uid: 'admin-1', email: 'typemywordz@gmail.com', getIdToken: async () => 'test-token' };
  return {
    useAuth: () => ({ currentUser }),
    setCurrentUserForTest: (nextUser) => { currentUser = nextUser; },
  };
});

const response = (payload = {}, ok = true) => ({ ok, json: async () => payload, blob: async () => new Blob(['combined pdf'], { type: 'application/pdf' }) });
const batch = { batch_id: 'upload-batch-1', category: 'text_messages', image_count: 4, job_count: 2, name: 'conversation.png + 1 more', download_name: 'conversation-combined', created_at: '2026-10-07T10:00:00Z' };

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

beforeEach(() => {
  setCurrentUserForTest({ uid: 'admin-1', email: 'typemywordz@gmail.com', getIdToken: async () => 'test-token' });
  global.fetch = jest.fn((url) => {
    if (String(url).includes('/recent-batches')) return Promise.resolve(response({ batches: [batch] }));
    return Promise.resolve(response({ created_count: 2 }));
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

test('image tabs only upload and download the combined PDF; queue actions are gone', async () => {
  render(<PdfJobsAdminPanel category="text_messages" />);
  expect(await screen.findByRole('button', { name: 'Download as one PDF' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Create image jobs' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: /Assign/i })).not.toBeInTheDocument();
  expect(screen.queryByText(/Whole-upload actions/i)).not.toBeInTheDocument();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  expect(global.fetch.mock.calls.some(([url]) => String(url).endsWith('/human-transcription/admin/pdf-jobs'))).toBe(false);
  expect(String(global.fetch.mock.calls[0][0])).toContain('category=text_messages');
});

test('downloads the whole upload as one PDF', async () => {
  render(<PdfJobsAdminPanel category="text_messages" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Download as one PDF' }));
  await waitFor(() => expect(global.fetch.mock.calls.some(([url]) => String(url).endsWith('/batches/upload-batch-1/download'))).toBe(true));
  await waitFor(() => expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled());
});

test('uploads staged images with the category and does not show a job list', async () => {
  render(<PdfJobsAdminPanel category="pdf" />);
  await screen.findByRole('heading', { name: 'PDF Jobs' });
  const input = document.querySelector('input[type="file"]');
  fireEvent.change(input, { target: { files: [new File(['x'], 'page.jpg', { type: 'image/jpeg' })] } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Create image jobs' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Create image jobs' }));
  await waitFor(() => expect(global.fetch.mock.calls.some(([url, options]) => String(url).endsWith('/human-transcription/admin/pdf-jobs') && options?.method === 'POST')).toBe(true));
  const [, options] = global.fetch.mock.calls.find(([url, call]) => String(url).endsWith('/human-transcription/admin/pdf-jobs') && call?.method === 'POST');
  expect(options.body.get('category')).toBe('pdf');
  expect(options.body.getAll('files')).toHaveLength(1);
});

test('compression leaves non-images and small JPEGs unchanged', async () => {
  const pdf = new File(['x'], 'a.pdf', { type: 'application/pdf' });
  expect(await compressImageFile(pdf)).toBe(pdf);
  const jpg = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
  expect(await compressImageFile(jpg)).toBe(jpg);
  global.createImageBitmap = jest.fn().mockRejectedValue(new Error('cannot decode'));
  const png = new File(['not really an image'], 'a.png', { type: 'image/png' });
  expect(await compressImageFile(png)).toBe(png);
});

test('uses the requested four-section instructions default', async () => {
  render(<PdfJobsAdminPanel category="pdf" />);
  expect(await screen.findByLabelText('Admin notes and special instructions')).toHaveValue('Client provided spellings: None\n\nClient Word List: None\n\nHint names from the Filename: None:\n\nOther instructions: None');
});
