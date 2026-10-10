// Customizable keyboard shortcuts for the recording playback panel.
// Stored per signed-in user in this browser, like the recorder shortcut.
import { formatRecorderShortcut, isReservedRecorderShortcut, isModifierOnlyKey } from './recorderShortcut';

export const PLAYER_ACTIONS = Object.freeze([
  { id: 'playPause', label: 'Play / pause' },
  { id: 'rewind', label: 'Rewind 5 seconds' },
  { id: 'restart', label: 'Go to the start (00:00:00)' },
]);

export const DEFAULT_PLAYER_SHORTCUTS = Object.freeze({
  playPause: Object.freeze({ key: 'p', code: 'KeyP', ctrlKey: false, altKey: true, shiftKey: false, metaKey: false }),
  rewind: Object.freeze({ key: 'j', code: 'KeyJ', ctrlKey: false, altKey: true, shiftKey: false, metaKey: false }),
  restart: Object.freeze({ key: '0', code: 'Digit0', ctrlKey: false, altKey: true, shiftKey: false, metaKey: false }),
});

const FLAGS = ['ctrlKey', 'altKey', 'shiftKey', 'metaKey'];

export const playerShortcutStorageKey = (userId) => (userId ? `tmwd_player_shortcuts_${userId}` : '');

const getStorage = () => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

const normalizeKey = (key) => {
  if (key === ' ') return 'Space';
  return key && key.length === 1 ? key.toLowerCase() : key;
};

export const playerShortcutFromEvent = (event) => ({
  key: normalizeKey(event.key || ''),
  code: event.code || '',
  ctrlKey: Boolean(event.ctrlKey),
  altKey: Boolean(event.altKey),
  shiftKey: Boolean(event.shiftKey),
  metaKey: Boolean(event.metaKey),
});

const isValid = (value) =>
  value && typeof value.key === 'string' && value.key.length > 0 && FLAGS.every((flag) => typeof value[flag] === 'boolean');

export const readPlayerShortcuts = (userId, storage = getStorage()) => {
  const defaults = {};
  PLAYER_ACTIONS.forEach(({ id }) => { defaults[id] = { ...DEFAULT_PLAYER_SHORTCUTS[id] }; });
  const storageKey = playerShortcutStorageKey(userId);
  if (!storageKey || !storage) return defaults;
  try {
    const saved = JSON.parse(storage.getItem(storageKey) || 'null') || {};
    PLAYER_ACTIONS.forEach(({ id }) => {
      if (isValid(saved[id])) defaults[id] = { ...saved[id], key: normalizeKey(saved[id].key) };
    });
  } catch {
    // Fall back to the defaults.
  }
  return defaults;
};

export const savePlayerShortcut = (userId, actionId, shortcut, storage = getStorage()) => {
  const storageKey = playerShortcutStorageKey(userId);
  if (!storageKey || !storage || !isValid(shortcut) || !PLAYER_ACTIONS.some((a) => a.id === actionId)) return false;
  try {
    const current = readPlayerShortcuts(userId, storage);
    current[actionId] = { ...shortcut, key: normalizeKey(shortcut.key) };
    storage.setItem(storageKey, JSON.stringify(current));
    return true;
  } catch {
    return false;
  }
};

export const resetPlayerShortcuts = (userId, storage = getStorage()) => {
  const storageKey = playerShortcutStorageKey(userId);
  if (!storageKey || !storage) return false;
  try {
    storage.removeItem(storageKey);
    return true;
  } catch {
    return false;
  }
};

const sameCombo = (a, b) =>
  a && b && a.key === b.key && FLAGS.every((flag) => Boolean(a[flag]) === Boolean(b[flag]));

export const matchesPlayerShortcut = (event, shortcut) => {
  if (!shortcut?.key || event.repeat) return false;
  if (FLAGS.some((flag) => Boolean(event[flag]) !== Boolean(shortcut[flag]))) return false;
  const key = normalizeKey(event.key || '');
  if (key === shortcut.key) return true;
  // Option/Alt combinations type special characters on some keyboards, so
  // fall back to the physical key.
  return Boolean(shortcut.altKey && shortcut.code && event.code === shortcut.code);
};

export const formatPlayerShortcut = (shortcut) => formatRecorderShortcut(shortcut);

// Returns an error message when a shortcut cannot be used, or '' when it can.
export const validatePlayerShortcut = (actionId, shortcut, all, recorderShortcut) => {
  if (!shortcut?.key || isModifierOnlyKey(shortcut.key)) return 'Press a key together with any modifier you like.';
  if (isReservedRecorderShortcut(shortcut)) return 'That key combination is reserved by your browser or the app. Try another one.';
  if (sameCombo(shortcut, recorderShortcut)) return 'That is already your recorder shortcut. Try another one.';
  const clash = PLAYER_ACTIONS.find(({ id }) => id !== actionId && sameCombo(shortcut, all[id]));
  if (clash) return `That is already used for "${clash.label}". Try another one.`;
  return '';
};
