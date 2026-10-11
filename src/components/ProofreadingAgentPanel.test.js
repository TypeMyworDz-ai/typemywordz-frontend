import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
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
  rerender(<ProofreadingAgentPanel job={{ ...base, segments: parts(['submitted', 'submitted']) }} act={act} busy={false} />);
  fireEvent.click(screen.getByRole('button', { name: /Run Proofreading Agent/ }));
  expect(act).toHaveBeenCalledWith('/human-transcription/jobs/j1/proofreading-agent', expect.objectContaining({ method: 'POST' }), expect.any(String));
});

test('progress bar shows while running and the text is shown once finished', () => {
  const running = { ...base, segments: parts(['submitted', 'submitted']), proofreading_run: { status: 'processing', stage: 'Proofreading and joining the parts', progress: 55, startedAt: new Date().toISOString() } };
  render(<ProofreadingAgentPanel job={running} act={jest.fn()} busy={false} />);
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '55');
  expect(proofreadingPartsHidden({ ...running, proofreading_agent_completedAt: '2026-10-11T00:00:00Z' })).toBe(false);
  expect(proofreadingPartsHidden({ ...running, job_type: 'letter_job' })).toBe(false);
});
