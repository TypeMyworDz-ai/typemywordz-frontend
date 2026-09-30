import React from 'react';
import { render, screen } from '@testing-library/react';
import WorkerAudioPlayer from './WorkerAudioPlayer';

test('shows the player, speed control and a download link when a recording is ready', () => {
  render(<WorkerAudioPlayer src="blob:abc" filename="part-1.mp3" />);
  const link = screen.getByText('Download audio');
  expect(link.getAttribute('href')).toBe('blob:abc');
  expect(link.getAttribute('download')).toBe('part-1.mp3');
  expect(screen.getByLabelText('Speed')).toBeTruthy();
});

test('says so plainly while the recording is being prepared', () => {
  render(<WorkerAudioPlayer src="" loading />);
  expect(screen.getByText(/Preparing the recording/)).toBeTruthy();
});
