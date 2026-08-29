// ---------------------------------------------------------------------------
// Transcript engine.
//
// One place that understands what a transcript IS, so the editor, the copy
// menu and the export menu can never disagree with each other.
//
// A transcript arrives from the backend as an HTML string, because speaker
// labels are marked up as <strong>Speaker 1:</strong>. It may also arrive with
// a `segments` array carrying real start and end times per line. Older
// transcripts have no segments at all, so everything here has to work without
// them and simply get sharper when they exist.
// ---------------------------------------------------------------------------

// ----- HTML -> text -------------------------------------------------------

// The transcript is stored as HTML. Turn it back into plain text before
// anything else looks at it: <br> and block ends become line breaks, all other
// tags are dropped, and the handful of entities that actually turn up are
// decoded.
export const htmlToText = (html) => String(html || '')
  .replace(/\r\n?/g, '\n')
  .replace(/<\s*br\s*\/?\s*>/gi, '\n')
  .replace(/<\s*\/\s*(p|div|li|h[1-6])\s*>/gi, '\n')
  .replace(/<[^>]*>/g, '')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"')
  .replace(/&#0?39;|&apos;/gi, "'")
  .replace(/&amp;/gi, '&');

// ----- patterns -----------------------------------------------------------

// "Speaker 1:", "Speaker A:", "SPEAKER 02:", "[Speaker 1] -", "<Speaker B>:"
// and any custom name the user has renamed a speaker to is handled separately.
export const SPEAKER_TAG = /^[[<(]?\s*speaker\s*[-_ ]?\w+\s*[\]>)]?\s*[:\-–—]\s*/i;

// A bracketed clock: "[00:01:23]", "(1:02)", "[00:01:23.456]".
// Safe to remove anywhere, because the brackets mark it as machine output.
export const BRACKETED_TIME = /[[(]\s*\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?\s*[\])]/g;

// A subtitle range on its own line: "00:00:01,000 --> 00:00:04,000".
export const SRT_RANGE = /^\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?\s*-->\s*\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?$/;

// A bare clock at the very START of a line: "00:12 Right, let's begin."
export const LEADING_TIME = /^\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?\s+/;

// IMPORTANT: a time inside a sentence ("we met at 9:30") is never touched.
// For legal, insurance and medical work those are evidence, not formatting.

// ----- time formatting ---------------------------------------------------

export const formatTime = (seconds) => {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
};

// ----- building segments -------------------------------------------------

// Split a block of prose into sentence-sized pieces. Used when a transcript
// has no speaker labels and no timings, so the editor still has lines a person
// can click rather than one immovable wall of text.
const splitIntoSentences = (text, maxChars = 240) => {
  // One segment per sentence. The whole point is that a person can click a
  // line to jump the audio there, so merging sentences together to fill a
  // character budget would defeat it. maxChars is only a safety valve for
  // someone who talks for a paragraph without pausing.
  const sentences = String(text)
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const out = [];
  for (const sentence of sentences) {
    if (sentence.length <= maxChars) {
      out.push(sentence);
      continue;
    }
    // Too long to be one line: break it on word boundaries.
    let buf = '';
    for (const word of sentence.split(/\s+/)) {
      if (buf && (buf.length + word.length + 1) > maxChars) {
        out.push(buf);
        buf = word;
      } else {
        buf = buf ? buf + ' ' + word : word;
      }
    }
    if (buf) out.push(buf);
  }
  return out;
};

// Pull the speaker name off the front of a line, if there is one.
const splitSpeaker = (line) => {
  const match = line.match(SPEAKER_TAG);
  if (!match) return { speaker: null, text: line };
  return {
    speaker: match[0].replace(/[[<(\]>)]/g, '').replace(/[:\-–—]\s*$/, '').trim(),
    text: line.slice(match[0].length)
  };
};

/**
 * Turn a stored transcript into the list of segments the editor renders.
 *
 * @param {string} rawText   the transcript as stored (may contain HTML)
 * @param {Array}  segments  real timings from the backend, when present
 * @param {number} duration  audio length in seconds, used only for estimating
 * @returns {{segments: Array, timing: 'exact'|'estimated'|'none'}}
 */
export const buildSegments = (rawText, segments, duration) => {
  const text = htmlToText(rawText).trim();

  // Best case: the backend gave us real times. Trust them.
  if (Array.isArray(segments) && segments.length > 0) {
    return {
      timing: 'exact',
      segments: segments.map((s, i) => ({
        id: i,
        start: Number(s.start) || 0,
        end: Number(s.end) || 0,
        speaker: s.speaker || null,
        text: String(s.text || '').trim(),
        confidence: typeof s.confidence === 'number' ? s.confidence : null
      })).filter((s) => s.text)
    };
  }

  if (!text) return { timing: 'none', segments: [] };

  // Otherwise build lines from the text itself. Speaker-labelled transcripts
  // are already one turn per line, which is exactly what we want.
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const hasSpeakers = lines.some((l) => SPEAKER_TAG.test(l));

  let pieces;
  if (hasSpeakers && lines.length > 1) {
    pieces = lines.map(splitSpeaker);
  } else {
    pieces = splitIntoSentences(lines.join(' ')).map((t) => ({ speaker: null, text: t }));
  }

  // With an audio length we can estimate where each line falls by spreading
  // the text across the recording in proportion to its length. This is an
  // estimate, not a measurement: it holds up on steady speech and drifts
  // where there are long silences. It is honest navigation, not sync.
  const total = pieces.reduce((n, p) => n + p.text.length, 0) || 1;
  const canEstimate = Number(duration) > 0;

  let cursor = 0;
  const built = pieces.map((p, i) => {
    const share = (p.text.length / total) * (Number(duration) || 0);
    const start = cursor;
    cursor += share;
    return {
      id: i,
      start: canEstimate ? Math.round(start * 100) / 100 : 0,
      end: canEstimate ? Math.round(cursor * 100) / 100 : 0,
      speaker: p.speaker,
      text: p.text,
      confidence: null
    };
  });

  return { timing: canEstimate ? 'estimated' : 'none', segments: built };
};

// ----- segments -> text --------------------------------------------------

// Rebuild the stored HTML from the segments, so edits round-trip back into
// the same shape the rest of the app and the Word export already understand.
export const segmentsToHtml = (segments, speakerNames = {}) => segments
  .map((s) => {
    const text = String(s.text || '').trim();
    if (!s.speaker) return text;
    const name = speakerNames[s.speaker] || s.speaker;
    return `<strong>${name}:</strong> ${text}`;
  })
  .filter(Boolean)
  .join('\n');

// ----- copy modes --------------------------------------------------------

export const COPY_MODES = [
  { id: 'full',  label: 'With speakers and timestamps', hint: 'Exactly as it appears on screen' },
  { id: 'clean', label: 'Clean text, keep paragraphs',  hint: 'No speaker tags or timestamps' },
  { id: 'block', label: 'As one block',                 hint: 'One continuous paragraph' }
];

export const stripTags = (text) => {
  const lines = htmlToText(text)
    .replace(BRACKETED_TIME, '')
    .split('\n')
    .map((line) => {
      let out = line.trim();
      if (SRT_RANGE.test(out)) return '';
      out = out.replace(LEADING_TIME, '');
      out = out.replace(SPEAKER_TAG, '');
      return out.replace(/[ \t]{2,}/g, ' ').trim();
    });

  // Collapse runs of blank lines so real paragraph breaks survive but gaps
  // left behind by removals do not.
  const kept = [];
  for (const line of lines) {
    if (line === '' && kept[kept.length - 1] === '') continue;
    kept.push(line);
  }
  return kept.join('\n').trim();
};

/**
 * Render segments for the clipboard.
 * `withTimes` adds a leading clock, but only when the times are real —
 * printing an estimate as though it were measured would be a lie.
 */
export const copyFromSegments = (segments, mode, { speakerNames = {}, withTimes = false } = {}) => {
  if (mode === 'clean' || mode === 'block') {
    const body = segments.map((s) => String(s.text || '').trim()).filter(Boolean);
    if (mode === 'block') {
      return body.join(' ').replace(/\s{2,}/g, ' ').trim();
    }
    return body.join('\n');
  }

  // 'full' - keep the speaker names, and the times if they are trustworthy.
  return segments
    .map((s) => {
      const name = s.speaker ? (speakerNames[s.speaker] || s.speaker) : null;
      const stamp = withTimes ? `[${formatTime(s.start)}] ` : '';
      const label = name ? `${name}: ` : '';
      return (stamp + label + String(s.text || '').trim()).trim();
    })
    .filter(Boolean)
    .join('\n');
};

// Kept for anything still passing raw text rather than segments.
export const applyCopyMode = (text, mode) => {
  const source = String(text || '');
  if (mode === 'clean') return stripTags(source);
  if (mode === 'block') {
    return stripTags(source).replace(/\s*\n+\s*/g, ' ').replace(/[ \t]{2,}/g, ' ').trim();
  }
  return htmlToText(source)
    .split('\n')
    .map((l) => l.replace(/[ \t]{2,}/g, ' ').trimEnd())
    .join('\n')
    .trim();
};

// ----- subtitles ---------------------------------------------------------

// Only offered when the times are real. Subtitles built from estimates would
// drift out of step with the picture and be worse than none at all.
const srtTime = (seconds) => {
  const ms = Math.max(0, Math.round((Number(seconds) || 0) * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const rem = ms % 1000;
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(rem, 3)}`;
};

export const toSrt = (segments, speakerNames = {}) => segments
  .map((s, i) => {
    const name = s.speaker ? (speakerNames[s.speaker] || s.speaker) : null;
    const body = (name ? `${name}: ` : '') + String(s.text || '').trim();
    return `${i + 1}\n${srtTime(s.start)} --> ${srtTime(s.end)}\n${body}\n`;
  })
  .join('\n');

export const toVtt = (segments, speakerNames = {}) => 'WEBVTT\n\n' + segments
  .map((s) => {
    const name = s.speaker ? (speakerNames[s.speaker] || s.speaker) : null;
    const body = (name ? `${name}: ` : '') + String(s.text || '').trim();
    return `${srtTime(s.start).replace(',', '.')} --> ${srtTime(s.end).replace(',', '.')}\n${body}\n`;
  })
  .join('\n');

// ----- misc --------------------------------------------------------------

// Distinct speaker labels, in the order they first appear.
export const speakersIn = (segments) => {
  const seen = [];
  for (const s of segments) {
    if (s.speaker && !seen.includes(s.speaker)) seen.push(s.speaker);
  }
  return seen;
};

export const countWords = (segments) => segments
  .reduce((n, s) => n + (String(s.text || '').trim().split(/\s+/).filter(Boolean).length), 0);

// Below this, a line is worth a second look. AssemblyAI's own guidance puts
// anything under about 0.8 in "check it" territory.
export const LOW_CONFIDENCE = 0.8;

export const isUncertain = (segment) =>
  typeof segment.confidence === 'number' && segment.confidence < LOW_CONFIDENCE;
