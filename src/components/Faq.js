import React, { useState } from 'react';
import LegalShell from './LegalShell';

/**
 * Frequently asked questions.
 *
 * Public on purpose: a visitor deciding whether to sign up should be able to
 * read honest answers before handing over an email address, and payment
 * providers look for a page like this too.
 *
 * Every answer here is checked against how the app actually behaves. If the
 * behaviour changes, this page changes with it. Nothing is promised here that
 * the app does not already do.
 */
const QUESTIONS = [
  {
    q: 'How accurate is it, really?',
    a: [
      'On clear audio with one or two speakers, expect to correct only the occasional word. Names, technical terms and places are the usual ones. On a noisy recording, a heavy accent, or several people talking over each other, expect to do more correcting.',
      'That is true of every transcription service, which is why we built a proper editor: you play the audio and fix as you listen, rather than retyping from scratch. We would rather you knew that up front than felt misled.',
    ],
  },
  {
    q: 'What happens to my recordings and my transcripts? Are they used to train AI?',
    a: [
      'No. All three of the transcription providers we use are contractually opted out of using your audio for model training, and we have confirmed that on each account.',
      'Your audio file is deleted as soon as the transcript is made, so we do not keep it. Your transcript is kept in your account for 30 days, or a full year on the Yearly plan, and you can delete it yourself at any time.',
    ],
  },
  {
    q: 'How long does a transcript take?',
    a: [
      'Usually a few minutes for an hour of audio. It varies with length and how busy the service is. You do not have to sit and watch it.',
    ],
  },
  {
    q: 'What file types can I upload, and can I record straight into the app?',
    a: [
      'Common audio and video files both work. You can also record directly in your browser, which is free. You only use your plan when you transcribe.',
      'One thing worth knowing: once you leave the editor, the transcript stays in My Files but the audio does not. If you want to proofread against the audio later, keep your own copy of the file.',
    ],
  },
  {
    q: 'What do I actually get for my money, and what happens if I run out?',
    a: [
      "Each plan includes a set amount of transcription: 8 hours on the Three-Day plan, 15 on the One-Week, and 25 hours a month on the Monthly and Yearly plans. That is far more than most people use.",
      'If you do run out, you can add more without changing plan, so you are never stuck in the middle of a job.',
    ],
  },
  {
    q: 'Do plans renew automatically? Will I be charged again without noticing?',
    a: [
      'No. Plans are one-off purchases that last a fixed period and then stop. There is no subscription running quietly in the background and nothing to cancel.',
    ],
  },
  {
    q: 'Can it tell speakers apart, and can I get timestamps?',
    a: [
      'Yes to both. Turn on speaker labels before you transcribe and the transcript comes back separated by speaker.',
      'Timestamps are there for seeking through the audio while you proofread, and on jobs with exact timing you can also export subtitle files.',
    ],
  },
  {
    q: 'How do I get the transcript out, and can I get help from a person?',
    a: [
      'Export to Word or plain text, or copy it to your clipboard in one click, including as a single block with the speaker tags stripped out, which is what most of our clients use.',
      'If you are stuck, email info@typemywordz.ai and a person will answer.',
    ],
  },
  {
    q: 'What if I want a human to handle my job?',
    a: [
      'We can do that too. Alongside the automatic service we run a department that produces 100% human-made transcripts, for the jobs where the audio is difficult or the accuracy has to be beyond question.',
      'Email info@typemywordz.ai, tell us roughly how long the recording is and when you need it back, and we will come back to you with a price and a turnaround.',
    ],
  },
];

const Faq = () => {
  // First question open, so the page never looks like a wall of closed boxes.
  const [open, setOpen] = useState(0);

  return (
    <LegalShell title="Frequently asked questions" updated="1 September 2026">
      <p>
        Honest answers to the things people actually ask us before they sign up. If your
        question is not here, email{' '}
        <a href="mailto:info@typemywordz.ai">info@typemywordz.ai</a> and a person will answer.
      </p>

      <div className="tm-faq">
        {QUESTIONS.map((item, i) => {
          const isOpen = open === i;
          return (
            <div className={'tm-faq-item' + (isOpen ? ' tm-faq-open' : '')} key={item.q}>
              <button
                type="button"
                className="tm-faq-q"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? -1 : i)}
              >
                <span>{item.q}</span>
                <svg
                  className="tm-faq-chev"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {isOpen && (
                <div className="tm-faq-a">
                  {item.a.map((para, k) => (
                    <p key={k}>{para}</p>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </LegalShell>
  );
};

export default Faq;
