import React, { useState, useRef, useEffect, useCallback } from 'react';
import './App.css';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './components/Login';
import Signup from './components/Signup';
import Dashboard from './components/Dashboard';
import AdminDashboard from './components/AdminDashboard';
import TranscriptionDetail from './components/TranscriptionDetail';
import { canUserTranscribe, updateUserUsage, saveTranscription, createUserProfile } from './userService';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import FloatingTranscribeButton from './components/FloatingTranscribeButton';

// Configuration
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://web-production-5eab.up.railway.app';

// Audio compression utility functions
const compressAudioToMP3 = async (audioFile, quality = 64) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target.result;
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        // Convert to mono for smaller file size
        const samples = audioBuffer.getChannelData(0);
        const sampleRate = 16000; // Optimize for speech recognition
        
        // Resample if needed
        let resampledSamples = samples;
        if (audioBuffer.sampleRate !== sampleRate) {
          const ratio = audioBuffer.sampleRate / sampleRate;
          const newLength = Math.round(samples.length / ratio);
          resampledSamples = new Float32Array(newLength);
          
          for (let i = 0; i < newLength; i++) {
            const srcIndex = Math.round(i * ratio);
            resampledSamples[i] = samples[srcIndex] || 0;
          }
        }
        
        // Convert to WAV format (simpler than MP3 encoding in browser)
        const wavBuffer = audioBufferToWav(resampledSamples, sampleRate);
        const compressedBlob = new Blob([wavBuffer], { type: 'audio/wav' });
        
        resolve(compressedBlob);
        
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = reject;
    reader.readAsArrayBuffer(audioFile);
  });
};

const audioBufferToWav = (samples, sampleRate) => {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  
  // WAV header
  const writeString = (offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };
  
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  
  // Convert float samples to 16-bit PCM
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, sample * 0x7FFF, true);
  }
  
  return buffer;
};

// FIXED: Compression ratio calculation
const getCompressionRatio = (originalSize, compressedSize) => {
  if (compressedSize >= originalSize) {
    // File got larger or stayed same - show as expansion
    const expansionRatio = ((compressedSize - originalSize) / originalSize * 100).toFixed(1);
    return { ratio: expansionRatio, isCompressed: false };
  } else {
    // File got smaller - show as compression
    const compressionRatio = ((originalSize - compressedSize) / originalSize * 100).toFixed(1);
    return { ratio: compressionRatio, isCompressed: true };
  }
};

