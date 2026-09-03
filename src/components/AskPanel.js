import React, { useState, useEffect, useMemo } from 'react';
import AskChat from './AskChat';
import { readModelPref } from './AskContext';

// The assistant sitting beside a transcript.
//
// This is the same conversation component used on the Ask TypeMyworDz page,
// given the transcript so the client can ask about the words in front of them
// rather than pasting them somewhere else. It appears in two places: straight
// after a job finishes, and whenever a transcript is opened from My files.
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
            emptyHint="Try: summarise this, list the action points, who said what about the school, or tidy up the wording."
          />
        </div>
      )}
    </section>
  );
};

export default AskPanel;
