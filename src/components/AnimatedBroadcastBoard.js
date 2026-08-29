import React, { useState, useEffect } from 'react';

const messages = [
  {
    type: 'text',
    content: "✨ Tell Assistant to summarize your transcripts!",
    color: '#6c5ce7'
  },
  {
    type: 'text',
    content: "🚀 Choose a plan that meets your needs and Schedule!",
    color: '#007bff'
  },
  {
    type: 'text',
    content: "💡 English and No Speakers are by Default. Change to your liking.",
    color: '#649615ff'
  },
  {
    type: 'image',
    content: "/gemini_logo.png", // Ensure this path is correct in your public folder
    text: "Interact with your transcripts using Gemini!",
    alt: "Gemini AI"
  },
  {
    type: 'text',
    content: "💡 Assistant can intelligently Speaker-Diarize your transcript.",
    color: '#649615ff'
  },
  {
    type: 'image',
    content: "/claude_logo.png", // Ensure this path is correct in your public folder
    text: "Interact with your transcripts using Claude Sonnet!",
    alt: "Claude AI"
  },
  {
    type: 'text',
    content: "💰 Our African subscribers can now pay with Mobile Money",
    color: '#1e9b0dff'
  },
  {
    type: 'text',
    content: "We also offer Human-Transcripts Services, talk to us!",
    color: '#5935dcff'
  },
  {
    type: 'text',
    content: "Our state-of-the-art audio recorder is FREE.",
    color: '#150c38ff'
  },
  {
    type: 'text',
    content: "Record on your phone, transcribe, access on phone/PC!",
    color: '#0f5364ff'
  },
  {
    type: 'text',
    content: "We use the latest audio compression technology.",
    color: '#630a54ff'
  },
  {
    type: 'text',
    content: "We do not store your audios/videos, we value your privacy!",
    color: '#0d248abd'
  },
  {
    type: 'text',
    content: "Edit your transcripts securely on our Transcription Editor tool.",
    color: '#41401dff'
  },
  {
    type: 'text',
    content: "Transcribe manually for free on our Transcription Editor.",
    color: '#7f9fdbff'
  },
  {
    type: 'image',
    content: "/claude_logo.png", // Ensure this path is correct in your public folder
    text: "Translate into Spanish & more!",
    alt: "Claude AI"
  }
];

const AnimatedBroadcastBoard = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [fade, setFade] = useState('fade-in');

  useEffect(() => {
    const fadeOutTimer = setTimeout(() => {
      setFade('fade-out');
    }, 4000); // Fade out after 4 seconds

    const nextMessageTimer = setTimeout(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % messages.length);
      setFade('fade-in');
    }, 5000); // Change message every 5 seconds (4s visible + 1s fade out)

    return () => {
      clearTimeout(fadeOutTimer);
      clearTimeout(nextMessageTimer);
    };
  }, [currentIndex]);

  const currentMessage = messages[currentIndex];

  return (
    <div style={{
      width: '100%',
      height: '64px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      position: 'relative',
      borderRadius: '10px',
      border: '1px solid #e5e6ea',
      boxShadow: 'none',
      backgroundColor: '#f8f8f9',
      padding: '12px 24px',
      boxSizing: 'border-box'
    }}>
      <div className={fade} style={{
        textAlign: 'center',
        position: 'absolute',
        width: 'calc(100% - 60px)', // Adjust for increased padding
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '15px' // Increased gap
      }}>
        {currentMessage.type === 'text' ? (
          <p style={{
            margin: 0,
            fontSize: '0.95rem',
            fontWeight: 500,
            color: '#3f434c',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            lineHeight: '1.4' // Better line height
          }}>
            {currentMessage.content}
          </p>
        ) : (
          <>
            <img 
              src={currentMessage.content} 
              alt={currentMessage.alt} 
              style={{ height: '22px', width: 'auto', verticalAlign: 'middle' }}
            />
            <span style={{ 
              fontSize: '0.95rem',
              fontWeight: 500, 
              color: '#3f434c',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              lineHeight: '1.4' // Better line height
            }}>
              {currentMessage.text}
            </span>
          </>
        )}
      </div>
    </div>
  );
};

export default AnimatedBroadcastBoard;
