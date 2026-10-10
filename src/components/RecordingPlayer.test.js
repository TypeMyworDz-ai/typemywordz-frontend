import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import RecordingPlayer, { formatClock } from './RecordingPlayer';
import { DEFAULT_PLAYER_SHORTCUTS, savePlayerShortcut, readPlayerShortcuts, validatePlayerShortcut } from '../playerShortcuts';
import { DEFAULT_RECORDER_SHORTCUT } from '../recorderShortcut';

beforeEach(() => {
  window.localStorage.clear();
  window.HTMLMediaElement.prototype.play = jest.fn().mockResolvedValue();
  window.HTMLMediaElement.prototype.pause = jest.fn();
});

test('formats clock as HH:MM:SS and never shows Infinity or NaN', () => {
  expect(formatClock(0)).toBe('00:00:00');
  expect(formatClock(3725)).toBe('01:02:05');
  expect(formatClock(Infinity)).toBe('00:00:00');
  expect(formatClock(NaN)).toBe('00:00:00');
});

test('shows controls, the known length, and speed up to 300 percent', () => {
  render(<RecordingPlayer src="blob:x" durationHint={65} userId="u1" />);
  expect(screen.getByText('00:00:00 / 00:01:05')).toBeInTheDocument();
  const speed = screen.getByLabelText('Speed');
  expect(speed).toHaveAttribute('max', '3');
  fireEvent.change(speed, { target: { value: '3' } });
  expect(screen.getByText('Speed 300%')).toBeInTheDocument();
  expect(screen.getByLabelText('Volume')).toBeInTheDocument();
});

test('play, rewind and go-to-start buttons drive the audio element', () => {
  const { container } = render(<RecordingPlayer src="blob:x" durationHint={120} userId="u1" />);
  const audio = container.querySelector('audio');
  fireEvent.click(screen.getByRole('button', { name: 'Play' }));
  expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalled();
  audio.currentTime = 30;
  fireEvent.click(screen.getByRole('button', { name: /Rewind 5s/ }));
  expect(audio.currentTime).toBe(25);
  fireEvent.click(screen.getByRole('button', { name: /Go to 00:00:00/ }));
  expect(audio.currentTime).toBe(0);
});

test('default keyboard shortcut toggles playback and custom ones are honoured', () => {
  render(<RecordingPlayer src="blob:x" durationHint={60} userId="u1" />);
  fireEvent.keyDown(window, { key: 'p', code: 'KeyP', altKey: true });
  expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  expect(savePlayerShortcut('u1', 'playPause', { key: 'k', code: 'KeyK', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false })).toBe(true);
  fireEvent.keyDown(window, { key: 'k', code: 'KeyK' });
  expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
});

test('shortcut storage defaults and validation', () => {
  expect(readPlayerShortcuts('nobody').rewind.key).toBe(DEFAULT_PLAYER_SHORTCUTS.rewind.key);
  const all = readPlayerShortcuts('u1');
  expect(validatePlayerShortcut('rewind', all.playPause, all, DEFAULT_RECORDER_SHORTCUT)).toMatch(/already used/);
  expect(validatePlayerShortcut('rewind', { ...DEFAULT_RECORDER_SHORTCUT }, all, DEFAULT_RECORDER_SHORTCUT)).toMatch(/recorder/);
  expect(validatePlayerShortcut('rewind', { key: 'm', code: 'KeyM', ctrlKey: false, altKey: true, shiftKey: false, metaKey: false }, all, DEFAULT_RECORDER_SHORTCUT)).toBe('');
});
