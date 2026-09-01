import React from 'react';
import AskChat from './AskChat';
import { useAsk } from './AskContext';

// The standalone Ask TypeMyworDz page. It is only the conversation: the list
// of past chats lives in the left sidebar under the Ask TypeMyworDz button,
// so the screen has one panel rather than two competing ones.

const AskTypeMyworDz = ({ userPlan, userEmail, canUse, onUpgrade }) => {
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
        emptyTitle="Ask TypeMyworDz"
        emptyHint="Ask a question, paste something in, or attach an image, PDF or Word document. Your chats are saved in the sidebar."
      />
    </div>
  );
};

export default AskTypeMyworDz;
