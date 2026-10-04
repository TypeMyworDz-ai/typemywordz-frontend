import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import Settings from './Settings';
import { recorderShortcutStorageKey, saveRecorderShortcut } from '../recorderShortcut';

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    currentUser: { uid: 'settings-test-user' },
    userProfile: null,
    refreshUserProfile: jest.fn(),
  }),
}));

jest.mock('./AskContext', () => ({
  useAsk: () => ({ model: '', setModel: jest.fn() }),
}));

const originalFetch = global.fetch;

beforeEach(() => {
  window.localStorage.clear();
  global.fetch = jest.fn(() => new Promise(() => {}));
});

afterEach(() => {
  if (originalFetch) global.fetch = originalFetch;
  else delete global.fetch;
});

test('lets a client bind a single key and stores it for their browser account', () => {
  render(<Settings userPlan="free" userEmail="client@example.com" />);

  expect(screen.getByRole('heading', { name: 'Recorder shortcut' })).toBeInTheDocument();
  expect(screen.getByText('Ctrl+R')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Change shortcut' }));
  fireEvent.keyDown(window, { key: 'Tab', code: 'Tab' });

  expect(screen.getByText('Tab')).toBeInTheDocument();
  expect(window.localStorage.getItem(recorderShortcutStorageKey('settings-test-user'))).toContain('"key":"Tab"');
  expect(screen.getByRole('status')).toHaveTextContent('Saved Tab for this browser.');
});

test('restores the existing Ctrl+R default', () => {
  saveRecorderShortcut('settings-test-user', {
    key: 'Tab', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false,
  });
  render(<Settings userPlan="free" userEmail="client@example.com" />);

  expect(screen.getByText('Tab')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Use default' }));

  expect(screen.getByText('Ctrl+R')).toBeInTheDocument();
  expect(window.localStorage.getItem(recorderShortcutStorageKey('settings-test-user'))).toBeNull();
});

test('rejects a reserved shortcut and allows capture to be cancelled', () => {
  render(<Settings userPlan="free" userEmail="client@example.com" />);
  fireEvent.click(screen.getByRole('button', { name: 'Change shortcut' }));
  fireEvent.keyDown(window, { key: 'o', ctrlKey: true, shiftKey: true });

  expect(screen.getByRole('status')).toHaveTextContent('reserved by your browser or the app');
  expect(window.localStorage.getItem(recorderShortcutStorageKey('settings-test-user'))).toBeNull();

  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.getByRole('button', { name: 'Change shortcut' })).toBeInTheDocument();
  expect(screen.getByText('Ctrl+R')).toBeInTheDocument();
});
