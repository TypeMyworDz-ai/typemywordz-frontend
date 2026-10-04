import {
  DEFAULT_RECORDER_SHORTCUT,
  formatRecorderShortcut,
  isReservedRecorderShortcut,
  matchesRecorderShortcut,
  readRecorderShortcut,
  recorderShortcutFromEvent,
  recorderShortcutStorageKey,
  resetRecorderShortcut,
  saveRecorderShortcut,
} from './recorderShortcut';

beforeEach(() => window.localStorage.clear());

test('uses the existing Ctrl+R binding until a user changes it', () => {
  expect(readRecorderShortcut('user-1')).toEqual(DEFAULT_RECORDER_SHORTCUT);
  expect(formatRecorderShortcut(readRecorderShortcut('user-1'))).toBe('Ctrl+R');
});

test('saves and resets a shortcut separately for each signed-in user', () => {
  const tab = recorderShortcutFromEvent({
    key: 'Tab', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false,
  });
  saveRecorderShortcut('user-1', tab);

  expect(readRecorderShortcut('user-1')).toEqual(tab);
  expect(readRecorderShortcut('user-2')).toEqual(DEFAULT_RECORDER_SHORTCUT);
  expect(window.localStorage.getItem(recorderShortcutStorageKey('user-1'))).toContain('Tab');

  resetRecorderShortcut('user-1');
  expect(readRecorderShortcut('user-1')).toEqual(DEFAULT_RECORDER_SHORTCUT);
});

test('formats a one-key binding and a multi-key binding clearly', () => {
  expect(formatRecorderShortcut({ key: 'Tab', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false })).toBe('Tab');
  expect(formatRecorderShortcut({ key: 'o', ctrlKey: true, altKey: false, shiftKey: true, metaKey: false })).toBe('Ctrl+Shift+O');
});

test('matches only the chosen key and exact modifier combination', () => {
  const shortcut = { key: 'r', ctrlKey: true, altKey: false, shiftKey: false, metaKey: false };
  expect(matchesRecorderShortcut({ key: 'r', ctrlKey: true }, shortcut)).toBe(true);
  expect(matchesRecorderShortcut({ key: 'r', ctrlKey: true, shiftKey: true }, shortcut)).toBe(false);
  expect(matchesRecorderShortcut({ key: 'r', ctrlKey: true, repeat: true }, shortcut)).toBe(false);
});

test('recognizes common browser and operating-system shortcuts as reserved', () => {
  expect(isReservedRecorderShortcut({ key: 'w', ctrlKey: true, altKey: false, shiftKey: false, metaKey: false })).toBe(true);
  expect(isReservedRecorderShortcut({ key: 'o', ctrlKey: true, altKey: false, shiftKey: true, metaKey: false })).toBe(true);
  expect(isReservedRecorderShortcut({ key: 'Tab', ctrlKey: true, altKey: false, shiftKey: false, metaKey: false })).toBe(true);
  expect(isReservedRecorderShortcut({ key: 'Tab', ctrlKey: false, altKey: true, shiftKey: false, metaKey: false })).toBe(true);
  expect(isReservedRecorderShortcut({ key: 'Tab', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false })).toBe(false);
  expect(isReservedRecorderShortcut(DEFAULT_RECORDER_SHORTCUT)).toBe(false);
});
