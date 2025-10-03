import React, { useState, useEffect } from 'react';

const FeedbackModal = ({ show, onClose, onSend, userName, userEmail, isSending }) => {
  const [name, setName] = useState(userName || '');
  const [email, setEmail] = useState(userEmail || '');
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    // Update state if props change (e.g., user logs in/out)
    setName(userName || '');
    setEmail(userEmail || '');
  }, [userName, userEmail]);

  if (!show) {
    return null;
  }

  const handleSubmit = (e) => {
    e.preventDefault();
    onSend(name, email, feedback);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 2000,
      backdropFilter: 'blur(5px)'
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '30px',
        borderRadius: '15px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
        textAlign: 'center',
        maxWidth: '500px',
        width: '90%',
        position: 'relative'
      }}>
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '15px',
            right: '15px',
            background: 'none',
            border: 'none',
            fontSize: '24px',
            cursor: 'pointer',
            color: '#6b7280'
          }}
        >
          &times;
        </button>
        <h2 style={{ color: '#6c5ce7', marginBottom: '20px', fontSize: '2rem' }}>Send Us Feedback</h2>
        <p style={{ color: '#6b7280', marginBottom: '25px', fontSize: '0.95rem' }}>
          We'd love to hear your thoughts, suggestions, or any issues you've encountered.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div>
            <label htmlFor="feedbackName" style={{ display: 'block', textAlign: 'left', color: '#374151', marginBottom: '5px' }}>
              Name (Optional):
            </label>
            <input
              type="text"
              id="feedbackName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '1rem',
                boxSizing: 'border-box'
              }}
              disabled={isSending}
            />
          </div>

          <div>
            <label htmlFor="feedbackEmail" style={{ display: 'block', textAlign: 'left', color: '#374151', marginBottom: '5px' }}>
              Email (Mandatory):
            </label>
            <input
              type="email"
              id="feedbackEmail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '1rem',
                boxSizing: 'border-box'
              }}
              disabled={isSending}
            />
          </div>

          <div>
            <label htmlFor="feedbackText" style={{ display: 'block', textAlign: 'left', color: '#374151', marginBottom: '5px' }}>
              Your Feedback (Mandatory):
            </label>
            <textarea
              id="feedbackText"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows="5"
              required
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '1rem',
                boxSizing: 'border-box',
                resize: 'vertical'
              }}
              placeholder="Type your feedback here..."
              disabled={isSending}
            ></textarea>
          </div>

          <button
            type="submit"
            disabled={isSending || !email || !feedback.trim()}
            style={{
              backgroundColor: isSending || !email || !feedback.trim() ? '#a0a0a0' : '#28a745',
              color: 'white',
              padding: '12px 25px',
              borderRadius: '10px',
              border: 'none',
              cursor: isSending || !email || !feedback.trim() ? 'not-allowed' : 'pointer',
              fontSize: '1rem',
              fontWeight: 'bold',
              marginTop: '15px',
              transition: 'background-color 0.3s ease'
            }}
            onMouseEnter={(e) => { if (!e.target.disabled) e.target.style.backgroundColor = '#218838'; }}
            onMouseLeave={(e) => { if (!e.target.disabled) e.target.style.backgroundColor = '#28a745'; }}
          >
            {isSending ? 'Sending...' : 'Send Feedback'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default FeedbackModal;
