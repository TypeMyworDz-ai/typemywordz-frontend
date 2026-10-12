import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdminWorkerRateOverrides from './AdminWorkerRateOverrides';

const workers = [
  { uid: 'worker-a', name: 'Worker A', email: 'a@example.com', rate_kes_per_minute: null },
  { uid: 'worker-b', name: 'Worker B', email: 'b@example.com', rate_kes_per_minute: 25 },
];

beforeEach(() => { window.confirm = jest.fn(() => true); });

test('admin selects one worker and saves an individual audio-minute rate', async () => {
  const request = jest.fn()
    .mockResolvedValueOnce({ workers, standard_rate_kes_per_minute: 30, minimum_rate_kes_per_minute: 1, maximum_rate_kes_per_minute: 500 })
    .mockResolvedValueOnce({ worker_uid: 'worker-a', rate_kes_per_minute: 40, standard_rate_kes_per_minute: 30 });
  render(<AdminWorkerRateOverrides request={request} standardRate={30} />);

  await screen.findByRole('option', { name: 'Worker A · a@example.com' });
  fireEvent.change(screen.getByLabelText('Select worker for individual rate'), { target: { value: 'worker-a' } });
  fireEvent.change(screen.getByLabelText('Custom rate per audio minute'), { target: { value: '40' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save individual rate' }));

  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  const [url, options] = request.mock.calls[1];
  expect(url).toBe('/human-transcription/admin/worker-rates/worker-a');
  expect(options.method).toBe('PUT');
  expect(options.body.get('transcriber_rate_kes_per_minute')).toBe('40');
  expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Worker A'));
});

test('admin can clear an override and restore standard job rates', async () => {
  const request = jest.fn()
    .mockResolvedValueOnce({ workers, standard_rate_kes_per_minute: 30, minimum_rate_kes_per_minute: 1, maximum_rate_kes_per_minute: 500 })
    .mockResolvedValueOnce({ worker_uid: 'worker-b', rate_kes_per_minute: null, standard_rate_kes_per_minute: 30 });
  render(<AdminWorkerRateOverrides request={request} standardRate={30} />);

  await screen.findByRole('option', { name: 'Worker B · b@example.com' });
  fireEvent.change(screen.getByLabelText('Select worker for individual rate'), { target: { value: 'worker-b' } });
  fireEvent.click(screen.getByRole('button', { name: 'Use standard rate' }));

  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  expect(request.mock.calls[1][1].body.get('transcriber_rate_kes_per_minute')).toBe('');
});
