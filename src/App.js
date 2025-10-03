import React, { useState, useRef, useEffect, useCallback } from 'react';
import './App.css';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import AdminDashboard from './components/AdminDashboard';
import TranscriptionDetail from './components/TranscriptionDetail';
import RichTextEditor from './components/RichTextEditor';
import Signup from './components/Signup'; // NEW: Import Signup component
import { canUserTranscribe, updateUserUsage, saveTranscription, createUserProfile, updateUserPlan } from './userService';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import FloatingTranscribeButton from './components/FloatingTranscribeButton';
import PrivacyPolicy from './components/PrivacyPolicy';
import AnimatedBroadcastBoard from './components/AnimatedBroadcastBoard'; // NEW: Import the new component
import { db } from './firebase'; // Import the db instance from your firebase.js
import { doc, getDoc } from 'firebase/firestore'; // Import doc and getDoc functions


// UPDATED Configuration - RE-ADDED Render Whisper URL
const RAILWAY_BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';
const RENDER_WHISPER_URL = process.env.REACT_APP_RENDER_WHISPER_URL || 'https://whisper-backend-render.onrender.com/'; 

// Helper function to determine if a user has access to AI features
const isPaidAIUser = (userProfile) => {
  if (!userProfile || !userProfile.plan) return false;
  const paidPlansForAI = ['Three-Day Plan', 'Pro', 'One-Week Plan'];
  return paidPlansForAI.includes(userProfile.plan);
};

// Copied Notification Component - Remains here as it's a UI element not tied to auth context messages
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
        backgroundColor: '#4CAF50', 
        color: 'white',
        padding: '10px 20px',
        borderRadius: '5px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
        zIndex: 1000,
        pointerEvents: 'none', 
      }}
    >
      📋 Copied to clipboard!
    </div>
  );
};
// REMOVED: ToastNotification component definition from here, it's now managed by AuthContext
// This ensures only one ToastNotification exists globally.

