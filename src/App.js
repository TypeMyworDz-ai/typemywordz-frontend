import React, { useState, useRef, useEffect, useCallback } from 'react';
import './App.css';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import AdminDashboard from './components/AdminDashboard';
import TranscriptionDetail from './components/TranscriptionDetail';
import RichTextEditor from './components/RichTextEditor';
import { canUserTranscribe, updateUserUsage, saveTranscription, createUserProfile, updateUserPlan } from './userService';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import FloatingTranscribeButton from './components/FloatingTranscribeButton';
import PrivacyPolicy from './components/PrivacyPolicy';

// UPDATED Configuration - Removed Render Whisper URL
const RAILWAY_BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://web-production-5eab.up.railway.app';

// Copied Notification Component
const CopiedNotification = ({ isVisible }) => {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        left: '50%',
        transform: `translateX(-50%) translateY(${isVisible ? '0' : '50px'})`,
        opacity: isVisible ? 1 : 0,
        transition: 'all 0.3s ease-in-out',
        backgroundColor: '#4CAF50', // Green background
        color: 'white',
        padding: '10px 20px',
        borderRadius: '5px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
        zIndex: 1000,
        pointerEvents: 'none', // Allow clicks to pass through
      }}
    >
      📋 Copied to clipboard!
    </div>
  );
};

