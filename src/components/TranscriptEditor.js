import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import {
  buildSegments, segmentsToHtml, copyFromSegments, COPY_MODES,
  formatTime, speakersIn, countWords, isUncertain, toSrt, toVtt
} from '../lib/transcript';

// ---------------------------------------------------------------------------
// The proofreading editor.
//
// One screen for reading a transcript against its audio, correcting it, and
// getting it out. It replaces three separate places that used to show a
// transcript in three different ways.
//
// Design decisions worth knowing about:
//
// * Only ONE segment is editable at a time. A textarea that opens on the line
//   you clicked is predictable, keeps the caret where you put it, and avoids
//   the well-known trouble React has with a contentEditable holding thousands
//   of nodes.
//
// * Segments are memoised and only the active one re-renders as the audio
//   plays. A one-hour transcript is a few thousand lines; re-rendering all of
//   them on every timeupdate would make the page crawl.
//
// * Times are labelled honestly. Real times from the service are shown plainly;
//   estimated ones are marked as approximate, and subtitle export is withheld,
//   because subtitles built on a guess drift out of step with the picture.
//
// * Auto-rewind on pause. When you stop to type, the audio steps back a couple
//   of seconds so you catch the run-up. Transcriptionists ask for this first.
// ---------------------------------------------------------------------------

const SKIP_SECONDS = 5;
const REWIND_ON_PAUSE_KEY = 'tmwd.rewindOnPause';
const COPY_MODE_KEY = 'tmwd.copyMode';
const COPY_REMEMBER_KEY = 'tmwd.copyRemember';
const SPEED_KEY = 'tmwd.playbackRate';

const readLS = (key, fallback) => {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch (e) {
    return fallback;
  }
};
const writeLS = (key, value) => {
  try { localStorage.setItem(key, String(value)); } catch (e) { /* private mode */ }
};

// ----- one line of the transcript ----------------------------------------

const Segment = memo(function Segment({
  seg, index, isActive, isEditing, showTimes, approximate, speakerNames,
  onSeek, onEdit, onCommit, onEditKeyDown, highlight
}) {
  const areaRef = useRef(null);

  useEffect(() => {
    if (isEditing && areaRef.current) {
      const el = areaRef.current;
      el.focus();
      el.style.height = 'auto';
      el.style.height = el.scrollHeight + 'px';
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [isEditing]);

  const uncertain = isUncertain(seg);
  const name = seg.speaker ? (speakerNames[seg.speaker] || seg.speaker) : null;

  // Mark the search term without using innerHTML, so a transcript can never
  // inject markup into the page.
  const body = useMemo(() => {
    const text = seg.text;
    if (!highlight) return text;
    const parts = [];
    const needle = highlight.toLowerCase();
    const hay = text.toLowerCase();
    let at = 0;
    let found = hay.indexOf(needle, at);
    if (found === -1) return text;
    while (found !== -1) {
      if (found > at) parts.push(text.slice(at, found));
      parts.push(<mark key={found} className="tm-hit">{text.slice(found, found + highlight.length)}</mark>);
      at = found + highlight.length;
      found = hay.indexOf(needle, at);
    }
    if (at < text.length) parts.push(text.slice(at));
    return parts;
  }, [seg.text, highlight]);

  return (
    <div
      className={
        'tm-seg' + (isActive ? ' tm-seg-on' : '') + (uncertain ? ' tm-seg-low' : '')
      }
      data-index={index}
    >
      {showTimes && (
        <button
          type="button"
          className="tm-seg-time"
          onClick={() => onSeek(seg.start)}
          title={
            (approximate ? 'Approximate position - ' : '') +
            'Jump the audio to ' + formatTime(seg.start)
          }
        >
          {formatTime(seg.start)}
          {approximate && <span className="tm-approx" aria-hidden="true">~</span>}
        </button>
      )}

      {name && <span className="tm-seg-who">{name}</span>}

      {isEditing ? (
        <textarea
          ref={areaRef}
          className="tm-seg-input"
          defaultValue={seg.text}
          rows={1}
          onInput={(e) => {
            e.target.style.height = 'auto';
            e.target.style.height = e.target.scrollHeight + 'px';
          }}
          onBlur={(e) => onCommit(index, e.target.value)}
          onKeyDown={(e) => onEditKeyDown(e, index)}
        />
      ) : (
        <div
          className="tm-seg-text"
          role="button"
          tabIndex={0}
          onClick={() => onEdit(index)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); onEdit(index); }
          }}
          title="Click to correct this line"
        >
          {uncertain ? <span className="tm-low-mark">{body}</span> : body}
          {uncertain && (
            <span className="tm-low-flag" title="The service was unsure about this line">
              check
            </span>
          )}
        </div>
      )}
    </div>
  );
});

