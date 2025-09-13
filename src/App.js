import React, { useState, useRef, useEffect, useCallback } from 'react';
import './App.css';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './components/Login';
import Signup from './components/Signup';
import Dashboard from './components/Dashboard';
import AdminDashboard from './components/AdminDashboard';
import { canUserTranscribe, updateUserUsage, saveTranscription, createUserProfile } from './userService';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

// Configuration
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://web-production-5eab.up.railway.app';

// Message Modal Component
const MessageModal = ({ message, onClose }) => {
  if (!message) return null;
  
  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div className="bg-white p-8 rounded-xl shadow-2xl text-center max-w-sm w-full transform transition-all duration-300 scale-100">
        <h3 className="text-xl font-bold mb-4 text-purple-600">Notification</h3>
        <p className="text-gray-700 mb-6">{message}</p>
        <button
          onClick={onClose}
          className="bg-purple-600 text-white px-6 py-2 rounded-full font-bold shadow-lg hover:bg-purple-700 transition-colors duration-200"
        >
          OK
        </button>
      </div>
    </div>
  );
};

// Utility functions
const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const simulateProgress = (setter, intervalTime, maxProgress = 100) => { 
  setter(0);
  const interval = setInterval(() => {
    setter(prev => {
      if (maxProgress === -1) { 
        return (prev + (Math.random() * 5 + 1)) % 100;
      }
      return prev + Math.random() * 10; 
    });
  }, intervalTime);
  return interval; 
};
function AppContent() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState('idle'); // 'idle', 'processing', 'completed', 'failed'
  const [transcription, setTranscription] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [transcriptionProgress, setTranscriptionProgress] = useState(0);
  const [showLogin, setShowLogin] = useState(true);
  const [currentView, setCurrentView] = useState('transcribe');
  const [audioDuration, setAudioDuration] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef(null);
  const recordingIntervalRef = useRef(null);
  const audioPlayerRef = useRef(null); 
  const recordedAudioBlobRef = useRef(null); 
  const [message, setMessage] = useState('');
  const [copiedMessageVisible, setCopiedMessageVisible] = useState(false);

  const abortControllerRef = useRef(null);

  const { currentUser, logout, userProfile, refreshUserProfile, signInWithGoogle, signInWithMicrosoft, profileLoading } = useAuth();

  const ADMIN_EMAILS = ['typemywordz@gmail.com', 'gracenyaitara@gmail.com'];
  const isAdmin = ADMIN_EMAILS.includes(currentUser?.email);

  const showMessage = useCallback((msg) => setMessage(msg), []);
  const clearMessage = useCallback(() => setMessage(''), []);
  const resetTranscriptionProcessUI = useCallback(() => { 
    setSelectedFile(null);
    setJobId(null);
    setStatus('idle'); 
    setTranscription('');
    setAudioDuration(0);
    setIsUploading(false);
    setUploadProgress(0);
    setTranscriptionProgress(0); 
    recordedAudioBlobRef.current = null;
    if (audioPlayerRef.current) {
      audioPlayerRef.current.src = '';
      audioPlayerRef.current.load();
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const handleFileSelect = useCallback((event) => {
    resetTranscriptionProcessUI(); 
    const file = event.target.files[0];
    setSelectedFile(file);
    
    if (file && (file.type.startsWith('audio/') || file.type.startsWith('video/'))) { 
      if (audioPlayerRef.current) {
        audioPlayerRef.current.src = URL.createObjectURL(file);
        audioPlayerRef.current.load();
      }

      const audio = new Audio(); 
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => {
        setAudioDuration(audio.duration);
        URL.revokeObjectURL(audio.src);
      };
      audio.src = URL.createObjectURL(file);
    }
  }, [resetTranscriptionProcessUI]);

  const startRecording = useCallback(async () => {
    resetTranscriptionProcessUI(); 
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      const chunks = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        chunks.push(event.data);
      };

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/wav' });
        recordedAudioBlobRef.current = blob; 
        const file = new File([blob], `recording-${Date.now()}.wav`, { type: 'audio/wav' });
        setSelectedFile(file);
        stream.getTracks().forEach(track => track.stop());

        if (audioPlayerRef.current) {
          audioPlayerRef.current.src = URL.createObjectURL(file);
          audioPlayerRef.current.load();
        }
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingTime(0);

      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (error) {
      showMessage('Could not access microphone: ' + error.message);
    }
  }, [resetTranscriptionProcessUI, showMessage]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(recordingIntervalRef.current);
    }
  }, [isRecording]);

  const handleCancelUpload = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    resetTranscriptionProcessUI();
    showMessage("Upload / Transcription cancelled.");
  }, [resetTranscriptionProcessUI, showMessage]);

  const handleTranscriptionComplete = useCallback(async (transcriptionText) => {
    try {
      const estimatedDuration = audioDuration || Math.max(60, selectedFile.size / 100000);
      
      await updateUserUsage(currentUser.uid, estimatedDuration);
      const audioUrl = selectedFile ? URL.createObjectURL(selectedFile) : (recordedAudioBlobRef.current ? URL.createObjectURL(recordedAudioBlobRef.current) : null);
      await saveTranscription(currentUser.uid, {
        fileName: selectedFile.name,
        duration: estimatedDuration,
        text: transcriptionText,
        audioUrl: audioUrl
      });
      
      await refreshUserProfile();
    } catch (error) {
      console.error('Error updating usage:', error);
      showMessage('Failed to save transcription or update usage.');
    }
  }, [audioDuration, selectedFile, currentUser, refreshUserProfile, showMessage, recordedAudioBlobRef]);
  const checkJobStatus = useCallback(async (jobId, transcriptionInterval) => { 
    try {
      abortControllerRef.current = new AbortController();
      const response = await fetch(`${BACKEND_URL}/status/${jobId}`, { signal: abortControllerRef.current.signal });
      const result = await response.json();
      
      if (response.ok && result.status === 'completed') {
        setTranscription(result.transcription);
        clearInterval(transcriptionInterval); 
        setTranscriptionProgress(100);
        setStatus('completed'); 
        await handleTranscriptionComplete(result.transcription);
        setIsUploading(false); 
      } else if (response.ok && result.status === 'failed') {
        showMessage('Transcription failed: ' + result.error);
        clearInterval(transcriptionInterval); 
        setTranscriptionProgress(0);
        setStatus('failed'); 
        setIsUploading(false); 
      } else {
        if (result.status === 'processing') {
          setTimeout(() => checkJobStatus(jobId, transcriptionInterval), 2000);
        } else {
          const errorDetail = result.detail || `Unexpected status: ${result.status} or HTTP error! Status: UNKNOWN`;
          showMessage('Status check failed: ' + errorDetail);
          clearInterval(transcriptionInterval); 
          setTranscriptionProgress(0);
          setStatus('failed'); 
          setIsUploading(false); 
        }
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Fetch aborted by user.');
      } else {
        console.error('Status check failed:', error);
        clearInterval(transcriptionInterval); 
        setTranscriptionProgress(0);
        setStatus('failed'); 
        setIsUploading(false); 
        showMessage('Status check failed: ' + error.message);
      }
    } finally {
      abortControllerRef.current = null;
    }
  }, [handleTranscriptionComplete, showMessage]);

  const handleUpload = useCallback(async () => {
    if (!selectedFile) {
      showMessage('Please select a file first');
      return;
    }

    // Wait for profile to be fully loaded
    if (profileLoading || !userProfile) {
      showMessage('Loading user profile... Please wait.');
      return;
    }

    const estimatedDuration = audioDuration || 60;
    const canTranscribe = await canUserTranscribe(currentUser.uid, estimatedDuration);
    
    if (!canTranscribe) {
      showMessage('You have exceeded your monthly transcription limit! Please upgrade your plan or wait until next month.');
      setCurrentView('dashboard');
      resetTranscriptionProcessUI(); 
      return;
    }

    setIsUploading(true);
    setStatus('processing');
    abortControllerRef.current = new AbortController();

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch(`${BACKEND_URL}/transcribe`, {
        method: 'POST',
        body: formData,
        signal: abortControllerRef.current.signal
      });

      const result = await response.json();
      
      if (response.ok) {
        setUploadProgress(100);
        setStatus('processing');
        setJobId(result.job_id);
        const transcriptionInterval = simulateProgress(setTranscriptionProgress, 500, -1); 
        checkJobStatus(result.job_id, transcriptionInterval); 
        
      } else {
        console.error("Backend upload failed response:", result);
        showMessage('Upload failed: ' + (result.detail || `HTTP error! Status: ${response.status}`));
        setUploadProgress(0);
        setTranscriptionProgress(0);
        setStatus('failed'); 
        setIsUploading(false); 
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Upload aborted by user.');
      } else {
        console.error("Fetch error during upload:", error);
        showMessage('Upload failed: ' + error.message);
        setUploadProgress(0);
        setTranscriptionProgress(0);
        setStatus('failed'); 
        setIsUploading(false); 
      }
    } finally {
      abortControllerRef.current = null;
    }
  }, [selectedFile, audioDuration, currentUser?.uid, showMessage, setCurrentView, resetTranscriptionProcessUI, checkJobStatus, userProfile, profileLoading]);

  useEffect(() => {
    if (selectedFile && status === 'idle' && !isRecording && !isUploading && !profileLoading && userProfile) {
      // Only trigger handleUpload when profile is fully loaded
      const timer = setTimeout(() => {
        handleUpload();
      }, 200); // Slightly longer delay to ensure everything is ready
      return () => clearTimeout(timer);
    }
  }, [selectedFile, status, isRecording, isUploading, handleUpload, userProfile, profileLoading]);

  const copyToClipboard = useCallback(() => { 
    navigator.clipboard.writeText(transcription);
    setCopiedMessageVisible(true);
    setTimeout(() => setCopiedMessageVisible(false), 2000);
  }, [transcription]);

  const downloadAsWord = useCallback(() => { 
    const blob = new Blob([transcription], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'transcription.doc';
    a.click();
    URL.revokeObjectURL(url);
  }, [transcription]);

  const downloadAsTXT = useCallback(() => { 
    const blob = new Blob([transcription], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'transcription.txt';
    a.click();
    URL.revokeObjectURL(url);
  }, [transcription]);

  const downloadRecordedAudio = useCallback(() => { 
    if (recordedAudioBlobRef.current) {
      const url = URL.createObjectURL(recordedAudioBlobRef.current);
      const a = document.createElement('a');
      a.href = url;
      a.download = `recording-${Date.now()}.wav`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      showMessage('No recorded audio available to download.');
    }
  }, [showMessage]);

  const handleLogout = useCallback(async () => {
    try {
      await logout();
    } catch (error) {
      showMessage('Failed to log out');
    }
  }, [logout, showMessage]);

  const createMissingProfile = useCallback(async () => {
    try {
      await createUserProfile(currentUser.uid, currentUser.email);
      showMessage('Profile created successfully! Refreshing page...');
      window.location.reload();
    } catch (error) {
      console.error('Error creating profile:', error);
      showMessage('Error creating profile: ' + error.message);
    }
  }, [currentUser?.uid, currentUser?.email, showMessage]);
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
          flex: 1, 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'flex-start',
          padding: '0 20px'
        }}>
          <Login />
        </div>
        <MessageModal message={message} onClose={clearMessage} />
        <footer style={{ 
          textAlign: 'center', 
          padding: '20px', 
          color: 'rgba(255, 255, 255, 0.7)', 
          fontSize: '0.9rem' 
        }}>
          &copy; {new Date().getFullYear()} TypeMyworDz, Inc.
        </footer>
      </div>
    );
  }

  const monthlyLimit = userProfile?.plan === 'business' ? Infinity : 30;
  const minutesUsed = userProfile?.monthlyMinutes !== undefined && userProfile?.monthlyMinutes !== null && !isNaN(userProfile?.monthlyMinutes) ? userProfile.monthlyMinutes : 0;
  const minutesLeft = monthlyLimit === Infinity ? 'Unlimited' : Math.max(0, monthlyLimit - minutesUsed);
  return (
    <div style={{ 
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: (currentView === 'dashboard' || currentView === 'admin') ? '#f8f9fa' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    }}>
      <MessageModal message={message} onClose={clearMessage} />

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
          
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '15px',
            fontSize: '14px',
            opacity: '0.9'
          }}>
            <span>Logged in as: {userProfile?.name || currentUser.email}</span>
            {userProfile && (
              <span>Usage: {minutesUsed}/{monthlyLimit === Infinity ? 'Unlimited' : monthlyLimit} min</span>
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

      {/* Profile Loading Indicator */}
      {profileLoading && (
        <div style={{
          textAlign: 'center',
          padding: '20px',
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          margin: '20px',
          borderRadius: '10px'
        }}>
          <div style={{ color: '#6c5ce7', fontSize: '16px' }}>
            🔄 Loading your profile...
          </div>
        </div>
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
              boxShadow: '0 4px 15px rgba(220, 53, 69, 0.4)'
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
          flex: 1, /* Allow main content to grow */
          padding: '0 20px 40px',
          maxWidth: '800px', 
          margin: '0 auto'
        }}>
          {/* Usage Warning */}
          {userProfile && userProfile.plan === 'free' && minutesLeft !== 'Unlimited' && minutesLeft < 5 && ( // Show warning if less than 5 minutes left
            <div style={{
              backgroundColor: 'rgba(255, 243, 205, 0.95)',
              color: '#856404',
              padding: '15px',
              borderRadius: '10px',
              marginBottom: '30px',
              textAlign: 'center',
              backdropFilter: 'blur(10px)'
            }}>
              ⚡ You're running low on minutes! You have {minutesLeft} minutes left this month.
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

              {/* Download Recorded Audio Button */}
              {recordedAudioBlobRef.current && !isRecording && (
                <button
                  onClick={downloadRecordedAudio}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#007bff',
                    color: 'white',
                    border: 'none',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    marginTop: '15px',
                    marginLeft: '10px'
                  }}
                >
                  📥 Download Recording
                </button>
              )}
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

              {/* NEW: Audio Player - Always visible if selectedFile */}
              {selectedFile && (
                <div style={{ marginBottom: '20px' }}>
                  <audio ref={audioPlayerRef} controls style={{ width: '100%' }} src={URL.createObjectURL(selectedFile)}>
                    Your browser does not support the audio element.
                  </audio>
                </div>
              )}
              
              {/* Transcription Progress Bar (appears immediately after upload_complete/processing) */}
              {(status === 'processing' || status === 'uploading') && ( // Show for both uploading and processing
                <div style={{ marginBottom: '20px' }}>
                  <div style={{
                    backgroundColor: '#e9ecef',
                    height: '20px',
                    borderRadius: '10px',
                    overflow: 'hidden',
                    marginBottom: '10px'
                  }}>
                    <div className="progress-bar-indeterminate" style={{
                      backgroundColor: '#6c5ce7', // Purple color for transcription progress
                      height: '100%',
                      width: '100%', // Fixed width for animation
                      borderRadius: '10px'
                    }}></div>
                  </div>
                  <div style={{ color: '#6c5ce7', fontSize: '14px' }}>
                    Transcription in Progress...
                  </div>
                </div>
              )}

              {/* Action Button: Start Transcription or Cancel */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', marginTop: '30px' }}>
                {status === 'idle' && !isUploading && selectedFile && (
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
                    🚀 Start Transcription
                  </button>
                )}

                {(status === 'uploading' || status === 'processing') && ( // Show for both uploading and processing
                  <button
                    onClick={handleCancelUpload}
                    style={{
                      padding: '15px 30px',
                      fontSize: '18px',
                      backgroundColor: '#dc3545', // Red for cancel
                      color: 'white',
                      border: 'none',
                      borderRadius: '25px',
                      cursor: 'pointer',
                      boxShadow: '0 5px 15px rgba(220, 53, 69, 0.4)'
                    }}
                  >
                    ❌ Cancel Transcribing
                  </button>
                )}
              </div>
            </div>
          </div>
          {/* Status Section */}
          {/* Modified: Only show status section for 'completed' or 'failed' statuses */}
          {status && (status === 'completed' || status === 'failed') && (
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
                {status === 'completed' ? '✅ Transcription Completed!' : `❌ Status: ${status}`}
              </h3>
              {status === 'failed' && ( // Only show error message for failed status
                <p style={{ margin: '10px 0 0 0', color: '#666' }}>
                  An error occurred during transcription. Please try again.
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
      {/* Footer for main app interface */}
      <footer style={{ 
        textAlign: 'center', 
        padding: '20px', 
        color: 'rgba(255, 255, 255, 0.7)', 
        fontSize: '0.9rem',
        marginTop: 'auto' /* Push footer to bottom */
      }}>
        &copy; {new Date().getFullYear()} TypeMyworDz, Inc.
      </footer>
      {/* NEW: Copied Message Animation */}
      {copiedMessageVisible && (
        <div className="copied-message-animation"> {/* <--- CHANGED TO CLASSNAME */}
          Copied to clipboard!
        </div>
      )}
    </div>
  );
}

// Main App Component with AuthProvider
function App() {
  return (
    <AuthProvider>
      <Router> {/* Wrap AppContent with Router */}
        <AppContent />
      </Router>
    </AuthProvider>
  );
}

export default App;