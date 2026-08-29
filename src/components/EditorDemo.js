import React from 'react';
import { useNavigate } from 'react-router-dom';
import TranscriptEditor from './TranscriptEditor';

// ---------------------------------------------------------------------------
// A sample transcript, so the editor can be tried out without spending any
// transcription minutes. Everything on this page is made up; nothing is sent
// anywhere. Reached at /editor-demo.
//
// The timings below are the shape the service returns, so this page also shows
// what the editor looks like once real timings are flowing: exact clock
// positions with no approximate warning, and subtitle export available.
// ---------------------------------------------------------------------------

const SAMPLE = [
  { start: 0.4,  end: 6.1,  speaker: 'Speaker 1', text: 'Good morning. This is the recorded interview regarding claim file 4471-B, and today is the twelfth of March.', confidence: 0.97 },
  { start: 6.4,  end: 9.8,  speaker: 'Speaker 1', text: 'Could you state your full name for the record, please?', confidence: 0.98 },
  { start: 10.2, end: 13.6, speaker: 'Speaker 2', text: 'Yes, it is Margaret Adeyemi.', confidence: 0.71 },
  { start: 14.0, end: 21.9, speaker: 'Speaker 1', text: 'Thank you. And can you take me through what happened on the morning of the incident, in your own words?', confidence: 0.96 },
  { start: 22.3, end: 31.5, speaker: 'Speaker 2', text: 'I left the house at about 7:15 and drove down Kenyatta Avenue as I always do.', confidence: 0.94 },
  { start: 31.9, end: 41.2, speaker: 'Speaker 2', text: 'The traffic was heavier than usual, so I would say I reached the junction around 7:40 rather than half past.', confidence: 0.92 },
  { start: 41.6, end: 47.0, speaker: 'Speaker 1', text: 'And at that point, was the signal working?', confidence: 0.99 },
  { start: 47.4, end: 58.8, speaker: 'Speaker 2', text: 'No, it was not. It had been out for two or three days by then, and there was no officer directing anyone.', confidence: 0.93 },
  { start: 59.2, end: 68.4, speaker: 'Speaker 2', text: 'The lorry came through from my right without stopping at all. I did not have time to brake.', confidence: 0.64 },
  { start: 68.8, end: 74.1, speaker: 'Speaker 1', text: 'I understand. Take your time. Did anyone stop to help?', confidence: 0.97 },
  { start: 74.5, end: 84.9, speaker: 'Speaker 2', text: 'Two people did, yes. A gentleman from the shop on the corner, and a lady who called the ambulance.', confidence: 0.95 },
  { start: 85.3, end: 92.0, speaker: 'Speaker 1', text: 'Thank you. That concludes the interview. The time is now 10:12.', confidence: 0.98 }
];

const RAW = SAMPLE.map((s) => `<strong>${s.speaker}:</strong> ${s.text}`).join('\n');

const EditorDemo = () => {
  const navigate = useNavigate();

  return (
    <div className="tm-detail">
      <div className="tm-demo-note">
        <strong>This is a sample transcript.</strong> Nothing here is real and nothing is saved,
        so try anything you like. Click a line to correct it, click a speaker name to rename them
        everywhere, and open Copy or Export to see the options. Add any audio file from your
        computer to see the lines follow along as it plays.
      </div>

      <TranscriptEditor
        fileName="Sample interview - claim 4471-B.mp3"
        rawText={RAW}
        segments={SAMPLE}
        durationSeconds={92}
        createdAt="12 Mar 2026"
        onSave={null}
        showBack
        onBack={() => navigate('/dashboard')}
      />
    </div>
  );
};

export default EditorDemo;
