import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import * as transcriptExport from '../utils/transcriptExport';
import FinalTranscriptView from './FinalTranscriptView';
import { ProofreadingAgentPanel, ProofreadingPartsNotice, proofreadingPartsHidden, proofreadingAgentReady } from './ProofreadingAgentPanel';

const parts = (statuses) => statuses.map((status, index) => ({ id: `p${index}`, label: `Part ${index + 1}`, status, transcript: `secret text ${index}` }));
const base = { id: 'j1', job_type: 'general_job', status: 'split_in_progress', split_mode: 'multi' };

test('parts are hidden from admins and listed as submitted for Proofreading', () => {
  const job = { ...base, segments: parts(['submitted', 'submitted']) };
  expect(proofreadingPartsHidden(job)).toBe(true);
  render(<FinalTranscriptView job={job} editable placeholder={<ProofreadingPartsNotice job={job} />} />);
  expect(screen.getByText('Part 1 submitted for Proofreading')).toBeInTheDocument();
  expect(screen.getByText('Part 2 submitted for Proofreading')).toBeInTheDocument();
  expect(screen.queryByText(/secret text/)).toBeNull();
});

test('button appears only once every part is submitted and starts the agent', () => {
  const act = jest.fn().mockResolvedValue();
  const waiting = { ...base, segments: parts(['submitted', 'in_progress']) };
  expect(proofreadingAgentReady(waiting)).toBe(false);
  const { rerender } = render(<ProofreadingAgentPanel job={waiting} act={act} busy={false} />);
  expect(screen.queryByRole('button', { name: /Run Proofreading Agent/ })).toBeNull();
  rerender(<ProofreadingAgentPanel job={{ id: 'j1', job_type: 'pdf_job', status: 'approved', pdf_review: { page_texts: ['page one'] } }} act={act} busy={false} />);
  fireEvent.click(screen.getByRole('button', { name: /Run Proofreading Agent/ }));
  expect(act).toHaveBeenCalledWith('/human-transcription/jobs/j1/proofreading-agent', expect.objectContaining({ method: 'POST' }), expect.any(String));
});

test('the Proofreading Agent button is inactive for General Jobs while paused', () => {
  const act = jest.fn().mockResolvedValue();
  render(<ProofreadingAgentPanel job={{ ...base, segments: parts(['submitted', 'submitted']) }} act={act} busy={false} />);
  const button = screen.getByRole('button', { name: /Run Proofreading Agent/ });
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(act).not.toHaveBeenCalled();
  expect(screen.getByRole('note')).toHaveTextContent(/paused for General Jobs/);
});

test('Copy to Word copies the submitted parts for a pre-proofreading backup', async () => {
  const copy = jest.spyOn(transcriptExport, 'copyForWord').mockResolvedValue();
  try {
    render(<ProofreadingAgentPanel job={{ ...base, segments: parts(['submitted', 'submitted']) }} act={jest.fn()} busy={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy to Word' }));
    await waitFor(() => expect(copy).toHaveBeenCalledWith('secret text 0\n\nsecret text 1'));
    expect(await screen.findByText('Copied to Word. Paste it into your document.')).toBeInTheDocument();
  } finally {
    copy.mockRestore();
  }
});

test('progress bar shows while running and the text is shown once finished', () => {
  const running = { ...base, segments: parts(['submitted', 'submitted']), proofreading_run: { status: 'processing', stage: 'Proofreading and joining the parts', progress: 55, startedAt: new Date().toISOString() } };
  render(<ProofreadingAgentPanel job={running} act={jest.fn()} busy={false} />);
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '55');
  expect(proofreadingPartsHidden({ ...running, proofreading_agent_completedAt: '2026-10-11T00:00:00Z' })).toBe(false);
  expect(proofreadingPartsHidden({ ...running, job_type: 'letter_job' })).toBe(false);
});
