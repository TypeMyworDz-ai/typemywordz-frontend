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
    if (address.includes('/human-transcription/jobs/job-1/ai-draft/proofread')) return Promise.resolve(response({ proofread: '\tFirst.  Second proofread.', credits_charged: 5 }));
    if (address.includes('/human-transcription/jobs/job-1/ai-draft')) return Promise.resolve(response({ draft: '\tFirst.  Second.', credits_charged: 0 }));
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
    fireEvent.click(screen.getByRole('button', { name: /Generate formatted draft/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Copy original draft for Word' }));
    await waitFor(() => expect(copy).toHaveBeenCalledWith('\tFirst.  Second.'));
  } finally {
    copy.mockRestore();
  }
});

test('worker can proofread the draft for five credits and insert only the separate proofread version', async () => {
  document.execCommand = jest.fn(() => false);
  render(<HumanJobWorkspace mode="worker" initialJobId="job-1" />);
  const inProgressTab = await screen.findByRole('tab', { name: 'In Progress' });
  await waitFor(() => expect(inProgressTab).toHaveAttribute('aria-selected', 'true'));
  await screen.findByText('Part 2');
  fireEvent.click(screen.getByRole('button', { name: /Generate formatted draft/ }));
  expect(await screen.findByText(/First\.\s+Second\./)).toBeInTheDocument();
  expect(screen.getByText(/costs 6 credits: 5 per started audio minute \(rounded up\) plus 1 formatting credit/)).toBeInTheDocument();
  expect(document.querySelector('.tm-worker-ai-text-preview')).toHaveStyle({ tabSize: '0.5in' });
  expect(screen.queryByText(/Claude Sonnet 5\.5|Claude Haiku 5\.5|Claude Haiku 4\.5|ChatGPT 5\.6 Terra|GPT-5\.6 Luna|Gemini 3\.5 Flash-Lite|Gemini 3\.8/)).not.toBeInTheDocument();
  expect(screen.getByText('Proofread this draft here before you start transcribing')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Proofread this draft · 5 credits' }));
  expect(await screen.findByText('Proofread version')).toBeInTheDocument();
  expect(screen.getByText(/Second proofread\./)).toBeInTheDocument();
  expect(document.querySelectorAll('.tm-worker-ai-text-preview')).toHaveLength(2);
  expect([...document.querySelectorAll('.tm-worker-ai-text-preview')].every((node) => node.style.tabSize === '0.5in')).toBe(true);
  expect(screen.getByText(/First\.\s+Second\./)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Insert proofread text into editor' }));
  expect(screen.getByRole('textbox', { name: 'Transcript editor' })).toHaveTextContent('Second proofread.');
  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining('/human-transcription/jobs/job-1/ai-draft/proofread'),
    expect.objectContaining({ method: 'POST' }),
  );
});

test('admin AI-agent choices describe the General and Template model routes', async () => {
  setCurrentUserForTest({ uid: 'admin-1', email: 'typemywordz@gmail.com', getIdToken: async () => 'test-token' });
  render(<HumanJobWorkspace mode="admin" />);

  expect(await screen.findByRole('button', { name: 'Assign general agent' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Assign template-aware agent' })).toBeInTheDocument();
  expect(screen.getByText(/General Jobs use Gemini 3.8 Flash with GPT-5.6 Terra fallback; Template Jobs use GPT-5.6 Sol with Claude Opus 5.5 fallback\./)).toBeInTheDocument();
});

test('off-shift assignment dropdown requires a worker who is both clocked in and online', async () => {
  setCurrentUserForTest({ uid: 'admin-1', email: 'typemywordz@gmail.com', getIdToken: async () => 'test-token' });
  global.fetch = jest.fn((url) => {
    const address = String(url);
    if (address.includes('/human-transcription/jobs?scope=admin')) return Promise.resolve(response({ jobs: [{
      id: 'admin-upload', status: 'approved', job_type: 'human_transcription', admin_uploaded: true,
      audio: { name: 'sample.mp3' }, minutes: 2, quote_credits: 0,
    }] }));
    if (address.endsWith('/human-transcription/workers')) return Promise.resolve(response({
      scheduled_now: false,
      workers: [
        { uid: 'worker-online', name: 'Online Worker', email: 'worker@example.com', approved: true, call_in_active: true, online: true, clocked_in: true },
        { uid: 'worker-not-clocked-in', name: 'Not Clocked In', email: 'not-clocked@example.com', approved: true, call_in_active: true, online: true, clocked_in: false },
        { uid: 'worker-not-called-in', name: 'Not Called In', email: 'not-called@example.com', approved: true, call_in_active: false, online: true, clocked_in: true },
      ],
    }));
    if (address.includes('/messages')) return Promise.resolve(response({ messages: [] }));
    return Promise.resolve(response({}));
  });
  render(<HumanJobWorkspace mode="admin" />);

  const workerSelect = await screen.findByLabelText('Worker');
  expect(Array.from(workerSelect.options).some((option) => option.value === 'worker-online')).toBe(true);
  expect(Array.from(workerSelect.options).some((option) => option.value === 'worker-not-clocked-in')).toBe(false);
  expect(Array.from(workerSelect.options).some((option) => option.value === 'worker-not-called-in')).toBe(false);
});

test('Available for work only controls online presence and does not enable off-shift claims', async () => {
  let availability = false;
  let presenceSeen = false;
  const shift = {
    status: 'off_shift', scheduled_now: false, call_in_active: false, clocked_in: false,
    online: false, off_shift_claim_enabled: false, off_shift_self_claim: false,
    message: 'There are no regular weekend shifts.',
  };
  global.fetch = jest.fn((url, options = {}) => {
    const address = String(url);
    if (address.endsWith('/human-transcription/worker/availability')) {
      if (options.method === 'POST') availability = JSON.parse(options.body).available;
      return Promise.resolve(response({ available: availability }));
    }
    if (address.endsWith('/human-transcription/worker/shift')) return Promise.resolve(response(shift));
    if (address.endsWith('/human-transcription/worker/shift/presence')) {
      presenceSeen = true;
      return Promise.resolve(response({ ...shift, online: true, workroom_online: true, available_for_work: true, can_claim: false }));
    }
    if (address.includes('/human-transcription/jobs?scope=available')) return Promise.resolve(response({
      jobs: [], worker_can_view_available: true, worker_can_claim: false,
      worker_available: availability, worker_shift_status: { off_shift_self_claim: false },
    }));
    if (address.includes('/messages')) return Promise.resolve(response({ messages: [] }));
    return Promise.resolve(response({}));
  });
  render(<HumanJobWorkspace mode="worker" />);

  const availableSwitch = await screen.findByRole('switch', { name: 'Available for work' });
  fireEvent.click(availableSwitch);
  await waitFor(() => expect(presenceSeen).toBe(true));
  expect(await screen.findByText('Online · not clocked in')).toBeInTheDocument();
  expect(screen.getByText(/does not record attendance or allow claims/i)).toBeInTheDocument();
  expect(screen.queryByText('Off-shift claiming is enabled')).not.toBeInTheDocument();
  expect(availability).toBe(true);
  expect(global.fetch.mock.calls.some(([url, options]) => String(url).endsWith('/human-transcription/worker/shift/presence') && options.method === 'POST')).toBe(true);
});

test('shift attendance shows online presence separately from missed attendance and keeps call-in available', async () => {
  setCurrentUserForTest({ uid: 'admin-1', email: 'typemywordz@gmail.com', getIdToken: async () => 'test-token' });
  global.fetch = jest.fn((url) => {
    const address = String(url);
    if (address.includes('/human-transcription/jobs?scope=admin')) return Promise.resolve(response({ jobs: [] }));
    if (address.endsWith('/human-transcription/workers')) return Promise.resolve(response({ workers: [], scheduled_now: false }));
    if (address.endsWith('/human-transcription/admin/shifts')) return Promise.resolve(response({
      date: '2026-10-06', workers: [{
        uid: 'worker-1', name: 'Presence Worker', email: 'worker@example.com', online: true,
        clocked_in: false, status: 'missed', call_in_active: false, misses_consecutive: 1,
      }],
    }));
    if (address.includes('/messages')) return Promise.resolve(response({ messages: [] }));
    return Promise.resolve(response({}));
  });
  render(<HumanJobWorkspace mode="admin" />);

  fireEvent.click(await screen.findByRole('tab', { name: 'Shift attendance' }));
  const workerRow = await screen.findByRole('row', { name: /Presence Worker/ });
  expect(within(workerRow).getByText('Online')).toBeInTheDocument();
  expect(within(workerRow).getByText('Missed shift')).toBeInTheDocument();
  expect(within(workerRow).getByRole('button', { name: 'Call in' })).toBeEnabled();
});

test('admin can finish complete internal AI work after confirming no client delivery', async () => {
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
    if (address.endsWith('/finish')) return Promise.resolve(response({ status: 'released', client_charged: false, client_notified: false }));
    return Promise.resolve(response({}));
  });
  render(<HumanJobWorkspace mode="admin" />);

  fireEvent.click(await screen.findByRole('button', { name: 'Finish Job' }));
  const dialog = await screen.findByRole('alertdialog');
  expect(dialog).toHaveTextContent('will not charge credits or send a client notification');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Finish Job' }));
  await waitFor(() => expect(global.fetch.mock.calls.some(([url, options]) => String(url).endsWith('/human-transcription/jobs/draft-job/finish') && options.method === 'POST')).toBe(true));
});

test('admin can finish client work without bypassing client approval or charging credits', async () => {
  setCurrentUserForTest({ uid: 'admin-1', email: 'typemywordz@gmail.com', getIdToken: async () => 'test-token' });
  const job = {
    id: 'client-job', status: 'submitted', job_type: 'general_job', client_uid: 'client-1',
    transcript: 'Completed and proofread transcript.', audio: { name: 'client-audio.mp3' }, minutes: 2,
  };
  global.fetch = jest.fn((url, options = {}) => {
    const address = String(url);
    if (address.includes('/human-transcription/jobs?scope=admin')) return Promise.resolve(response({ jobs: [job] }));
    if (address.endsWith('/human-transcription/workers')) return Promise.resolve(response({ workers: [], scheduled_now: true }));
    if (address.includes('/messages')) return Promise.resolve(response({ messages: [] }));
    if (address.endsWith('/human-transcription/jobs/client-job/finish')) return Promise.resolve(response({ status: 'client_review', client_review_required: true, client_charged: false }));
    return Promise.resolve(response({}));
  });
  render(<HumanJobWorkspace mode="admin" />);

  fireEvent.click(await screen.findByRole('tab', { name: /Submitted/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Finish Job' }));
  const dialog = await screen.findByRole('alertdialog');
  expect(dialog).toHaveTextContent('The client will be notified to check the transcript');
  expect(dialog).toHaveTextContent('credits are not charged unless the client approves');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Finish Job' }));
  await waitFor(() => expect(global.fetch.mock.calls.some(([url, options]) => String(url).endsWith('/human-transcription/jobs/client-job/finish') && options.method === 'POST')).toBe(true));
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

test('warns at ten deadline returns and blocks a second claim on the same whole job', async () => {
  global.fetch = jest.fn((url) => {
    const address = String(url);
    if (address.includes('/human-transcription/jobs?scope=available')) return Promise.resolve(response({
      jobs: [{
        id: 'general-1', status: 'approved', job_type: 'general_job', job_category: 'general',
        job_name: 'General interview', claimable_full_job: true, claim_attempt_count: 1,
        max_claims_per_item: 1, can_claim: false,
        claim_block_reason: 'You have already claimed this job once. It cannot be claimed again.',
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
  expect(screen.getByText(/already claimed this job once/)).toBeInTheDocument();
});

test('Human Work sub-admin sees only their own payment tab and shift reminder', async () => {
  setCurrentUserForTest({ uid: 'subadmin-1', email: 'info@typemywordz.ai', getIdToken: async () => 'test-token' });
  global.fetch = jest.fn((url) => {
    const address = String(url);
    if (address.includes('/human-transcription/jobs?scope=admin')) return Promise.resolve(response({ jobs: [] }));
    if (address.endsWith('/human-transcription/workers')) return Promise.resolve(response({ workers: [], scheduled_now: true }));
    if (address.endsWith('/human-transcription/subadmin/payment-history')) return Promise.resolve(response({
      earnings: [{ earning_id: 'earned-1', shift_date: '2026-10-05', job_name: 'Interview', category: 'image_human', quantity: 30, measure: 'words', rate_kes_per_unit: 0.001, amount_kes: 0.03, payout_status: 'accruing' }],
      payouts: [], totals: { accruing_kes: 0.03, pending_kes: 0, paid_kes: 0 },
    }));
    return Promise.resolve(response({}));
  });
  render(<HumanJobWorkspace mode="admin" restricted />);

  expect(await screen.findByRole('heading', { name: 'Human Work Queue' })).toBeInTheDocument();
  expect(screen.getByText(/Keep all shift work inside the TypeMyworDz system/)).toBeInTheDocument();
  const paymentsTab = screen.getByRole('tab', { name: 'My payments · KES' });
  expect(screen.queryByRole('tab', { name: 'Shift attendance' })).not.toBeInTheDocument();
  expect(screen.queryByRole('tab', { name: 'Sub-admin payments' })).not.toBeInTheDocument();
  expect(screen.queryByRole('tab', { name: 'Worker payments · KES' })).not.toBeInTheDocument();
  fireEvent.click(paymentsTab);
  expect(await screen.findByRole('heading', { name: 'Your payment record' })).toBeInTheDocument();
  expect(await screen.findAllByText('KES 0.030')).toHaveLength(2);
  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining('/human-transcription/subadmin/payment-history'),
    expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer test-token' }) }),
  );
});

test('main admin alone sees sub-admin payroll management and rate tabs', async () => {
  setCurrentUserForTest({ uid: 'admin-1', email: 'typemywordz@gmail.com', getIdToken: async () => 'test-token' });
  global.fetch = jest.fn((url) => {
    const address = String(url);
    if (address.includes('/human-transcription/jobs?scope=admin')) return Promise.resolve(response({ jobs: [] }));
    if (address.endsWith('/human-transcription/workers')) return Promise.resolve(response({ workers: [], scheduled_now: true }));
    return Promise.resolve(response({}));
  });
  render(<HumanJobWorkspace mode="admin" />);
  expect(await screen.findByRole('tab', { name: 'Sub-admin payments' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Sub-admin rates' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Shift attendance' })).toBeInTheDocument();
  expect(screen.queryByRole('tab', { name: 'My payments · KES' })).not.toBeInTheDocument();
});

test('admin can save worker feedback without changing job completion', async () => {
  setCurrentUserForTest({ uid: 'admin-1', email: 'typemywordz@gmail.com', getIdToken: async () => 'test-token' });
  const submittedJob = {
    id: 'submitted-job', status: 'submitted', job_type: 'human_transcription', job_name: 'Submitted audio',
    worker_uid: 'worker-1', worker_name: 'Worker One', worker_email: 'worker@example.com', transcript: 'Completed transcript.',
    minutes: 2, quote_credits: 0, createdAt: '2026-10-06T12:00:00Z', segments: [],
  };
  global.fetch = jest.fn((url) => {
    const address = String(url);
    if (address.includes('/human-transcription/jobs?scope=admin')) return Promise.resolve(response({ jobs: [submittedJob] }));
    if (address.includes('/human-transcription/jobs/submitted-job/messages')) return Promise.resolve(response({ messages: [], thread: 'worker' }));
    if (address.endsWith('/human-transcription/worker/payment-history')) return Promise.resolve(response({ pending_payouts: [], paid: [], accruing: [] }));
    return Promise.resolve(response({}));
  });

  render(<HumanJobWorkspace mode="admin" />);
  fireEvent.click(await screen.findByRole('tab', { name: /Submitted/ }));
  fireEvent.click(await screen.findByRole('button', { name: /Submitted audio/ }));
  expect(await screen.findByRole('button', { name: 'Save worker rating and comments' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Finish Job' })).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('Worker rating'), { target: { value: '4' } });
  fireEvent.change(screen.getByPlaceholderText('Comments for this worker'), { target: { value: 'Clear and accurate.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save worker rating and comments' }));

  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining('/human-transcription/jobs/submitted-job/rate-part'),
    expect.objectContaining({ method: 'POST', body: JSON.stringify({ segment_id: '', rating: 4, note: 'Clear and accurate.' }) }),
  ));
  expect(global.fetch.mock.calls.some(([url]) => String(url).includes('/review') || String(url).includes('/finish-job'))).toBe(false);
});

test('admin Archived Jobs tab requests the retained archived job list', async () => {
  setCurrentUserForTest({ uid: 'admin-1', email: 'typemywordz@gmail.com', getIdToken: async () => 'test-token' });
  render(<HumanJobWorkspace mode="admin" />);
  const archivedTab = await screen.findByRole('tab', { name: 'Archived Jobs' });
  fireEvent.click(archivedTab);
  expect(await screen.findByText('Archived after three days')).toBeInTheDocument();
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining('/human-transcription/jobs?scope=archived'),
    expect.any(Object),
  ));
  expect(screen.getByText('No jobs have reached the three-day archive yet.')).toBeInTheDocument();
});

test('worker sees a clear locked-recording notice and no audio request until the draft exists', async () => {
  const base = global.fetch;
  global.fetch = jest.fn((url, options) => {
    const address = String(url);
    if (address.includes('/human-transcription/jobs?scope=assigned')) {
      return Promise.resolve(response({
        jobs: [{
          id: 'job-9', status: 'in_progress', audio: { name: 'rec.mp3' }, transcript: '', minutes: 5, audio_locked: true,
          worker_assignment: { id: 'transcriber', role: 'transcriber', status: 'in_progress', label: 'Whole job' },
          time_remaining_seconds: 240,
        }],
        worker_rating_summary: { average: 4.25, count: 2 },
        worker_can_view_available: true, worker_active_assignment: true,
        worker_available: true, worker_can_claim: false, worker_claim_block_reason: '',
      }));
    }
    return base(url, options);
  });
  render(<HumanJobWorkspace mode="worker" initialJobId="job-9" />);
  expect(await screen.findByText('Your recording is locked for now')).toBeInTheDocument();
  expect(screen.getByText(/If the draft fails, contact the admin and they will open the recording/)).toBeInTheDocument();
  expect(global.fetch.mock.calls.some(([url]) => String(url).includes('/jobs/job-9/audio'))).toBe(false);
});
