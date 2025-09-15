import React from 'react';
import { useNavigate } from 'react-router-dom';

const FloatingTranscribeButton = () => {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate('/');
  };

  return (
    <button
      onClick={handleClick}
      style={{
        position: 'fixed',
        top: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        backgroundColor: '#7c3aed',
        color: 'white',
        padding: '12px 24px',
        borderRadius: '50px',
        border: 'none',
        cursor: 'pointer',
        fontSize: '16px',
        fontWeight: '600',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        boxShadow: '0 4px 20px rgba(124, 58, 237, 0.4)',
        transition: 'all 0.3s ease',
        backdropFilter: 'blur(10px)',
        animation: 'float 3s ease-in-out infinite'
      }}
      onMouseEnter={(e) => {
        e.target.style.backgroundColor = '#6d28d9';
        e.target.style.transform = 'translateX(-50%) translateY(-2px)';
        e.target.style.boxShadow = '0 6px 25px rgba(124, 58, 237, 0.6)';
      }}
      onMouseLeave={(e) => {
        e.target.style.backgroundColor = '#7c3aed';
        e.target.style.transform = 'translateX(-50%)';
        e.target.style.boxShadow = '0 4px 20px rgba(124, 58, 237, 0.4)';
      }}
    >
      <svg 
        style={{ width: '20px', height: '20px' }} 
        fill="none" 
        stroke="currentColor" 
        viewBox="0 0 24 24"
      >
        <path 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          strokeWidth={2} 
          d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" 
        />
      </svg>
      🎤 New Transcription
      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateX(-50%) translateY(0px); }
          50% { transform: translateX(-50%) translateY(-3px); }
        }
      `}</style>
    </button>
  );
};

export default FloatingTranscribeButton;