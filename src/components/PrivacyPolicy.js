import React from 'react';

const PrivacyPolicy = () => {
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f8f9fa',
      padding: '40px 20px'
    }}>
      <div style={{
        maxWidth: '800px',
        margin: '0 auto',
        backgroundColor: 'white',
        padding: '40px',
        borderRadius: '15px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.1)'
      }}>
        <h1 style={{ color: '#6c5ce7', marginBottom: '30px', fontSize: '2.5rem' }}>
          Privacy Policy
        </h1>
        <p style={{ color: '#666', fontSize: '1.1rem', marginBottom: '30px' }}>
          <strong>Last updated:</strong> January 2025
        </p>
        
        <h2 style={{ color: '#333', marginTop: '30px', marginBottom: '15px' }}>
          Information We Collect
        </h2>
        <p style={{ lineHeight: '1.6', marginBottom: '20px' }}>
          We collect information you provide directly to us, such as when you create an account using Google Sign-In, 
          upload audio files for transcription, or contact us for support. This includes your email address, 
          name, and transcription data.
        </p>
        
        <h2 style={{ color: '#333', marginTop: '30px', marginBottom: '15px' }}>
          How We Use Your Information
        </h2>
        <p style={{ lineHeight: '1.6', marginBottom: '20px' }}>
          We use the information we collect to:
        </p>
        <ul style={{ lineHeight: '1.6', marginBottom: '20px', paddingLeft: '30px' }}>
          <li>Provide, maintain, and improve our transcription services</li>
          <li>Process your audio files and generate transcriptions</li>
          <li>Manage your account and subscription</li>
          <li>Communicate with you about our services</li>
          <li>Provide customer support</li>
        </ul>
        
        <h2 style={{ color: '#333', marginTop: '30px', marginBottom: '15px' }}>
          Information Sharing
        </h2>
        <p style={{ lineHeight: '1.6', marginBottom: '20px' }}>
          We do not sell, trade, or otherwise transfer your personal information to third parties without your consent, 
          except as described in this policy. We may use third-party services (like AssemblyAI and Whisper) to process 
          your audio files for transcription purposes.
        </p>
        
        <h2 style={{ color: '#333', marginTop: '30px', marginBottom: '15px' }}>
          Data Security
        </h2>
        <p style={{ lineHeight: '1.6', marginBottom: '20px' }}>
          We implement appropriate security measures to protect your personal information against unauthorized access, 
          alteration, disclosure, or destruction. Your data is stored securely using Firebase and Google Cloud services.
        </p>
        
        <h2 style={{ color: '#333', marginTop: '30px', marginBottom: '15px' }}>
          Data Retention
        </h2>
        <p style={{ lineHeight: '1.6', marginBottom: '20px' }}>
          We retain your transcription data for 7 days for Pro users and immediately after processing for free users, 
          unless you delete it earlier. Account information is retained as long as your account is active.
        </p>
        
        <h2 style={{ color: '#333', marginTop: '30px', marginBottom: '15px' }}>
          Your Rights
        </h2>
        <p style={{ lineHeight: '1.6', marginBottom: '20px' }}>
          You have the right to access, update, or delete your personal information. You can manage your data 
          through your account dashboard or by contacting us directly.
        </p>
        
        <h2 style={{ color: '#333', marginTop: '30px', marginBottom: '15px' }}>
          Contact Us
        </h2>
        <p style={{ lineHeight: '1.6', marginBottom: '20px' }}>
          If you have any questions about this Privacy Policy, please contact us at:
        </p>
        <div style={{
          backgroundColor: '#f8f9fa',
          padding: '20px',
          borderRadius: '8px',
          marginBottom: '30px'
        }}>
          <p style={{ margin: 0, fontWeight: 'bold' }}>Email: njokigituku@gmail.com</p>
          <p style={{ margin: '5px 0 0 0' }}>TypeMyworDz Support Team</p>
        </div>
        
        <div style={{ textAlign: 'center', marginTop: '40px' }}>
          <button
            onClick={() => window.history.back()}
            style={{
              padding: '12px 30px',
              backgroundColor: '#6c5ce7',
              color: 'white',
              border: 'none',
              borderRadius: '25px',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: 'bold'
            }}
          >
            ← Back to App
          </button>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
