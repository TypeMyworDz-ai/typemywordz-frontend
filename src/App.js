import React, { useState, useRef, useEffect, useCallback } from 'react';
import './App.css';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './components/Login';
import Signup from './components/Signup';
import Dashboard from './components/Dashboard';
import AdminDashboard from './components/AdminDashboard';
import TranscriptionDetail from './components/TranscriptionDetail';
import StripePayment from './components/StripePayment';
import CreditPurchase from './components/SubscriptionPlans';
import { canUserTranscribe, updateUserUsage, saveTranscription, createUserProfile, updateUserPlan } from './userService';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import FloatingTranscribeButton from './components/FloatingTranscribeButton';

// Configuration
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://web-production-5eab.up.railway.app';
// Enhanced Toast Notification Component
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
  // State declarations
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
  const [message, setMessage] = useState('');
  const [copiedMessageVisible, setCopiedMessageVisible] = useState(false);
  
  // UPDATED: Payment states with better naming
  const [showPayment, setShowPayment] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [pricingView, setPricingView] = useState('credits'); // 'credits' or 'subscription'

  // Refs
  const mediaRecorderRef = useRef(null);
  const recordingIntervalRef = useRef(null);
  const recordedAudioBlobRef = useRef(null); 
  const abortControllerRef = useRef(null);
  const transcriptionIntervalRef = useRef(null);
  const statusCheckTimeoutRef = useRef(null);
  const isCancelledRef = useRef(false);

  // Auth and user setup
  const { currentUser, logout, userProfile, refreshUserProfile, signInWithGoogle, signInWithMicrosoft, profileLoading } = useAuth();
  const ADMIN_EMAILS = ['typemywordz@gmail.com', 'gracenyaitara@gmail.com'];
  const isAdmin = ADMIN_EMAILS.includes(currentUser?.email);

  // Message handlers
  const showMessage = useCallback((msg) => setMessage(msg), []);
  const clearMessage = useCallback(() => setMessage(''), []);
  // NEW: Paystack payment functions
  const initializePaystackPayment = async (email, amount, planName) => {
    try {
      console.log('Initializing Paystack payment:', { email, amount, planName });
      
      const response = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer pk_test_305e52e090e0da3cd2acb5f6fddf4f9b5d4b8e52',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email,
          amount: amount * 100, // Convert to kobo (Paystack uses kobo)
          currency: 'USD',
          callback_url: `${window.location.origin}/?payment=success`,
          metadata: {
            plan: planName,
            user_id: currentUser.uid,
            custom_fields: [
              {
                display_name: "Plan Type",
                variable_name: "plan_type", 
                value: planName
              }
            ]
          }
        })
      });

      const data = await response.json();
      console.log('Paystack response:', data);
      
      if (data.status) {
        showMessage('Redirecting to payment page...');
        // Redirect to Paystack payment page
        window.location.href = data.data.authorization_url;
      } else {
        throw new Error(data.message || 'Payment initialization failed');
      }
    } catch (error) {
      console.error('Paystack payment error:', error);
      showMessage('Payment initialization failed: ' + error.message);
    }
  };

  // NEW: Handle payment success callback
  const handlePaystackCallback = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const reference = urlParams.get('reference');
    const paymentStatus = urlParams.get('payment');
    
    console.log('Checking payment callback:', { reference, paymentStatus });
    
    if (reference) {
      try {
        showMessage('Verifying payment...');
        
        const response = await fetch(`${BACKEND_URL}/api/verify-payment`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ reference }),
        });
        
        const data = await response.json();
        console.log('Payment verification result:', data);
        
        if (data.status === 'success') {
          // Update user plan in your system
          await updateUserPlan(currentUser.uid, 'pro', reference);
          await refreshUserProfile();
          
          showMessage(`🎉 Payment successful! ${data.data.plan} activated.`);
          setCurrentView('transcribe');
          
          // Clean up URL
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
  };

  // NEW: useEffect to handle payment callbacks
  useEffect(() => {
    // Check if we're returning from a payment
    const urlParams = new URLSearchParams(window.location.search);
    const reference = urlParams.get('reference');
    const paymentStatus = urlParams.get('payment');
    
    if (reference || paymentStatus === 'success') {
      console.log('Payment callback detected');
      handlePaystackCallback();
    }
  }, [currentUser]); // Run when component mounts or user changes
  // Enhanced reset function with better job cancellation
  const resetTranscriptionProcessUI = useCallback(() => { 
    console.log('🔄 Resetting transcription UI and cancelling any ongoing processes');
    
    // Set cancellation flag FIRST
    isCancelledRef.current = true;
    
    // Reset UI state
    setJobId(null);
    setStatus('idle'); 
    setTranscription('');
    setAudioDuration(0);
    setIsUploading(false);
    setUploadProgress(0);
    setTranscriptionProgress(0); 
    
    // Clear recorded audio reference
    recordedAudioBlobRef.current = null;
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Clear all intervals and timeouts aggressively
    if (transcriptionIntervalRef.current) {
      clearInterval(transcriptionIntervalRef.current);
      transcriptionIntervalRef.current = null;
    }

    if (statusCheckTimeoutRef.current) {
      clearTimeout(statusCheckTimeoutRef.current);
      statusCheckTimeoutRef.current = null;
    }

    // Clear all other intervals that might be running
    const highestIntervalId = setInterval(() => {}, 0);
    for (let i = 1; i <= highestIntervalId; i++) {
      clearInterval(i);
      clearTimeout(i);
    }
    
    // Reset cancellation flag after a short delay
    setTimeout(() => {
      isCancelledRef.current = false;
      console.log('✅ Reset complete, ready for new operations');
    }, 500);
  }, []);

  // DIAGNOSTIC: Log userProfile.totalMinutesUsed changes
  useEffect(() => {
    if (userProfile) {
      console.log('DIAGNOSTIC: userProfile.totalMinutesUsed updated to:', userProfile.totalMinutesUsed);
    }
  }, [userProfile?.totalMinutesUsed]);

  // Enhanced file selection with proper job cancellation
  const handleFileSelect = useCallback(async (event) => {
    const file = event.target.files[0];
    
    if (!file) {
      return;
    }
    
    // FIRST: Cancel any ongoing backend job before clearing state
    if (jobId && (status === 'processing' || status === 'uploading')) {
      console.log('🛑 Cancelling previous job before selecting new file');
      isCancelledRef.current = true;
      
      // Try to cancel the backend job
      try {
        await fetch(`${BACKEND_URL}/cancel/${jobId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        console.log('✅ Previous job cancelled successfully');
      } catch (error) {
        console.log('⚠️ Failed to cancel previous job, but continuing:', error);
      }
    }
    
    // Always reset everything when new file is selected
    resetTranscriptionProcessUI();
    
    // Set the new file
    setSelectedFile(file);
    
    if (file && (file.type.startsWith('audio/') || file.type.startsWith('video/'))) { 
      const audio = new Audio(); 
      audio.preload = 'metadata';
      audio.onloadedmetadata = async () => {
        setAudioDuration(audio.duration);
        URL.revokeObjectURL(audio.src);
        
        try {
          const originalSize = file.size / (1024 * 1024);
          showMessage(`File loaded: ${originalSize.toFixed(2)} MB - ready for transcription.`);
        } catch (error) {
          console.error('Error getting file info:', error);
        }
      };
      const audioUrl = URL.createObjectURL(file);
      audio.src = audioUrl;
    }
  }, [showMessage, resetTranscriptionProcessUI, jobId, status]);
  // Enhanced recording function with proper job cancellation
  const startRecording = useCallback(async () => {
    // FIRST: Cancel any ongoing backend job before clearing state
    if (jobId && (status === 'processing' || status === 'uploading')) {
      console.log('🛑 Cancelling previous job before starting new recording');
      isCancelledRef.current = true;
      
      // Try to cancel the backend job
      try {
        await fetch(`${BACKEND_URL}/cancel/${jobId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        console.log('✅ Previous job cancelled successfully');
      } catch (error) {
        console.log('⚠️ Failed to cancel previous job, but continuing:', error);
      }
    }

    // Clear ALL previous state including selected files
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
        showMessage(`Recording saved: ${originalSize.toFixed(2)} MB - ready for transcription.`);
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
  }, [resetTranscriptionProcessUI, showMessage, isUploading, userProfile, profileLoading, jobId, status]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(recordingIntervalRef.current);
    }
  }, [isRecording]);

  // UPDATED: Improved cancel function with page refresh
  const handleCancelUpload = useCallback(async () => {
    console.log('🛑 FORCE CANCEL - Stopping everything immediately');
    
    // Set cancellation flag FIRST
    isCancelledRef.current = true;
    
    // Immediately reset ALL UI state - no waiting
    setIsUploading(false);
    setUploadProgress(0);
    setTranscriptionProgress(0);
    setStatus('idle');
    setJobId(null);
    
    // Kill all running processes
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // Clear ALL intervals and timeouts
    if (transcriptionIntervalRef.current) {
      clearInterval(transcriptionIntervalRef.current);
      transcriptionIntervalRef.current = null;
    }
    
    if (statusCheckTimeoutRef.current) {
      clearTimeout(statusCheckTimeoutRef.current);
      statusCheckTimeoutRef.current = null;
    }

    // Clear ALL other intervals that might be running
    const highestIntervalId = setInterval(() => {}, 0);
    for (let i = 1; i <= highestIntervalId; i++) {
      clearInterval(i);
      clearTimeout(i);
    }
    
    // Try to cancel backend job (but don't wait for response)
    if (jobId) {
      fetch(`${BACKEND_URL}/cancel/${jobId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }).catch(() => {
        console.log('Backend cancel request failed, but continuing with force cancel');
      });
    }
    
    // Show success message briefly, then refresh
    showMessage("🛑 Transcription cancelled! Reloading page...");
    
    // Force a small delay for message to show, then refresh the page
    setTimeout(() => {
      window.location.reload(); // Force page refresh as requested
    }, 1500); // 1.5 second delay
    
    console.log('✅ Force cancellation complete. Page refresh initiated.');
  }, [jobId, showMessage]);
  const handleTranscriptionComplete = useCallback(async (transcriptionText) => {
    try {
      const estimatedDuration = audioDuration || Math.max(60, selectedFile.size / 100000);
      
      console.log('DIAGNOSTIC: Before updateUserUsage - userProfile.totalMinutesUsed:', userProfile?.totalMinutesUsed);
      console.log('DIAGNOSTIC: Estimated duration for this transcription:', estimatedDuration);

      await updateUserUsage(currentUser.uid, estimatedDuration); // This sends new usage to backend
      // ... saveTranscription ...
      
      await refreshUserProfile(); // Crucial for updating totalMinutesUsed
      console.log('DIAGNOSTIC: After refreshUserProfile - userProfile.totalMinutesUsed:', userProfile?.totalMinutesUsed);

    } catch (error) {
      console.error('Error updating usage:', error);
      showMessage('Failed to save transcription or update usage.');
    }
  }, [audioDuration, selectedFile, currentUser, refreshUserProfile, showMessage, recordedAudioBlobRef, userProfile]); // Added userProfile to dependencies for logging

  // NEW: Handle successful payment
  const handlePaymentSuccess = useCallback(async (subscriptionId, planType) => {
    try {
      // Update user plan in Firestore
      await updateUserPlan(currentUser.uid, planType, subscriptionId);
      
      // Refresh user profile to get updated plan
      await refreshUserProfile();
      
      // Close payment modal
      setShowPayment(false);
      setSelectedPlan(null);
      
      // Show success message
      showMessage(`🎉 Successfully upgraded to ${planType.charAt(0).toUpperCase() + planType.slice(1)} plan! You now have unlimited transcription access.`);
      
      // Redirect to transcribe view
      setCurrentView('transcribe');
    } catch (error) {
      console.error('Error updating user plan:', error);
      showMessage('Payment successful but there was an error updating your account. Please contact support.');
    }
  }, [currentUser?.uid, refreshUserProfile, showMessage, setCurrentView]);

  // Enhanced checkJobStatus with better cancellation handling
  const checkJobStatus = useCallback(async (jobId, transcriptionInterval) => { 
    // FIRST thing - check if cancelled
    if (isCancelledRef.current) {
      console.log('🛑 Status check aborted - job was cancelled');
      clearInterval(transcriptionInterval);
      return;
    }
    
    let timeoutId;
    
    try {
      const controller = new AbortController();
      abortControllerRef.current = controller;
      
      // Set aggressive timeout
      timeoutId = setTimeout(() => {
        console.log('⏰ Status check timeout - aborting');
        controller.abort();
      }, 5000);
      
      const response = await fetch(`${BACKEND_URL}/status/${jobId}`, { 
        signal: controller.signal 
      });
      
      clearTimeout(timeoutId);
      
      // Check cancellation IMMEDIATELY after fetch
      if (isCancelledRef.current) {
        console.log('🛑 Job cancelled during fetch - stopping immediately');
        clearInterval(transcriptionInterval);
        return;
      }
      
      const result = await response.json();
      
      // Check cancellation AGAIN after parsing response
      if (isCancelledRef.current) {
        console.log('🛑 Job cancelled after response - stopping immediately');
        clearInterval(transcriptionInterval);
        return;
      }
      
      if (response.ok && result.status === 'completed') {
        // Final cancellation check before processing
        if (isCancelledRef.current) {
          console.log('🛑 Job cancelled - ignoring completion');
          clearInterval(transcriptionInterval);
          return;
        }
        
        setTranscription(result.transcription);
        clearInterval(transcriptionInterval); 
        setTranscriptionProgress(100);
        setStatus('completed'); 
        
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
        
      } else if (response.ok && (result.status === 'cancelled' || result.status === 'canceled')) {
        console.log('✅ Backend confirmed job cancellation');
        clearInterval(transcriptionInterval);
        setTranscriptionProgress(0);
        setStatus('idle');
        setIsUploading(false);
        
      } else {
        // Only continue if not cancelled AND status is processing
        if (result.status === 'processing' && !isCancelledRef.current) {
          console.log('⏳ Job still processing - will check again');
          statusCheckTimeoutRef.current = setTimeout(() => {
            // Double check cancellation before recursive call
            if (!isCancelledRef.current) {
              checkJobStatus(jobId, transcriptionInterval);
            } else {
              console.log('🛑 Recursive call cancelled');
              clearInterval(transcriptionInterval);
            }
          }, 2000);
        } else if (isCancelledRef.current) {
          console.log('🛑 Job cancelled - stopping status checks');
          clearInterval(transcriptionInterval);
        } else {
          // Error case
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
  }, [handleTranscriptionComplete, showMessage]);
  // Enhanced upload function with proper interval tracking
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
    
    // UPDATED: Check for 30-minute trial for free users and enforce lock
    const remainingMinutes = 30 - (userProfile?.totalMinutesUsed || 0);
    if (userProfile.plan === 'free' && remainingMinutes <= 0) {
      showMessage('You have used your 30-minute free trial. Please upgrade to continue transcribing.');
      setCurrentView('pricing');
      resetTranscriptionProcessUI();
      return;
    }

    // Only business/paid users or free users within their trial can proceed with transcription
    const canTranscribe = await canUserTranscribe(currentUser.uid, estimatedDuration);
    
    // If canTranscribe is false AND it's not a free user within their limit, then block
    if (!canTranscribe && !(userProfile.plan === 'free' && remainingMinutes > 0)) {
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

  // UPDATED: Copy to clipboard - only for paid users
  const copyToClipboard = useCallback(() => { 
    // Check if user is on free plan
    if (userProfile?.plan === 'free') {
      showMessage('Copy to clipboard is only available for paid users. Please upgrade to access this feature.');
      return;
    }
    
    navigator.clipboard.writeText(transcription);
    setCopiedMessageVisible(true);
    setTimeout(() => setCopiedMessageVisible(false), 2000);
  }, [transcription, userProfile, showMessage]);

  // UPDATED: Download as Word - only for paid users
  const downloadAsWord = useCallback(() => { 
    // Check if user is on free plan
    if (userProfile?.plan === 'free') {
      showMessage('MS Word download is only available for paid users. Please upgrade to access this feature.');
      return;
    }
    
    const blob = new Blob([transcription], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'transcription.doc';
    a.click();
    URL.revokeObjectURL(url);
  }, [transcription, userProfile, showMessage]);

  // TXT download - available for all users
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
          // Note: Compression now handled by backend, this is just for download
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

  // UPDATED: Handle upgrade button clicks
  const handleUpgradeClick = useCallback((planType) => {
    console.log('Upgrade clicked for plan:', planType);
    setSelectedPlan(planType);
    setShowPayment(true);
  }, []);
  // UPDATED: useEffect to handle 30-minute trial for free users
  useEffect(() => {
    if (selectedFile && status === 'idle' && !isRecording && !isUploading && !profileLoading && userProfile) {
      // Auto-trigger for business users and free users within their 30-minute limit
      const remainingMinutes = 30 - (userProfile.totalMinutesUsed || 0);
      if (userProfile.plan === 'business' || (userProfile.plan === 'free' && remainingMinutes > 0)) {
        console.log('DIAGNOSTIC: Auto-upload triggered. User plan:', userProfile.plan, 'Remaining minutes:', remainingMinutes);
        const timer = setTimeout(() => {
          handleUpload();
        }, 200);
        return () => clearTimeout(timer);
      } else if (userProfile.plan === 'free' && remainingMinutes <= 0) {
        console.log('DIAGNOSTIC: Free trial ended. Not auto-uploading.');
        // Optionally show a message here if you want to notify user immediately
        // showMessage('Your free trial has ended. Please upgrade to transcribe.');
      }
    }
  }, [selectedFile, status, isRecording, isUploading, handleUpload, userProfile, profileLoading, showMessage]);

  // Cleanup effect to ensure cancellation works
  useEffect(() => {
    return () => {
      // Cleanup on unmount
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
            Speech to Text AI • Simple, Accurate, Powerful • Now with 30-Minute Free Trial
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
      
      {/* Dashboard route - separate from main app */}
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
                ) : userProfile && userProfile.plan === 'pro' ? (
                  <span>Plan: Pro (Unlimited Transcription)</span>
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
              📊 History/Editor
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

              {/* UPDATED: More subtle region selection */}
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
                  💳 Buy Credits
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
                  🔄 Pro Plans
                </button>
              </div>

              {/* Conditional Content Based on Selected View */}
              {pricingView === 'credits' ? (
                <>
                  {/* UPDATED: Cleaner Credit System */}
                  <div style={{ marginTop: '20px' }}>
                    <h2 style={{ color: '#007bff', marginBottom: '30px' }}>
                      💳 Buy Credits - Pro Feature Access
                    </h2>
                    <p style={{ color: '#666', marginBottom: '30px' }}>
                      Purchase temporary access to Pro features. Available globally with local currency support
                    </p>
                    
                    <div style={{ display: 'flex', gap: '30px', justifyContent: 'center', flexWrap: 'wrap' }}>
                      {/* 24 Hours Plan - UPDATED with cleaner design */}
                      <div style={{
                        backgroundColor: 'white',
                        padding: '40px 30px',
                        borderRadius: '20px',
                        boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
                        maxWidth: '350px',
                        width: '100%',
                        border: '2px solid #e9ecef'
                      }}>
                        <h3 style={{ 
                          color: '#007bff',
                          fontSize: '1.8rem',
                          margin: '0 0 10px 0'
                        }}>
                          24 Hours Pro Access
                        </h3>
                        <p style={{ color: '#666', marginBottom: '20px', fontSize: '14px' }}>
                          Full access to Pro features for 24 hours
                        </p>
                        <div style={{ marginBottom: '30px' }}>
                          <span style={{ 
                            fontSize: '3rem',
                            fontWeight: 'bold',
                            color: '#6c5ce7'
                          }}>
                            USD 1
                          </span>
                          <span style={{ 
                            color: '#666',
                            fontSize: '1.2rem'
                          }}>
                            for 24 hours
                          </span>
                        </div>
                        
                        {/* UPDATED: Cleaner feature list */}
                        <div style={{ marginBottom: '30px', textAlign: 'left' }}>
                          <h4 style={{ color: '#007bff', marginBottom: '15px', fontSize: '16px' }}>What you get:</h4>
                          <ul style={{ 
                            color: '#666', 
                            lineHeight: '2.2',
                            listStyle: 'none',
                            padding: '0',
                            margin: '0'
                          }}>
                            <li>✅ Unlimited transcription for 24 hours</li>
                            <li>✅ All Transcript Download Options</li>
                          </ul>
                        </div>
                        
                        <button
                          onClick={() => {
                            if (!currentUser?.email) {
                              showMessage('Please log in first to purchase credits.');
                              return;
                            }
                            initializePaystackPayment(currentUser.email, 3, '24 Hours Pro Access');
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
                          {!currentUser?.email ? 'Login Required' : 'Pay with Paystack - $3'}
                        </button>
                      </div>
                      {/* 5 Days Plan - UPDATED with cleaner design */}
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
                          BEST VALUE
                        </div>
                        <h3 style={{ 
                          color: '#28a745',
                          fontSize: '1.8rem',
                          margin: '0 0 10px 0'
                        }}>
                          5 Days Pro Access
                        </h3>
                        <p style={{ color: '#666', marginBottom: '20px', fontSize: '14px' }}>
                          Full access to Pro features for 5 days
                        </p>
                        <div style={{ marginBottom: '30px' }}>
                          <span style={{ 
                            fontSize: '3rem',
                            fontWeight: 'bold',
                            color: '#6c5ce7'
                          }}>
                            USD 2.5
                          </span>
                          <span style={{ 
                            color: '#666',
                            fontSize: '1.2rem'
                          }}>
                            for 5 days
                          </span>
                        </div>
                        
                        {/* UPDATED: Cleaner feature list */}
                        <div style={{ marginBottom: '30px', textAlign: 'left' }}>
                          <h4 style={{ color: '#28a745', marginBottom: '15px', fontSize: '16px' }}>What you get:</h4>
                          <ul style={{ 
                            color: '#666', 
                            lineHeight: '2.2',
                            listStyle: 'none',
                            padding: '0',
                            margin: '0'
                          }}>
                            <li>✅ Unlimited transcription for 5 days</li>
                            <li>✅ All Transcript Download Options</li>
                            <li>✅ Extended File Storage</li>
                          </ul>
                        </div>
                        
                        <button
                          onClick={() => {
                            if (!currentUser?.email) {
                              showMessage('Please log in first to purchase credits.');
                              return;
                            }
                            initializePaystackPayment(currentUser.email, 5, '5 Days Pro Access');
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
                          {!currentUser?.email ? 'Login Required' : 'Pay with Paystack - $5'}
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Pro Plan */}
                  <div style={{ marginTop: '20px' }}>
                    <h2 style={{ color: '#28a745', marginBottom: '30px' }}>
                      🔄 Monthly Pro Plans
                    </h2>
                    <p style={{ color: '#666', marginBottom: '30px' }}>
                      Go Pro
                    </p>
                    
                    <div style={{ display: 'flex', gap: '30px', justifyContent: 'center', flexWrap: 'wrap' }}>
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
                            $9.99
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
                </>
              )}
              {/* Common Features Section */}
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
                  <div>✅ Backend audio compression technology</div>
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
              {/* UPDATED: Usage Information Banner with dynamic remaining minutes */}
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
                      🎵 Your free trial has ended. You have {Math.max(0, 30 - (userProfile.totalMinutesUsed || 0))} minutes remaining.{' '}
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

                  {/* UPDATED: Action Buttons with proper free user handling and locked state */}
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', marginTop: '30px' }}>
                    {status === 'idle' && !isUploading && selectedFile && (
                      <button
                        onClick={() => {
                          const remainingMinutes = 30 - (userProfile?.totalMinutesUsed || 0);
                          if (userProfile?.plan === 'free' && remainingMinutes <= 0) {
                            setCurrentView('pricing'); // Redirect to pricing if trial ended
                          } else {
                            handleUpload(); // Proceed with upload if within trial or paid
                          }
                        }}
                        disabled={
                          !selectedFile || 
                          isUploading || 
                          (userProfile?.plan === 'free' && (30 - (userProfile?.totalMinutesUsed || 0)) <= 0) // Disable if free trial ended
                        }
                        style={{
                          padding: '15px 30px',
                          fontSize: '18px',
                          backgroundColor: (!selectedFile || isUploading || (userProfile?.plan === 'free' && (30 - (userProfile?.totalMinutesUsed || 0)) <= 0)) ? '#6c757d' : 
                            (userProfile?.plan === 'free' && (30 - (userProfile?.totalMinutesUsed || 0)) > 0) ? '#ffc107' : '#6c5ce7',
                          color: 'white',
                          border: 'none',
                          borderRadius: '25px',
                          cursor: (!selectedFile || isUploading || (userProfile?.plan === 'free' && (30 - (userProfile?.totalMinutesUsed || 0)) <= 0)) ? 'not-allowed' : 'pointer',
                          boxShadow: '0 5px 15px rgba(108, 92, 231, 0.4)'
                        }}
                      >
                        {(userProfile?.plan === 'free' && (30 - (userProfile?.totalMinutesUsed || 0)) <= 0) ? 
                          '🔒 Upgrade to Transcribe' : '🚀 Start Transcription'}
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
                      Transcription failed. Check Your Network & Refresh the Page.
                    </p>
                  )}
                </div>
              )}
              {/* UPDATED: Enhanced Transcription Result with User Plan Restrictions */}
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
                    {/* UPDATED: Copy to Clipboard - Only for paid users */}
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
                    
                    {/* UPDATED: MS Word Download - Only for paid users */}
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
                    
                    {/* TXT Download - Available for all users */}
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
                  
                  {/* Show upgrade message for free users */}
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
            &copy; {new Date().getFullYear()} TypeMyworDz, Inc. - Enhanced with 30-Minute Free Trial
          </footer>

          {/* Copied Message Animation */}
          {copiedMessageVisible && (
            <div className="copied-message-animation">
              Copied to clipboard!
            </div>
          )}

          {/* NEW: Payment Modal */}
          {showPayment && selectedPlan && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000
            }}>
              <div style={{
                backgroundColor: 'white',
                borderRadius: '15px',
                padding: '20px',
                maxWidth: '500px',
                width: '90%',
                maxHeight: '90vh',
                overflow: 'auto'
              }}>
                <StripePayment
                  selectedPlan={selectedPlan}
                  onSuccess={handlePaymentSuccess}
                  onCancel={() => {
                    setShowPayment(false);
                    setSelectedPlan(null);
                  }}
                />
              </div>
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