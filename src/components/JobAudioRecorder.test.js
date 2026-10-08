import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import JobAudioRecorder from './JobAudioRecorder';

let mediaRecorderDescriptor;
let mediaDevicesDescriptor;
let getUserMedia;
let stopTrack;

class FakeMediaRecorder {
  static isTypeSupported = jest.fn(() => true);
  constructor(stream, options = {}) { this.stream = stream; this.mimeType = options.mimeType || 'audio/webm'; this.state = 'inactive'; }
  start() { this.state = 'recording'; }
  pause() { this.state = 'paused'; }
  resume() { this.state = 'recording'; }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob([new Uint8Array(4096)], { type: this.mimeType }) });
    this.onstop?.();
  }
}

beforeEach(() => {
  mediaRecorderDescriptor = Object.getOwnPropertyDescriptor(window, 'MediaRecorder');
  Object.defineProperty(window, 'MediaRecorder', { configurable: true, writable: true, value: FakeMediaRecorder });
  mediaDevicesDescriptor = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
  stopTrack = jest.fn();
  getUserMedia = jest.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] });
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
});

afterEach(() => {
  if (mediaRecorderDescriptor) Object.defineProperty(window, 'MediaRecorder', mediaRecorderDescriptor);
  else delete window.MediaRecorder;
  if (mediaDevicesDescriptor) Object.defineProperty(navigator, 'mediaDevices', mediaDevicesDescriptor);
  else delete navigator.mediaDevices;
});

test('Record and Stop creates a file and passes it into the job form callback', async () => {
  const onRecordingReady = jest.fn();
  render(<JobAudioRecorder onRecordingReady={onRecordingReady} />);
  fireEvent.click(screen.getByRole('button', { name: 'Record audio' }));
  await waitFor(() => expect(getUserMedia).toHaveBeenCalledWith({ audio: true }));
  expect(await screen.findByRole('button', { name: 'Stop recording' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
  expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
  fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }));
  await waitFor(() => expect(onRecordingReady).toHaveBeenCalledTimes(1));
  const [file, seconds] = onRecordingReady.mock.calls[0];
  expect(file).toBeInstanceOf(File);
  expect(file.name).toMatch(/^recording-\d+\.webm$/);
  expect(file.size).toBeGreaterThan(2048);
  expect(seconds).toBeGreaterThanOrEqual(1);
  expect(screen.getByText(/Recording ready/)).toBeInTheDocument();
  expect(stopTrack).toHaveBeenCalled();
});

test('explains how to recover when microphone permission is denied', async () => {
  getUserMedia.mockRejectedValueOnce(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }));
  render(<JobAudioRecorder />);
  fireEvent.click(screen.getByRole('button', { name: 'Record audio' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Microphone access was blocked');
});
