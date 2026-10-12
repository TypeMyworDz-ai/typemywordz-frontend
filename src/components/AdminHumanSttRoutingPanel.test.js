import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AdminHumanSttRoutingPanel from './AdminHumanSttRoutingPanel';

const providers = [
  { id: 'assemblyai', label: 'AssemblyAI' },
  { id: 'deepgram', label: 'Deepgram' },
  { id: 'voxtral', label: 'Voxtral' },
  { id: 'openai', label: 'OpenAI' },
];
const stages = [
  { key: 'audio_agent', label: 'Admin audio-job agent first draft', order: ['assemblyai'], comparison: '', default: { order: ['assemblyai'], comparison: '' }, customised: false },
  { key: 'proofreading_agent', label: 'Proofreading Agent whole-audio reference', order: ['deepgram'], comparison: '', default: { order: ['deepgram'], comparison: '' }, customised: false },
];

test('shows stage defaults and saves a selected second transcript provider', async () => {
  const calls = [];
  global.fetch = jest.fn((url, options = {}) => {
    calls.push([String(url), options.method || 'GET', options.body]);
    return Promise.resolve({ ok: true, json: async () => ({ stages, providers }) });
  });
  render(<AdminHumanSttRoutingPanel currentUser={{ getIdToken: async () => 'token' }} showMessage={() => {}} />);
  const stage = await screen.findByText('Admin audio-job agent first draft');
  const card = stage.closest('article');
  expect(within(card).getByLabelText('Admin audio-job agent first draft Primary provider')).toHaveValue('assemblyai');
  expect(within(card).getByText(/default: AssemblyAI/)).toBeInTheDocument();
  fireEvent.click(within(card).getByLabelText('Run a second speech transcript for comparison'));
  fireEvent.change(within(card).getByLabelText('Admin audio-job agent first draft comparison provider'), { target: { value: 'deepgram' } });
  fireEvent.click(within(card).getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(calls.some(([url, method, body]) => url.endsWith('/api/admin/human-work-stt-routing') && method === 'PUT' && JSON.parse(body).key === 'audio_agent' && JSON.parse(body).comparison === 'deepgram')).toBe(true));
});
