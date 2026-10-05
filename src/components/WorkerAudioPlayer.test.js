import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import WorkerAudioPlayer from './WorkerAudioPlayer';

test('shows the player, speed control and download link when ready', () => {
  render(<WorkerAudioPlayer src="blob:abc" filename="part-1.mp3" />);
  const link = screen.getByText('Download audio');
  expect(link.getAttribute('href')).toBe('blob:abc');
  expect(link.getAttribute('download')).toBe('part-1.mp3');
  expect(screen.getByLabelText('Speed')).toBeTruthy();
});

test('explains browser playback errors instead of leaving workers with a silent player', () => {
  render(<WorkerAudioPlayer src="blob:abc" />);
  const audio = screen.getByLabelText('Source recording audio');
  Object.defineProperty(audio, 'error', { configurable: true, value: { code: 3 } });
  fireEvent.error(audio);
  expect(screen.getByRole('alert')).toHaveTextContent(/could not be decoded in the browser/i);
  fireEvent.canPlay(audio);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('says so plainly while the recording is being prepared', () => {
  render(<WorkerAudioPlayer src="" loading />);
  expect(screen.getByText(/Preparing the recording/)).toBeTruthy();
});
