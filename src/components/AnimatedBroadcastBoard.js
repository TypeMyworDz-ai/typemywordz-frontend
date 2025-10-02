import React, { useState, useEffect } from 'react';

const messages = [
  {
    type: 'text',
    content: "✨ Tell Assistant to summarize your transcripts!",
    color: '#6c5ce7'
  },
  {
    type: 'text',
    content: "🚀 Choose from Three-Day Plan and Experience Speed and Accuracy!",
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
    type: 'image',
    content: "/claude_logo.png", // Ensure this path is correct in your public folder
    text: "Interact with your transcripts using Claude Sonnet!",
    alt: "Claude AI"
  },
  {
    type: 'text',
    content: "💰 Our African subscribers can now pay with M-PESA",
    color: '#1e9b0dff'
  },
  {
    type: 'text',
    content: "We also offer Human-Transcripts Services, talk to us!",
    color: '#5935dcff'
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
      height: '120px', // Increased height to make it more beautiful
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      position: 'relative',
      borderRadius: '15px', // More rounded corners
      border: '2px solid #e9ecef', // Slightly thicker border
      boxShadow: '0 8px 25px rgba(0,0,0,0.15)', // Enhanced shadow
      backgroundColor: 'white',
      padding: '20px 30px', // Increased padding
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
            fontSize: '1.3rem', // Increased font size
            fontWeight: 'bold',
            color: currentMessage.color,
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
              style={{ height: '40px', width: 'auto', verticalAlign: 'middle' }} // Increased image size
            />
            <span style={{ 
              fontSize: '1.3rem', // Increased font size
              fontWeight: 'bold', 
              color: '#333',
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
