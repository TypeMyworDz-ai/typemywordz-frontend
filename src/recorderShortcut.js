export const DEFAULT_RECORDER_SHORTCUT = Object.freeze({
  key: 'r',
  ctrlKey: true,
  altKey: false,
  shiftKey: false,
  metaKey: false,
});

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta']);
const MODIFIER_FLAGS = ['ctrlKey', 'altKey', 'shiftKey', 'metaKey'];

export const recorderShortcutStorageKey = (userId) =>
  userId ? `tmwd_recorder_shortcut_${userId}` : '';

const getStorage = () => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

const normalizeKey = (key) => {
  if (key === ' ') return 'Space';
  return key.length === 1 ? key.toLowerCase() : key;
};

export const isModifierOnlyKey = (key) => MODIFIER_KEYS.has(key);

export const recorderShortcutFromEvent = (event) => ({
  key: normalizeKey(event.key || ''),
  ctrlKey: Boolean(event.ctrlKey),
  altKey: Boolean(event.altKey),
  shiftKey: Boolean(event.shiftKey),
  metaKey: Boolean(event.metaKey),
});

export const formatRecorderShortcut = (shortcut = DEFAULT_RECORDER_SHORTCUT) => {
  if (!shortcut?.key) return '';
  const parts = [];
  if (shortcut.ctrlKey) parts.push('Ctrl');
  if (shortcut.altKey) parts.push('Alt');
  if (shortcut.shiftKey) parts.push('Shift');
  if (shortcut.metaKey) parts.push('Meta');

  const names = {
    ' ': 'Space',
    ArrowDown: 'Down Arrow',
    ArrowLeft: 'Left Arrow',
    ArrowRight: 'Right Arrow',
    ArrowUp: 'Up Arrow',
    Escape: 'Esc',
  };
  const key = names[shortcut.key] || (shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key);
  return [...parts, key].join('+');
};

export const matchesRecorderShortcut = (event, shortcut) => {
  if (!shortcut?.key || event.repeat) return false;
  const key = normalizeKey(event.key || '');
  return key === shortcut.key && MODIFIER_FLAGS.every((flag) => Boolean(event[flag]) === Boolean(shortcut[flag]));
};

export const isReservedRecorderShortcut = (shortcut) => {
  if (!shortcut?.key) return false;
  const key = shortcut.key.toLowerCase();
  const ctrl = Boolean(shortcut.ctrlKey);
  const alt = Boolean(shortcut.altKey);
  const meta = Boolean(shortcut.metaKey);
  const shift = Boolean(shortcut.shiftKey);

  // Avoid common browser/OS actions and the app's existing choose-file shortcut.
  if (alt && key === 'f4') return true;
  if (key === 'tab' && (ctrl || alt || meta || shift)) return true;
  if (alt && ['arrowleft', 'arrowright', 'home'].includes(key)) return true;
  if (!ctrl && !alt && !meta && !shift && ['f5', 'f11'].includes(key)) return true;
  if (ctrl && !alt && !meta && !shift && ['w', 't', 'n', 'l'].includes(key)) return true;
  if (ctrl && !alt && !meta && shift && ['o', 'r', 't', 'w', 'n'].includes(key)) return true;
  if (meta && !ctrl && !alt && !shift && ['q', 'w', 't', 'n', 'l', 'r'].includes(key)) return true;
  return false;
};

const isValidShortcut = (value) =>
  value && typeof value.key === 'string' && value.key.length > 0 && MODIFIER_FLAGS.every((flag) => typeof value[flag] === 'boolean');

export const readRecorderShortcut = (userId, storage = getStorage()) => {
  const storageKey = recorderShortcutStorageKey(userId);
  if (!storageKey || !storage) return { ...DEFAULT_RECORDER_SHORTCUT };
  try {
    const saved = JSON.parse(storage.getItem(storageKey) || 'null');
    return isValidShortcut(saved) ? { ...saved, key: normalizeKey(saved.key) } : { ...DEFAULT_RECORDER_SHORTCUT };
  } catch {
    return { ...DEFAULT_RECORDER_SHORTCUT };
  }
};

export const saveRecorderShortcut = (userId, shortcut, storage = getStorage()) => {
  const storageKey = recorderShortcutStorageKey(userId);
  if (!storageKey || !storage || !isValidShortcut(shortcut)) return false;
  try {
    storage.setItem(storageKey, JSON.stringify({ ...shortcut, key: normalizeKey(shortcut.key) }));
    return true;
  } catch {
    return false;
  }
};

export const resetRecorderShortcut = (userId, storage = getStorage()) => {
  const storageKey = recorderShortcutStorageKey(userId);
  if (!storageKey || !storage) return false;
  try {
    storage.removeItem(storageKey);
    return true;
  } catch {
    return false;
  }
};
