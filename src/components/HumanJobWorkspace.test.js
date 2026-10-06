import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import HumanJobWorkspace from './HumanJobWorkspace';
import * as transcriptExport from '../utils/transcriptExport';
import { setCurrentUserForTest } from '../contexts/AuthContext';

jest.mock('../contexts/AuthContext', () => {
  let currentUser = { uid: 'worker-1', email: 'worker@example.com', getIdToken: async () => 'test-token' };
  return {
    useAuth: () => ({ currentUser }),
    setCurrentUserForTest: (nextUser) => { currentUser = nextUser; },
  };
});

jest.mock('./TranscriptEditor', () => function TranscriptEditorMock() {
  return <div>Transcript editor</div>;
});

const response = (payload) => ({ ok: true, text: async () => JSON.stringify(payload), json: async () => payload, blob: async () => new Blob([]) });

beforeEach(() => {
  setCurrentUserForTest({ uid: 'worker-1', email: 'worker@example.com', getIdToken: async () => 'test-token' });
  global.fetch = jest.fn((url) => {
    const address = String(url);
    if (address.includes('/human-transcription/jobs?scope=admin')) {
      return Promise.resolve(response({ jobs: [{ id: 'admin-job', status: 'approved', job_type: 'human_transcription', audio: { name: 'admin-audio.mp3' }, minutes: 2, quote_credits: 4, createdAt: '2026-10-03T00:00:00Z' }] }));
    }
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
    if (address.includes('/human-transcription/jobs/job-1/ai-draft')) return Promise.resolve(response({ draft: '\tFirst.  Second.', credits_charged: 1 }));
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

test('worker copies a formatted draft with the Word clipboard format', async () => {
  const copy = jest.spyOn(transcriptExport, 'copyForWord').mockResolvedValue();
  try {
    render(<HumanJobWorkspace mode="worker" initialJobId="job-1" />);
    const inProgressTab = await screen.findByRole('tab', { name: 'In Progress' });
    await waitFor(() => expect(inProgressTab).toHaveAttribute('aria-selected', 'true'));
    await screen.findByText('Part 2');
    fireEvent.click(screen.getByRole('button', { name: 'Get AI formatted draft' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Copy for Word' }));
    await waitFor(() => expect(copy).toHaveBeenCalledWith('\tFirst.  Second.'));
  } finally {
    copy.mockRestore();
  }
});

test('admin AI-agent choices describe the General and Template model routes', async () => {
  setCurrentUserForTest({ uid: 'admin-1', email: 'typemywordz@gmail.com', getIdToken: async () => 'test-token' });
  render(<HumanJobWorkspace mode="admin" />);

  expect(await screen.findByRole('button', { name: 'Assign general agent' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Assign template-aware agent' })).toBeInTheDocument();
  expect(screen.getByText(/General Jobs use Claude Sonnet 5.5 with Gemini 3.8 Flash fallback; Template Jobs use Claude Opus 5.5 with GPT-5.6 Sol fallback\./)).toBeInTheDocument();
});

test('admin assignment dropdown includes an online worker even with off-shift opt-in paused', async () => {
  setCurrentUserForTest({ uid: 'admin-1', email: 'typemywordz@gmail.com', getIdToken: async () => 'test-token' });
  global.fetch = jest.fn((url) => {
    const address = String(url);
    if (address.includes('/human-transcription/jobs?scope=admin')) return Promise.resolve(response({ jobs: [{
      id: 'admin-upload', status: 'approved', job_type: 'human_transcription', admin_uploaded: true,
      audio: { name: 'sample.mp3' }, minutes: 2, quote_credits: 0,
    }] }));
    if (address.endsWith('/human-transcription/workers')) return Promise.resolve(response({
      scheduled_now: false,
      workers: [{ uid: 'worker-online', name: 'Online Worker', email: 'worker@example.com', approved: true, online: true, available: false }],
    }));
    if (address.includes('/messages')) return Promise.resolve(response({ messages: [] }));
    return Promise.resolve(response({}));
  });
  render(<HumanJobWorkspace mode="admin" />);

  const workerSelect = await screen.findByLabelText('Worker');
  expect(Array.from(workerSelect.options).some((option) => option.value === 'worker-online')).toBe(true);
});

test('worker can opt into off-shift claims while online without clocking in', async () => {
  let presenceSeen = false;
  const shift = {
    status: 'off_shift', scheduled_now: false, call_in_active: false, clocked_in: false,
    off_shift_claim_enabled: true, off_shift_self_claim: false,
    message: 'Outside regular shift hours.',
  };
  global.fetch = jest.fn((url, options = {}) => {
    const address = String(url);
    if (address.endsWith('/human-transcription/worker/availability')) return Promise.resolve(response({ available: true }));
    if (address.endsWith('/human-transcription/worker/shift')) return Promise.resolve(response(shift));
    if (address.endsWith('/human-transcription/worker/shift/presence')) {
      presenceSeen = true;
      return Promise.resolve(response({ ...shift, off_shift_self_claim: true, can_claim: true, workroom_online: true }));
    }
    if (address.includes('/human-transcription/jobs?scope=available')) return Promise.resolve(response({
      jobs: [], worker_can_view_available: true, worker_can_claim: presenceSeen,
      worker_available: true, worker_shift_status: { off_shift_self_claim: presenceSeen },
    }));
    if (address.includes('/messages')) return Promise.resolve(response({ messages: [] }));
    return Promise.resolve(response({}));
  });
  render(<HumanJobWorkspace mode="worker" />);

  expect(await screen.findByText('Off-shift claiming is enabled')).toBeInTheDocument();
  expect(screen.getByText(/online and available/)).toBeInTheDocument();
  expect(global.fetch.mock.calls.some(([url, options]) => String(url).endsWith('/human-transcription/worker/shift/presence') && options.method === 'POST')).toBe(true);
});

test('admin can finish a complete internal AI draft after confirming no client delivery', async () => {
  setCurrentUserForTest({ uid: 'admin-1', email: 'typemywordz@gmail.com', getIdToken: async () => 'test-token' });
  const job = {
    id: 'draft-job', status: 'proofreading_available', job_type: 'human_transcription', admin_uploaded: true,
    audio: { name: 'sample.mp3' }, minutes: 2, quote_credits: 0,
    ai_agent_status: 'submitted', ai_agent_id: 'general-gpt', ai_agent_name: 'General Transcription Agent',
    segments: [{ id: 'part-1', status: 'submitted', transcript: 'Complete private draft.' }],
  };
  global.fetch = jest.fn((url, options = {}) => {
    const address = String(url);
    if (address.includes('/human-transcription/jobs?scope=admin')) return Promise.resolve(response({ jobs: [job] }));
    if (address.endsWith('/human-transcription/workers')) return Promise.resolve(response({ workers: [], scheduled_now: true }));
    if (address.includes('/messages')) return Promise.resolve(response({ messages: [] }));
    if (address.endsWith('/ai-agent/finish')) return Promise.resolve(response({ status: 'released', client_charged: false, client_notified: false }));
    return Promise.resolve(response({}));
  });
  render(<HumanJobWorkspace mode="admin" />);

  fireEvent.click(await screen.findByRole('button', { name: 'Finish internal job' }));
  const dialog = await screen.findByRole('alertdialog');
  expect(dialog).toHaveTextContent('will not be sent to a client, charge credits, or send a client notification');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Finish internal job' }));
  await waitFor(() => expect(global.fetch.mock.calls.some(([url, options]) => String(url).endsWith('/ai-agent/finish') && options.method === 'POST')).toBe(true));
});

test('admin sends extra template-job instructions and files with the template assignment', async () => {
  const templateJob = {
    id: 'template-job', status: 'approved', job_type: 'human_transcription',
    audio: { name: 'template-job.mp3', storage_path: 'private/audio.mp3' }, minutes: 3,
    instruction_attachments: [{ name: 'Client Template.docx', content_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }],
  };
  setCurrentUserForTest({ uid: 'admin-1', email: 'typemywordz@gmail.com', getIdToken: async () => 'test-token' });
  global.fetch = jest.fn((url) => {
    const address = String(url);
    if (address.includes('/human-transcription/jobs?scope=admin')) return Promise.resolve(response({ jobs: [templateJob] }));
    if (address.includes('/human-transcription/workers')) return Promise.resolve(response({ workers: [] }));
    if (address.includes('/messages')) return Promise.resolve(response({ messages: [] }));
    return Promise.resolve(response({ status: 'queued' }));
  });
  render(<HumanJobWorkspace mode="admin" />);

  const assignButton = await screen.findByRole('button', { name: 'Assign template-aware agent' });
  expect(assignButton).toBeEnabled();
  expect(screen.getByText(/Below are text-specific guidelines .* priority first over GENERAL guidelines/)).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: 'Additional template-job instructions' }), {
    target: { value: 'Preserve client-confirmed spellings and keep the dictated paragraph breaks.' },
  });
  const extraFile = new File(['Client reference notes'], 'client-reference.txt', { type: 'text/plain' });
  fireEvent.change(screen.getByLabelText('Extra reference files for this template job'), { target: { files: [extraFile] } });
  expect(screen.getByText('client-reference.txt')).toBeInTheDocument();

  fireEvent.click(assignButton);
  await waitFor(() => expect(global.fetch.mock.calls.some(([url]) => String(url).includes('/human-transcription/jobs/template-job/ai-agent/assign'))).toBe(true));
  const [, options] = global.fetch.mock.calls.find(([url]) => String(url).includes('/human-transcription/jobs/template-job/ai-agent/assign'));
  expect(options.method).toBe('POST');
  expect(options.body).toBeInstanceOf(FormData);
  expect(options.body.get('agent_id')).toBe('template-claude');
  expect(options.body.get('job_specific_guidelines')).toBe('Preserve client-confirmed spellings and keep the dictated paragraph breaks.');
  expect(options.body.get('reference_files').name).toBe('client-reference.txt');
  expect(options.headers['Content-Type']).toBeUndefined();
});

test('admin confirms whole-job AI takeover before pausing unclaimed split parts', async () => {
  const splitJob = {
    id: 'split-job', status: 'split_in_progress', split_mode: 'dual', job_type: 'human_transcription',
    audio: { name: 'full-audio.mp3' }, seconds: 300, minutes: 5, segments: [
      { id: 'part-1', label: 'Part 1', status: 'available' },
      { id: 'part-2', label: 'Part 2', status: 'approved' },
    ],
  };
  setCurrentUserForTest({ uid: 'admin-1', email: 'typemywordz@gmail.com', getIdToken: async () => 'test-token' });
  global.fetch = jest.fn((url) => {
    if (String(url).includes('/human-transcription/jobs?scope=admin')) return Promise.resolve(response({ jobs: [splitJob] }));
    if (String(url).includes('/messages')) return Promise.resolve(response({ messages: [] }));
    return Promise.resolve(response({ status: 'queued' }));
  });
  render(<HumanJobWorkspace mode="admin" />);

  fireEvent.click(await screen.findByRole('tab', { name: /In progress/ }));
  const takeover = await screen.findByRole('button', { name: 'Assign whole job to general agent' });
  expect(takeover).toBeEnabled();
  fireEvent.click(takeover);
  expect(await screen.findByRole('alertdialog', { name: 'Pause the parts and assign one whole-job draft?' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Pause parts and continue' }));

  await waitFor(() => expect(global.fetch.mock.calls.some(([url]) => String(url).includes('/ai-agent/assign'))).toBe(true));
  const [, options] = global.fetch.mock.calls.find(([url]) => String(url).includes('/ai-agent/assign'));
  expect(options.method).toBe('POST');
  expect(JSON.parse(options.body)).toEqual({ agent_id: 'general-gpt', segment_id: '', whole_job: true });
});

test('admin cannot take over a split job after any part is claimed', async () => {
  const splitJob = {
    id: 'split-job', status: 'split_in_progress', split_mode: 'dual', job_type: 'human_transcription',
    audio: { name: 'full-audio.mp3' }, seconds: 300, minutes: 5, segments: [
      { id: 'part-1', label: 'Part 1', status: 'available' },
      { id: 'part-2', label: 'Part 2', status: 'in_progress', worker_uid: 'worker-1' },
    ],
  };
  setCurrentUserForTest({ uid: 'admin-1', email: 'typemywordz@gmail.com', getIdToken: async () => 'test-token' });
  global.fetch = jest.fn((url) => {
    if (String(url).includes('/human-transcription/jobs?scope=admin')) return Promise.resolve(response({ jobs: [splitJob] }));
    if (String(url).includes('/messages')) return Promise.resolve(response({ messages: [] }));
    return Promise.resolve(response({}));
  });
  render(<HumanJobWorkspace mode="admin" />);

  fireEvent.click(await screen.findByRole('tab', { name: /In progress/ }));
  expect(await screen.findByRole('button', { name: 'Assign whole job to general agent' })).toBeDisabled();
  expect(screen.queryByRole('alertdialog', { name: 'Pause the parts and assign one whole-job draft?' })).not.toBeInTheDocument();
});

test('warns at ten deadline returns and blocks a third claim on the same whole job', async () => {
  global.fetch = jest.fn((url) => {
    const address = String(url);
    if (address.includes('/human-transcription/jobs?scope=available')) return Promise.resolve(response({
      jobs: [{
        id: 'general-1', status: 'approved', job_type: 'general_job', job_category: 'general',
        job_name: 'General interview', claimable_full_job: true, claim_attempt_count: 2,
        max_claims_per_item: 2, can_claim: false,
        claim_block_reason: 'You have already successfully claimed this job twice.',
      }],
      worker_rating_summary: { average: 4.5, count: 2 }, worker_can_view_available: true,
      worker_active_assignment: false, worker_available: true, worker_can_claim: true,
      worker_claim_block_reason: '', worker_deadline_return_count: 10, worker_deadline_warning: true,
    }));
    if (address.includes('/human-transcription/jobs?scope=assigned')) return Promise.resolve(response({ jobs: [] }));
    if (address.endsWith('/human-transcription/worker/payment-history')) return Promise.resolve(response({ pending_payouts: [], paid: [], accruing: [] }));
    if (address.includes('/human-transcription/workers')) return Promise.resolve(response({ workers: [] }));
    return Promise.resolve(response({ jobs: [] }));
  });
  render(<HumanJobWorkspace mode="worker" />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Deadline reminder · 10 returns');
  expect(await screen.findByRole('button', { name: 'Claim job' })).toBeDisabled();
  expect(screen.getByText(/already successfully claimed this job twice/)).toBeInTheDocument();
});