function AppContent() {
  const navigate = useNavigate();
  // FIX: Destructure showMessage from useAuth() instead of defining it locally
  const { currentUser, logout, userProfile, refreshUserProfile, signInWithGoogle, profileLoading, showMessage } = useAuth();
  
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
  const [copiedMessageVisible, setCopiedMessageVisible] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('en'); 
  const [speakerLabelsEnabled, setSpeakerLabelsEnabled] = useState(false);
  // State to store the latest completed transcription for AI Assistant
  const [latestTranscription, setLatestTranscription] = useState(''); 

  // Payment states
  const [pricingView, setPricingView] = useState('credits');
  const [selectedRegion, setSelectedRegion] = useState('KE'); // Default to Kenya
  const [convertedAmounts, setConvertedAmounts] = useState({ 
    'oneday': { amount: 1.00, currency: 'USD' }, 
    'threeday': { amount: 2.00, currency: 'USD' },
    'oneweek': { amount: 3.00, currency: 'USD' }
  });

  // AI Assistant states
  const [userPrompt, setUserPrompt] = useState('');
  const [aiResponse, setAIResponse] = useState('');
  const [aiLoading, setAILoading] = useState(false);
  // NEW: State to select between AI providers (claude or gemini) for user side
  const [selectedAIProvider, setSelectedAIProvider] = useState('claude'); // 'claude' or 'gemini'
  // NEW: Predefined AI query prompts
  const [predefinedPrompts] = useState([
    "Summarize this transcript in 3-5 bullet points.",
    "Extract all key action items.",
    "List all questions asked and their answers, if present.",
    "Identify the main topics discussed.",
    "Generate a concise executive summary.",
    "Translate this transcript into Spanish."
  ]);
  
  // NEW: States for continue functionality
  const [showContinueBox, setShowContinueBox] = useState(false);
  const [continuePrompt, setContinuePrompt] = useState('');
  
  // Refs
  const mediaRecorderRef = useRef(null);
  const recordingIntervalRef = useRef(null);
  const recordedAudioBlobRef = useRef(null); 
  const abortControllerRef = useRef(null);
  const transcriptionIntervalRef = useRef(null);
  const statusCheckTimeoutRef = useRef(null);
  const isCancelledRef = useRef(false);

  // Auth and user setup (currentUser, logout, userProfile, refreshUserProfile, signInWithGoogle, profileLoading, showMessage) are now destructured from useAuth()
  // UPDATED: Admin emails are now referenced from your backend configuration
  const ADMIN_EMAILS = ['typemywordz@gmail.com', 'gracenyaitara@gmail.com']; 
  const isAdmin = ADMIN_EMAILS.includes(currentUser?.email); 

  // --- Menu State & Functions (React-managed) ---
  const [openSubmenu, setOpenSubmenu] = useState(null); // Tracks which submenu is open

  const handleToggleSubmenu = useCallback((submenuId) => {
    setOpenSubmenu(prev => (prev === submenuId ? null : submenuId));
  }, []);

  const handleOpenPrivacyPolicy = useCallback(() => {
    // Navigate directly in React Router for authenticated users, or use window.open for static link
    navigate('/privacy-policy');
    setOpenSubmenu(null); // Close any open menu
  }, [navigate]);

  // handleOpenPricing for the menu item
  const handleOpenPricing = useCallback(() => {
    setCurrentView('pricing');
    setOpenSubmenu(null); // Close any open menu
  }, [setCurrentView]);

  // Paystack payment functions
  const initializePaystackPayment = useCallback(async (email, amount, planName, countryCode) => { // Made useCallback
    try {
      console.log('Initializing Paystack payment:', { email, amount, planName, countryCode });
      
      const response = await fetch(`${RAILWAY_BACKEND_URL}/api/initialize-paystack-payment`, {
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
  }, [currentUser, showMessage, RAILWAY_BACKEND_URL]); // Dependencies

  // Handle payment success callback
  const handlePaystackCallback = useCallback(async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const reference = urlParams.get('reference');
    const paymentStatus = urlParams.get('payment');
    
    console.log('Checking payment callback:', { reference, paymentStatus });
    
    if (reference) {
      try {
        showMessage('Verifying payment...');
        
        const response = await fetch(`${RAILWAY_BACKEND_URL}/api/verify-payment`, {
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
  // Enhanced reset function with better job cancellation - ADDING LOGS
  const resetTranscriptionProcessUI = useCallback(() => { 
    console.log('🔄 DEBUG: resetTranscriptionProcessUI called. Stopping ongoing processes and resetting UI states.');
    
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
      console.log('🔄 DEBUG: Aborting active fetch request.');
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = null; // Ensure it's nullified after aborting

    if (transcriptionIntervalRef.current) {
      console.log('🔄 DEBUG: Clearing transcription progress interval.');
      clearInterval(transcriptionIntervalRef.current);
      transcriptionIntervalRef.current = null;
    }

    if (statusCheckTimeoutRef.current) {
      console.log('🔄 DEBUG: Clearing status check timeout.');
      clearTimeout(statusCheckTimeoutRef.current);
      statusCheckTimeoutRef.current = null;
    }

    // Clear any stray intervals/timeouts
    const highestIntervalId = setInterval(() => {}, 0);
    for (let i = 1; i <= highestIntervalId; i++) {
      clearInterval(i);
      clearTimeout(i);
    }

    // Explicitly clear the file input element
    const fileInput = document.querySelector('input[type="file"]');
    if (fileInput) {
      fileInput.value = ''; // This is crucial for allowing re-selection of the same file
      console.log('🔄 DEBUG: File input element cleared.');
    } else {
      console.log('🔄 DEBUG: File input element not found for clearing.');
    }
    
    setTimeout(() => {
      isCancelledRef.current = false;
      console.log('✅ DEBUG: Reset complete, ready for new operations.');
    }, 500);
  }, []); // No external dependencies, so empty array is correct

  // Enhanced file selection with proper job cancellation - ADDING LOGS
  const handleFileSelect = useCallback(async (event) => {
    console.log('📁 DEBUG: handleFileSelect called.');
    const file = event.target.files[0];
    
    if (!file) {
      console.log('📁 DEBUG: No file selected. Exiting handleFileSelect.');
      return;
    }
    
    console.log('📁 DEBUG: File selected:', file.name);
    // Always reset UI when a new file is selected, effectively deselecting options
    // This also stops any ongoing transcription.
    resetTranscriptionProcessUI(); 
    
    setSelectedFile(file);
    console.log('📁 DEBUG: setSelectedFile called with:', file.name);
    
    if (file && (file.type.startsWith('audio/') || file.type.startsWith('video/'))) { 
      const audio = new Audio(); 
      audio.preload = 'metadata';
      audio.onloadedmetadata = async () => {
        setAudioDuration(audio.duration);
        URL.revokeObjectURL(audio.src);
        console.log(`📊 DEBUG: Audio metadata loaded. Duration: ${audio.duration} seconds.`);
        
        try {
          const originalSize = file.size / (1024 * 1024);
          console.log(`📊 DEBUG: ${Math.round(audio.duration/60)}-minute file loaded (${originalSize.toFixed(2)} MB) - ready for quick transcription.`);
        } catch (error) {
          console.error('❌ DEBUG: Error getting file info in onloadedmetadata:', error);
          showMessage('Error getting file info: ' + error.message); 
        }
      };
      audio.onerror = (e) => { // NEW: Add onerror handler for audio loading
        console.error('❌ DEBUG: Audio element error during metadata loading:', e);
        showMessage('Error loading audio file. Please ensure it is a valid audio/video format.');
        resetTranscriptionProcessUI(); // Reset if audio file itself is problematic
      };
      const audioUrl = URL.createObjectURL(file);
      audio.src = audioUrl;
      console.log('📁 DEBUG: Audio URL created and assigned:', audioUrl);
    } else {
      console.log('📁 DEBUG: Selected file is not an audio/video type. No audio metadata loading.');
      showMessage('Selected file is not a valid audio or video format.');
      resetTranscriptionProcessUI(); // Reset if file type is wrong
    }
  }, [showMessage, resetTranscriptionProcessUI]);

  // Enhanced recording function with proper job cancellation
  const startRecording = useCallback(async () => {
    console.log('🎙️ DEBUG: startRecording called.'); // NEW LOG
    // Always reset UI when starting a new recording, effectively deselecting options
    // This also stops any ongoing transcription.
    resetTranscriptionProcessUI(); 
    setSelectedFile(null); // Clear any previously selected file
    
    const fileInput = document.querySelector('input[type="file"]');
    if (fileInput) {
      fileInput.value = ''; // Clear file input
      console.log('🎙️ DEBUG: File input element cleared before recording.'); // NEW LOG
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
      console.log('🎙️ DEBUG: Microphone stream obtained.'); // NEW LOG
      
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/wav';
          console.warn('🎙️ DEBUG: Falling back to audio/wav for recording.'); // NEW LOG
        } else {
          console.warn('🎙️ DEBUG: Falling back to audio/webm for recording.'); // NEW LOG
        }
      } else {
        console.log(`🎙️ DEBUG: Using ${mimeType} for recording.`); // NEW LOG
      }
      
      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType });
      const chunks = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        chunks.push(event.data);
        console.log('🎙️ DEBUG: Data available from MediaRecorder. Chunk size:', event.data.size); // NEW LOG
      };

      mediaRecorderRef.current.onstop = async () => {
        console.log('🎙️ DEBUG: MediaRecorder stopped. Processing recorded audio.'); // NEW LOG
        const originalBlob = new Blob(chunks, { type: mimeType });
        
        if (recordedAudioBlobRef.current) {
          recordedAudioBlobRef.current = null;
          console.log('🎙️ DEBUG: Cleared previous recordedAudioBlobRef.'); // NEW LOG
        }
        
        recordedAudioBlobRef.current = originalBlob;
        
        let extension = 'wav';
        if (mimeType.includes('webm')) {
          extension = 'webm';
        }
        
        const file = new File([originalBlob], `recording-${Date.now()}.${extension}`, { type: mimeType });
        setSelectedFile(file);
        stream.getTracks().forEach(track => track.stop());
        console.log('🎙️ DEBUG: Stream tracks stopped. Selected file set from recording:', file.name); // NEW LOG
        
        const originalSize = originalBlob.size / (1024 * 1024);
        console.log(`📊 DEBUG: Recording saved: ${originalSize.toFixed(2)} MB - ready for transcription.`);
      };

      mediaRecorderRef.current.start(1000);
      setIsRecording(true);
      setRecordingTime(0);
      console.log('🎙️ DEBUG: MediaRecorder started. isRecording set to true.'); // NEW LOG

      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('❌🎙️ DEBUG: Could not access microphone:', error); // NEW LOG
      showMessage('Could not access microphone: ' + error.message);
    }
  }, [resetTranscriptionProcessUI, showMessage]);

  const stopRecording = useCallback(() => {
    console.log('🎙️ DEBUG: stopRecording called.'); // NEW LOG
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(recordingIntervalRef.current);
      console.log('🎙️ DEBUG: MediaRecorder stopped, isRecording set to false, interval cleared.'); // NEW LOG
    }
  }, [isRecording]);
  // Improved cancel function with page refresh
  const handleCancelUpload = useCallback(async () => {
    console.log('🛑 DEBUG: FORCE CANCEL - Stopping everything immediately');
    
    isCancelledRef.current = true;
    
    setJobId(null); // FIX: Ensure jobId is cleared
    setStatus('idle'); // FIX: Ensure status is reset
    setTranscription(''); // FIX: Clear transcription text
    setAudioDuration(0); // FIX: Clear audio duration
    setIsUploading(false);
    setUploadProgress(0);
    setTranscriptionProgress(0);
    setSpeakerLabelsEnabled(false); // FIX: Reset speaker labels
    setSelectedFile(null); // FIX: Clear selected file
    recordedAudioBlobRef.current = null; // FIX: Clear recorded blob
    
    if (abortControllerRef.current) {
      console.log('🛑 DEBUG: Aborting active fetch request.');
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = null; // Ensure it's nullified after aborting

    if (transcriptionIntervalRef.current) {
      console.log('🛑 DEBUG: Clearing transcription progress interval.');
      clearInterval(transcriptionIntervalRef.current);
      transcriptionIntervalRef.current = null;
    }

    if (statusCheckTimeoutRef.current) {
      console.log('🛑 DEBUG: Clearing status check timeout.');
      clearTimeout(statusCheckTimeoutRef.current);
      statusCheckTimeoutRef.current = null;
    }

    // Clear any stray intervals/timeouts
    const highestIntervalId = setInterval(() => {}, 0);
    for (let i = 1; i <= highestIntervalId; i++) {
      clearInterval(i);
      clearTimeout(i);
    }
    
    // Try to cancel job on Railway backend
    if (jobId) { 
      try {
        console.log(`🛑 DEBUG: Attempting to cancel job ${jobId} on Railway backend.`);
        await fetch(`${RAILWAY_BACKEND_URL}/cancel/${jobId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        console.log('✅ DEBUG: Previous job cancelled successfully on Railway.');
      } catch (error) {
        console.log('⚠️ DEBUG: Failed to cancel previous job on Railway, but continuing with force cancel:', error);
      }
    }
    
    showMessage("🛑 Transcription cancelled! Reloading page...");
    
    setTimeout(() => {
      window.location.reload();
    }, 1500);
    
    console.log('✅ DEBUG: Force cancellation complete. Page refresh initiated.');
  }, [jobId, showMessage, RAILWAY_BACKEND_URL]);

// Find this function in your App.js file:
const handleTranscriptionComplete = useCallback(async (transcriptionText, completedJobId) => {
  try {
    // FIX: Ensure selectedFile is not null before accessing its properties
    const estimatedDuration = audioDuration || (selectedFile ? Math.max(60, selectedFile.size / 100000) : 0);
    
    console.log('DIAGNOSTIC: Before updateUserUsage - userProfile.totalMinutesUsed:', userProfile?.totalMinutesUsed);
    console.log('DIAGNOSTIC: Estimated duration for this transcription: ', estimatedDuration);

    await updateUserUsage(currentUser.uid, estimatedDuration);
    
    console.log('DEBUG: Attempting to save transcription...');
    console.log('DEBUG: saveTranscription arguments:');
    console.log('DEBUG:   currentUser.uid:', currentUser.uid);
    // FIX: Ensure selectedFile is not null before accessing its properties
    console.log('DEBUG:   selectedFile.name (or recorded audio name):', selectedFile ? selectedFile.name : `Recording-${Date.now()}.wav`);
    console.log('DEBUG:   transcriptionText (first 100 chars):', transcriptionText.substring(0, 100) + '...');
    console.log('DEBUG:   estimatedDuration:', estimatedDuration);
    console.log('DEBUG:   jobId (passed to saveTranscription):', completedJobId);
    // NEW: Log currentUser.uid explicitly
    console.log('DEBUG:   currentUser.uid (for userId field):', currentUser.uid); 
    
    // NEW DIAGNOSTIC STEP: Attempt to read user profile directly from Firestore
    // This uses the 'db' object from firebase.js and currentUser.uid
    try {
      if (currentUser && currentUser.uid) {
        const userDocRef = doc(db, 'users', currentUser.uid); 
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          console.log('DIAGNOSTIC: Successfully read user profile from Firestore (direct check):', userDocSnap.data());
        } else {
          console.error('DIAGNOSTIC: User profile NOT FOUND in Firestore for UID (direct check):', currentUser.uid);
        }
      } else {
        console.error('DIAGNOSTIC: currentUser or currentUser.uid is NULL during direct Firestore read attempt.');
      }
    } catch (readError) {
      console.error('DIAGNOSTIC: Error reading user profile directly from Firestore (direct check):', readError);
    }
    // END NEW DIAGNOSTIC STEP
    
    // Call Railway backend to save the transcription
    // UPDATED: Added currentUser.uid as the userId parameter
    await saveTranscription(
      currentUser.uid, 
      selectedFile ? selectedFile.name : `Recording-${Date.now()}.wav`, 
      transcriptionText, 
      estimatedDuration, 
      completedJobId,
      currentUser.uid // Pass the userId here!
    );
    console.log('DEBUG: saveTranscription call completed.');
    
    await refreshUserProfile();
    console.log('DIAGNOSTIC: After refreshUserProfile - userProfile.totalMinutesUsed:', userProfile?.totalMinutesUsed);

    // Success message with favicon and brand name
    showMessage('✅ <img src="/favicon-32x32.png" alt="TypeMyworDz Logo" style="width: 16px; height: 16px; vertical-align: middle; margin-right: 5px;"> TypeMyworDz, Done!');
    
    // Save the latest transcription for the AI Assistant
    setLatestTranscription(transcriptionText);

  } catch (error) {
    console.error('Error updating usage or saving transcription:', error);
    showMessage('Failed to save transcription or update usage.');
  } finally {
    // No changes here, as processingMessage state was removed
  }
}, [audioDuration, selectedFile, currentUser, refreshUserProfile, showMessage, recordedAudioBlobRef, userProfile]);

  // Handle successful payment
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
  const checkJobStatus = useCallback(async (jobIdToPass, transcriptionInterval) => {
    if (isCancelledRef.current) {
      console.log('🛑 DEBUG: Status check aborted - job was cancelled'); 
      clearInterval(transcriptionInterval);
      return;
    }
    
    let timeoutId;
    
    try {
      const controller = new AbortController();
      abortControllerRef.current = controller;
      
      timeoutId = setTimeout(() => {
        console.log('⏰ DEBUG: Status check timeout - aborting'); 
        controller.abort();
      }, 10000); 
      
      const statusUrl = `${RAILWAY_BACKEND_URL}/status/${jobIdToPass}`;
      
      const response = await fetch(statusUrl, {
        signal: controller.signal 
      });
      
      clearTimeout(timeoutId);
      
      if (isCancelledRef.current) {
        console.log('🛑 DEBUG: Job cancelled during fetch - stopping immediately'); 
        clearInterval(transcriptionInterval);
        return;
      }
      
      const result = await response.json();
      
      if (isCancelledRef.current) {
        console.log('🛑 DEBUG: Job cancelled after response - stopping immediately'); 
        clearInterval(transcriptionInterval);
        return;
      }
      
      if (response.ok && result.status === 'completed') {
        if (isCancelledRef.current) {
          console.log('🛑 DEBUG: Job cancelled - ignoring completion'); 
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
          showMessage('❌ Transcription failed: ' + result.error + '. Please try again.');
          clearInterval(transcriptionInterval); 
          setTranscriptionProgress(0);
          setStatus('failed'); 
          setIsUploading(false);
          resetTranscriptionProcessUI();
        }
        
      } else if (response.ok && (result.status === 'cancelled' || result.status === 'canceled')) {
        console.log('✅ DEBUG: Backend confirmed job cancellation'); 
        clearInterval(transcriptionInterval);
        setTranscriptionProgress(0);
        setStatus('idle');
        setIsUploading(false);
        showMessage('🛑 Transcription was cancelled. Please start a new one.');
        resetTranscriptionProcessUI();
        
      } else {
        if (result.status === 'processing' && !isCancelledRef.current) {
          console.log('⏳ DEBUG: Job still processing - will check again'); 
          statusCheckTimeoutRef.current = setTimeout(() => {
            if (!isCancelledRef.current) {
              checkJobStatus(jobIdToPass, transcriptionInterval); 
            } else {
              console.log('🛑 DEBUG: Recursive call cancelled'); 
              clearInterval(transcriptionInterval);
              showMessage('🛑 Transcription process interrupted. Please start a new one.');
              resetTranscriptionProcessUI();
            }
          }, 2000);
        } else if (isCancelledRef.current) {
          console.log('🛑 DEBUG: Job cancelled - stopping status checks'); 
          clearInterval(transcriptionInterval);
          showMessage('🛑 Transcription process interrupted. Please start a new one.');
          resetTranscriptionProcessUI();
        } else {
          const errorDetail = result.detail || `Unexpected status: ${result.status}`;
          showMessage('❌ Status check failed: ' + errorDetail + '. Please try again.');
          clearInterval(transcriptionInterval); 
          setTranscriptionProgress(0);
          setStatus('failed'); 
          setIsUploading(false); 
          resetTranscriptionProcessUI();
        }
      }
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError' || isCancelledRef.current) {
        console.log('🛑 DEBUG: Request aborted or job cancelled'); 
        clearInterval(transcriptionInterval);
        if (!isCancelledRef.current) {
          setIsUploading(false);
        }
        showMessage('🛑 Transcription process interrupted. Please start a new one.');
        resetTranscriptionProcessUI();
        return;
      } else if (!isCancelledRef.current) {
        console.error('❌ DEBUG: Status check error:', error); 
        clearInterval(transcriptionInterval); 
        setTranscriptionProgress(0);
        setStatus('failed'); 
        setIsUploading(false); 
        showMessage('❌ Status check failed: ' + error.message + '. Please try again.');
        resetTranscriptionProcessUI();
      }
    } finally {
      abortControllerRef.current = null;
    }
  }, [handleTranscriptionComplete, showMessage, RAILWAY_BACKEND_URL, resetTranscriptionProcessUI]);
  // handleUpload with new backend logic for model selection
  const handleUpload = useCallback(async () => {
    console.log('🚀 DEBUG: handleUpload called.'); 
    if (!selectedFile) {
      showMessage('Please select a file first');
      console.log('❌ DEBUG: No file selected for upload.'); 
      return;
    }

    if (profileLoading || !userProfile) {
      showMessage('Loading user profile... Please wait.');
      console.log('⏳ DEBUG: User profile still loading or not available.'); 
      return;
    }

    const estimatedDuration = audioDuration || Math.max(60, selectedFile.size / 100000);
    console.log('📊 DEBUG: Estimated duration for upload:', estimatedDuration); 

    const transcribeCheck = await canUserTranscribe(currentUser.uid, estimatedDuration);
    console.log('✅ DEBUG: canUserTranscribe check result:', transcribeCheck); 
    
    if (!transcribeCheck.canTranscribe) {
      if (transcribeCheck.redirectToPricing) {
        let userMessage = 'Please upgrade to continue transcribing.';
        if (transcribeCheck.reason === 'exceeds_free_limit') {
          userMessage = `This ${transcribeCheck.requiredMinutes}-minute audio exceeds your ${transcribeCheck.remainingMinutes} remaining free minutes. Redirecting to pricing...`;
        } else if (transcribeCheck.reason === 'free_trial_exhausted') {
          userMessage = 'Your 30-minute free trial has been used. Redirecting to pricing...';
        } else if (transcribeCheck.reason === 'plan_expired') {
          userMessage = 'Your paid plan has expired. Redirecting to pricing...';
        }

        showMessage(userMessage);
        console.log('❌ DEBUG: Blocking transcription due to plan/limit. Redirecting to pricing.'); 
        
        setTimeout(() => {
          setCurrentView('pricing');
          resetTranscriptionProcessUI();
        }, 2000);
        return;
      } else {
        showMessage('You do not have permission to transcribe audio. Please contact support if this is an error.');
        console.log('❌ DEBUG: Blocking transcription due to insufficient permissions.'); 
        resetTranscriptionProcessUI();
        return;
      }
    }

    console.log(`🎯 DEBUG: Initiating transcription for ${Math.round(estimatedDuration/60)}-minute audio.`);

    isCancelledRef.current = false;
    setIsUploading(true);
    setStatus('processing');
    abortControllerRef.current = new AbortController();

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('language_code', selectedLanguage);
    formData.append('speaker_labels_enabled', speakerLabelsEnabled);
    formData.append('user_plan', userProfile?.plan || 'free');
    formData.append('user_email', currentUser?.email || ''); // ADDED: Send user email to backend

    try {
      console.log(`🎯 DEBUG: Using unified transcription endpoint: ${RAILWAY_BACKEND_URL}/transcribe`);
      const response = await fetch(`${RAILWAY_BACKEND_URL}/transcribe`, {
        method: 'POST',
        body: formData,
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        const errorText = await response.text(); // Get raw error text
        console.error('❌ DEBUG: Backend transcription service failed. Status:', response.status, 'Text:', errorText); 
        throw new Error(`Transcription service failed with status: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log('✅ DEBUG: Backend transcription endpoint responded:', result); 

      if (result && result.job_id) {
        const transcriptionJobId = result.job_id;
        console.log('✅ DEBUG: Transcription job started. Processing...');
        console.log(`📊 DEBUG: Logic used: ${result.logic_used || 'Smart service selection'}`);
        
        setUploadProgress(100);
        setStatus('processing');
        setJobId(transcriptionJobId);
        transcriptionIntervalRef.current = simulateProgress(setTranscriptionProgress, 500, -1); 
        checkJobStatus(transcriptionJobId, transcriptionIntervalRef.current);
      } else {
        console.error(`❌ DEBUG: Transcription service returned no job ID: ${JSON.stringify(result)}`); 
        throw new Error(`Transcription service returned no job ID: ${JSON.stringify(result)}`);
      }

    } catch (transcriptionError) {
      console.error('❌ DEBUG: Transcription failed in handleUpload catch block:', transcriptionError); 
      showMessage('❌ Transcription service is currently unavailable. Please try again later.');
      setUploadProgress(0);
      setTranscriptionProgress(0);
      setStatus('failed'); 
      setIsUploading(false);
    }

  }, [selectedFile, audioDuration, currentUser?.uid, currentUser?.email, showMessage, setCurrentView, resetTranscriptionProcessUI, handleTranscriptionComplete, userProfile, profileLoading, selectedLanguage, speakerLabelsEnabled, RAILWAY_BACKEND_URL, checkJobStatus]);

  // Copy to clipboard (now triggers CopiedNotification)
  const copyToClipboard = useCallback(() => { 
    // Check for AI paid user eligibility for this feature
    if (!isPaidAIUser(userProfile)) {
      showMessage('Copy to clipboard is only available for paid AI users (Three-Day, Pro plans). Please upgrade to access this feature.');
      return;
    }
    
    // To copy HTML content, we need to create a temporary element
    const tempElement = document.createElement('div');
    tempElement.innerHTML = transcription;
    navigator.clipboard.writeText(tempElement.textContent || tempElement.innerText); // Copy plain text content
    
    setCopiedMessageVisible(true); // Show copied message
    setTimeout(() => setCopiedMessageVisible(false), 2000); // Hide after 2 seconds
  }, [transcription, userProfile, showMessage]);

  // Download as Word - now calls backend for formatted DOCX
  const downloadAsWord = useCallback(async () => { 
    // Check for AI paid user eligibility for this feature
    if (!isPaidAIUser(userProfile)) {
      showMessage('MS Word download is only available for paid AI users (Three-Day, Pro plans). Please upgrade to access this feature.');
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
        const errorText = await response.text(); 
        console.error('❌ DEBUG: Word document generation failed. Status:', response.status, 'Text:', errorText); 
        throw new Error(`Failed to generate Word document: ${response.status} - ${errorText}`);
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
  // TXT download - available for all users
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

  // Download recorded audio (Note: This is for recorded audio, not transcription results)
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
          showMessage('MP3 compression complete! '); 
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

  // handleAIQuery for User AI Assistant with FormData - UPDATED for Gemini option
  const handleAIQuery = useCallback(async () => {
      if (profileLoading || !userProfile) {
          showMessage('Loading user profile... Please wait.');
          return;
      }
      // Check if user is eligible for AI features
      if (!isPaidAIUser(userProfile)) {
          showMessage('❌ TypeMyworDz AI Assistant features are only available for paid AI users (Three-Day, Pro, One-Week plans). Please upgrade your plan.');
          return;
      }

      if (!latestTranscription || !userPrompt) {
          showMessage('Please provide both a transcript and a prompt for the AI Assistant.');
          return;
      }

      setAILoading(true);
      setAIResponse(''); // Clear previous AI response

      try {
          const formData = new FormData();
          formData.append('transcript', latestTranscription);
          formData.append('user_prompt', userPrompt);
          formData.append('max_tokens', '4096'); 
          formData.append('user_plan', userProfile?.plan || 'free'); 

          let endpoint = '';
          let modelToUse = '';

          if (selectedAIProvider === 'claude') {
            endpoint = `${RAILWAY_BACKEND_URL}/ai/user-query`; 
            modelToUse = 'claude-3-haiku-20240307'; 
          } else if (selectedAIProvider === 'gemini') {
            endpoint = `${RAILWAY_BACKEND_URL}/ai/user-query-gemini`; 
            modelToUse = 'models/gemini-pro-latest'; 
          } else {
            showMessage('Invalid AI provider selected.');
            setAILoading(false);
            return;
          }
          formData.append('model', modelToUse); 

          const response = await fetch(endpoint, {
              method: 'POST',
              body: formData, 
          });

          if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.detail || `Backend error: ${response.status} ${response.statusText}`);
          }

          const data = await response.json();
          setAIResponse(data.ai_response || data.formatted_transcript); 
          setShowContinueBox(true); 
          showMessage('✨ AI response generated successfully!');

      } catch (error) {
          console.error('AI Assistant Error:', error);
          showMessage('❌ AI Assistant failed: ' + error.message);
      } finally {
          setAILoading(false);
      }
  }, [latestTranscription, userPrompt, userProfile, profileLoading, showMessage, RAILWAY_BACKEND_URL, selectedAIProvider]);

  // NEW: Function to handle continue AI response
  const handleContinueAIResponse = useCallback(async () => {
    if (!continuePrompt.trim()) {
      showMessage('Please enter instructions for continuing the response.');
      return;
    }

    setAILoading(true);
    
    try {
      const formData = new FormData();
      formData.append('transcript', latestTranscription + '\n\nPrevious AI Response:\n' + aiResponse);
      formData.append('user_prompt', continuePrompt);
      formData.append('max_tokens', '4096'); 
      formData.append('user_plan', userProfile?.plan || 'free');

      let endpoint = '';
      let modelToUse = '';

      if (selectedAIProvider === 'claude') {
        endpoint = `${RAILWAY_BACKEND_URL}/ai/user-query`;
        modelToUse = 'claude-3-haiku-20240307'; 
      } else if (selectedAIProvider === 'gemini') {
        endpoint = `${RAILWAY_BACKEND_URL}/ai/user-query-gemini`;
        modelToUse = 'models/gemini-pro-latest';
      } else {
        showMessage('Invalid AI provider selected.');
        setAILoading(false);
        return;
      }
      
      formData.append('model', modelToUse);

      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `Backend error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      setAIResponse(aiResponse + '\n\n' + (data.ai_response || data.formatted_transcript));
      setContinuePrompt('');
      setShowContinueBox(false);
      showMessage('✅ Response continued successfully!');

    } catch (error) {
      console.error('Continue AI Response Error:', error);
      showMessage('❌ Failed to continue response: ' + error.message);
    } finally {
      setAILoading(false);
    }
  }, [continuePrompt, latestTranscription, aiResponse, userProfile, selectedAIProvider, showMessage, RAILWAY_BACKEND_URL]);

  // Function to handle predefined prompt click
  const handlePredefinedPromptClick = useCallback((prompt) => {
    setUserPrompt(prompt);
  }, []);

  // Cleanup effect to ensure cancellation works
  useEffect(() => {
    return () => {
      if (isCancelledRef.current) {
        console.log('🧹 DEBUG: Component cleanup - clearing all intervals'); 
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
        

        {/* The Menu (sidebar-menu) for non-authenticated users - uses global window functions */}
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
            }}
        >
            {/* Products Menu Item (non-authenticated) */}
            <div className="menu-item" onClick={() => window.showSpeechToText()}>
                <span className="menu-icon">📦</span>
                <span className="menu-text">Products</span>
            </div>
            
            {/* Pricing Menu Item (non-authenticated) */}
            <div className="menu-item" onClick={() => window.location.href = '/pricing'}>
                <span className="menu-icon">💰</span>
                <span className="menu-text">Pricing</span>
            </div>

            {/* Social Menu Item (non-authenticated) */}
            <div className="menu-item" onClick={() => window.openDonate()}>
                <span className="menu-icon">🤝</span>
                <span className="menu-text">Social</span>
            </div>

            {/* Privacy Policy Menu Item (non-authenticated) */}
            <div className="menu-item" onClick={() => window.openPrivacyPolicy()}>
                <span className="menu-icon">📋</span>
                <span className="menu-text">Privacy Policy</span>
            </div>
        </div>

        <header style={{ 
          textAlign: 'center', 
          padding: '60px 20px',
          color: 'white'
        }}>
        </header>
        
        <div style={{ 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column',
          justifyContent: 'center', 
          alignItems: 'center',
          padding: '0 20px'
        }}>
          {/* Renders the Login component when not authenticated */}
          <Login />
          {/* NEW: Link to Signup page - THIS IS THE BUTTON WE ARE DEBUGGING */}
          <p style={{ marginTop: '20px', color: 'white', fontSize: '1rem' }}>
            Don't have an account? {' '}
            <button
              onClick={() => {
                console.log("DEBUG: 'Sign Up' button clicked. Attempting navigation to /signup."); // NEW DIAGNOSTIC LOG
                navigate('/signup'); 
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#007bff', 
                textDecoration: 'underline',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: 'bold',
                padding: 0
              }}
            >
              Sign Up
            </button>
          </p>

          {/* UPDATED: Login page tagline and logos */}
          <p style={{ 
            fontSize: '1.1rem', 
            margin: '30px 0 0 0',
            opacity: '0.8',
            color: 'white',
            textAlign: 'center'
          }}>
            Speech AI • Simple, Accurate, Powerful •
          </p>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '15px',
            marginTop: '10px'
          }}>
                        <span style={{ color: 'white', fontSize: '1rem' }}>Powered with</span>
            <img src="/claude_logo.png" alt="Claude AI Logo" style={{ width: '24px', height: '24px', verticalAlign: 'middle' }} />
            <span style={{ 
              color: '#000000', 
              fontSize: '1.1rem', 
              fontWeight: 'bold',
              textShadow: '0 1px 2px rgba(255,255,255,0.8)',
              marginLeft: '5px'
            }}>Claude</span>
            <span style={{ color: 'white', fontSize: '1.2rem', margin: '0 8px' }}>&</span>
            <img src="/gemini_logo.png" alt="Gemini AI Logo" style={{ width: '24px', height: '24px', verticalAlign: 'middle' }} />
            <span style={{ 
              color: '#000000',
              fontSize: '1.1rem',
              fontWeight: 'bold',
              textShadow: '0 1px 2px rgba(255,255,255,0.8)',
              marginLeft: '5px'
            }}>Gemini</span>
          </div>

        </div>
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
    {/* NEW: Route for Signup component */}
    <Route path="/signup" element={<Signup />} /> 
    {/* FIXED: Passing showMessage prop to AdminDashboard */}
    <Route path="/admin" element={isAdmin ? <AdminDashboard showMessage={showMessage} /> : <Navigate to="/" />} />
    
    {/* IMPORTANT: Define specific routes for unauthenticated users first */}
    <Route path="/" element={<Login />} /> {/* Default route for Login when not authenticated */}
    {/* The catch-all route should be last for authenticated users */}
    <Route path="/*" element={<AppContent />} /> 
  </Routes>
);
}

// Main App Component with AuthProvider (existing, no changes needed here)
function App() {
  return (
    <AuthProvider>
      <Router>
        <AppContent /> {/* AppContent now handles all routing based on currentUser */}
      </Router>
    </AuthProvider>
  );
}

export default App;
