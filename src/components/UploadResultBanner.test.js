import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import UploadResultBanner, { announceJobsChanged } from './UploadResultBanner';

test('success message stays visible and offers the queue', () => {
  const open = jest.fn();
  render(<UploadResultBanner result={{ kind: 'success', title: 'Human Job.mp3', detail: 'Created.', at: Date.now() }} onOpenQueue={open} onDismiss={() => {}} />);
  expect(screen.getByText(/Upload complete: Human Job.mp3/)).toBeInTheDocument();
  fireEvent.click(screen.getByText('View in Job Queue'));
  expect(open).toHaveBeenCalled();
});

test('shows a do-not-upload-again notice while working and a clear error', () => {
  const { rerender } = render(<UploadResultBanner working="Uploading a.mp3…" />);
  expect(screen.getByText(/do not upload again/i)).toBeInTheDocument();
  rerender(<UploadResultBanner result={{ kind: 'error', title: 'a.mp3', detail: 'Too big' }} />);
  expect(screen.getByRole('alert')).toHaveTextContent('Too big');
});

test('announces job changes with a window event', () => {
  const handler = jest.fn();
  window.addEventListener('tm-human-jobs-changed', handler);
  announceJobsChanged();
  window.removeEventListener('tm-human-jobs-changed', handler);
  expect(handler).toHaveBeenCalledTimes(1);
});