// Enhanced Toast Notification Component
const ToastNotification = ({ message, onClose }) => {
  const [isVisible, setIsVisible] = useState(false);
  
  useEffect(() => {
    if (message) {
      setIsVisible(true);
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(onClose, 300);
      }, 5000); // Changed to 5 seconds
      
      return () => clearTimeout(timer);
    }
  }, [message, onClose]);
  
  if (!message) return null;
  
  return (
    <div 
      className={`fixed bottom-4 right-4 max-w-sm w-full bg-white border-l-4 border-blue-500 rounded-lg shadow-lg p-4 transform transition-all duration-300 z-50 ${
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0' // Changed 'translate-x' to 'translate-y'
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
        bottom: '16px', // Changed from 'top' to 'bottom'
        right: '16px',
        zIndex: 1000,
        transform: isVisible ? 'translateY(0)' : 'translateY(100%)', // Changed 'translateX' to 'translateY'
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
  const navigate = useNavigate();
  
  // State declarations
  const [selectedFile, setSelectedFile] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState('idle');
  const [transcription, setTranscription] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [transcriptionProgress, setTranscriptionProgress] = useState(0);
  const [currentView, setCurrentView] = useState('transcribe');
  const [audioDuration, setAudioDuration] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [downloadFormat, setDownloadFormat] = useState('mp3');
  const [message, setMessage] = useState('');
  const [copiedMessageVisible, setCopiedMessageVisible] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('en'); 
  const [speakerLabelsEnabled, setSpeakerLabelsEnabled] = useState(false);
  
  // Payment states
  const [pricingView, setPricingView] = useState('credits');
  const [selectedRegion, setSelectedRegion] = useState('KE'); // Default to Kenya
  const [convertedAmounts, setConvertedAmounts] = useState({ 
    'oneday': { amount: 1.00, currency: 'USD' }, 
    'threeday': { amount: 2.00, currency: 'USD' },
    'oneweek': { amount: 3.00, currency: 'USD' }
  });
  
  // Refs
  const mediaRecorderRef = useRef(null);
  const recordingIntervalRef = useRef(null);
  const recordedAudioBlobRef = useRef(null); 
  const abortControllerRef = useRef(null);
  const transcriptionIntervalRef = useRef(null);
  const statusCheckTimeoutRef = useRef(null);
  const isCancelledRef = useRef(false);
  
  // Auth and user setup
  const { currentUser, logout, userProfile, refreshUserProfile, signInWithGoogle, profileLoading } = useAuth();
  const ADMIN_EMAILS = ['typemywordz@gmail.com']; // 'typemywordz@gmail.com' is an admin for functionality
  const isAdmin = ADMIN_EMAILS.includes(currentUser?.email); 

  // Message handlers
  const showMessage = useCallback((msg) => setMessage(msg), []);
  const clearMessage = useCallback(() => setMessage(''), []);

  // --- Menu State & Functions (React-managed) ---
  const [openSubmenu, setOpenSubmenu] = useState(null); // Tracks which submenu is open

  const handleToggleSubmenu = (submenuId) => {
    setOpenSubmenu(prev => (prev === submenuId ? null : submenuId));
  };

  const handleOpenPrivacyPolicy = () => {
    window.open('/privacy-policy', '_blank');
    setOpenSubmenu(null); // Close any open menu
  };
  // Paystack payment functions (these remain unchanged)
  const initializePaystackPayment = async (email, amount, planName, countryCode) => {
    try {
      console.log('Initializing Paystack payment:', { email, amount, planName, countryCode });
      
      const response = await fetch(`${RAILWAY_BACKEND_URL}/api/initialize-paystack-payment`, { // Calls Railway
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email,
          amount: amount,
          plan_name: planName,
          user_id: currentUser.uid,
          country_code: countryCode,
          callback_url: `${window.location.origin}/?payment=success`
        })
      });

      const data = await response.json();
      console.log('Backend payment initialization response:', data);
      
      if (response.ok && data.status) {
        showMessage('Redirecting to payment page...');
        window.location.href = data.authorization_url;
      } else {
        throw new Error(data.message || 'Payment initialization failed');
      }
    } catch (error) {
      console.error('Paystack payment error:', error);
      showMessage('Payment initialization failed: ' + error.message);
    }
  };

  // Handle payment success callback (remains unchanged)
  const handlePaystackCallback = useCallback(async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const reference = urlParams.get('reference');
    const paymentStatus = urlParams.get('payment');
    
    console.log('Checking payment callback:', { reference, paymentStatus });
    
    if (reference) {
      try {
        showMessage('Verifying payment...');
        
        const response = await fetch(`${RAILWAY_BACKEND_URL}/api/verify-payment`, { // Calls Railway
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ reference }),
        });
        
        const data = await response.json();
        console.log('Payment verification result:', data);
        
        if (response.ok && data.status === 'success') {
          await updateUserPlan(currentUser.uid, data.data.plan, reference); 
          await refreshUserProfile();
          
          showMessage(`🎉 Payment successful! ${data.data.plan} activated.`);
          setCurrentView('transcribe');
          
          window.history.replaceState({}, document.title, window.location.pathname);
        } else {
          showMessage('Payment verification failed: ' + (data.message || 'Unknown error'));
        }
      } catch (error) {
        console.error('Payment verification error:', error);
        showMessage('Payment verification failed: ' + error.message);
      }
    } else if (paymentStatus === 'success') {
      showMessage('Payment completed! Please wait for verification...');
    }
  }, [currentUser, showMessage, refreshUserProfile, setCurrentView, RAILWAY_BACKEND_URL]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const reference = urlParams.get('reference');
    const paymentStatus = urlParams.get('payment');
    
    if (reference || paymentStatus === 'success') {
      console.log('Payment callback detected');
      handlePaystackCallback();
    }
  }, [currentUser, handlePaystackCallback]);

  // Enhanced reset function with better job cancellation (remains unchanged)
  const resetTranscriptionProcessUI = useCallback(() => { 
    console.log('🔄 Resetting transcription UI and cancelling any ongoing processes');
    
    isCancelledRef.current = true;
    
    setJobId(null);
    setStatus('idle'); 
    setTranscription('');
    setAudioDuration(0);
    setIsUploading(false);
    setUploadProgress(0);
    setTranscriptionProgress(0); 
    setSpeakerLabelsEnabled(false); // Reset speaker labels to default (No Speakers)
    
    recordedAudioBlobRef.current = null;
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (transcriptionIntervalRef.current) {
      clearInterval(transcriptionIntervalRef.current);
      transcriptionIntervalRef.current = null;
    }

    if (statusCheckTimeoutRef.current) {
      clearTimeout(statusCheckTimeoutRef.current);
      statusCheckTimeoutRef.current = null;
    }

    const highestIntervalId = setInterval(() => {}, 0);
    for (let i = 1; i <= highestIntervalId; i++) {
      clearInterval(i);
      clearTimeout(i);
    }
    
    setTimeout(() => {
      isCancelledRef.current = false;
      console.log('✅ Reset complete, ready for new operations');
    }, 500);
  }, []);

  useEffect(() => {
    if (userProfile) {
      console.log('DIAGNOSTIC: userProfile.totalMinutesUsed updated to:', userProfile?.totalMinutesUsed);
    }
  }, [userProfile?.totalMinutesUsed]);

  // Enhanced file selection with proper job cancellation (remains unchanged)
  const handleFileSelect = useCallback(async (event) => {
    const file = event.target.files[0];
    
    if (!file) {
      return;
    }
    
    // Always reset UI when a new file is selected, effectively deselecting options
    // This also stops any ongoing transcription.
    resetTranscriptionProcessUI(); 
    
    setSelectedFile(file);
    
    if (file && (file.type.startsWith('audio/') || file.type.startsWith('video/'))) { 
      const audio = new Audio(); 
      audio.preload = 'metadata';
      audio.onloadedmetadata = async () => {
        setAudioDuration(audio.duration);
        URL.revokeObjectURL(audio.src);
        
        try {
          const originalSize = file.size / (1024 * 1024);
          console.log(`📊 ${Math.round(audio.duration/60)}-minute file loaded (${originalSize.toFixed(2)} MB) - ready for quick transcription.`);
        } catch (error) {
          console.error('Error getting file info:', error);
          showMessage('Error getting file info: ' + error.message); // Keep critical errors in main message modal
        }
      };
      const audioUrl = URL.createObjectURL(file);
      audio.src = audioUrl;
    }
  }, [showMessage, resetTranscriptionProcessUI]);

  // Enhanced recording function with proper job cancellation (remains unchanged, icon updated below)
  const startRecording = useCallback(async () => {
    // Always reset UI when starting a new recording, effectively deselecting options
    // This also stops any ongoing transcription.
    resetTranscriptionProcessUI(); 
    setSelectedFile(null); // Clear any previously selected file
    
    const fileInput = document.querySelector('input[type="file"]');
    if (fileInput) {
      fileInput.value = ''; // Clear file input
    }
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      
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
        
        if (recordedAudioBlobRef.current) {
          recordedAudioBlobRef.current = null;
        }
        
        recordedAudioBlobRef.current = originalBlob;
        
        let extension = 'wav';
        if (mimeType.includes('webm')) {
          extension = 'webm';
        }
        
        const file = new File([originalBlob], `recording-${Date.now()}.${extension}`, { type: mimeType });
        setSelectedFile(file);
        stream.getTracks().forEach(track => track.stop());
        
        const originalSize = originalBlob.size / (1024 * 1024);
        console.log(`📊 Recording saved: ${originalSize.toFixed(2)} MB - ready for transcription.`);
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
  }, [resetTranscriptionProcessUI, showMessage]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(recordingIntervalRef.current);
    }
  }, [isRecording]);
  // Improved cancel function with page refresh (updated for new backend)
  const handleCancelUpload = useCallback(async () => {
    console.log('🛑 FORCE CANCEL - Stopping everything immediately');
    
    isCancelledRef.current = true;
    
    setIsUploading(false);
    setUploadProgress(0);
    setTranscriptionProgress(0);
    setStatus('idle');
    setJobId(null);
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (transcriptionIntervalRef.current) {
      clearInterval(transcriptionIntervalRef.current);
      transcriptionIntervalRef.current = null;
    }

    if (statusCheckTimeoutRef.current) {
      clearTimeout(statusCheckTimeoutRef.current);
      statusCheckTimeoutRef.current = null;
    }

    const highestIntervalId = setInterval(() => {}, 0);
    for (let i = 1; i <= highestIntervalId; i++) {
      clearInterval(i);
      clearTimeout(i);
    }
    
    // Try to cancel job on Railway backend
    if (jobId) { 
      try {
        console.log(`Attempting to cancel job ${jobId} on Railway backend.`);
        await fetch(`${RAILWAY_BACKEND_URL}/cancel/${jobId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        console.log('✅ Previous job cancelled successfully on Railway.');
      } catch (error) {
        console.log('⚠️ Failed to cancel previous job on Railway, but continuing with force cancel:', error);
      }
    }
    
    showMessage("🛑 Transcription cancelled! Reloading page...");
    
    setTimeout(() => {
      window.location.reload();
    }, 1500);
    
    console.log('✅ Force cancellation complete. Page refresh initiated.');
  }, [jobId, showMessage, RAILWAY_BACKEND_URL]);

  // handleTranscriptionComplete with debugging logs (remains unchanged)
  const handleTranscriptionComplete = useCallback(async (transcriptionText, completedJobId) => {
    try {
      const estimatedDuration = audioDuration || Math.max(60, selectedFile.size / 100000);
      
      console.log('DIAGNOSTIC: Before updateUserUsage - userProfile.totalMinutesUsed:', userProfile?.totalMinutesUsed);
      console.log('DIAGNOSTIC: Estimated duration for this transcription:', estimatedDuration);

      await updateUserUsage(currentUser.uid, estimatedDuration);
      
      console.log('DEBUG: Attempting to save transcription...');
      console.log('DEBUG: saveTranscription arguments:');
      console.log('DEBUG:   currentUser.uid:', currentUser.uid);
      console.log('DEBUG:   selectedFile.name (or recorded audio name):', selectedFile ? selectedFile.name : `Recording-${Date.now()}.wav`);
      console.log('DEBUG:   transcriptionText (first 100 chars):', transcriptionText.substring(0, 100) + '...');
      console.log('DEBUG:   estimatedDuration:', estimatedDuration);
      console.log('DEBUG:   jobId (passed to saveTranscription):', completedJobId);
      
      // Call Railway backend to save the transcription
      await saveTranscription(
        currentUser.uid, 
        selectedFile ? selectedFile.name : `Recording-${Date.now()}.wav`, 
        transcriptionText, 
        estimatedDuration, 
        completedJobId 
      );
      console.log('DEBUG: saveTranscription call completed.');
      
      await refreshUserProfile();
      console.log('DIAGNOSTIC: After refreshUserProfile - userProfile.totalMinutesUsed:', userProfile?.totalMinutesUsed);

    } catch (error) {
      console.error('Error updating usage or saving transcription:', error);
      showMessage('Failed to save transcription or update usage.');
    } finally {
      // No changes here, as processingMessage state was removed
    }
  }, [audioDuration, selectedFile, currentUser, refreshUserProfile, showMessage, recordedAudioBlobRef, userProfile]);

  // Handle successful payment (remains unchanged)
  const handlePaymentSuccess = useCallback(async (planName, subscriptionId) => {
    try {
      await updateUserPlan(currentUser.uid, planName, subscriptionId);
      
      await refreshUserProfile();
      
      showMessage(`🎉 Successfully upgraded to ${planName.charAt(0).toUpperCase() + planName.slice(1)} plan! You now have unlimited transcription access.`);
      
      setCurrentView('transcribe');
    } catch (error) {
      console.error('Error updating user plan:', error);
      showMessage('Payment successful but there was an error updating your account. Please contact support.');
    }
  }, [currentUser?.uid, refreshUserProfile, showMessage, setCurrentView]);

  // UPDATED: checkJobStatus for new unified backend
  const checkJobStatus = useCallback(async (jobIdToPass, transcriptionInterval) => {
    if (isCancelledRef.current) {
      console.log('🛑 Status check aborted - job was cancelled');
      clearInterval(transcriptionInterval);
      return;
    }
    
    let timeoutId;
    
    try {
      const controller = new AbortController();
      abortControllerRef.current = controller;
      
      timeoutId = setTimeout(() => {
        console.log('⏰ Status check timeout - aborting');
        controller.abort();
      }, 10000); 
      
      const statusUrl = `${RAILWAY_BACKEND_URL}/status/${jobIdToPass}`;
      
      const response = await fetch(statusUrl, {
        signal: controller.signal 
      });
      
      clearTimeout(timeoutId);
      
      if (isCancelledRef.current) {
        console.log('🛑 Job cancelled during fetch - stopping immediately');
        clearInterval(transcriptionInterval);
        return;
      }
      
      const result = await response.json();
      
      if (isCancelledRef.current) {
        console.log('🛑 Job cancelled after response - stopping immediately');
        clearInterval(transcriptionInterval);
        return;
      }
      
      if (response.ok && result.status === 'completed') {
        if (isCancelledRef.current) {
          console.log('🛑 Job cancelled - ignoring completion');
          clearInterval(transcriptionInterval);
          return;
        }
        
        setTranscription(result.transcription);
        clearInterval(transcriptionInterval); 
        setTranscriptionProgress(100);
        setStatus('completed'); 
        
        await handleTranscriptionComplete(result.transcription, jobIdToPass);
        setIsUploading(false); 
        
      } else if (response.ok && result.status === 'failed') {
        if (!isCancelledRef.current) {
          showMessage('Transcription failed: ' + result.error);
          clearInterval(transcriptionInterval); 
          setTranscriptionProgress(0);
          setStatus('failed'); 
          setIsUploading(false);
        }
        
      } else if (response.ok && (result.status === 'cancelled' || result.status === 'canceled')) {
        console.log('✅ Backend confirmed job cancellation');
        clearInterval(transcriptionInterval);
        setTranscriptionProgress(0);
        setStatus('idle');
        setIsUploading(false);
        
      } else {
        if (result.status === 'processing' && !isCancelledRef.current) {
          console.log('⏳ Job still processing - will check again');
          statusCheckTimeoutRef.current = setTimeout(() => {
            if (!isCancelledRef.current) {
              checkJobStatus(jobIdToPass, transcriptionInterval); 
            } else {
              console.log('🛑 Recursive call cancelled');
              clearInterval(transcriptionInterval);
            }
          }, 2000);
        } else if (isCancelledRef.current) {
          console.log('🛑 Job cancelled - stopping status checks');
          clearInterval(transcriptionInterval);
        } else {
          const errorDetail = result.detail || `Unexpected status: ${result.status}`;
          showMessage('Status check failed: ' + errorDetail);
          clearInterval(transcriptionInterval); 
          setTranscriptionProgress(0);
          setStatus('failed'); 
          setIsUploading(false); 
        }
      }
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError' || isCancelledRef.current) {
        console.log('🛑 Request aborted or job cancelled');
        clearInterval(transcriptionInterval);
        if (!isCancelledRef.current) {
          setIsUploading(false);
        }
        return;
      } else if (!isCancelledRef.current) {
        console.error('❌ Status check error:', error);
        clearInterval(transcriptionInterval); 
        setTranscriptionProgress(0);
        setStatus('failed'); 
        setIsUploading(false); 
        showMessage('Status check failed: ' + error.message);
      }
    } finally {
      abortControllerRef.current = null;
    }
  }, [handleTranscriptionComplete, showMessage, RAILWAY_BACKEND_URL]);
  // NEW: Updated handleUpload with new backend logic
  const handleUpload = useCallback(async () => {
    if (!selectedFile) {
      showMessage('Please select a file first');
      return;
    }

    if (profileLoading || !userProfile) {
      showMessage('Loading user profile... Please wait.');
      return;
    }

    const estimatedDuration = audioDuration || Math.max(60, selectedFile.size / 100000);
    const estimatedDurationMinutes = Math.ceil(estimatedDuration / 60);

    // Use the canUserTranscribe function with its new return format
    const transcribeCheck = await canUserTranscribe(currentUser.uid, estimatedDuration);
    
    if (!transcribeCheck.canTranscribe) {
      if (transcribeCheck.redirectToPricing) {
        // Auto-redirect to pricing for users who exceed limits or have exhausted trial
        let userMessage = 'Please upgrade to continue transcribing.';
        if (transcribeCheck.reason === 'exceeds_free_limit') {
          userMessage = `This ${transcribeCheck.requiredMinutes}-minute audio exceeds your ${transcribeCheck.remainingMinutes} remaining free minutes. Redirecting to pricing...`;
        } else if (transcribeCheck.reason === 'free_trial_exhausted') {
          userMessage = 'Your 30-minute free trial has been used. Redirecting to pricing...';
        } else if (transcribeCheck.reason === 'plan_expired') {
          userMessage = 'Your paid plan has expired. Redirecting to pricing...';
        }

        showMessage(userMessage);
        
        // Redirect to pricing after 2 seconds
        setTimeout(() => {
          setCurrentView('pricing');
          resetTranscriptionProcessUI();
        }, 2000);
        return;
      } else {
        // Other reasons for not transcribing (e.g., profile not found, unhandled plan)
        showMessage('You do not have permission to transcribe audio. Please contact support if this is an error.');
        resetTranscriptionProcessUI();
        return;
      }
    }

    console.log(`🎯 Initiating transcription for ${Math.round(estimatedDuration/60)}-minute audio.`);

    isCancelledRef.current = false;
    setIsUploading(true);
    setStatus('processing');
    abortControllerRef.current = new AbortController();

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('language_code', selectedLanguage);
    formData.append('speaker_labels_enabled', speakerLabelsEnabled);
    formData.append('user_plan', userProfile?.plan || 'free'); // NEW: Send user plan

    try {
      // NEW: Call unified transcription endpoint
      console.log(`🎯 Using unified transcription endpoint: ${RAILWAY_BACKEND_URL}/transcribe`);
      const response = await fetch(`${RAILWAY_BACKEND_URL}/transcribe`, {
        method: 'POST',
        body: formData,
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        throw new Error(`Transcription service failed with status: ${response.status} - ${response.statusText}`);
      }

      const result = await response.json();

      if (result && result.job_id) {
        const transcriptionJobId = result.job_id;
        console.log('✅ Transcription job started. Processing...');
        console.log(`📊 Logic used: ${result.logic_used || 'Smart service selection'}`);
        
        setUploadProgress(100);
        setStatus('processing');
        setJobId(transcriptionJobId);
        transcriptionIntervalRef.current = simulateProgress(setTranscriptionProgress, 500, -1); 
        checkJobStatus(transcriptionJobId, transcriptionIntervalRef.current);
      } else {
        throw new Error(`Transcription service returned no job ID: ${JSON.stringify(result)}`);
      }

    } catch (transcriptionError) {
      console.error('Transcription failed:', transcriptionError);
      showMessage('❌ Transcription service is currently unavailable. Please try again later.');
      setUploadProgress(0);
      setTranscriptionProgress(0);
      setStatus('failed'); 
      setIsUploading(false);
    }

  }, [selectedFile, audioDuration, currentUser?.uid, showMessage, setCurrentView, resetTranscriptionProcessUI, handleTranscriptionComplete, userProfile, profileLoading, selectedLanguage, speakerLabelsEnabled, RAILWAY_BACKEND_URL, checkJobStatus, canUserTranscribe]);

  // Copy to clipboard (existing, now triggers NEW CopiedNotification)
  const copyToClipboard = useCallback(() => { 
    if (userProfile?.plan === 'free') {
      showMessage('Copy to clipboard is only available for paid users. Please upgrade to access this feature.');
      return;
    }
    
    // To copy HTML content, we need to create a temporary element
    const tempElement = document.createElement('div');
    tempElement.innerHTML = transcription;
    navigator.clipboard.writeText(tempElement.textContent || tempElement.innerText); // Copy plain text content
    
    setCopiedMessageVisible(true); // NEW: Show copied message
    setTimeout(() => setCopiedMessageVisible(false), 2000); // Hide after 2 seconds
  }, [transcription, userProfile, showMessage]);

  // UPDATED: Download as Word - now calls backend for formatted DOCX (remains unchanged)
  const downloadAsWord = useCallback(async () => { 
    if (userProfile?.plan === 'free') {
      showMessage('MS Word download is only available for paid users. Please upgrade to access this feature.');
      return;
    }
    
    try {
      showMessage('Generating formatted Word document...');
      const response = await fetch(`${RAILWAY_BACKEND_URL}/generate-formatted-word`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transcription_html: transcription,
          filename: `transcription_${Date.now()}.docx`
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to generate Word document: ${response.statusText}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transcription_${Date.now()}.docx`; // Use .docx extension
      a.click();
      URL.revokeObjectURL(url);
      showMessage('Word document generated successfully!');

    } catch (error) {
      console.error('Error downloading Word document:', error);
      showMessage('Failed to generate Word document: ' + error.message);
    }
  }, [transcription, userProfile, showMessage, RAILWAY_BACKEND_URL]);

  // TXT download - available for all users (remains unchanged)
  const downloadAsTXT = useCallback(() => { 
    // For TXT download, we want plain text, so strip HTML tags
    const tempElement = document.createElement('div');
    tempElement.innerHTML = transcription;
    const plainTextTranscription = tempElement.textContent || tempElement.innerText;

    const blob = new Blob([plainTextTranscription], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'transcription.txt';
    a.click();
    URL.revokeObjectURL(url);
  }, [transcription]);

  // Enhanced download with compression options (Note: This is for recorded audio, not transcription results) (remains unchanged, icon updated below)
  const downloadRecordedAudio = useCallback(async () => { 
    if (recordedAudioBlobRef.current) {
      try {
        let downloadBlob = recordedAudioBlobRef.current;
        let filename = `recording-${Date.now()}.${downloadFormat}`;
        
        if (downloadFormat === 'mp3' && !recordedAudioBlobRef.current.type.includes('mp3')) {
          showMessage('Compressing to MP3...');
          // This part of the frontend is not actually performing the compression,
          // it's just showing a message. The backend's /compress-download endpoint would handle it.
          // For now, we'll keep the message, but actual compression would involve a backend call here.
          showMessage('MP3 compression complete!'); 
        }
        
        const url = URL.createObjectURL(downloadBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      } catch (error) {
        console.error('Error compressing for download: ', error);
        showMessage('Download compression failed, downloading original format.');
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

  const handleUpgradeClick = useCallback((planType) => {
    console.log('Upgrade clicked for plan:', planType);
    setCurrentView('pricing');
  }, [setCurrentView]);

  // Cleanup effect to ensure cancellation works (remains unchanged)
  useEffect(() => {
    return () => {
      if (isCancelledRef.current) {
        console.log('🧹 Component cleanup - clearing all intervals');
        const highestId = setInterval(() => {}, 0);
        for (let i = 1; i <= highestId; i++) {
          clearInterval(i);
          clearTimeout(i);
        }
      }
    };
  }, []);
  // Login screen for non-authenticated users
  if (!currentUser) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* NEW LAYOUT: App name and tagline in top-left (for non-authenticated state) */}
        <div style={{ 
          position: 'absolute', 
          top: '20px', 
          left: '20px', 
          zIndex: 100,
          color: 'white'
        }}>
          <h1 style={{ 
            fontSize: '1.8rem', 
            margin: '0 0 5px 0',
            fontWeight: '300',
            textShadow: '0 2px 4px rgba(0,0,0,0.3)'
          }}>
            TypeMyworDz
          </h1>
          <p style={{ 
            fontSize: '1rem', 
            margin: '0',
            opacity: '0.9'
          }}>
            You Talk, We Type
          </p>
        </div>

        {/* The Menu (sidebar-menu) will be rendered here directly when not authenticated */}
        {/* Managed by React state for dropdowns */}
        <div 
            className="sidebar-menu" 
            style={{
                position: 'fixed',
                right: '20px', 
                top: '20px',
                left: 'auto', 
                display: 'flex', 
                flexDirection: 'row', 
                width: 'fit-content', 
                // Other styles from menu.css will apply via className
            }}
            onMouseLeave={() => setOpenSubmenu(null)} // Close submenu on mouse leave
        >
            {/* Products Parent Menu */}
            <div className="menu-item parent-menu" onClick={() => handleToggleSubmenu('productsSubmenu')}>
                <span className="menu-icon">📦</span>
                <span className="menu-text">Products</span>
                <span className={`dropdown-arrow ${openSubmenu === 'productsSubmenu' ? 'rotated' : ''}`}>▼</span>
                
                {/* Products Submenu */}
                {openSubmenu === 'productsSubmenu' && (
                    <div className={`submenu ${openSubmenu === 'productsSubmenu' ? 'open' : ''}`} id="productsSubmenu">
                        <div className="submenu-item" onClick={() => window.showSpeechToText()}>
                            <span className="submenu-icon">🎙️</span>
                            <span className="submenu-text">Speech-to-Text</span>
                        </div>
                        <div className="submenu-item" onClick={() => window.showComingSoon('TypeMyNote')}>
                            <span className="submenu-icon">🎤</span>
                            <span className="submenu-text">TypeMyNote</span>
                        </div>
                        <div className="submenu-item" onClick={() => window.showComingSoon('Text-to-Speech')}>
                            <span className="submenu-icon">🔊</span>
                            <span className="submenu-text">Text-to-Speech</span>
                        </div>
                        <div className="submenu-item" onClick={() => window.showHumanTranscripts()}>
                            <span className="submenu-icon">👥</span>
                            <span className="submenu-text">Human Transcripts</span>
                        </div>
                    </div>
                )}
            </div>
            
            {/* Collaborate Parent Menu */}
            <div className="menu-item parent-menu" onClick={() => handleToggleSubmenu('collaborateSubmenu')}>
                <span className="menu-icon">🤝</span>
                <span className="menu-text">Collaborate</span>
                <span className={`dropdown-arrow ${openSubmenu === 'collaborateSubmenu' ? 'rotated' : ''}`}>▼</span>
                
                {/* Collaborate Submenu */}
                {openSubmenu === 'collaborateSubmenu' && (
                    <div className={`submenu ${openSubmenu === 'collaborateSubmenu' ? 'open' : ''}`} id="collaborateSubmenu">
                        <div className="submenu-item" onClick={() => window.openDonate()}>
                            <span className="submenu-icon">💝</span>
                            <span className="submenu-text">Donate</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Privacy Policy Menu Item */}
            <div className="menu-item" onClick={handleOpenPrivacyPolicy}>
                <span className="menu-icon">📋</span>
                <span className="submenu-text">Privacy Policy</span>
            </div>
        </div>

        <header style={{ 
          textAlign: 'center', 
          padding: '60px 20px',
          color: 'white'
        }}>
          {/* Main App Title for Login Screen (removed from here, now top-left) */}
          {/* Main App Tagline for Login Screen (moved below login palette) */}
        </header>
        
        <div style={{ 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column', // Added column direction for proper layout
          justifyContent: 'center', 
          alignItems: 'center',
          padding: '0 20px'
        }}>
          <Login />
          {/* Moved below login palette */}
          <p style={{ 
            fontSize: '1.1rem', 
            margin: '30px 0 0 0', // Adjusted margin to move it below login
            opacity: '0.8',
            color: 'white',
            textAlign: 'center'
          }}>
            Speech to Text AI • Simple, Accurate, Powerful • Now with 30-Minute Free Trial
          </p>
        </div>
        <ToastNotification message={message} onClose={clearMessage} />
        <footer style={{ 
          textAlign: 'center', 
          padding: '20px', 
          color: 'rgba(255, 255, 255, 0.7)', 
          fontSize: '0.9rem' 
        }}>
          © {new Date().getFullYear()} TypeMyworDz
        </footer>
      </div>
    );
  }
return (
  <Routes>
    <Route path="/transcription/:id" element={<TranscriptionDetail />} />
    <Route path="/transcription-editor" element={<RichTextEditor />} />
    <Route path="/privacy-policy" element={<PrivacyPolicy />} />
    <Route path="/dashboard" element={
      <>
        <FloatingTranscribeButton />
        <Dashboard setCurrentView={setCurrentView} />
      </>
    } />
    <Route path="/admin" element={isAdmin ? <AdminDashboard /> : <Navigate to="/" />} />
    
    <Route path="/" element={
      <div style={{ 
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: (currentView === 'dashboard' || currentView === 'admin' || currentView === 'pricing') ? '#f8f9fa' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
      }}>
        <ToastNotification message={message} onClose={clearMessage} />
        <CopiedNotification isVisible={copiedMessageVisible} />

        {/* NEW LAYOUT: App name and tagline in top-left */}
        <div style={{ 
          position: 'absolute', 
          top: '20px', 
          left: '20px', 
          zIndex: 100,
          color: 'white'
        }}>
          <h1 style={{ 
            fontSize: '1.8rem', 
            margin: '0 0 5px 0',
            fontWeight: '300',
            textShadow: '0 2px 4px rgba(0,0,0,0.3)'
          }}>
            TypeMyworDz
          </h1>
          <p style={{ 
            fontSize: '1rem', 
            margin: '0',
            opacity: '0.9'
          }}>
            You Talk, We Type
          </p>
        </div>

        {/* The Menu (sidebar-menu) will be rendered here directly when authenticated */}
        {/* Managed by React state for dropdowns */}
        <div 
            className="sidebar-menu" 
            style={{
                position: 'fixed',
                right: '20px', 
                top: '20px',
                left: 'auto', 
                display: 'flex', 
                flexDirection: 'row', 
                width: 'fit-content', 
                // Other styles from menu.css will apply via className
            }}
            onMouseLeave={() => setOpenSubmenu(null)} // Close submenu on mouse leave
        >
            {/* Products Parent Menu */}
            <div className="menu-item parent-menu" onClick={() => handleToggleSubmenu('productsSubmenu')}>
                <span className="menu-icon">📦</span>
                <span className="menu-text">Products</span>
                <span className={`dropdown-arrow ${openSubmenu === 'productsSubmenu' ? 'rotated' : ''}`}>▼</span>
                
                {/* Products Submenu */}
                {openSubmenu === 'productsSubmenu' && (
                    <div className={`submenu ${openSubmenu === 'productsSubmenu' ? 'open' : ''}`} id="productsSubmenu">
                        <div className="submenu-item" onClick={() => window.showSpeechToText()}>
                            <span className="submenu-icon">🎙️</span>
                            <span className="submenu-text">Speech-to-Text</span>
                        </div>
                        <div className="submenu-item" onClick={() => window.showComingSoon('TypeMyNote')}>
                            <span className="submenu-icon">🎤</span>
                            <span className="submenu-text">TypeMyNote</span>
                        </div>
                        <div className="submenu-item" onClick={() => window.showComingSoon('Text-to-Speech')}>
                            <span className="submenu-icon">🔊</span>
                            <span className="submenu-text">Text-to-Speech</span>
                        </div>
                        <div className="submenu-item" onClick={() => window.showHumanTranscripts()}>
                            <span className="submenu-icon">👥</span>
                            <span className="submenu-text">Human Transcripts</span>
                        </div>
                    </div>
                )}
            </div>
            
            {/* Collaborate Parent Menu */}
            <div className="menu-item parent-menu" onClick={() => handleToggleSubmenu('collaborateSubmenu')}>
                <span className="menu-icon">🤝</span>
                <span className="menu-text">Collaborate</span>
                <span className={`dropdown-arrow ${openSubmenu === 'collaborateSubmenu' ? 'rotated' : ''}`}>▼</span>
                
                {/* Collaborate Submenu */}
                {openSubmenu === 'collaborateSubmenu' && (
                    <div className={`submenu ${openSubmenu === 'collaborateSubmenu' ? 'open' : ''}`} id="collaborateSubmenu">
                        <div className="submenu-item" onClick={() => window.openDonate()}>
                            <span className="submenu-icon">💝</span>
                            <span className="submenu-text">Donate</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Privacy Policy Menu Item */}
            <div className="menu-item" onClick={handleOpenPrivacyPolicy}>
                <span className="menu-icon">📋</span>
                <span className="menu-text">Privacy Policy</span>
            </div>
        </div>

        {currentView === 'transcribe' && (
          <header style={{ 
            textAlign: 'center', 
            padding: '40px 20px 20px',
            color: 'white'
          }}>
            {/* BIG LOGO above "Logged in as..." */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'center', 
              marginBottom: '20px' 
            }}>
              <img 
                src="/android-chrome-192x192.png" // Using the larger PNG for the main logo
                alt="TypeMyworDz Logo" 
                style={{ 
                  width: '80px', 
                  height: '80px',
                  filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
                }} 
              />
            </div>
            
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
              {userProfile && userProfile.plan === 'pro' ? ( 
                <span>Plan: Pro (Unlimited Transcription) {userProfile.expiresAt && `until ${new Date(userProfile.expiresAt).toLocaleDateString()}`}</span> 
              ) : userProfile && userProfile.plan === 'One-Day Plan' ? (
                <span>Plan: One-Day Plan {userProfile.expiresAt && `until ${new Date(userProfile.expiresAt).toLocaleDateString()}`}</span>
              ) : userProfile && userProfile.plan === 'Three-Day Plan' ? (
                <span>Plan: Three-Day Plan {userProfile.expiresAt && `until ${new Date(userProfile.expiresAt).toLocaleDateString()}`}</span>
              ) : userProfile && userProfile.plan === 'One-Week Plan' ? (
                <span>Plan: One-Week Plan {userProfile.expiresAt && `until ${new Date(userProfile.expiresAt).toLocaleDateString()}`}</span>
              ) : userProfile && userProfile.plan === 'free' ? (
                <span>Plan: Free Trial ({Math.max(0, 30 - (userProfile.totalMinutesUsed || 0))} minutes remaining)</span>
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
                    borderRadius: '44px',
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

        {/* NEW: Transcription Editor button above other navigation buttons */}
        {currentView === 'transcribe' && (
          <div style={{ 
            textAlign: 'center', 
            padding: '10px 20px',
            backgroundColor: 'transparent'
          }}>
            <button
              onClick={() => window.open('/transcription-editor', '_blank')}
              style={{
                backgroundColor: '#28a745',
                color: 'white',
                padding: '10px 20px',
                border: 'none',
                borderRadius: '20px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                boxShadow: '0 4px 15px rgba(40, 167, 69, 0.4)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.3s ease',
                marginBottom: '15px'
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = '#218838';
                e.target.style.transform = 'translateY(-2px)';
                e.target.style.boxShadow = '0 6px 20px rgba(40, 167, 69, 0.6)';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = '#28a745';
                e.target.style.transform = 'translateY(0)';
                e.target.style.boxShadow = '0 4px 15px rgba(40, 167, 69, 0.4)';
              }}
            >
              <img 
                src="/favicon-32x32.png" // Using the smaller PNG for button icon
                alt="Favicon" 
                style={{ width: '16px', height: '16px' }} 
              />
              ✏️ Transcription Editor
            </button>
          </div>
        )}
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
            📊 History
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

        {/* 🎯 HORIZONTAL PAYMENT PLANS - Key Feature */}
        {currentView === 'pricing' ? (
          <>
            <div style={{ 
              padding: '40px 20px', 
              textAlign: 'center', 
              maxWidth: '1200px', 
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
                Flexible options for different regions and needs
              </p>

              <div style={{ marginBottom: '40px' }}>
                <label htmlFor="paymentRegion" style={{ color: '#6c5ce7', fontWeight: 'bold', marginRight: '10px' }}>
                  Select Your Region:
                </label>
                <select
                  id="paymentRegion"
                  value={selectedRegion}
                  onChange={(e) => setSelectedRegion(e.target.value)}
                  style={{
                    padding: '8px 15px',
                    borderRadius: '8px',
                    border: '1px solid #6c5ce7',
                    fontSize: '16px',
                    minWidth: '200px'
                  }}
                >
                  <option value="KE">Kenya (M-Pesa, Card)</option>
                  <option value="OTHER_AFRICA">Other African Countries (Card USD)</option>
                </select>
              </div>

              <div style={{ marginBottom: '40px' }}>
                <button
                  onClick={() => setPricingView('credits')}
                  style={{
                    padding: '12px 30px',
                    margin: '0 10px',
                    backgroundColor: pricingView === 'credits' ? '#007bff' : '#6c757d',
                    color: 'white',
                    border: 'none',
                    borderRadius: '25px',
                    cursor: 'pointer',
                    fontSize: '16px'
                  }}
                >
                  💳 Go Pro for Africa
                </button>
                <button
                  onClick={() => setPricingView('subscription')}
                  style={{
                    padding: '12px 30px',
                    margin: '0 10px',
                    backgroundColor: pricingView === 'subscription' ? '#28a745' : '#6c757d',
                    color: 'white',
                    border: 'none',
                    borderRadius: '25px',
                    cursor: 'pointer',
                    fontSize: '16px'
                  }}
                >
                  🔄 Pro International
                </button>
              </div>

              {pricingView === 'credits' ? (
                <>
                  <div style={{ marginTop: '20px' }}>
                    <h2 style={{ color: '#007bff', marginBottom: '30px' }}>
                      💳 Go Pro with our One-Day, Three-Day, or One-Week Plan
                    </h2>
                    <p style={{ color: '#666', marginBottom: '30px', fontSize: '14px', textAlign: 'center' }}>
                      Purchase temporary access to Pro features. Available globally with local currency support
                    </p>
                    
                    {/* 🎯 HORIZONTAL LAYOUT FOR PAYMENT PLANS - KEY FEATURE */}
                    <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', flexWrap: 'wrap' }}>
                      {/* One-Day Plan (formerly 24 Hours Pro Access) */}
                      <div style={{
                        backgroundColor: 'white',
                        padding: '30px 25px',
                        borderRadius: '15px',
                        boxShadow: '0 8px 25px rgba(0,0,0,0.1)',
                        minWidth: '280px',
                        maxWidth: '320px',
                        border: '2px solid #e9ecef',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between'
                      }}>
                        <div>
                          <h3 style={{ 
                            color: '#007bff',
                            fontSize: '1.5rem',
                            margin: '0 0 10px 0',
                            textAlign: 'center'
                          }}>
                            One-Day Plan
                          </h3>
                          <p style={{ color: '#666', marginBottom: '15px', fontSize: '14px', textAlign: 'center' }}>
                            Full access to Pro features for 1 day
                          </p>
                          <div style={{ marginBottom: '20px', textAlign: 'center' }}>
                            <span style={{ 
                              fontSize: '2.5rem',
                              fontWeight: 'bold',
                              color: '#6c5ce7'
                            }}>
                              USD 1
                            </span>
                            <span style={{ 
                              color: '#666',
                              fontSize: '1rem',
                              display: 'block'
                            }}>
                              for 1 day
                            </span>
                          </div>
                        </div>
                        
                        <button
                          onClick={() => {
                            if (!currentUser?.email) {
                              showMessage('Please log in first to purchase credits.');
                              return;
                            }
                            initializePaystackPayment(currentUser.email, 1, 'One-Day Plan', selectedRegion);
                          }}
                          disabled={!currentUser?.email}
                          style={{
                            width: '100%',
                            padding: '15px',
                            backgroundColor: !currentUser?.email ? '#6c757d' : '#007bff',
                            color: 'white',
                            border: 'none',
                            borderRadius: '10px',
                            cursor: !currentUser?.email ? 'not-allowed' : 'pointer',
                            fontSize: '16px',
                            fontWeight: 'bold'
                          }}
                        >
                          {!currentUser?.email ? 'Login Required' : `Pay with Paystack - USD 1`}
                        </button>
                      </div>
                      
                      {/* Three-Day Plan (formerly 5 Days Pro Access) */}
                      <div style={{
                        backgroundColor: 'white',
                        padding: '30px 25px',
                        borderRadius: '15px',
                        boxShadow: '0 8px 25px rgba(40, 167, 69, 0.2)',
                        minWidth: '280px',
                        maxWidth: '320px',
                        border: '3px solid #28a745',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        transform: 'scale(1.02)'
                      }}>
                        <div>
                          <div style={{
                            backgroundColor: '#28a745',
                            color: 'white',
                            padding: '8px 20px',
                            borderRadius: '20px',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            marginBottom: '15px',
                            display: 'inline-block'
                          }}>
                            BEST VALUE
                          </div>
                          <h3 style={{ 
                            color: '#28a745',
                            fontSize: '1.5rem',
                            margin: '0 0 10px 0',
                            textAlign: 'center'
                          }}>
                            Three-Day Plan
                          </h3>
                          <p style={{ color: '#666', marginBottom: '15px', fontSize: '14px', textAlign: 'center' }}>
                            Full access to Pro features for 3 days
                          </p>
                          <div style={{ marginBottom: '20px', textAlign: 'center' }}>
                            <span style={{ 
                              fontSize: '2.5rem',
                              fontWeight: 'bold',
                              color: '#6c5ce7'
                            }}>
                              USD 2
                            </span>
                            <span style={{ 
                              color: '#666',
                              fontSize: '1rem',
                              display: 'block'
                            }}>
                              for 3 days
                            </span>
                          </div>
                        </div>
                        
                        <button
                          onClick={() => {
                            if (!currentUser?.email) {
                              showMessage('Please log in first to purchase credits.');
                              return;
                            }
                            initializePaystackPayment(currentUser.email, 2, 'Three-Day Plan', selectedRegion);
                          }}
                          disabled={!currentUser?.email}
                          style={{
                            width: '100%',
                            padding: '15px',
                            backgroundColor: !currentUser?.email ? '#6c757d' : '#28a745',
                            color: 'white',
                            border: 'none',
                            borderRadius: '10px',
                            cursor: !currentUser?.email ? 'not-allowed' : 'pointer',
                            fontSize: '16px',
                            fontWeight: 'bold'
                          }}
                        >
                          {!currentUser?.email ? 'Login Required' : `Pay with Paystack - USD 2`}
                        </button>
                      </div>

                      {/* NEW: One-Week Plan */}
                      <div style={{
                        backgroundColor: 'white',
                        padding: '30px 25px',
                        borderRadius: '15px',
                        boxShadow: '0 8px 25px rgba(0,0,0,0.1)',
                        minWidth: '280px',
                        maxWidth: '320px',
                        border: '2px solid #e9ecef',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between'
                      }}>
                        <div>
                          <h3 style={{ 
                            color: '#007bff',
                            fontSize: '1.5rem',
                            margin: '0 0 10px 0',
                            textAlign: 'center'
                          }}>
                            One-Week Plan
                          </h3>
                          <p style={{ color: '#666', marginBottom: '15px', fontSize: '14px', textAlign: 'center' }}>
                            Full access to Pro features for 7 days
                          </p>
                          <div style={{ marginBottom: '20px', textAlign: 'center' }}>
                            <span style={{ 
                              fontSize: '2.5rem',
                              fontWeight: 'bold',
                              color: '#6c5ce7'
                            }}>
                              USD 3
                            </span>
                            <span style={{ 
                              color: '#666',
                              fontSize: '1rem',
                              display: 'block'
                            }}>
                              for 7 days
                            </span>
                          </div>
                        </div>
                        
                        <button
                          onClick={() => {
                            if (!currentUser?.email) {
                              showMessage('Please log in first to purchase credits.');
                              return;
                            }
                            initializePaystackPayment(currentUser.email, 3, 'One-Week Plan', selectedRegion);
                          }}
                          disabled={!currentUser?.email}
                          style={{
                            width: '100%',
                            padding: '15px',
                            backgroundColor: !currentUser?.email ? '#6c757d' : '#007bff',
                            color: 'white',
                            border: 'none',
                            borderRadius: '10px',
                            cursor: !currentUser?.email ? 'not-allowed' : 'pointer',
                            fontSize: '16px',
                            fontWeight: 'bold'
                          }}
                        >
                          {!currentUser?.email ? 'Login Required' : `Pay with Paystack - USD 3`}
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ marginTop: '20px' }}>
                    <h2 style={{ color: '#28a745', marginBottom: '30px' }}>
                      🔄 Monthly Pro Plans
                    </h2>
                    <p style={{ color: '#666', marginBottom: '30px' }}>
                      Recurring monthly plans with 2Checkout integration
                    </p>
                    
                    <div style={{ display: 'flex', gap: '30px', justifyContent: 'center', flexWrap: 'wrap' }}>
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
                        <div>
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
                            COMING SOON
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
                            <li>✅ Copy to clipboard feature</li>
                            <li>✅ MS Word & TXT downloads</li>
                            <li>✅ 7-day file storage</li>
                            <li>✅ Email support</li>
                          </ul>
                          <button 
                            style={{
                              width: '100%',
                              padding: '15px',
                              backgroundColor: '#6c757d',
                              color: 'white',
                              border: 'none',
                              borderRadius: '10px',
                              cursor: 'not-allowed',
                              fontSize: '16px',
                              fontWeight: 'bold'
                            }}
                          >
                            Coming Soon (2Checkout)
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

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
                  <div>✅ Smart service selection (OpenAI + AssemblyAI)</div>
                  <div>✅ Multiple file formats supported</div>
                  <div>✅ Easy-to-use interface</div>
                  <div>✅ Mobile-friendly design</div>
                </div>
              </div>
            </div>
          </>
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
            {/* Tagline for authenticated users, removed as per user's request */}

            {userProfile && userProfile.plan === 'free' && (
              <div style={{
                backgroundColor: 'rgba(255, 255, 255, 0.95)', 
                color: '#856404',
                padding: '15px',
                borderRadius: '10px',
                marginBottom: '30px',
                textAlign: 'center',
                backdropFilter: 'blur(10px)',
                border: '1px solid #ffecb3' 
              }}>
                {userProfile.totalMinutesUsed < 30 ? (
                  <>
                    🎉 <strong>Free Trial:</strong> {Math.max(0, 30 - (userProfile.totalMinutesUsed || 0))} minutes remaining!{' '}
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
                      Upgrade for unlimited
                    </button>
                  </>
                ) : (
                  <>
                    🎵 Your free trial has ended. You have {Math.max(0, 30 - (userProfile.totalMinutesUsed || 0))} minutes remaining!{' '}
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
                      View Plans
                    </button>
                  </>
                )}
              </div>
            )}

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
                Record Audio or 📁 Upload File
              </h2>
              
              <div style={{ marginBottom: '30px' }}>
                <h3 style={{ 
                  color: '#6c5ce7', 
                  margin: '0 0 15px 0',
                  fontSize: '1.2rem'
                }}>
                  Record Audio
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
                    transition: 'all 0.3s ease',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '10px'
                  }}
                >
                  {/* NEW: Use the actual favicon-32x32.png for the icon */}
                  <img 
                    src="/favicon-32x32.png" 
                    alt="Record Icon" 
                    style={{ width: '20px', height: '20px' }} 
                  />
                  {isRecording ? 'Stop Recording' : 'Start Recording'}
                </button>

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
                        Ready for transcription
                      </div>
                    </div>
                  )}
                </div>

                {/* Language Selection Dropdown */}
                <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px' }}>
                  <label htmlFor="languageSelect" style={{ color: '#6c5ce7', fontWeight: 'bold', fontSize: '1.1rem' }}>
                    Transcription Language:
                  </label>
                  <select
                    id="languageSelect"
                    value={selectedLanguage}
                    onChange={(e) => setSelectedLanguage(e.target.value)}
                    style={{
                      padding: '8px 15px',
                      borderRadius: '8px',
                      border: '1px solid #6c5ce7'
                    }}
                  >
                    <option value="en">English (Default)</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                    <option value="de">German</option>
                    <option value="it">Italian</option>
                    <option value="pt">Portuguese</option>
                    <option value="ru">Russian</option>
                    <option value="zh">Chinese</option>
                    <option value="ja">Japanese</option>
                    <option value="ko">Korean</option>
                  </select>
                </div>
                
                {/* Speaker Tags Dropdown */}
                <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px' }}>
                  <label htmlFor="speakerLabelsSelect" style={{ color: '#6c5ce7', fontWeight: 'bold', fontSize: '1.1rem' }}>
                    Speaker Tags:
                  </label>
                  <select
                    id="speakerLabelsSelect"
                    value={speakerLabelsEnabled ? "true" : "false"}
                    onChange={(e) => setSpeakerLabelsEnabled(e.target.value === "true")}
                    style={{
                      padding: '8px 15px',
                      borderRadius: '8px',
                      border: '1px solid #6c5ce7'
                    }}
                  >
                    <option value="false">No Speakers (Default)</option>
                    <option value="true">With Speakers</option>
                  </select>
                </div>

                {/* Processing bar and text */}
                {(status === 'processing' || status === 'uploading') && (
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{
                      backgroundColor: '#e9ecef',
                      height: '30px',
                      borderRadius: '15px',
                      overflow: 'hidden',
                      marginBottom: '10px'
                    }}>
                      <div className="progress-bar-indeterminate" style={{
                        backgroundColor: '#6c5ce7',
                        height: '100%',
                        width: '100%',
                        borderRadius: '15px'
                      }}></div>
                    </div>
                    <div style={{ color: '#6c5ce7', fontSize: '14px' }}>
                      🎯 Processing audio with smart service selection...
                    </div>
                  </div>
                )}

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
                    Transcription failed. Check Your Network & Refresh the Page.
                  </p>
                )}
              </div>
            )}
            
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
                      backgroundColor: userProfile?.plan === 'free' ? '#6c757d' : '#27ae60',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: userProfile?.plan === 'free' ? 'not-allowed' : 'pointer',
                      fontSize: '14px',
                      opacity: userProfile?.plan === 'free' ? 0.6 : 1
                    }}
                  >
                    {userProfile?.plan === 'free' ? '🔒 Copy (Pro Only)' : '📋 Copy to Clipboard'}
                  </button>
                  
                  <button
                    onClick={downloadAsWord}
                    style={{
                      padding: '10px 20px',
                      backgroundColor: userProfile?.plan === 'free' ? '#6c757d' : '#007bff',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: userProfile?.plan === 'free' ? 'not-allowed' : 'pointer',
                      fontSize: '14px',
                      opacity: userProfile?.plan === 'free' ? 0.6 : 1
                    }}
                  >
                    {userProfile?.plan === 'free' ? '🔒 Word (Pro Only)' : '📄 MS Word'}
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
                
                {userProfile?.plan === 'free' && (
                  <div style={{
                    backgroundColor: 'rgba(255, 243, 205, 0.95)',
                    color: '#856404',
                    padding: '10px',
                    borderRadius: '5px',
                    marginBottom: '20px',
                    textAlign: 'center',
                    fontSize: '14px'
                  }}>
                    🔒 Copy to clipboard and MS Word downloads are available for Pro users.{' '}
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
                      Upgrade now
                    </button>
                  </div>
                )}
                
                <div style={{
                  backgroundColor: '#f8f9fa',
                  padding: '20px',
                  borderRadius: '10px',
                  textAlign: 'left',
                  // whiteSpace: 'pre-wrap', // Removed, as dangerouslySetInnerHTML handles line breaks
                  lineHeight: '1.6',
                  border: '1px solid #dee2e6'
                }}>
                  {/* FIXED: Use dangerouslySetInnerHTML to render HTML bold tags */}
                  <div dangerouslySetInnerHTML={{ __html: transcription.replace(/\n/g, '<br>') }} />
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
                    History
                  </button>
                  {' '}for your saved transcripts.
                </div>
              </div>
            )}
          </main>
        )}
        <footer style={{ 
          textAlign: 'center', 
          padding: '20px', 
          color: 'rgba(255, 255, 255, 0.7)', 
          fontSize: '0.9rem',
          marginTop: 'auto'
        }}>
          © {new Date().getFullYear()} TypeMyworDz
        </footer>

        {/* Removed StripePayment modal */}
      </div>
    } />
  </Routes>
);
}

// Main App Component with AuthProvider (existing, no changes needed here)
function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Standalone routes that don't require auth check */}
          <Route path="/transcription-editor" element={<RichTextEditor />} />
          <Route path="/transcription/:id" element={<TranscriptionDetail />} />
          
          {/* Main app routes */}
          <Route path="/*" element={<AppContent />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;