// ----- the editor ---------------------------------------------------------

const TranscriptEditor = ({
  fileName = 'Transcript',
  rawText = '',
  segments: incomingSegments = null,
  durationSeconds = 0,
  audioFile = null,
  audioUrl: providedAudioUrl = null,
  createdAt = null,
  onSave = null,
  onAskAI = null,
  canUseAI = true,
  showBack = false,
  onBack = null
}) => {
  // ---- audio ----
  const audioRef = useRef(null);
  const [localFile, setLocalFile] = useState(audioFile);
  const [audioUrl, setAudioUrl] = useState(providedAudioUrl);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [audioLength, setAudioLength] = useState(0);
  const [speed, setSpeed] = useState(() => Number(readLS(SPEED_KEY, '1')) || 1);
  const [rewindOnPause, setRewindOnPause] = useState(() => readLS(REWIND_ON_PAUSE_KEY, 'true') !== 'false');

  useEffect(() => {
    if (!localFile) return undefined;
    const url = URL.createObjectURL(localFile);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [localFile]);

  // ---- transcript ----
  const initial = useMemo(
    () => buildSegments(rawText, incomingSegments, durationSeconds || audioLength),
    // audioLength deliberately excluded: re-deriving segments mid-edit would
    // throw away the user's corrections the moment the audio loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rawText, incomingSegments, durationSeconds]
  );

  const [segments, setSegments] = useState(initial.segments);
  const [timing, setTiming] = useState(initial.timing);
  const [speakerNames, setSpeakerNames] = useState({});
  const [editingIndex, setEditingIndex] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error

  useEffect(() => {
    setSegments(initial.segments);
    setTiming(initial.timing);
    setDirty(false);
  }, [initial]);

  // If the transcript had no timings but we now know how long the audio is,
  // estimate positions - but only while nothing has been edited, so a
  // correction is never overwritten.
  useEffect(() => {
    if (timing !== 'none' || audioLength <= 0 || dirty) return;
    const next = buildSegments(segmentsToHtml(segments, {}), null, audioLength);
    if (next.timing !== 'none') {
      setSegments(next.segments);
      setTiming(next.timing);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioLength, timing, dirty]);

  const approximate = timing === 'estimated';
  const showTimes = timing !== 'none';

  // ---- which line is playing ----
  const [activeIndex, setActiveIndex] = useState(-1);
  const followRef = useRef(true);
  const listRef = useRef(null);

  useEffect(() => {
    if (!showTimes || segments.length === 0) { setActiveIndex(-1); return; }
    // Segments are in time order, so walk from the end for the first one that
    // has started. Cheap enough to run on every tick.
    let found = -1;
    for (let i = segments.length - 1; i >= 0; i--) {
      if (current >= segments[i].start - 0.05) { found = i; break; }
    }
    setActiveIndex(found);
  }, [current, segments, showTimes]);

  useEffect(() => {
    if (!followRef.current || activeIndex < 0 || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-index="${activeIndex}"]`);
    if (!el) return;
    const box = listRef.current.getBoundingClientRect();
    const row = el.getBoundingClientRect();
    if (row.top < box.top + 40 || row.bottom > box.bottom - 40) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [activeIndex]);

  // ---- audio wiring ----
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return undefined;
    const onTime = () => setCurrent(a.currentTime);
    const onMeta = () => setAudioLength(a.duration || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnd = () => setPlaying(false);
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('loadedmetadata', onMeta);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    a.addEventListener('ended', onEnd);
    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('loadedmetadata', onMeta);
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('ended', onEnd);
    };
  }, [audioUrl]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed, audioUrl]);

  const seek = useCallback((seconds) => {
    const a = audioRef.current;
    if (!a || !audioUrl) return;
    a.currentTime = Math.max(0, Math.min(seconds, a.duration || seconds));
    setCurrent(a.currentTime);
    followRef.current = true;
  }, [audioUrl]);

  const togglePlay = useCallback(() => {
    const a = audioRef.current;
    if (!a || !audioUrl) return;
    if (a.paused) {
      a.play().catch(() => {});
    } else {
      a.pause();
      // Step back so the last few words are heard again when you resume.
      if (rewindOnPause) {
        a.currentTime = Math.max(0, a.currentTime - 2);
        setCurrent(a.currentTime);
      }
    }
  }, [audioUrl, rewindOnPause]);

  const nudge = useCallback((delta) => {
    const a = audioRef.current;
    if (!a || !audioUrl) return;
    a.currentTime = Math.max(0, Math.min(a.currentTime + delta, a.duration || 0));
    setCurrent(a.currentTime);
  }, [audioUrl]);

  // ---- editing ----
  const commit = useCallback((index, value) => {
    setEditingIndex(null);
    setSegments((prev) => {
      if (prev[index] === undefined) return prev;
      const clean = String(value).replace(/\s+/g, ' ').trim();
      if (clean === prev[index].text) return prev;
      const next = prev.slice();
      next[index] = { ...next[index], text: clean };
      setDirty(true);
      return next;
    });
  }, []);

  const onEditKeyDown = useCallback((e, index) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setEditingIndex(null);
      return;
    }
    // Enter moves on to the next line, the way a data grid behaves.
    // Shift+Enter puts in a genuine line break.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      commit(index, e.target.value);
      setSegments((prev) => {
        if (index + 1 < prev.length) setEditingIndex(index + 1);
        return prev;
      });
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      commit(index, e.target.value);
      const next = e.shiftKey ? index - 1 : index + 1;
      if (next >= 0 && next < segments.length) setEditingIndex(next);
    }
  }, [commit, segments.length]);

  // ---- saving ----
  const save = useCallback(async () => {
    if (!onSave || !dirty) return;
    setSaveState('saving');
    try {
      await onSave(segmentsToHtml(segments, speakerNames));
      setDirty(false);
      setSaveState('saved');
      setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 2500);
    } catch (err) {
      setSaveState('error');
    }
  }, [onSave, dirty, segments, speakerNames]);

  // Save quietly a couple of seconds after the typing stops.
  useEffect(() => {
    if (!dirty || !onSave || editingIndex !== null) return undefined;
    const t = setTimeout(() => { save(); }, 1800);
    return () => clearTimeout(t);
  }, [dirty, editingIndex, onSave, save]);

  // Never let a correction disappear because a tab was closed.
  useEffect(() => {
    if (!dirty || !onSave) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; return ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, onSave]);

  // ---- copy ----
  const [copyMode, setCopyMode] = useState(() => {
    if (readLS(COPY_REMEMBER_KEY, 'true') === 'false') return 'full';
    const stored = readLS(COPY_MODE_KEY, 'full');
    return COPY_MODES.some((m) => m.id === stored) ? stored : 'full';
  });
  const [remember, setRemember] = useState(() => readLS(COPY_REMEMBER_KEY, 'true') !== 'false');
  const [copyOpen, setCopyOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [includeTimes, setIncludeTimes] = useState(false);
  const copyRef = useRef(null);
  const exportRef = useRef(null);

  const doCopy = useCallback(async (mode) => {
    const payload = copyFromSegments(segments, mode, {
      speakerNames,
      withTimes: includeTimes && timing === 'exact'
    });
    try {
      await navigator.clipboard.writeText(payload);
    } catch (err) {
      // Older browsers and insecure contexts have no clipboard API.
      const ta = document.createElement('textarea');
      ta.value = payload;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e2) { /* nothing more to try */ }
      document.body.removeChild(ta);
    }
    if (remember) { writeLS(COPY_MODE_KEY, mode); }
    setCopyMode(mode);
    setCopyOpen(false);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }, [segments, speakerNames, remember, includeTimes, timing]);

  // ---- export ----
  const download = useCallback((content, extension, type) => {
    const base = String(fileName).replace(/\.[^.]+$/, '') || 'transcript';
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${base}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setExportOpen(false);
  }, [fileName]);

  const exportWord = useCallback(() => {
    const body = segments.map((s) => {
      const name = s.speaker ? (speakerNames[s.speaker] || s.speaker) : null;
      const escape = (t) => String(t)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return '<p>' + (name ? `<strong>${escape(name)}:</strong> ` : '') + escape(s.text) + '</p>';
    }).join('\n');
    const doc =
      '<html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
      'xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">' +
      '<head><meta charset="utf-8"><title>' + String(fileName) + '</title></head><body>' +
      '<h2>' + String(fileName) + '</h2>' + body + '</body></html>';
    download(doc, 'doc', 'application/msword');
  }, [segments, speakerNames, fileName, download]);

  // ---- find and replace ----
  const [findOpen, setFindOpen] = useState(false);
  const [find, setFind] = useState('');
  const [replace, setReplace] = useState('');
  const findRef = useRef(null);

  const matchCount = useMemo(() => {
    if (!find) return 0;
    const needle = find.toLowerCase();
    return segments.reduce((n, s) => {
      const hay = s.text.toLowerCase();
      let count = 0;
      let at = hay.indexOf(needle);
      while (at !== -1) { count++; at = hay.indexOf(needle, at + needle.length); }
      return n + count;
    }, 0);
  }, [find, segments]);

  const replaceAll = useCallback(() => {
    if (!find) return;
    setSegments((prev) => {
      const rx = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const next = prev.map((s) => ({ ...s, text: s.text.replace(rx, replace) }));
      setDirty(true);
      return next;
    });
  }, [find, replace]);

  // ---- speakers ----
  const speakers = useMemo(() => speakersIn(segments), [segments]);
  const [renaming, setRenaming] = useState(null);

  const applyRename = useCallback((label, value) => {
    setRenaming(null);
    const clean = String(value).trim();
    setSpeakerNames((prev) => {
      const next = { ...prev };
      if (!clean || clean === label) { delete next[label]; } else { next[label] = clean; }
      return next;
    });
    setDirty(true);
  }, []);

  // ---- uncertain lines ----
  const uncertainIndexes = useMemo(
    () => segments.map((s, i) => (isUncertain(s) ? i : -1)).filter((i) => i >= 0),
    [segments]
  );

  const jumpToUncertain = useCallback((from) => {
    if (uncertainIndexes.length === 0) return;
    const next = uncertainIndexes.find((i) => i > from);
    const target = next === undefined ? uncertainIndexes[0] : next;
    const el = listRef.current && listRef.current.querySelector(`[data-index="${target}"]`);
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (showTimes) seek(segments[target].start);
  }, [uncertainIndexes, segments, seek, showTimes]);

  // ---- keyboard ----
  useEffect(() => {
    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
        e.preventDefault(); doCopy(copyMode); return;
      }
      if (mod && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        setFindOpen(true);
        setTimeout(() => findRef.current && findRef.current.focus(), 30);
        return;
      }
      if (mod && (e.key === 's' || e.key === 'S')) {
        e.preventDefault(); save(); return;
      }
      // Foot-pedal keys. Ctrl is held so they keep working inside a textarea.
      if (mod && e.code === 'Space') { e.preventDefault(); togglePlay(); return; }
      if (mod && e.key === 'ArrowLeft') { e.preventDefault(); nudge(-SKIP_SECONDS); return; }
      if (mod && e.key === 'ArrowRight') { e.preventDefault(); nudge(SKIP_SECONDS); return; }
      if (e.key === 'Escape') { setCopyOpen(false); setExportOpen(false); setFindOpen(false); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [doCopy, copyMode, save, togglePlay, nudge]);

  // Close the menus on an outside click.
  useEffect(() => {
    if (!copyOpen && !exportOpen) return undefined;
    const onDown = (e) => {
      if (copyRef.current && !copyRef.current.contains(e.target)) setCopyOpen(false);
      if (exportRef.current && !exportRef.current.contains(e.target)) setExportOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [copyOpen, exportOpen]);

  const words = useMemo(() => countWords(segments), [segments]);
  const shownLength = audioLength || durationSeconds || 0;

  return (
    <div className="tm-ed">

      {/* ---------- header ---------- */}
      <div className="tm-ed-head">
        <div className="tm-ed-id">
          {showBack && (
            <button type="button" className="tm-ed-back" onClick={onBack}>
              <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor"
                   strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 3.5L5 8l4.5 4.5"/></svg>
              My files
            </button>
          )}
          <h2 className="tm-ed-title" title={fileName}>{fileName}</h2>
          <p className="tm-ed-meta">
            {shownLength > 0 && <span>{formatTime(shownLength)}</span>}
            {speakers.length > 0 && <span>{speakers.length} speaker{speakers.length > 1 ? 's' : ''}</span>}
            <span>{words.toLocaleString()} words</span>
            {createdAt && <span>{createdAt}</span>}
            {saveState === 'saving' && <span className="tm-ed-save">Saving…</span>}
            {saveState === 'saved' && <span className="tm-ed-save tm-ed-save-ok">Saved</span>}
            {saveState === 'error' && <span className="tm-ed-save tm-ed-save-bad">Not saved — retrying</span>}
            {saveState === 'idle' && dirty && onSave && <span className="tm-ed-save">Unsaved changes</span>}
          </p>
        </div>

        <div className="tm-ed-actions">
          {/* Copy: split button, body copies with the last-used mode */}
          <div className="tm-split" ref={copyRef}>
            <button type="button" className="tm-split-main" onClick={() => doCopy(copyMode)}
                    title="Copy to clipboard (Ctrl+Shift+C)">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7">
                <rect x="9" y="9" width="11" height="11" rx="2"/>
                <path d="M15 6.5A1.5 1.5 0 0 0 13.5 5h-7A1.5 1.5 0 0 0 5 6.5v7A1.5 1.5 0 0 0 6.5 15"/>
              </svg>
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button type="button" className="tm-split-caret" onClick={() => setCopyOpen((o) => !o)}
                    aria-label="Copy options" aria-expanded={copyOpen}>
              <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor"
                   strokeWidth="3" strokeLinecap="round"><path d="M5 9l7 7 7-7"/></svg>
            </button>

            {copyOpen && (
              <div className="tm-split-menu">
                <div className="tm-split-head">Copy to clipboard</div>
                {COPY_MODES.map((m) => (
                  <button key={m.id} type="button"
                          className={'tm-split-item' + (copyMode === m.id ? ' tm-split-item-on' : '')}
                          onClick={() => doCopy(m.id)}>
                    <span className="tm-split-tick" aria-hidden="true">
                      {copyMode === m.id && (
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2"
                             strokeLinecap="round" strokeLinejoin="round"><path d="M3 8.5l3.5 3.5L13 4.5"/></svg>
                      )}
                    </span>
                    <span>
                      <span className="tm-split-name">{m.label}</span>
                      <span className="tm-split-hint">{m.hint}</span>
                    </span>
                  </button>
                ))}
                {timing === 'exact' && (
                  <label className="tm-split-remember">
                    <input type="checkbox" checked={includeTimes}
                           onChange={(e) => setIncludeTimes(e.target.checked)} />
                    Include timestamps
                  </label>
                )}
                <label className="tm-split-remember">
                  <input type="checkbox" checked={remember}
                         onChange={(e) => { setRemember(e.target.checked); writeLS(COPY_REMEMBER_KEY, e.target.checked); }} />
                  Remember my choice
                </label>
              </div>
            )}
          </div>

          {/* Export */}
          <div className="tm-split" ref={exportRef}>
            <button type="button" className="tm-export-btn" onClick={() => setExportOpen((o) => !o)}
                    aria-expanded={exportOpen}>
              Export
              <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor"
                   strokeWidth="3" strokeLinecap="round"><path d="M5 9l7 7 7-7"/></svg>
            </button>
            {exportOpen && (
              <div className="tm-split-menu">
                <div className="tm-split-head">Download</div>
                <button type="button" className="tm-split-item" onClick={exportWord}>
                  <span className="tm-split-tick" />
                  <span><span className="tm-split-name">Word document</span>
                    <span className="tm-split-hint">Speaker names in bold</span></span>
                </button>
                <button type="button" className="tm-split-item"
                        onClick={() => download(copyFromSegments(segments, 'full', { speakerNames }), 'txt', 'text/plain;charset=utf-8')}>
                  <span className="tm-split-tick" />
                  <span><span className="tm-split-name">Plain text</span>
                    <span className="tm-split-hint">With speaker names</span></span>
                </button>
                <button type="button" className="tm-split-item"
                        onClick={() => download(copyFromSegments(segments, 'clean', { speakerNames }), 'txt', 'text/plain;charset=utf-8')}>
                  <span className="tm-split-tick" />
                  <span><span className="tm-split-name">Plain text, clean</span>
                    <span className="tm-split-hint">No speaker names</span></span>
                </button>
                {timing === 'exact' ? (
                  <>
                    <button type="button" className="tm-split-item"
                            onClick={() => download(toSrt(segments, speakerNames), 'srt', 'text/plain;charset=utf-8')}>
                      <span className="tm-split-tick" />
                      <span><span className="tm-split-name">Subtitles (SRT)</span>
                        <span className="tm-split-hint">For video editors</span></span>
                    </button>
                    <button type="button" className="tm-split-item"
                            onClick={() => download(toVtt(segments, speakerNames), 'vtt', 'text/vtt;charset=utf-8')}>
                      <span className="tm-split-tick" />
                      <span><span className="tm-split-name">Subtitles (WebVTT)</span>
                        <span className="tm-split-hint">For the web</span></span>
                    </button>
                  </>
                ) : (
                  <div className="tm-split-note">
                    Subtitles need exact timings, which this transcript does not have.
                  </div>
                )}
              </div>
            )}
          </div>

          {onAskAI && (
            <button type="button" className={'tm-ed-ai' + (canUseAI ? '' : ' tm-ed-ai-off')}
                    onClick={() => onAskAI(copyFromSegments(segments, 'full', { speakerNames }))}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7">
                <path d="M20 15.5a2.5 2.5 0 0 1-2.5 2.5H8l-4 3V6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5z"/>
              </svg>
              Ask AI
            </button>
          )}
        </div>
      </div>

      {/* ---------- audio ---------- */}
      {audioUrl ? (
        <div className="tm-play">
          <audio ref={audioRef} src={audioUrl} preload="metadata" />
          <button type="button" className="tm-play-btn" onClick={togglePlay}
                  title={(playing ? 'Pause' : 'Play') + ' (Ctrl+Space)'}>
            {playing ? (
              <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
            ) : (
              <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M7 4l13 8-13 8z"/></svg>
            )}
          </button>

          <button type="button" className="tm-play-skip" onClick={() => nudge(-SKIP_SECONDS)} title="Back 5 seconds (Ctrl+Left)">-5s</button>

          <span className="tm-play-time">{formatTime(current)}</span>

          <input
            type="range"
            className="tm-play-bar"
            min="0"
            max={Math.max(1, audioLength || 1)}
            step="0.1"
            value={Math.min(current, audioLength || 1)}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label="Position in the recording"
          />

          <span className="tm-play-time">{formatTime(audioLength)}</span>

          <button type="button" className="tm-play-skip" onClick={() => nudge(SKIP_SECONDS)} title="Forward 5 seconds (Ctrl+Right)">+5s</button>

          <select className="tm-play-speed" value={speed}
                  onChange={(e) => { const v = Number(e.target.value); setSpeed(v); writeLS(SPEED_KEY, v); }}
                  aria-label="Playback speed">
            {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((r) => (
              <option key={r} value={r}>{r}&times;</option>
            ))}
          </select>

          <label className="tm-play-rewind" title="When you pause, step back 2 seconds so you catch the run-up">
            <input type="checkbox" checked={rewindOnPause}
                   onChange={(e) => { setRewindOnPause(e.target.checked); writeLS(REWIND_ON_PAUSE_KEY, e.target.checked); }} />
            Auto-rewind
          </label>
        </div>
      ) : (
        <div className="tm-attach">
          <div>
            <strong>Add the audio to proofread against it.</strong>
            <p>
              We never keep your recordings, so the file has to come from your computer.
              It stays on your machine and is not uploaded anywhere.
            </p>
          </div>
          <label className="tm-attach-btn">
            Choose audio file
            <input type="file" accept="audio/*,video/*"
                   onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) setLocalFile(f); }} />
          </label>
        </div>
      )}

      {/* ---------- toolbar ---------- */}
      <div className="tm-ed-bar">
        {speakers.length > 0 && (
          <div className="tm-spk">
            <span className="tm-spk-label">Speakers</span>
            {speakers.map((label) => (
              renaming === label ? (
                <input
                  key={label}
                  className="tm-spk-input"
                  autoFocus
                  defaultValue={speakerNames[label] || label}
                  onBlur={(e) => applyRename(label, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); applyRename(label, e.target.value); }
                    if (e.key === 'Escape') { e.preventDefault(); setRenaming(null); }
                  }}
                />
              ) : (
                <button key={label} type="button" className="tm-spk-chip"
                        onClick={() => setRenaming(label)}
                        title={'Rename ' + label + ' everywhere in this transcript'}>
                  {speakerNames[label] || label}
                </button>
              )
            ))}
          </div>
        )}

        <span className="tm-ed-sp" />

        {uncertainIndexes.length > 0 && (
          <button type="button" className="tm-ed-tool" onClick={() => jumpToUncertain(activeIndex)}>
            {uncertainIndexes.length} line{uncertainIndexes.length > 1 ? 's' : ''} to check
          </button>
        )}

        <button type="button" className="tm-ed-tool" onClick={() => {
          setFindOpen((o) => !o);
          setTimeout(() => findRef.current && findRef.current.focus(), 30);
        }}>
          Find and replace
        </button>
      </div>

      {findOpen && (
        <div className="tm-find">
          <input ref={findRef} className="tm-find-in" placeholder="Find" value={find}
                 onChange={(e) => setFind(e.target.value)} />
          <input className="tm-find-in" placeholder="Replace with" value={replace}
                 onChange={(e) => setReplace(e.target.value)} />
          <span className="tm-find-count">
            {find ? `${matchCount} match${matchCount === 1 ? '' : 'es'}` : 'Not case sensitive'}
          </span>
          <button type="button" className="tm-find-go" disabled={!find || matchCount === 0}
                  onClick={replaceAll}>Replace all</button>
          <button type="button" className="tm-ed-tool" onClick={() => { setFindOpen(false); setFind(''); }}>Close</button>
        </div>
      )}

      {approximate && (
        <p className="tm-ed-warn">
          These times are worked out from the length of the text, not measured from the audio,
          so they get you close rather than exact. Transcriptions made from now on will carry
          real times.
        </p>
      )}

      {/* ---------- the transcript ---------- */}
      <div className="tm-ed-list" ref={listRef}
           onWheel={() => { followRef.current = false; }}>
        {segments.length === 0 ? (
          <p className="tm-ed-empty">This transcript is empty.</p>
        ) : segments.map((seg, i) => (
          <Segment
            key={seg.id}
            seg={seg}
            index={i}
            isActive={i === activeIndex}
            isEditing={i === editingIndex}
            showTimes={showTimes}
            approximate={approximate}
            speakerNames={speakerNames}
            highlight={findOpen ? find : ''}
            onSeek={seek}
            onEdit={setEditingIndex}
            onCommit={commit}
            onEditKeyDown={onEditKeyDown}
          />
        ))}
      </div>

      <div className="tm-ed-foot">
        <span>Click any line to correct it. Enter moves to the next line.</span>
        {audioUrl && (
          <span>
            <b>Ctrl+Space</b> play or pause &nbsp;·&nbsp;
            <b>Ctrl+&larr;</b> back 5s &nbsp;·&nbsp;
            <b>Ctrl+&rarr;</b> forward 5s &nbsp;·&nbsp;
            <b>Ctrl+Shift+C</b> copy
          </span>
        )}
      </div>
    </div>
  );
};

export default TranscriptEditor;