// FIXED: Better Toast Notification Component
const ToastNotification = ({ message, onClose }) => {
  const [isVisible, setIsVisible] = useState(false);
  
  useEffect(() => {
    if (message) {
      setIsVisible(true);
      // Auto-dismiss after 4 seconds
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(onClose, 300); // Wait for fade animation
      }, 4000);
      
      return () => clearTimeout(timer);
    }
  }, [message, onClose]);
  
  if (!message) return null;
  
  return (
    <div 
      className={`fixed top-4 right-4 max-w-sm w-full bg-white border-l-4 border-blue-500 rounded-lg shadow-lg p-4 transform transition-all duration-300 z-50 ${
        isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      }`}
      style={{
        backgroundColor: 'white',
        borderLeft: '4px solid #3b82f6',
        borderRadius: '8px',
        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
        padding: '16px',
        maxWidth: '384px',
        width: '100%',
        position: 'fixed',
        top: '16px',
        right: '16px',
        zIndex: 1000,
        transform: isVisible ? 'translateX(0)' : 'translateX(100%)',
        opacity: isVisible ? 1 : 0,
        transition: 'all 0.3s ease-in-out'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        <div style={{ 
          backgroundColor: '#3b82f6', 
          borderRadius: '50%', 
          width: '24px', 
          height: '24px', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          marginRight: '12px',
          flexShrink: 0
        }}>
          <span style={{ color: 'white', fontSize: '14px', fontWeight: 'bold' }}>ℹ</span>
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ 
            margin: 0, 
            color: '#374151', 
            fontSize: '14px', 
            lineHeight: '1.4',
            fontWeight: '500'
          }}>
            {message}
          </p>
        </div>
        <button
          onClick={() => {
            setIsVisible(false);
            setTimeout(onClose, 300);
          }}
          style={{
            background: 'none',
            border: 'none',
            color: '#9ca3af',
            cursor: 'pointer',
            fontSize: '18px',
            padding: '0',
            marginLeft: '8px',
            lineHeight: 1
          }}
        >
          ×
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
  const [status, setStatus] = useState('idle');
  const [transcription, setTranscription] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [transcriptionProgress, setTranscriptionProgress] = useState(0);
  const [showLogin, setShowLogin] = useState(true);
  const [currentView, setCurrentView] = useState('transcribe');
  const [audioDuration, setAudioDuration] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [downloadFormat, setDownloadFormat] = useState('mp3');
  const [compressionStats, setCompressionStats] = useState(null);
  const mediaRecorderRef = useRef(null);
  const recordingIntervalRef = useRef(null);
  const audioPlayerRef = useRef(null); 
  const recordedAudioBlobRef = useRef(null); 
  const [message, setMessage] = useState('');
  const [copiedMessageVisible, setCopiedMessageVisible] = useState(false);

  const abortControllerRef = useRef(null);
  const transcriptionIntervalRef = useRef(null);
  const statusCheckTimeoutRef = useRef(null); // ADDED: For tracking status check timeouts
  const isCancelledRef = useRef(false); // ADDED: For tracking cancellation state

  const { currentUser, logout, userProfile, refreshUserProfile, signInWithGoogle, signInWithMicrosoft, profileLoading } = useAuth();

  const ADMIN_EMAILS = ['typemywordz@gmail.com', 'gracenyaitara@gmail.com'];
  const isAdmin = ADMIN_EMAILS.includes(currentUser?.email);

  const showMessage = useCallback((msg) => setMessage(msg), []);
  const clearMessage = useCallback(() => setMessage(''), []);

  // FIXED: Enhanced reset function that properly clears all state
  const resetTranscriptionProcessUI = useCallback(() => { 
    setJobId(null);
    setStatus('idle'); 
    setTranscription('');
    setAudioDuration(0);
    setIsUploading(false);
    setUploadProgress(0);
    setTranscriptionProgress(0); 
    setCompressionStats(null);
    
    // Reset cancellation flag
    isCancelledRef.current = false;
    
    // FIXED: Clear recorded audio reference completely
    recordedAudioBlobRef.current = null;
    
    // FIXED: Clear audio player completely and revoke object URLs
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      if (audioPlayerRef.current.src && audioPlayerRef.current.src.startsWith('blob:')) {
        URL.revokeObjectURL(audioPlayerRef.current.src);
      }
      audioPlayerRef.current.src = '';
      audioPlayerRef.current.load();
    }
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Clear all intervals and timeouts
    if (transcriptionIntervalRef.current) {
      clearInterval(transcriptionIntervalRef.current);
      transcriptionIntervalRef.current = null;
    }

    if (statusCheckTimeoutRef.current) {
      clearTimeout(statusCheckTimeoutRef.current);
      statusCheckTimeoutRef.current = null;
    }
  }, []);

  // FIXED: Enhanced file selection that properly resets previous content
  const handleFileSelect = useCallback(async (event) => {
    const file = event.target.files[0];
    
    // Only proceed if a file was actually selected
    if (!file) {
      return;
    }
    
    // FIXED: Always reset everything when new file is selected
    resetTranscriptionProcessUI();
    
    // Set the new file
    setSelectedFile(file);
    
    if (file && (file.type.startsWith('audio/') || file.type.startsWith('video/'))) { 
      // Create new object URL for the new file
      const newAudioUrl = URL.createObjectURL(file);
      
      if (audioPlayerRef.current) {
        audioPlayerRef.current.src = newAudioUrl;
        audioPlayerRef.current.load();
      }

      const audio = new Audio(); 
      audio.preload = 'metadata';
      audio.onloadedmetadata = async () => {
        setAudioDuration(audio.duration);
        URL.revokeObjectURL(audio.src);
        
        // Show file info
        try {
          const originalSize = file.size / (1024 * 1024); // MB
          showMessage(`File loaded: ${originalSize.toFixed(2)} MB. Server will compress for optimal transcription.`);
        } catch (error) {
          console.error('Error getting file info:', error);
        }
      };
      audio.src = newAudioUrl;
    }
  }, [showMessage, resetTranscriptionProcessUI]);

  // FIXED: Enhanced recording that properly clears previous state
  const startRecording = useCallback(async () => {
    // FIXED: Clear ALL previous state including selected files
    resetTranscriptionProcessUI();
    setSelectedFile(null);
    
    // Clear file input
    const fileInput = document.querySelector('input[type="file"]');
    if (fileInput) {
      fileInput.value = '';
    }
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000, // Optimized for speech recognition
          channelCount: 1,   // Mono audio
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      
      // Try to use the best available format
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/wav';
        }
      }
      
      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType });
      const chunks = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        chunks.push(event.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        const originalBlob = new Blob(chunks, { type: mimeType });
        
        // FIXED: Clear any previous recorded audio first
        if (recordedAudioBlobRef.current) {
          recordedAudioBlobRef.current = null;
        }
        
        recordedAudioBlobRef.current = originalBlob;
        
        // Determine file extension
        let extension = 'wav';
        if (mimeType.includes('webm')) {
          extension = 'webm';
        }
        
        const file = new File([originalBlob], `recording-${Date.now()}.${extension}`, { type: mimeType });
        setSelectedFile(file);
        stream.getTracks().forEach(track => track.stop());

        if (audioPlayerRef.current) {
          // Clear previous audio first
          if (audioPlayerRef.current.src && audioPlayerRef.current.src.startsWith('blob:')) {
            URL.revokeObjectURL(audioPlayerRef.current.src);
          }
          audioPlayerRef.current.src = URL.createObjectURL(file);
          audioPlayerRef.current.load();
        }
        
        const originalSize = originalBlob.size / (1024 * 1024);
        showMessage(`Recording saved: ${originalSize.toFixed(2)} MB - server will compress for transcription`);
        
        // Don't auto-start transcription for free users
        if (userProfile?.plan === 'business') {
          setTimeout(() => {
            if (!isUploading && userProfile && !profileLoading) {
              handleUpload();
            }
          }, 1000);
        }
      };

      mediaRecorderRef.current.start(1000);
      setIsRecording(true);
      setRecordingTime(0);

      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (error) {
      showMessage('Could not access microphone: ' + error.message);
    }
  }, [resetTranscriptionProcessUI, showMessage, isUploading, userProfile, profileLoading]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(recordingIntervalRef.current);
    }
  }, [isRecording]);

    // FIXED: More aggressive cancel function that forces immediate stop
  const handleCancelUpload = useCallback(async () => {
    console.log('Cancel button clicked - forcing immediate stop');
    
    // Set cancellation flag immediately
    isCancelledRef.current = true;
    
    // Abort any ongoing fetch requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // Clear all intervals and timeouts immediately
    if (transcriptionIntervalRef.current) {
      clearInterval(transcriptionIntervalRef.current);
      transcriptionIntervalRef.current = null;
    }
    
    if (statusCheckTimeoutRef.current) {
      clearTimeout(statusCheckTimeoutRef.current);
      statusCheckTimeoutRef.current = null;
    }

    // Try to cancel the backend job if we have a jobId
    if (jobId) {
      try {
        console.log('Attempting to cancel backend job:', jobId);
        const cancelController = new AbortController();
        const cancelResponse = await fetch(`${BACKEND_URL}/cancel/${jobId}`, {
          method: 'POST',
          signal: cancelController.signal,
          headers: {
            'Content-Type': 'application/json',
          }
        });
        
        if (cancelResponse.ok) {
          console.log('Backend job cancelled successfully');
        } else {
          console.log('Backend job cancellation failed, but continuing with frontend cleanup');
        }
      } catch (error) {
        console.log('Error cancelling backend job, but continuing with frontend cleanup:', error);
      }
    }
    
    // Force reset all state immediately regardless of backend response
    setIsUploading(false);
    setUploadProgress(0);
    setTranscriptionProgress(0);
    setStatus('idle');
    setJobId(null);
    setTranscription('');
    
    // Show cancellation message
    showMessage("Transcription cancelled successfully.");
    
    console.log('Cancellation complete - all state reset');
  }, [jobId, showMessage]);

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

  // Enhanced download with compression options
  const downloadRecordedAudio = useCallback(async () => { 
    if (recordedAudioBlobRef.current) {
      try {
        let downloadBlob = recordedAudioBlobRef.current;
        let filename = `recording-${Date.now()}.${downloadFormat}`;
        
        // If user wants different format, compress accordingly
        if (downloadFormat === 'mp3' && !recordedAudioBlobRef.current.type.includes('mp3')) {
          showMessage('Compressing to MP3...');
          downloadBlob = await compressAudioToMP3(recordedAudioBlobRef.current, 128); // Higher quality for download
          showMessage('MP3 compression complete!');
        }
        
        const url = URL.createObjectURL(downloadBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      } catch (error) {
        console.error('Error compressing for download:', error);
        showMessage('Download compression failed, downloading original format.');
        // Fallback to original
        const url = URL.createObjectURL(recordedAudioBlobRef.current);
        const a = document.createElement('a');
        a.href = url;
        a.download = `recording-${Date.now()}.wav`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } else {
      showMessage('No recorded audio available to download.');
    }
  }, [showMessage, downloadFormat]);

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

  const handleUpgradeClick = useCallback(() => {
    showMessage('Upgrade functionality will be implemented soon. Please contact support for now.');
  }, [showMessage]);
  // FIXED: More robust checkJobStatus with immediate cancellation checks
  const checkJobStatus = useCallback(async (jobId, transcriptionInterval) => { 
    console.log('Checking job status for:', jobId, 'Cancelled flag:', isCancelledRef.current);
    
    // Check if cancelled before making request
    if (isCancelledRef.current) {
      console.log('Job cancelled - stopping status checks');
      clearInterval(transcriptionInterval);
      return;
    }
    
    try {
      const controller = new AbortController();
      abortControllerRef.current = controller;
      
      // Set a timeout to abort the request if it takes too long
      const timeoutId = setTimeout(() => {
        if (!isCancelledRef.current) {
          controller.abort();
        }
      }, 10000); // 10 second timeout
      
      const response = await fetch(`${BACKEND_URL}/status/${jobId}`, { 
        signal: controller.signal 
      });
      
      clearTimeout(timeoutId);
      
      // Check if cancelled after request
      if (isCancelledRef.current) {
        console.log('Job cancelled during request - stopping');
        clearInterval(transcriptionInterval);
        return;
      }
      
      const result = await response.json();
      console.log('Status response:', result);
      
      if (response.ok && result.status === 'completed') {
        // Double check cancellation before processing completion
        if (isCancelledRef.current) {
          console.log('Job cancelled - ignoring completion');
          return;
        }
        
        setTranscription(result.transcription);
        clearInterval(transcriptionInterval); 
        setTranscriptionProgress(100);
        setStatus('completed'); 
        
        // Display compression stats from backend
        if (result.compression_stats) {
          const stats = result.compression_stats;
          setCompressionStats({
            originalSize: stats.original_size_mb,
            compressedSize: stats.compressed_size_mb,
            ratio: Math.abs(stats.compression_ratio_percent),
            isCompressed: stats.compressed_size_mb < stats.original_size_mb
          });
        }
        
        await handleTranscriptionComplete(result.transcription);
        setIsUploading(false); 
      } else if (response.ok && result.status === 'failed') {
        if (!isCancelledRef.current) {
          showMessage('Transcription failed: ' + result.error);
          clearInterval(transcriptionInterval); 
          setTranscriptionProgress(0);
          setStatus('failed'); 
          setIsUploading(false);
        }
      } else if (response.ok && result.status === 'cancelled') {
        // Handle backend cancellation
        console.log('Backend job was cancelled');
        clearInterval(transcriptionInterval);
        setTranscriptionProgress(0);
        setStatus('idle');
        setIsUploading(false);
        if (!isCancelledRef.current) {
          showMessage('Transcription was cancelled.');
        }
      } else {
        if (result.status === 'processing' && !isCancelledRef.current) {
          console.log('Job still processing, checking again in 2 seconds');
          // Only continue checking if not cancelled - use timeout instead of setTimeout
          statusCheckTimeoutRef.current = setTimeout(() => {
            if (!isCancelledRef.current) {
              checkJobStatus(jobId, transcriptionInterval);
            }
          }, 2000);
        } else if (!isCancelledRef.current) {
          const errorDetail = result.detail || `Unexpected status: ${result.status} or HTTP error! Status: UNKNOWN`;
          showMessage('Status check failed: ' + errorDetail);
          clearInterval(transcriptionInterval); 
          setTranscriptionProgress(0);
          setStatus('failed'); 
          setIsUploading(false); 
        }
      }
    } catch (error) {
      if (error.name === 'AbortError' || isCancelledRef.current) {
        console.log('Fetch aborted by user or timeout');
        clearInterval(transcriptionInterval);
        setTranscriptionProgress(0);
        if (!isCancelledRef.current) {
          setIsUploading(false);
        }
        return;
      } else if (!isCancelledRef.current) {
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

  // FIXED: Enhanced upload function with proper interval tracking
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
    
    // FIXED: Strict enforcement - free users cannot transcribe at all
    if (userProfile.plan === 'free') {
      showMessage('Transcription is only available for paid users. Free users can record audio but need to upgrade to transcribe.');
      setCurrentView('pricing');
      resetTranscriptionProcessUI();
      return;
    }

    // Only business/paid users can proceed with transcription
    const canTranscribe = await canUserTranscribe(currentUser.uid, estimatedDuration);
    
    if (!canTranscribe) {
      showMessage('You do not have permission to transcribe audio. Please upgrade your plan.');
      setCurrentView('pricing');
      resetTranscriptionProcessUI(); 
      return;
    }

    // Reset cancellation flag
    isCancelledRef.current = false;

    setIsUploading(true);
    setStatus('processing');
    abortControllerRef.current = new AbortController();

    try {
      // Show compression message
      showMessage('Server will compress audio for optimal transcription...');
      
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch(`${BACKEND_URL}/transcribe`, {
        method: 'POST',
        body: formData,
        signal: abortControllerRef.current.signal
      });

      // Check if cancelled after upload
      if (isCancelledRef.current) {
        return;
      }

      const result = await response.json();
      
      if (response.ok) {
        setUploadProgress(100);
        setStatus('processing');
        setJobId(result.job_id);
        // Store the interval reference so we can clear it on cancel
        transcriptionIntervalRef.current = simulateProgress(setTranscriptionProgress, 500, -1); 
        checkJobStatus(result.job_id, transcriptionIntervalRef.current); 
        
      } else {
        console.error("Backend upload failed response:", result);
        showMessage('Upload failed: ' + (result.detail || `HTTP error! Status: ${response.status}`));
        setUploadProgress(0);
        setTranscriptionProgress(0);
        setStatus('failed'); 
        setIsUploading(false); 
      }
    } catch (error) {
      if (error.name === 'AbortError' || isCancelledRef.current) {
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

  // FIXED: Updated useEffect to not auto-trigger for free users
  useEffect(() => {
    if (selectedFile && status === 'idle' && !isRecording && !isUploading && !profileLoading && userProfile) {
      // Only auto-trigger for business users
      if (userProfile.plan === 'business') {
        const timer = setTimeout(() => {
          handleUpload();
        }, 200);
        return () => clearTimeout(timer);
      }
    }
  }, [selectedFile, status, isRecording, isUploading, handleUpload, userProfile, profileLoading]);

  // Login screen for non-authenticated users
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
            Speech to Text AI • Simple, Accurate, Powerful • Now with Advanced Audio Compression
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
        <ToastNotification message={message} onClose={clearMessage} />
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
  return (
    <Routes>
      {/* Route for individual transcription detail page */}
      <Route path="/transcription/:id" element={<TranscriptionDetail />} />
      
      {/* Dashboard route - separate from main app - FIXED: Added FloatingTranscribeButton */}
      <Route path="/dashboard" element={
        <>
          <FloatingTranscribeButton />
          <Dashboard setCurrentView={setCurrentView} />
        </>
      } />
      
      {/* Admin dashboard route */}
      <Route path="/admin" element={isAdmin ? <AdminDashboard /> : <Navigate to="/" />} />
      
      {/* Main app route */}
      <Route path="/" element={
        <div style={{ 
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          background: (currentView === 'dashboard' || currentView === 'admin' || currentView === 'pricing') ? '#f8f9fa' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
        }}>
          <ToastNotification message={message} onClose={clearMessage} />

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
                {userProfile && userProfile.plan === 'business' ? (
                  <span>Plan: Unlimited Transcription</span>
                ) : (
                  <span>Plan: Free (Recording Only - Upgrade for Transcription)</span>
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

          {/* FIXED: Compression Stats Display with Correct Wording */}
          {compressionStats && (
            <div style={{
              textAlign: 'center',
              padding: '15px',
              backgroundColor: compressionStats.isCompressed ? 'rgba(212, 237, 218, 0.9)' : 'rgba(255, 243, 205, 0.9)',
              margin: '20px',
              borderRadius: '10px',
              color: compressionStats.isCompressed ? '#155724' : '#856404'
            }}>
              <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>
                {compressionStats.isCompressed ? '✅ File Size Reduced' : '⚠️ File Size Increased'}
              </div>
              <div style={{ fontSize: '14px' }}>
                Original: {compressionStats.originalSize} MB → Processed: {compressionStats.compressedSize} MB 
                ({compressionStats.isCompressed ? 
                  `${compressionStats.ratio}% reduction` : 
                  `${compressionStats.ratio}% larger`
                })
              </div>
            </div>
          )}

          {/* Navigation Tabs */}
          <div style={{ 
            textAlign: 'center', 
            padding: currentView === 'transcribe' ? '0 20px 40px' : '20px',
            backgroundColor: (currentView === 'dashboard' || currentView === 'admin' || currentView === 'pricing') ? 'white' : 'transparent'
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
            <button
              onClick={() => setCurrentView('pricing')}
              style={{
                padding: '12px 25px',
                margin: '0 10px',
                backgroundColor: currentView === 'pricing' ? '#28a745' : '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '25px',
                cursor: 'pointer',
                fontSize: '16px',
                boxShadow: '0 4px 15px rgba(40, 167, 69, 0.4)'
              }}
            >
              💰 Pricing
            </button>
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
          {/* Show Different Views - Pricing Section and Main Interface */}
          {currentView === 'pricing' ? (
            <div style={{ 
              padding: '40px 20px', 
              textAlign: 'center', 
              maxWidth: '1000px', 
              margin: '0 auto',
              backgroundColor: '#f8f9fa',
              minHeight: '70vh'
            }}>
              <h1 style={{ 
                color: '#6c5ce7', 
                marginBottom: '20px',
                fontSize: '2.5rem'
              }}>
                Choose Your Plan
              </h1>
              <p style={{
                color: '#666',
                fontSize: '1.2rem',
                marginBottom: '40px'
              }}>
                Unlock the full potential of TypeMyworDz with our flexible pricing plans
              </p>
              <div style={{ 
                display: 'flex', 
                gap: '30px', 
                justifyContent: 'center', 
                flexWrap: 'wrap' 
              }}>
                {/* Free Plan */}
                <div style={{
                  backgroundColor: 'white',
                  padding: '40px 30px',
                  borderRadius: '20px',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
                  maxWidth: '350px',
                  width: '100%',
                  border: '2px solid #e9ecef'
                }}>
                  <div style={{
                    backgroundColor: '#6c757d',
                    color: 'white',
                    padding: '8px 20px',
                    borderRadius: '20px',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    marginBottom: '20px',
                    display: 'inline-block'
                  }}>
                    CURRENT PLAN
                  </div>
                  <h3 style={{ 
                    color: '#6c757d',
                    fontSize: '1.8rem',
                    margin: '0 0 10px 0'
                  }}>
                    Free Plan
                  </h3>
                  <div style={{ marginBottom: '30px' }}>
                    <span style={{ 
                      fontSize: '3rem',
                      fontWeight: 'bold',
                      color: '#6c5ce7'
                    }}>
                      USD 0
                    </span>
                    <span style={{ 
                      color: '#666',
                      fontSize: '1.2rem'
                    }}>
                      /month
                    </span>
                  </div>
                  <ul style={{ 
                    textAlign: 'left', 
                    color: '#666', 
                    lineHeight: '2.5',
                    listStyle: 'none',
                    padding: '0',
                    marginBottom: '40px'
                  }}>
                    <li>✅ Unlimited audio recording</li>
                    <li>✅ Advanced audio compression</li>
                    <li>✅ Download recordings as MP3/WAV</li>
                    <li>✅ Basic audio playback</li>
                    <li>✅ 24-hour file storage</li>
                    <li>❌ No transcription access</li>
                    <li>❌ No text conversion</li>
                  </ul>
                  <button style={{
                    width: '100%',
                    padding: '15px',
                    backgroundColor: '#6c757d',
                    color: 'white',
                    border: 'none',
                    borderRadius: '10px',
                    cursor: 'not-allowed',
                    fontSize: '16px',
                    fontWeight: 'bold'
                  }}>
                    Current Plan
                  </button>
                </div>

                {/* Pro Plan */}
                <div style={{
                  backgroundColor: 'white',
                  padding: '40px 30px',
                  borderRadius: '20px',
                  boxShadow: '0 15px 40px rgba(40, 167, 69, 0.2)',
                  maxWidth: '350px',
                  width: '100%',
                  border: '3px solid #28a745',
                  transform: 'scale(1.05)'
                }}>
                  <div style={{
                    backgroundColor: '#28a745',
                    color: 'white',
                    padding: '8px 20px',
                    borderRadius: '20px',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    marginBottom: '20px',
                    display: 'inline-block'
                  }}>
                    MOST POPULAR
                  </div>
                  <h3 style={{ 
                    color: '#28a745',
                    fontSize: '1.8rem',
                    margin: '0 0 10px 0'
                  }}>
                    Pro Plan
                  </h3>
                  <div style={{ marginBottom: '30px' }}>
                    <span style={{ 
                      fontSize: '3rem',
                      fontWeight: 'bold',
                      color: '#6c5ce7'
                    }}>
                      USD 9.99
                    </span>
                    <span style={{ 
                      color: '#666',
                      fontSize: '1.2rem'
                    }}>
                      /month
                    </span>
                  </div>
                  <ul style={{ 
                    textAlign: 'left', 
                    color: '#666', 
                    lineHeight: '2.5',
                    listStyle: 'none',
                    padding: '0',
                    marginBottom: '40px'
                  }}>
                    <li>✅ Everything in Free Plan</li>
                    <li>✅ Unlimited transcription access</li>
                    <li>✅ High accuracy AI transcription</li>
                    <li>✅ Priority processing</li>
                    <li>✅ Advanced export options</li>
                    <li>✅ 7-day file storage</li>
                    <li>✅ Email support</li>
                  </ul>
                  <button 
                    onClick={handleUpgradeClick}
                    style={{
                      width: '100%',
                      padding: '15px',
                      backgroundColor: '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      fontSize: '16px',
                      fontWeight: 'bold'
                    }}
                  >
                    Upgrade Now
                  </button>
                </div>

                {/* Business Plan */}
                <div style={{
                  backgroundColor: 'white',
                  padding: '40px 30px',
                  borderRadius: '20px',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
                  maxWidth: '350px',
                  width: '100%',
                  border: '2px solid #6c5ce7'
                }}>
                  <div style={{
                    backgroundColor: '#6c5ce7',
                    color: 'white',
                    padding: '8px 20px',
                    borderRadius: '20px',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    marginBottom: '20px',
                    display: 'inline-block'
                  }}>
                    PREMIUM ACCURACY
                  </div>
                  <h3 style={{ 
                    color: '#6c5ce7',
                    fontSize: '1.8rem',
                    margin: '0 0 10px 0'
                  }}>
                    Business Plan
                  </h3>
                  <div style={{ marginBottom: '30px' }}>
                    <span style={{ 
                      fontSize: '3rem',
                      fontWeight: 'bold',
                      color: '#6c5ce7'
                    }}>
                      Custom
                    </span>
                    <span style={{ 
                      color: '#666',
                      fontSize: '1.2rem'
                    }}>
                      /Month
                    </span>
                  </div>
                  <ul style={{ 
                    textAlign: 'left', 
                    color: '#666', 
                    lineHeight: '2.5',
                    listStyle: 'none',
                    padding: '0',
                    marginBottom: '40px'
                  }}>
                    <li>✅ Everything in Pro Plan</li>
                    <li>✅ 99%+ Human-level accuracy</li>
                    <li>✅ Bulk processing</li>
                    <li>✅ API access</li>
                    <li>✅ Custom integrations</li>
                    <li>✅ Dedicated support</li>
                    <li>✅ SLA guarantee</li>
                  </ul>
                  <button 
                    onClick={handleUpgradeClick}
                    style={{
                      width: '100%',
                      padding: '15px',
                      backgroundColor: '#6c5ce7',
                      color: 'white',
                      border: 'none',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      fontSize: '16px',
                      fontWeight: 'bold'
                    }}
                  >
                    Contact Sales
                  </button>
                </div>
              </div>
              <div style={{
                marginTop: '60px',
                padding: '30px',
                backgroundColor: 'white',
                borderRadius: '15px',
                boxShadow: '0 5px 15px rgba(0,0,0,0.1)'
              }}>
                <h3 style={{ color: '#6c5ce7', marginBottom: '20px' }}>
                  🔒 All plans include:
                </h3>
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
                  gap: '20px',
                  textAlign: 'left',
                  color: '#666'
                }}>
                  <div>✅ Advanced audio compression technology</div>
                  <div>✅ Multiple file formats supported</div>
                  <div>✅ Fast processing times</div>
                  <div>✅ Easy-to-use interface</div>
                  <div>✅ Mobile-friendly design</div>
                  <div>✅ Regular updates & improvements</div>
                </div>
              </div>
            </div>
          ) : currentView === 'admin' ? (
            <AdminDashboard />
          ) : currentView === 'dashboard' ? (
            <Dashboard setCurrentView={setCurrentView} />
          ) : (
            <main style={{ 
              flex: 1,
              padding: '0 20px 40px',
              maxWidth: '800px', 
              margin: '0 auto'
            }}>
              {/* FIXED: Updated Usage Information Banner */}
              {userProfile && userProfile.plan === 'free' && (
                <div style={{
                  backgroundColor: 'rgba(255, 243, 205, 0.95)',
                  color: '#856404',
                  padding: '15px',
                  borderRadius: '10px',
                  marginBottom: '30px',
                  textAlign: 'center',
                  backdropFilter: 'blur(10px)'
                }}>
                  🎵 Free users can <strong>record audio</strong> but need to{' '}
                  <button 
                    onClick={() => setCurrentView('pricing')}
                    style={{
                      backgroundColor: 'transparent',
                      color: '#007bff',
                      border: 'none',
                      textDecoration: 'underline',
                      cursor: 'pointer',
                      fontWeight: 'bold'
                    }}
                  >
                    Upgrade
                  </button>
                  {' '}for transcription access.
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
                    🎤 Record Audio (with Auto-Compression)
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

                  {/* Enhanced Format Selection and Download Recorded Audio */}
                  {recordedAudioBlobRef.current && !isRecording && (
                    <div style={{ marginTop: '15px' }}>
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        gap: '10px',
                        marginBottom: '10px'
                      }}>
                        <label htmlFor="downloadFormat" style={{ color: '#6c5ce7', fontWeight: 'bold' }}>
                          Download Format:
                        </label>
                        <select
                          id="downloadFormat"
                          value={downloadFormat}
                          onChange={(e) => setDownloadFormat(e.target.value)}
                          style={{
                            padding: '5px 10px',
                            borderRadius: '5px',
                            border: '1px solid #6c5ce7'
                          }}
                        >
                          <option value="mp3">MP3 (Compressed)</option>
                          <option value="wav">WAV (Original)</option>
                        </select>
                      </div>
                      <button
                        onClick={downloadRecordedAudio}
                        style={{
                          padding: '10px 20px',
                          backgroundColor: '#007bff',
                          color: 'white',
                          border: 'none',
                          borderRadius: '5px',
                          cursor: 'pointer',
                          fontSize: '14px'
                        }}
                      >
                        📥 Download Recording ({downloadFormat.toUpperCase()})
                      </button>
                    </div>
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
                    📁 Or Upload Audio/Video File (Auto-Compressed)
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
                      accept="audio/mp3,audio/mpeg,audio/*,video/*"
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
                        <div style={{ fontSize: '12px', marginTop: '5px', opacity: '0.8' }}>
                          Audio will be automatically compressed for optimal transcription
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Audio Player */}
                  {selectedFile && (
                    <div style={{ marginBottom: '20px' }}>
                      <audio ref={audioPlayerRef} controls style={{ width: '100%' }} src={URL.createObjectURL(selectedFile)}>
                        Your browser does not support the audio element.
                      </audio>
                    </div>
                  )}

                  {/* Enhanced Transcription Progress Bar */}
                  {(status === 'processing' || status === 'uploading') && (
                    <div style={{ marginBottom: '20px' }}>
                      <div style={{
                        backgroundColor: '#e9ecef',
                        height: '20px',
                        borderRadius: '10px',
                        overflow: 'hidden',
                        marginBottom: '10px'
                      }}>
                        <div className="progress-bar-indeterminate" style={{
                          backgroundColor: '#6c5ce7',
                          height: '100%',
                          width: '100%',
                          borderRadius: '10px'
                        }}></div>
                      </div>
                      <div style={{ color: '#6c5ce7', fontSize: '14px' }}>
                        🗜️ Compressing & Transcribing Audio...
                      </div>
                    </div>
                  )}

                  {/* FIXED: Action Buttons with proper free user handling */}
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', marginTop: '30px' }}>
                    {status === 'idle' && !isUploading && selectedFile && (
                      <button
                        onClick={userProfile?.plan === 'free' ? () => setCurrentView('pricing') : handleUpload}
                        disabled={!selectedFile || isUploading}
                        style={{
                          padding: '15px 30px',
                          fontSize: '18px',
                          backgroundColor: (!selectedFile || isUploading) ? '#6c757d' : (userProfile?.plan === 'free' ? '#ffc107' : '#6c5ce7'),
                          color: 'white',
                          border: 'none',
                          borderRadius: '25px',
                          cursor: (!selectedFile || isUploading) ? 'not-allowed' : 'pointer',
                          boxShadow: '0 5px 15px rgba(108, 92, 231, 0.4)'
                        }}
                      >
                        {userProfile?.plan === 'free' ? '🔒 Upgrade to Transcribe' : '🚀 Start Transcription'}
                      </button>
                    )}

                    {(status === 'uploading' || status === 'processing') && (
                      <button
                        onClick={handleCancelUpload}
                        style={{
                          padding: '15px 30px',
                          fontSize: '18px',
                          backgroundColor: '#dc3545',
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
                  {status === 'failed' && (
                    <p style={{ margin: '10px 0 0 0', color: '#666' }}>
                      An error occurred during transcription. Please try again.
                    </p>
                  )}
                </div>
              )}
              {/* Enhanced Transcription Result */}
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
                    ✅ Check your{' '}
                    <button
                      onClick={() => setCurrentView('dashboard')}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#007bff',
                        textDecoration: 'underline',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: 'bold',
                        padding: 0
                      }}
                      onMouseEnter={(e) => e.target.style.color = '#0056b3'}
                      onMouseLeave={(e) => e.target.style.color = '#007bff'}
                    >
                      Dashboard
                    </button>
                    {' '}for your transcripts history.
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
            marginTop: 'auto'
          }}>
            &copy; {new Date().getFullYear()} TypeMyworDz, Inc. - Enhanced with Advanced Audio Compression
          </footer>

          {/* Copied Message Animation */}
          {copiedMessageVisible && (
            <div className="copied-message-animation">
              Copied to clipboard!
            </div>
          )}
        </div>
      } />
    </Routes>
  );
}
// Main App Component with AuthProvider
function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/*" element={<AppContent />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;