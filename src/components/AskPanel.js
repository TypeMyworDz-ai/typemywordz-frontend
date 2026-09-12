import React, { useState, useEffect, useMemo } from 'react';
import AskChat from './AskChat';
import { readModelPref } from './AskContext';

// The assistant sitting beside a transcript.
//
// This is the same conversation component used on the Ask TypeMyworDz page,
// given the transcript so the client can ask about the words in front of them
// rather than pasting them somewhere else. It appears in two places: straight
// after a job finishes, and whenever a transcript is opened from Dashboard.
//
// It deliberately does NOT save to the chat history. A question about the
// transcript you are looking at belongs to that transcript, not to a separate
// list of conversations, and cluttering the sidebar with one entry per
// transcript would make the history useless.

// Transcripts are stored as HTML, so anything that reads their words has to
// turn them back into text first. Sending the markup to the assistant wastes
// the client's money and confuses the answer.
const htmlToText = (html) => {
  const raw = String(html || '');
  if (!/<[a-z][\s\S]*>/i.test(raw)) return raw;
  return raw
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|li|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const TRANSCRIPT_SUGGESTIONS = [
  {
    label: 'Sort out the speakers',
    prompt:
      'Work out who is speaking where in this transcript and label the speakers correctly. '
      + 'If you are not sure about a turn, say so rather than guessing.',
  },
  {
    label: 'Take out the filler words',
    prompt:
      'Remove filler words and false starts such as uh, um, you know and I mean, without '
      + 'changing anyone\'s meaning or wording otherwise.',
  },
  {
    label: 'List the names and check the spellings',
    prompt:
      'List every proper noun in this transcript: people, places, organisations and products. '
      + 'Give the correct spelling for each one, and mark any you are unsure about.',
  },
  {
    label: 'Format it to my guidelines',
    prompt:
      'Format this transcript to the following guidelines, and follow them exactly:\n\n'
      + '(replace this line with your guidelines)',
  },
  {
    label: 'Summarise it',
    prompt: 'Summarise this transcript in a short paragraph, then in five bullet points.',
  },
  {
    label: 'Pull out the action points',
    prompt:
      'List the action points from this transcript. For each one, say who is responsible '
      + 'and any deadline mentioned. If nobody was named, say so.',
  },
  {
    label: 'Write it up as a report',
    prompt:
      'Turn this transcript into a written report with headings, in plain professional '
      + 'English. Do not invent anything that was not said.',
  },
];

const AskPanel = ({
  transcript = '',
  userPlan = 'free',
  userEmail = '',
  userId = '',
  canUse = false,
  onUpgrade,
  defaultOpen = false,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const [messages, setMessages] = useState([]);
  const [model, setModel] = useState('');

  useEffect(() => {
    setModel(readModelPref());
  }, [open]);

  // A new transcript is a new conversation.
  useEffect(() => {
    setMessages([]);
  }, [transcript]);

  const plainTranscript = useMemo(() => htmlToText(transcript), [transcript]);

  if (!plainTranscript) return null;

  if (!canUse) {
    return (
      <section className="tm-ask-panel tm-ask-panel-locked">
        <div className="tm-ask-panel-head">
          <img src="/android-chrome-192x192.png" alt="" className="tm-ask-mark" width="20" height="20" />
          <span>Ask about this transcript</span>
        </div>
        <p className="tm-ask-panel-lock">
          Ask questions about this transcript, get a summary, pull out the action points, or
          have it tidied up. Included with every paid plan.
        </p>
        {onUpgrade && (
          <button type="button" className="tm-btn-go" onClick={onUpgrade}>
            See plans
          </button>
        )}
      </section>
    );
  }

  return (
    <section className={'tm-ask-panel' + (open ? ' tm-ask-panel-open' : '')}>
      <button
        type="button"
        className="tm-ask-panel-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <img src="/android-chrome-192x192.png" alt="" className="tm-ask-mark" width="20" height="20" />
        <span className="tm-ask-panel-title">Ask about this transcript</span>
        <span className="tm-ask-panel-chev" aria-hidden="true">
          <svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d={open ? 'M2.5 7.5L6 4l3.5 3.5' : 'M2.5 4.5L6 8l3.5-3.5'} />
          </svg>
        </span>
      </button>

      {open && (
        <div className="tm-ask-panel-body">
          <AskChat
            messages={messages}
            onMessagesChange={setMessages}
            transcript={plainTranscript}
            model={model}
            userPlan={userPlan}
            userEmail={userEmail}
            userId={userId}
            compact
            placeholder="Ask about this transcript, or attach a file"
            emptyTitle="Ask about this transcript"
            emptyHint="Ask anything about the words in front of you, or start with one of these."
            suggestions={TRANSCRIPT_SUGGESTIONS}
          />
        </div>
      )}
    </section>
  );
};

export default AskPanel;
