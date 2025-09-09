import React, { useState, useRef } from 'react';
import './App.css';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './components/Login';
import Signup from './components/Signup';
import Dashboard from './components/Dashboard';
import AdminDashboard from './components/AdminDashboard';
import { canUserTranscribe, updateUserUsage, saveTranscription, createUserProfile } from './userService';

// Main App Content (your transcription service)
function AppContent() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState('');
  const [transcription, setTranscription] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showLogin, setShowLogin] = useState(true);
  const [currentView, setCurrentView] = useState('transcribe');
  const [audioDuration, setAudioDuration] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef(null);
  const recordingIntervalRef = useRef(null);
  
  const { currentUser, logout, userProfile, refreshUserProfile } = useAuth();

  // Admin emails
  const ADMIN_EMAILS = ['typemywordz@gmail.com', 'gracenyaitara@gmail.com'];
  const isAdmin = ADMIN_EMAILS.includes(currentUser?.email);

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    setSelectedFile(file);
    
    setJobId(null);
    setStatus('');
    setTranscription('');
    setAudioDuration(0);
    setUploadProgress(0);

    if (file && file.type.startsWith('audio/')) {
      const audio = document.createElement('audio');
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => {
        setAudioDuration(audio.duration);
        URL.revokeObjectURL(audio.src);
      };
      audio.src = URL.createObjectURL(file);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      const chunks = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        chunks.push(event.data);
      };

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/wav' });
        const file = new File([blob], `recording-${Date.now()}.wav`, { type: 'audio/wav' });
        setSelectedFile(file);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingTime(0);

      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (error) {
      alert('Could not access microphone: ' + error.message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(recordingIntervalRef.current);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const simulateProgress = () => {
    setUploadProgress(0);
    const interval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 90) {
          clearInterval(interval);
          return prev;
        }
        return prev + Math.random() * 10;
      });
    }, 200);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      alert('Please select a file first');
      return;
    }

    const estimatedDuration = audioDuration || 60;
    const canTranscribe = await canUserTranscribe(currentUser.uid, estimatedDuration);
    
    if (!canTranscribe) {
      alert('You have exceeded your monthly transcription limit! Please upgrade your plan or wait until next month.');
      setCurrentView('dashboard');
      return;
    }

    setIsUploading(true);
    simulateProgress();
    
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('https://transcription-app-861t.onrender.com/transcribe', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      
      if (response.ok) {
        setJobId(result.job_id);
        setStatus(result.status);
        setUploadProgress(100);
        checkJobStatus(result.job_id);
      } else {
        alert('Upload failed: ' + result.detail);
        setUploadProgress(0);
      }
    } catch (error) {
      alert('Upload failed: ' + error.message);
      setUploadProgress(0);
    }
    
    setIsUploading(false);
  };

  const checkJobStatus = async (jobId) => {
    try {
      const response = await fetch(`https://transcription-app-861t.onrender.com/status/${jobId}`);
      const result = await response.json();
      
      setStatus(result.status);
      
      if (result.status === 'completed') {
        setTranscription(result.transcription);
        await handleTranscriptionComplete(result.transcription);
      } else if (result.status === 'failed') {
        alert('Transcription failed: ' + result.error);
      } else if (result.status === 'processing') {
        setTimeout(() => checkJobStatus(jobId), 2000);
      }
    } catch (error) {
      console.error('Status check failed:', error);
    }
  };

  const handleTranscriptionComplete = async (transcriptionText) => {
    try {
      const estimatedDuration = audioDuration || Math.max(60, selectedFile.size / 100000);
      
      await updateUserUsage(currentUser.uid, estimatedDuration);
      await saveTranscription(currentUser.uid, {
        fileName: selectedFile.name,
        duration: estimatedDuration,
        text: transcriptionText
      });
      
      await refreshUserProfile();
      console.log('Usage updated successfully');
    } catch (error) {
      console.error('Error updating usage:', error);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(transcription);
    alert('Transcription copied to clipboard!');
  };

  const downloadAsWord = () => {
    const blob = new Blob([transcription], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'transcription.doc';
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadAsTXT = () => {
    const blob = new Blob([transcription], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'transcription.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      alert('Failed to log out');
    }
  };

  // NEW FUNCTION: Create missing admin profile
  const createMissingProfile = async () => {
    try {
      await createUserProfile(currentUser.uid, currentUser.email);
      alert('Profile created successfully! Refreshing page...');
      window.location.reload();
    } catch (error) {
      console.error('Error creating profile:', error);
      alert('Error creating profile: ' + error.message);
    }
  };
  // Show login/signup forms if user is not logged in
  if (!currentUser) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <header style={{ 
          textAlign: 'center', 
          padding: '60px 20px',
          color: 'white'
        }}>
          <h1 style={{ 
            fontSize: '3.5rem', 
            margin: '0 0 20px 0',
            fontWeight: '300',
            textShadow: '0 2px 4px rgba(0,0,0,0.3)'
          }}>
            TypeMyworDz
          </h1>
          <p style={{ 
            fontSize: '1.5rem', 
            margin: '0 0 10px 0',
            opacity: '0.9'
          }}>
            You Talk, We Type
          </p>
          <p style={{ 
            fontSize: '1.1rem', 
            margin: '0',
            opacity: '0.8'
          }}>
            Speech to Text AI • Simple, Accurate, Powerful
          </p>
        </header>
        
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          marginBottom: '30px' 
        }}>
          <button
            onClick={() => setShowLogin(true)}
            style={{
              padding: '12px 30px',
              margin: '0 10px',
              backgroundColor: showLogin ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)',
              color: 'white',
              border: '2px solid rgba(255,255,255,0.3)',
              borderRadius: '25px',
              cursor: 'pointer',
              fontSize: '16px',
              backdropFilter: 'blur(10px)'
            }}
          >
            Login
          </button>
          <button
            onClick={() => setShowLogin(false)}
            style={{
              padding: '12px 30px',
              margin: '0 10px',
              backgroundColor: !showLogin ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)',
              color: 'white',
              border: '2px solid rgba(255,255,255,0.3)',
              borderRadius: '25px',
              cursor: 'pointer',
              fontSize: '16px',
              backdropFilter: 'blur(10px)'
            }}
          >
            Sign Up
          </button>
        </div>
        
        <div style={{ 
          flex: 1, 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'flex-start',
          padding: '0 20px'
        }}>
          {showLogin ? <Login /> : <Signup />}
        </div>
      </div>
    );
  }

  // Show main app interface if user is logged in
  return (
    <div style={{ 
      minHeight: '100vh',
      background: (currentView === 'dashboard' || currentView === 'admin') ? '#f8f9fa' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    }}>
      {currentView === 'transcribe' && (
        <header style={{ 
          textAlign: 'center', 
          padding: '40px 20px',
          color: 'white'
        }}>
          <h1 style={{ 
            fontSize: '3rem', 
            margin: '0 0 15px 0',
            fontWeight: '300',
            textShadow: '0 2px 4px rgba(0,0,0,0.3)'
          }}>
            TypeMyworDz
          </h1>
          <p style={{ 
            fontSize: '1.3rem', 
            margin: '0 0 8px 0',
            opacity: '0.9'
          }}>
            You Talk, We Type
          </p>
          <p style={{ 
            fontSize: '1rem', 
            margin: '0 0 20px 0',
            opacity: '0.8'
          }}>
            Speech to Text AI • Simple, Accurate, Powerful
          </p>
          
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '15px',
            fontSize: '14px',
            opacity: '0.9'
          }}>
            <span>Logged in as: {currentUser.email}</span>
            {userProfile && (
              <span>Usage: {userProfile.monthlyMinutes}/{userProfile.plan === 'business' ? '∞' : '30'} min</span>
            )}
            <button
              onClick={handleLogout}
              style={{
                padding: '6px 12px',
                backgroundColor: 'rgba(220, 53, 69, 0.8)',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >
              Logout
            </button>
            {/* Fix Profile Button - Only visible to admins */}
            {isAdmin && (
              <button
                onClick={createMissingProfile}
                style={{
                  padding: '6px 12px',
                  backgroundColor: 'rgba(40, 167, 69, 0.8)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  marginLeft: '5px'
                }}
              >
                Fix Profile
              </button>
            )}
          </div>
        </header>
      )}

      {/* Navigation Tabs */}
      <div style={{ 
        textAlign: 'center', 
        padding: currentView === 'transcribe' ? '0 20px 40px' : '20px',
        backgroundColor: (currentView === 'dashboard' || currentView === 'admin') ? 'white' : 'transparent'
      }}>
        <button
          onClick={() => setCurrentView('transcribe')}
          style={{
            padding: '12px 25px',
            margin: '0 10px',
            backgroundColor: currentView === 'transcribe' ? '#007bff' : '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '25px',
            cursor: 'pointer',
            fontSize: '16px',
            boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
          }}
        >
          🎤 Transcribe
        </button>
        <button
          onClick={() => setCurrentView('dashboard')}
          style={{
            padding: '12px 25px',
            margin: '0 10px',
            backgroundColor: currentView === 'dashboard' ? '#007bff' : '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '25px',
            cursor: 'pointer',
            fontSize: '16px',
            boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
          }}
        >
          📊 Dashboard
        </button>
        {/* Admin Tab - Only visible to admins */}
        {isAdmin && (
          <button
            onClick={() => setCurrentView('admin')}
            style={{
              padding: '12px 25px',
              margin: '0 10px',
              backgroundColor: currentView === 'admin' ? '#dc3545' : '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '25px',
              cursor: 'pointer',
              fontSize: '16px',
              boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
            }}
          >
            👑 Admin
          </button>
        )}
      </div>

      {/* Show Dashboard, Admin, or Transcription Interface */}
      {currentView === 'admin' ? (
        <AdminDashboard />
      ) : currentView === 'dashboard' ? (
        <Dashboard />
      ) : (
        <main style={{ 
          padding: '0 20px 40px',
          maxWidth: '800px', 
          margin: '0 auto'
        }}>
          {/* Usage Warning */}
          {userProfile && userProfile.plan === 'free' && userProfile.monthlyMinutes >= 25 && (
            <div style={{
              backgroundColor: 'rgba(255, 243, 205, 0.95)',
              color: '#856404',
              padding: '15px',
              borderRadius: '10px',
              marginBottom: '30px',
              textAlign: 'center',
              backdropFilter: 'blur(10px)'
            }}>
              ⚡ You're running low on minutes! You have {30 - userProfile.monthlyMinutes} minutes left this month.
              <button 
                onClick={() => setCurrentView('dashboard')}
                style={{
                  marginLeft: '10px',
                  padding: '5px 10px',
                  backgroundColor: '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer'
                }}
              >
                Upgrade Now
              </button>
            </div>
          )}
          {/* Record Audio Section */}
          <div style={{
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            borderRadius: '15px',
            padding: '30px',
            marginBottom: '30px',
            textAlign: 'center',
            boxShadow: '0 10px 30px rgba(0,0,0,0.2)'
          }}>
            <h2 style={{ 
              color: '#6c5ce7', 
              margin: '0 0 20px 0',
              fontSize: '1.5rem'
            }}>
              🎤 Record Audio or 📁 Upload File
            </h2>
            
            <div style={{ marginBottom: '30px' }}>
              <h3 style={{ 
                color: '#6c5ce7', 
                margin: '0 0 15px 0',
                fontSize: '1.2rem'
              }}>
                🎤 Record Audio
              </h3>
              
              {isRecording && (
                <div style={{
                  color: '#e17055',
                  fontSize: '18px',
                  marginBottom: '15px',
                  fontWeight: 'bold'
                }}>
                  🔴 Recording: {formatTime(recordingTime)}
                </div>
              )}
              
              <button
                onClick={isRecording ? stopRecording : startRecording}
                style={{
                  padding: '15px 30px',
                  fontSize: '18px',
                  backgroundColor: isRecording ? '#e17055' : '#e74c3c',
                  color: 'white',
                  border: 'none',
                  borderRadius: '25px',
                  cursor: 'pointer',
                  boxShadow: '0 5px 15px rgba(231, 76, 60, 0.4)',
                  transition: 'all 0.3s ease'
                }}
              >
                {isRecording ? '⏹️ Stop Recording' : '🎤 Start Recording'}
              </button>
            </div>

            <div style={{
              borderTop: '2px solid #e9ecef',
              paddingTop: '30px'
            }}>
              <h3 style={{ 
                color: '#6c5ce7', 
                margin: '0 0 15px 0',
                fontSize: '1.2rem'
              }}>
                📁 Or Upload Audio/Video File
              </h3>
              
              <div style={{
                border: '2px dashed #6c5ce7',
                borderRadius: '10px',
                padding: '20px',
                marginBottom: '20px',
                backgroundColor: '#f8f9ff'
              }}>
                <input
                  type="file"
                  accept="audio/*,video/*"
                  onChange={handleFileSelect}
                  style={{ marginBottom: '10px' }}
                />
                {selectedFile && (
                  <div style={{
                    backgroundColor: '#d1f2eb',
                    color: '#27ae60',
                    padding: '10px',
                    borderRadius: '5px',
                    marginTop: '10px'
                  }}>
                    ✅ Selected: {selectedFile.name}
                  </div>
                )}
              </div>

              {isUploading && uploadProgress > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <div style={{
                    backgroundColor: '#e9ecef',
                    height: '20px',
                    borderRadius: '10px',
                    overflow: 'hidden',
                    marginBottom: '10px'
                  }}>
                    <div style={{
                      backgroundColor: '#007bff',
                      height: '100%',
                      width: `${uploadProgress}%`,
                      transition: 'width 0.3s ease',
                      borderRadius: '10px'
                    }}></div>
                  </div>
                  <div style={{ color: '#007bff', fontSize: '14px' }}>
                    Uploading: {Math.round(uploadProgress)}%
                  </div>
                </div>
              )}

              <button
                onClick={handleUpload}
                disabled={!selectedFile || isUploading}
                style={{
                  padding: '15px 30px',
                  fontSize: '18px',
                  backgroundColor: (!selectedFile || isUploading) ? '#6c757d' : '#6c5ce7',
                  color: 'white',
                  border: 'none',
                  borderRadius: '25px',
                  cursor: (!selectedFile || isUploading) ? 'not-allowed' : 'pointer',
                  boxShadow: '0 5px 15px rgba(108, 92, 231, 0.4)'
                }}
              >
                {isUploading ? '⏳ Processing...' : '🚀 Start Transcription'}
              </button>
            </div>
          </div>

          {/* Status Section */}
          {status && (
            <div style={{
              backgroundColor: status === 'completed' ? 'rgba(212, 237, 218, 0.95)' : 'rgba(255, 243, 205, 0.95)',
              border: `2px solid ${status === 'completed' ? '#27ae60' : '#f39c12'}`,
              borderRadius: '10px',
              padding: '20px',
              marginBottom: '30px',
              textAlign: 'center'
            }}>
              <h3 style={{ 
                color: status === 'completed' ? '#27ae60' : '#f39c12',
                margin: '0'
              }}>
                {status === 'completed' ? '✅ Status: Completed!' : `⏳ Status: ${status}`}
              </h3>
              {status === 'processing' && (
                <p style={{ margin: '10px 0 0 0', color: '#666' }}>
                  Processing your file... This may take a few minutes.
                </p>
              )}
            </div>
          )}

          {/* Transcription Result */}
          {transcription && (
            <div style={{
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              borderRadius: '15px',
              padding: '30px',
              boxShadow: '0 10px 30px rgba(0,0,0,0.2)'
            }}>
              <h3 style={{ 
                color: '#6c5ce7',
                margin: '0 0 20px 0',
                textAlign: 'center',
                fontSize: '1.5rem'
              }}>
                📄 Transcription Result:
              </h3>
              
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                gap: '15px',
                marginBottom: '20px',
                flexWrap: 'wrap'
              }}>
                <button
                  onClick={copyToClipboard}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#27ae60',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  📋 Copy to Clipboard
                </button>
                <button
                  onClick={downloadAsWord}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#007bff',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  📄 MS Word
                </button>
                <button
                  onClick={downloadAsTXT}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#6c757d',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  📝 TXT
                </button>
              </div>
              
              <div style={{
                backgroundColor: '#f8f9fa',
                padding: '20px',
                borderRadius: '10px',
                textAlign: 'left',
                whiteSpace: 'pre-wrap',
                lineHeight: '1.6',
                border: '1px solid #dee2e6'
              }}>
                {transcription}
              </div>
              
              <div style={{ 
                marginTop: '15px', 
                textAlign: 'center', 
                color: '#27ae60',
                fontSize: '14px'
              }}>
                ✅ Usage updated! Check your dashboard to see remaining minutes.
              </div>
            </div>
          )}
        </main>
      )}
    </div>
  );
}

// Main App Component
function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;