import React from 'react';
import AskChat from './AskChat';
import { useAsk } from './AskContext';

// The standalone Ask TypeMyworDz page. It is only the conversation: the list
// of past chats lives in the left sidebar under the Ask TypeMyworDz button,
// so the screen has one panel rather than two competing ones.

const GENERAL_SUGGESTIONS = [
  {
    label: 'Write something for me',
    prompt:
      'Write a short, plain-English email to a client explaining a delay and what happens next. '
      + 'Keep it under 150 words and do not be defensive.',
  },
  {
    label: 'Explain this simply',
    prompt: 'Explain the following in plain English, as if I have no background in it:\n\n',
  },
  {
    label: 'Research a topic',
    prompt:
      'Give me a briefing on the following topic: what it is, why it matters, and the main '
      + 'points of disagreement. Tell me where you are unsure.\n\n',
  },
  {
    label: 'Write some code',
    prompt:
      'Write a small script for the following, and put it in a code block so I can copy it '
      + 'straight into my editor. Explain what it does in a sentence first.\n\n',
  },
  {
    label: 'Fix my code',
    prompt:
      'Here is some code that is not working. Tell me what is wrong and give me the corrected '
      + 'version in a code block.\n\n',
  },
  {
    label: 'Read a document I attach',
    prompt:
      'Read the attached file and give me a summary, then the key points, then anything in it '
      + 'that looks like a problem.',
  },
  {
    label: 'Turn my notes into a document',
    prompt:
      'Turn these rough notes into a tidy document with headings. Do not add anything I have '
      + 'not written.\n\n',
  },
];

const AskTypeMyworDz = ({ userPlan, userEmail, userId, canUse, onUpgrade }) => {
  const { messages, handleMessages, model } = useAsk();

  if (!canUse) {
    return (
      <div className="tm-askpage-locked">
        <h2 className="tm-askpage-title">Ask TypeMyworDz</h2>
        <p>
          Ask TypeMyworDz answers questions about your transcripts and anything else you need. It is
          included with every paid plan.
        </p>
        <button type="button" className="tm-btn-go" onClick={onUpgrade}>
          See plans
        </button>
      </div>
    );
  }

  return (
    <div className="tm-askpage">
      <AskChat
        messages={messages}
        onMessagesChange={handleMessages}
        model={model}
        userPlan={userPlan}
        userEmail={userEmail}
        userId={userId}
        emptyTitle="Ask TypeMyworDz"
        emptyHint="Ask a question, paste something in, or attach an image, PDF or Word document. Your chats are saved in the sidebar."
        suggestions={GENERAL_SUGGESTIONS}
      />
    </div>
  );
};

export default AskTypeMyworDz;
