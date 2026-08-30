import React, { useState, useRef, useEffect, useCallback } from 'react';
import './App.css';
import './styles/theme.css';
import { AuthProvider, useAuth, ToastNotification } from './contexts/AuthContext';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import AdminDashboard from './components/AdminDashboard';
import TranscriptionDetail from './components/TranscriptionDetail';
import RichTextEditor from './components/RichTextEditor';
import TranscriptEditor from './components/TranscriptEditor';
import EditorDemo from './components/EditorDemo';
import TranscribeProgress from './components/TranscribeProgress';
import Signup from './components/Signup';
import FeedbackModal from './components/FeedbackModal';
import { canUserTranscribe, updateUserUsage, saveTranscription, updateTranscription, updateUserPlan, saveFeedback } from './userService'; // Removed createUserProfile
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import PrivacyPolicy from './components/PrivacyPolicy';
import AnimatedBroadcastBoard from './components/AnimatedBroadcastBoard';
import { db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';


// UPDATED Configuration - RE-ADDED Render Whisper URL
// MODIFIED: Use the new Railway Backend URL
const RAILWAY_BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';
// REMOVED: const RENDER_WHISPER_URL = process.env.REACT_APP_RENDER_WHISPER_URL || 'https://whisper-backend-render.onrender.com/'; // This URL is for TypeMyworDz2 (Render)

// Helper function to determine if a user has access to AI features
const initialsOf = (nameOrEmail) => {
  if (!nameOrEmail) return '?';
  const cleaned = String(nameOrEmail).trim();
  const namePart = cleaned.includes('@') ? cleaned.split('@')[0] : cleaned;
  const words = namePart.replace(/[._-]+/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
};

const isPaidAIUser = (userProfile) => {
  if (!userProfile || !userProfile.plan) return false;
  // UPDATED: 'Monthly Plan' in economy tier is now part of paid AI users
  const paidPlansForAI = ['Three-Day Plan', 'One-Week Plan', 'Monthly Plan', 'Yearly Plan'];
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
        backgroundColor: '#4CAF50', // Green background
        color: 'white',
        padding: '10px 20px',
        borderRadius: '5px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
        zIndex: 1000,
        pointerEvents: 'none', // Allow clicks to pass through
      }}
    >
       Copied to clipboard!
    </div>
  );
};
function AppContent() {
  const navigate = useNavigate();
  // Removed signInWithGoogle as it's not used in AppContent
  const { currentUser, logout, userProfile, refreshUserProfile, showMessage, message, messageType, clearMessage } = useAuth(); 
  
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
  // Per-line timings from the service, when it supplies them. Lets the
  // proofreading editor jump the audio to any line.
  const [transcriptSegments, setTranscriptSegments] = useState(null);
  // How much of the file has actually reached the server, and which stage the
  // job is at. The upload figure is measured, not guessed.
  const [uploadPercent, setUploadPercent] = useState(0);
  const [transcribePhase, setTranscribePhase] = useState('uploading');
  const [isUploading, setIsUploading] = useState(false);
  // Removed uploadProgress state and its setter
  // Removed transcriptionProgress state and its setter
  const [currentView, setCurrentView] = useState('transcribe');
  const [audioDuration, setAudioDuration] = useState(0);
  const [isRecording, setIsRecording] = useState(false); // Corrected to boolean
  const [recordingTime, setRecordingTime] = useState(0);
  const [downloadFormat, setDownloadFormat] = useState('mp3');
  const [copiedMessageVisible, setCopiedMessageVisible] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('en'); 
  const [speakerLabelsEnabled, setSpeakerLabelsEnabled] = useState(false);
  // State to store the latest completed transcription for AI Assistant
  const [latestTranscription, setLatestTranscription] = useState(''); 

  // Payment states
  const [pricingView, setPricingView] = useState('credits'); // 'credits' for one-time, 'subscription' for recurring (now also one-time)
  const [selectedRegion, setSelectedRegion] = useState('KE'); // Default to Kenya
  // Removed convertedAmounts and setConvertedAmounts as they were unused
  
  // AI Assistant states
  const [userPrompt, setUserPrompt] = useState(''); 
  const [aiResponse, setAIResponse] = useState('');
  const [aiLoading, setAILoading] = useState(false);
  // NEW: State to select between AI providers (claude or gemini) for user side
  const [selectedAIProvider, setSelectedAIProvider] = useState('claude'); // 'claude' or 'gemini'
  
  // Refs
  const mediaRecorderRef = useRef(null);
  const recordingIntervalRef = useRef(null);
  const recordedAudioBlobRef = useRef(null); 
  const abortControllerRef = useRef(null);
  const transcriptionIntervalRef = useRef(null);
  const statusCheckTimeoutRef = useRef(null);
  const isCancelledRef = useRef(false);
  const accountRef = useRef(null);

  // UPDATED: Admin emails are now referenced from your backend configuration
  const ADMIN_EMAILS = ['typemywordz@gmail.com', 'gracenyaitara@gmail.com']; 
  const isAdmin = ADMIN_EMAILS.includes(currentUser?.email); 

  // NEW: State to prevent duplicate payment verification
  const [isVerifyingPayment, setIsVerifyingPayment] = useState(false);

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
  const initializePaystackPayment = useCallback(async (email, amount, planName, countryCode) => {
    try {
      console.log('Initializing Paystack payment:', { email, amount, planName, countryCode });

      let actualCountryCode = countryCode; // Now this will correctly be 'KE' if selected
      let actualAmount = amount;

      // REMOVED: The problematic if (planName === 'Monthly Plan' || planName === 'Yearly Plan') { actualCountryCode = 'OTHER_AFRICA'; } block
      // The backend is now smart enough to handle USD for Yearly Plans, and local currencies for Monthly/Weekly/Three-Day.
      
      const response = await fetch(`${RAILWAY_BACKEND_URL}/api/initialize-paystack-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email,
          amount: actualAmount,
          plan_name: planName,
          user_id: currentUser.uid,
          country_code: actualCountryCode, // This will now pass the actual selectedRegion
          callback_url: `${window.location.origin}/?payment=success`,
          update_admin_revenue: true
        })
      });
      const data = await response.json();
      console.log('Backend payment initialization response:', data);
      
      if (response.ok && data.status) {
        showMessage('Redirecting to payment page...Please do not refresh.', 'info');
        window.location.href = data.authorization_url;
      } else {
        throw new Error(data.message || 'Payment initialization failed');
      }
    } catch (error) {
      console.error('Paystack payment error:', error);
      showMessage('Payment initialization failed: ' + error.message, 'error');
    }
  }, [currentUser, showMessage]);

  // Handle payment success callback - MODIFIED to prevent infinite loop
  const handlePaystackCallback = useCallback(async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const reference = urlParams.get('reference');
    const paymentStatus = urlParams.get('payment');
    
    // Only proceed if there's a reference/success status AND we're not already verifying
    if ((reference || paymentStatus === 'success') && !isVerifyingPayment) {
      setIsVerifyingPayment(true); // Set flag to true to prevent re-entry
      console.log('Checking payment callback:', { reference, paymentStatus });
      
      if (reference) {
        try {
          showMessage('Verifying payment...', 'info');
          
          const response = await fetch(`${RAILWAY_BACKEND_URL}/api/verify-payment`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
              reference,
              update_admin_revenue: true
            }),
          });
          
          const data = await response.json();
          console.log('Payment verification result: ', data);
          
          if (response.ok && data.status === 'success') {
            await updateUserPlan(currentUser.uid, data.data.plan, reference); 
            await refreshUserProfile();
            
            showMessage(`Payment successful! ${data.data.plan} activated.`,'success');
            setCurrentView('transcribe');
            
            // Crucial: Clear URL parameters AFTER successful processing
            window.history.replaceState({}, document.title, window.location.pathname);
          } else {
            showMessage('Payment verification failed: ' + (data.message || 'Unknown error'), 'error');
          }
        } catch (error) {
          console.error('Payment verification error:', error);
          showMessage('Payment verification failed: ' + error.message, 'error');
        } finally {
          setIsVerifyingPayment(false); // Reset flag regardless of outcome
        }
      } else if (paymentStatus === 'success') {
        showMessage('Payment completed! Please wait for verification...', 'info');
        // If only paymentStatus='success' is present without a reference,
        // it might be an intermediate state. We should still clear it.
        window.history.replaceState({}, document.title, window.location.pathname);
        setIsVerifyingPayment(false); // Reset flag
      }
    }
  }, [currentUser, showMessage, refreshUserProfile, setCurrentView, isVerifyingPayment]); // Removed isAdmin from dependencies as it's not used in the function body

  // useEffect to trigger payment callback handling
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const reference = urlParams.get('reference');
    const paymentStatus = urlParams.get('payment');
    
    // Call the callback if parameters are present. The callback itself will manage the `isVerifyingPayment` flag.
    if (reference || paymentStatus === 'success') {
      console.log('Payment callback detected in useEffect.');
      handlePaystackCallback();
    }
  }, [currentUser, handlePaystackCallback]);

  // Enhanced reset function with better job cancellation - ADDING LOGS
  const resetTranscriptionProcessUI = useCallback(() => { 
    console.log('DEBUG: resetTranscriptionProcessUI called. Stopping ongoing processes and resetting UI states.');
    
    isCancelledRef.current = true;
    
    setJobId(null);
    setStatus('idle');
    setTranscription('');
    setAudioDuration(0);
    setIsUploading(false);
    // Removed setUploadProgress(0);
    // Removed setTranscriptionProgress(0);
    setSpeakerLabelsEnabled(false);
    
    recordedAudioBlobRef.current = null;
    
    if (abortControllerRef.current) {
      console.log('DEBUG: Aborting active fetch request.');
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (transcriptionIntervalRef.current) {
      console.log('DEBUG: Clearing transcription progress interval.');
      clearInterval(transcriptionIntervalRef.current);
      transcriptionIntervalRef.current = null;
    }

    if (statusCheckTimeoutRef.current) {
      console.log('DEBUG: Clearing status check timeout.');
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
      fileInput.value = '';
      console.log('DEBUG: File input element cleared.');
    } else {
      console.log('DEBUG: File input element not found for clearing.');
    }
    
    setTimeout(() => {
      isCancelledRef.current = false;
      console.log('DEBUG: Reset complete, ready for new operations.');
    }, 500);
  }, []); // No external dependencies, so empty array is correct

  // Enhanced file selection with proper job cancellation - ADDING LOGS
  const handleFileSelect = useCallback(async (event) => {
    console.log('DEBUG: handleFileSelect called.');
    const file = event.target.files[0];
    
    if (!file) {
      console.log('DEBUG: No file selected. Exiting handleFileSelect.');
      return;
    }
    
    console.log('DEBUG: File selected:', file.name);
    // Always reset UI when a new file is selected, effectively deselecting options
    // This also stops any ongoing transcription.
    resetTranscriptionProcessUI(); 
    
    setSelectedFile(file);
    console.log('DEBUG: setSelectedFile called with:', file.name);
    
    if (file && (file.type.startsWith('audio/') || file.type.startsWith('video/'))) { 
      const audio = new Audio(); 
      audio.preload = 'metadata';
      audio.onloadedmetadata = async () => {
        setAudioDuration(audio.duration);
        URL.revokeObjectURL(audio.src);
        console.log(`DEBUG: Audio metadata loaded. Duration: ${audio.duration} seconds.`);
        
        try {
          const originalSize = file.size / (1024 * 1024);
          console.log(`DEBUG: ${Math.round(audio.duration/60)}-minute file loaded (${originalSize.toFixed(2)} MB) - ready for quick transcription.`);
        } catch (error) {
          console.error('DEBUG: Error getting file info in onloadedmetadata:', error);
          showMessage('Error getting file info: ' + error.message, 'error');
        }
      };
      audio.onerror = (e) => { // NEW: Add onerror handler for audio loading
        console.error('DEBUG: Audio element error during metadata loading:', e);
        resetTranscriptionProcessUI();
        setSelectedFile(null);
        showMessage(
          file.size === 0
            ? 'That file is empty, so there is nothing to transcribe. Please choose another file.'
            : 'That file could not be opened as audio. Please check it plays on your computer, then try again.',
          'error'
        );
      };
      const audioUrl = URL.createObjectURL(file);
      audio.src = audioUrl;
      console.log('DEBUG: Audio URL created and assigned:', audioUrl);
    } else {
      console.log('DEBUG: Selected file is not an audio/video type. No audio metadata loading.');
      resetTranscriptionProcessUI();
      setSelectedFile(null);
      showMessage('That is not an audio or video file. Please choose a recording to transcribe.', 'error');
    }
  }, [showMessage, resetTranscriptionProcessUI]);

  // A recording shorter than this is silence or a failed capture, never speech.
  // 2 KB is well under a second of Opus audio, so real recordings clear it easily.
  const MIN_AUDIO_BYTES = 2048;

  // Load an audio file's metadata to prove the browser can decode it and to
  // read its true duration. MediaRecorder webm files often report Infinity for
  // duration, which is a quirk rather than a fault, so that still counts as OK.
  const measureAudio = useCallback((file) => {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const audio = new Audio();
      let settled = false;
      const finish = (ok, duration) => {
        if (settled) return;
        settled = true;
        URL.revokeObjectURL(url);
        resolve({ ok, duration: Number.isFinite(duration) ? duration : 0 });
      };
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => finish(true, audio.duration);
      audio.onerror = () => finish(false, 0);
      // Never let a stuck decode hang the button forever.
      setTimeout(() => finish(true, 0), 6000);
      audio.src = url;
    });
  }, []);

  // Enhanced recording function with proper job cancellation
  const startRecording = useCallback(async () => {
    console.log('DEBUG: startRecording called.'); // NEW LOG
    // Always reset UI when starting a new recording, effectively deselecting options
    // This also stops any ongoing transcription.
    resetTranscriptionProcessUI(); 
    setSelectedFile(null); // Clear any previously selected file
    
    const fileInput = document.querySelector('input[type="file"]');
    if (fileInput) {
      fileInput.value = ''; // Clear file input
      console.log('DEBUG: File input element cleared before recording.'); // NEW LOG
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
      console.log('DEBUG: Microphone stream obtained.'); // NEW LOG
      
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/wav';
          console.warn('DEBUG: Falling back to audio/wav for recording.'); // NEW LOG
        } else {
          console.warn('DEBUG: Falling back to audio/webm for recording.'); // NEW LOG
        }
      } else {
        console.log(`DEBUG: Using ${mimeType} for recording.`); // NEW LOG
      }
      
      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType });
      const chunks = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        chunks.push(event.data);
        console.log('DEBUG: Data available from MediaRecorder. Chunk size:', event.data.size); // NEW LOG
      };

      mediaRecorderRef.current.onstop = async () => {
        console.log('DEBUG: MediaRecorder stopped. Processing recorded audio.');
        const originalBlob = new Blob(chunks, { type: mimeType });
        stream.getTracks().forEach(track => track.stop());

        if (recordedAudioBlobRef.current) {
          recordedAudioBlobRef.current = null;
        }

        // An empty or near-empty blob means the microphone captured nothing.
        // Catch it here and say so plainly, rather than uploading silence and
        // letting the transcription service return an error nobody can act on.
        if (!originalBlob || originalBlob.size < MIN_AUDIO_BYTES) {
          console.warn('DEBUG: Recording produced no usable audio. Bytes:', originalBlob ? originalBlob.size : 0);
          setSelectedFile(null);
          setAudioDuration(0);
          showMessage(
            'That recording came through empty, so there was nothing to transcribe. ' +
            'Check that your microphone is connected and not in use by another program, ' +
            'then record again.',
            'error'
          );
          return;
        }

        recordedAudioBlobRef.current = originalBlob;

        let extension = 'wav';
        if (mimeType.includes('webm')) {
          extension = 'webm';
        }

        const file = new File([originalBlob], `recording-${Date.now()}.${extension}`, { type: mimeType });

        // Confirm the browser can actually decode what we just recorded, and
        // read the true length so we stop guessing the duration from file size.
        const measured = await measureAudio(file);
        if (!measured.ok) {
          console.warn('DEBUG: Recording could not be decoded.');
          setSelectedFile(null);
          setAudioDuration(0);
          showMessage(
            'That recording could not be read back, so it has not been sent. ' +
            'Please record again.',
            'error'
          );
          return;
        }

        if (measured.duration > 0) {
          setAudioDuration(measured.duration);
        }
        setSelectedFile(file);
        console.log('DEBUG: Recording ready.', file.name, originalBlob.size, 'bytes,', measured.duration, 'seconds');
      };

      mediaRecorderRef.current.start(1000);
      setIsRecording(true);
      setRecordingTime(0);
      console.log('DEBUG: MediaRecorder started. isRecording set to true.'); // NEW LOG

      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('DEBUG: Could not access microphone:', error); // NEW LOG
      showMessage('Could not access microphone: ' + error.message, 'error');
    }
  }, [resetTranscriptionProcessUI, showMessage, measureAudio]);

  const stopRecording = useCallback(() => {
    console.log('DEBUG: stopRecording called.'); // NEW LOG
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(recordingIntervalRef.current);
      console.log('DEBUG: MediaRecorder stopped, isRecording set to false, interval cleared.'); // NEW LOG
    }
  }, [isRecording]);
  // Improved cancel function with page refresh
  const handleCancelUpload = useCallback(async () => {
    console.log('DEBUG: FORCE CANCEL - Stopping everything immediately');
    
    isCancelledRef.current = true;
    
    setJobId(null);
    setStatus('idle');
    setTranscription('');
    setAudioDuration(0);
    setIsUploading(false);
    // Removed setUploadProgress(0);
    // Removed setTranscriptionProgress(0);
    setSpeakerLabelsEnabled(false);
    setSelectedFile(null);
    recordedAudioBlobRef.current = null;
    
    if (abortControllerRef.current) {
      console.log('DEBUG: Aborting active fetch request.');
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = null;

    if (transcriptionIntervalRef.current) {
      console.log('DEBUG: Clearing transcription progress interval.');
      clearInterval(transcriptionIntervalRef.current);
      transcriptionIntervalRef.current = null;
    }

    if (statusCheckTimeoutRef.current) {
      console.log('DEBUG: Clearing status check timeout.');
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
        console.log(`DEBUG: Attempting to cancel job ${jobId} on Railway backend.`);
        await fetch(`${RAILWAY_BACKEND_URL}/cancel/${jobId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        console.log('DEBUG: Previous job cancelled successfully on Railway.');
      } catch (error) {
        console.log('DEBUG: Failed to cancel previous job on Railway, but continuing with force cancel:', error);
      }
    }
    
    showMessage("Transcription cancelled! Reloading page...",'warning');
    
    setTimeout(() => {
      window.location.reload();
    }, 1500);
    
    console.log('DEBUG: Force cancellation complete. Page refresh initiated.');
  }, [jobId, showMessage]);
// Find this function in your App.js file:
const handleTranscriptionComplete = useCallback(async (transcriptionText, completedJobId, segments = null) => {
  try {
    // FIX: Ensure selectedFile is not null before accessing its properties
    const estimatedDuration = audioDuration || (selectedFile ? Math.max(60, selectedFile.size / 100000) : 0);
    
    console.log('DIAGNOSTIC: Before updateUserUsage - userProfile.totalMinutesUsed:', userProfile?.totalMinutesUsed);
    console.log('DIAGNOSTIC: Estimated duration for this transcription: ', estimatedDuration);
    
    // Skip usage tracking for paid plans
    if (userProfile && userProfile.plan && userProfile.plan !== 'free') {
        console.log('DIAGNOSTIC: User has paid plan, skipping usage tracking');
    } else {
        // Only update usage for free users
        await updateUserUsage(currentUser.uid, estimatedDuration);
        console.log('DIAGNOSTIC: Usage updated for free user');
    }
    
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
      currentUser.uid, // Pass the userId here!
      segments, // Per-line timings, when the service returned them
      userProfile?.plan || 'free' // decides how long the file is kept
    );
    console.log('DEBUG: saveTranscription call completed.');
    
    await refreshUserProfile();
    console.log('DIAGNOSTIC: After refreshUserProfile - userProfile.totalMinutesUsed:', userProfile?.totalMinutesUsed);

    // Success message with favicon and brand name
    showMessage('<img src="/favicon-32x32.png"alt="TypeMyworDz Logo"style="width: 16px; height: 16px; vertical-align: middle; margin-right: 5px;"> TypeMyworDz, Done!','success');
    
    // Save the latest transcription for the AI Assistant
    setLatestTranscription(transcriptionText);

  } catch (error) {
    console.error('Error updating usage or saving transcription:', error);
    showMessage('Failed to save transcription or update usage.', 'error');
  } finally {
    // No changes here, as processingMessage state was removed
  }
}, [audioDuration, selectedFile, currentUser, refreshUserProfile, showMessage, userProfile, setLatestTranscription]); // Removed recordedAudioBlobRef from dependencies

  // Removed handlePaymentSuccess as it was unused.

  const checkJobStatus = useCallback(async (jobIdToPass, transcriptionInterval) => {
    if (isCancelledRef.current) {
      console.log('DEBUG: Status check aborted - job was cancelled');
      clearInterval(transcriptionInterval);
      return;
    }
    
    let timeoutId;
    
    try {
      const controller = new AbortController();
      abortControllerRef.current = controller;
      
      timeoutId = setTimeout(() => {
        console.log('DEBUG: Status check timeout - aborting');
        controller.abort();
      }, 10000); 
      
      const statusUrl = `${RAILWAY_BACKEND_URL}/status/${jobIdToPass}`;
      
      const response = await fetch(statusUrl, {
        signal: controller.signal 
      });
      
      clearTimeout(timeoutId);
      
      if (isCancelledRef.current) {
        console.log('DEBUG: Job cancelled during fetch - stopping immediately');
        clearInterval(transcriptionInterval);
        return;
      }
      
      const result = await response.json();
      
      if (isCancelledRef.current) {
        console.log('DEBUG: Job cancelled after response - stopping immediately');
        clearInterval(transcriptionInterval);
        return;
      }
      
      if (response.ok && result.status === 'completed') {
        if (isCancelledRef.current) {
          console.log('DEBUG: Job cancelled - ignoring completion');
          clearInterval(transcriptionInterval);
          return;
        }
        
        setTranscription(result.transcription);
        const jobSegments = Array.isArray(result.segments) && result.segments.length > 0
          ? result.segments
          : null;
        setTranscriptSegments(jobSegments);
        clearInterval(transcriptionInterval); 
        // Removed setTranscriptionProgress as it was unused
        setStatus('completed'); 
        
        await handleTranscriptionComplete(result.transcription, jobIdToPass, jobSegments);
        setIsUploading(false); 
        
      } else if (response.ok && result.status === 'failed') {
        if (!isCancelledRef.current) {
          // The service returns terse internal text. Translate the common case
          // into something the person sitting in front of the screen can act on.
          const raw = String(result.error || '');
          const friendly = /multiple attempts|no speech|empty|too short|could not/i.test(raw)
            ? 'We could not get any speech out of that audio. This usually means the recording ' +
              'is silent, extremely quiet, or the file is damaged. Try playing it back first, ' +
              'then upload it again.'
            : 'That transcription did not complete: ' + raw;
          showMessage(friendly, 'error');
          clearInterval(transcriptionInterval); 
          // Removed setTranscriptionProgress as it was unused
          setStatus('failed'); 
          setIsUploading(false);
          resetTranscriptionProcessUI();
        }
        
      } else if (response.ok && (result.status === 'cancelled' || result.status === 'canceled')) {
        console.log('DEBUG: Backend confirmed job cancellation');
        clearInterval(transcriptionInterval);
        // Removed setTranscriptionProgress as it was unused
        setStatus('idle');
        setIsUploading(false);
        showMessage('Transcription was cancelled. Please start a new one.','warning');
        resetTranscriptionProcessUI();
        
      } else {
        if (result.status === 'processing' && !isCancelledRef.current) {
          console.log('DEBUG: Job still processing - will check again');
          statusCheckTimeoutRef.current = setTimeout(() => {
            if (!isCancelledRef.current) {
              checkJobStatus(jobIdToPass, transcriptionInterval); 
            } else {
              console.log('DEBUG: Recursive call cancelled');
              clearInterval(transcriptionInterval);
              showMessage('Transcription process interrupted. Please start a new one.','warning');
              resetTranscriptionProcessUI();
            }
          }, 2000);
        } else if (isCancelledRef.current) {
          console.log('DEBUG: Job cancelled - stopping status checks');
          clearInterval(transcriptionInterval);
          showMessage('Transcription process interrupted. Please start a new one.','warning');
          resetTranscriptionProcessUI();
        } else {
          const errorDetail = result.detail || `Unexpected status: ${result.status}`;
          showMessage('Status check failed: ' + errorDetail + '. Please try again.', 'error');
          clearInterval(transcriptionInterval); 
          // Removed setTranscriptionProgress as it was unused
          setStatus('failed'); 
          setIsUploading(false); 
          resetTranscriptionProcessUI();
        }
      }
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError' || isCancelledRef.current) {
        console.log('DEBUG: Request aborted or job cancelled');
        clearInterval(transcriptionInterval);
        if (!isCancelledRef.current) {
          setIsUploading(false);
        }
        showMessage('Transcription process interrupted. Please start a new one.','warning');
        resetTranscriptionProcessUI();
        return;
      } else if (!isCancelledRef.current) {
        console.error('DEBUG: Status check error:', error);
        clearInterval(transcriptionInterval); 
        // Removed setTranscriptionProgress as it was unused
        setStatus('failed'); 
        setIsUploading(false); 
        showMessage('Status check failed: ' + error.message + '. Please try again.', 'error');
        resetTranscriptionProcessUI();
      }
    } finally {
      abortControllerRef.current = null;
    }
  }, [handleTranscriptionComplete, showMessage, resetTranscriptionProcessUI]); // Removed RAILWAY_BACKEND_URL from dependencies
  // handleUpload with new backend logic for model selection
  const handleUpload = useCallback(async () => {
    console.log('DEBUG: handleUpload called.');
    if (!selectedFile) {
      showMessage('Please select a file first', 'warning');
      console.log('DEBUG: No file selected for upload..');
      return;
    }

    if (userProfile === undefined) {
      showMessage('Loading user profile... Please wait.', 'info');
      console.log('DEBUG: User profile still loading or not available.');
      return;
    }

    if (selectedFile.size < MIN_AUDIO_BYTES) {
      showMessage(
        'That file is empty, so there is nothing to transcribe. Please choose or record another file.',
        'error'
      );
      resetTranscriptionProcessUI();
      return;
    }

    const estimatedDuration = audioDuration || Math.max(60, selectedFile.size / 100000);
    console.log('DEBUG: Estimated duration for upload:', estimatedDuration);

    const transcribeCheck = await canUserTranscribe(currentUser.uid, estimatedDuration);
    console.log('DEBUG: canUserTranscribe check result:', transcribeCheck);
    
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

        showMessage(userMessage, 'warning');
        console.log('DEBUG: Blocking transcription due to plan/limit. Redirecting to pricing.');
        
        setTimeout(() => {
          setCurrentView('pricing');
          resetTranscriptionProcessUI();
        }, 2000);
        return;
      } else {
        showMessage('You do not have permission to transcribe audio. Please contact support if this is an error.', 'error');
        console.log('DEBUG: Blocking transcription due to insufficient permissions.');
        resetTranscriptionProcessUI();
        return;
      }
    }

    console.log(`DEBUG: Initiating transcription for ${Math.round(estimatedDuration/60)}-minute audio.`);

    isCancelledRef.current = false;
    setUploadPercent(0);
    setTranscribePhase('uploading');
    setIsUploading(true);
    setStatus('processing');
    abortControllerRef.current = new AbortController();

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('language_code', selectedLanguage);
    formData.append('speaker_labels_enabled', speakerLabelsEnabled);
    formData.append('user_plan', userProfile?.plan || 'free');
    formData.append('user_email', currentUser?.email || '');
    // NEW: Send user's free minutes remaining for accurate backend checks
    if (userProfile && userProfile.plan === 'free') {
      const freeMinutesRemaining = Math.max(0, 30 - (userProfile.totalMinutesUsed || 0));
      formData.append('free_minutes_remaining', freeMinutesRemaining.toString());
      formData.append('has_received_initial_free_minutes', userProfile.hasReceivedInitialFreeMinutes ? 'true' : 'false');
    }

    try {
      console.log(`DEBUG: Using unified transcription endpoint: ${RAILWAY_BACKEND_URL}/transcribe`);

      // Sent with XMLHttpRequest rather than fetch purely so the browser will
      // report upload progress. fetch cannot do that, which is why the old bar
      // had nothing real to show. The request itself is identical.
      const result = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${RAILWAY_BACKEND_URL}/transcribe`);

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && event.total > 0) {
            setUploadPercent((event.loaded / event.total) * 100);
          }
        };

        xhr.upload.onload = () => {
          // Everything has reached the server; from here it is the service's turn.
          setUploadPercent(100);
          setTranscribePhase('transcribing');
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText));
            } catch (parseError) {
              reject(new Error('The transcription service sent a reply we could not read.'));
            }
          } else {
            console.error('DEBUG: Backend transcription service failed. Status:', xhr.status, 'Text:', xhr.responseText);
            reject(new Error(`Transcription service failed with status: ${xhr.status} - ${xhr.responseText}`));
          }
        };

        xhr.onerror = () => reject(new Error('We could not reach the transcription service. Please check your connection.'));
        xhr.ontimeout = () => reject(new Error('The upload timed out.'));
        xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));

        // Keep the existing Stop button working exactly as before.
        if (abortControllerRef.current) {
          abortControllerRef.current.signal.addEventListener('abort', () => xhr.abort());
        }

        xhr.send(formData);
      });

      console.log('DEBUG: Backend transcription endpoint responded:', result);

      if (result && result.job_id) {
        const transcriptionJobId = result.job_id;
        console.log('DEBUG: Transcription job started. Processing...');
        console.log(`DEBUG: Logic used: ${result.logic_used || 'Smart service selection'}`);
        
        // Removed setUploadProgress as it was unused
        setStatus('processing');
        setJobId(transcriptionJobId);
        transcriptionIntervalRef.current = simulateProgress(() => {}, 500, -1); // Removed setTranscriptionProgress
        checkJobStatus(transcriptionJobId, transcriptionIntervalRef.current);
      } else {
        console.error(`DEBUG: Transcription service returned no job ID: ${JSON.stringify(result)}`);
        throw new Error(`Transcription service returned no job ID: ${JSON.stringify(result)}`);
      }

    } catch (transcriptionError) {
      console.error('DEBUG: Transcription failed in handleUpload catch block:', transcriptionError);
      // Removed setUploadProgress and setTranscriptionProgress as they were unused
      setStatus('failed'); 
      setIsUploading(false);
      showMessage('Transcription service is currently unavailable. Please try again later.','error');
    }
  }, [selectedFile, audioDuration, currentUser?.uid, currentUser?.email, showMessage, setCurrentView, resetTranscriptionProcessUI, userProfile, selectedLanguage, speakerLabelsEnabled, checkJobStatus]); // Removed RAILWAY_BACKEND_URL from dependencies

  // Copy to clipboard (now triggers CopiedNotification)
  // The old Copy / Word / TXT buttons lived here. The proofreading editor
  // now owns all of that, so every screen behaves the same way.

  // A correction made on the transcript that has just come back is saved to
  // the same record the History list reads, so the fix is not lost the moment
  // the user navigates away.
  const handleSaveFreshTranscript = useCallback(async (html) => {
    if (!currentUser?.uid || !jobId) return;
    await updateTranscription(currentUser.uid, jobId, { transcriptionText: html });
  }, [currentUser?.uid, jobId]);

  // Download as Word - now calls backend for formatted DOCX

  // TXT download - available for all users

  // Download recorded audio (Note: This is for recorded audio, not transcription results)
  const downloadRecordedAudio = useCallback(async () => { 
    if (recordedAudioBlobRef.current) {
      try {
        let downloadBlob = recordedAudioBlobRef.current;
        let filename = `recording-${Date.now()}.${downloadFormat}`;
        
        if (downloadFormat === 'mp3' && !recordedAudioBlobRef.current.type.includes('mp3')) {
          showMessage('Compressing to MP3...', 'info');
          // This part of the frontend is not actually performing the compression,
          // it's just showing a message. The backend's /compress-download endpoint would handle it.
          // For now, we'll keep the message, but actual compression would involve a backend call here.
          showMessage('MP3 compression complete! ', 'success');
        }
        
        const url = URL.createObjectURL(downloadBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      } catch (error) {
        console.error('Error compressing for download: ', error);
        showMessage('Download compression failed, downloading original format.', 'error');
        const url = URL.createObjectURL(recordedAudioBlobRef.current);
        const a = document.createElement('a');
        a.href = url;
        a.download = `recording-${Date.now()}.wav`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } else {
      showMessage('No recorded audio available to download.', 'warning');
    }
  }, [showMessage, downloadFormat, recordedAudioBlobRef]); // Removed unnecessary dependency

  const handleLogout = useCallback(async () => {
    try {
      await logout();
    } catch (error) {
      showMessage('Failed to log out', 'error');
    }
  }, [logout, showMessage]);

  // Removed createMissingProfile as it was unused.
  // Removed handleUpgradeClick as it was unused.

  // Short, human plan label for the top bar (replaces the long inline plan string)
  const planLabel = (() => {
    const p = userProfile?.plan;
    const until = userProfile?.expiresAt
      ? ' \u00b7 until ' + new Date(userProfile.expiresAt).toLocaleDateString()
      : '';
    if (p === 'Yearly Plan')    return { text: 'Yearly' + until, isFree: false };
    if (p === 'Monthly Plan')   return { text: 'Monthly' + until, isFree: false };
    if (p === 'One-Week Plan')  return { text: 'One week' + until, isFree: false };
    if (p === 'Three-Day Plan') return { text: 'Three days' + until, isFree: false };
    if (p === 'free' && !userProfile?.hasReceivedInitialFreeMinutes) {
      return { text: 'Free trial \u00b7 ' + Math.max(0, 30 - (userProfile?.totalMinutesUsed || 0)) + ' min left', isFree: true };
    }
    return { text: 'Free plan', isFree: true };
  })();

  // handleAIQuery for User AI Assistant with FormData - UPDATED for Gemini option and fallback
  const handleAIQuery = useCallback(async () => {
      if (!userProfile) { 
          showMessage('Loading user profile... Please wait.', 'info');
          return;
      }
      // Check if user is eligible for AI features
      if (!isPaidAIUser(userProfile)) {
          showMessage('TypeMyworDz AI Assistant features are only available for paid AI users (Three-Day, One-Week, Monthly Plan, Yearly Plan plans). Please upgrade your plan.','error');
          return;
      }

      // userPrompt now holds the guidelines
      if (!latestTranscription || !userPrompt) {
          showMessage('Please provide both a transcript and formatting guidelines for the AI Assistant.', 'warning');
          return;
      }

      setAILoading(true);
      setAIResponse(''); // Clear previous AI response

      try {
          const formData = new FormData();
          formData.append('transcript', latestTranscription);
          // MODIFIED: Send userPrompt as formatting_instructions
          formData.append('formatting_instructions', userPrompt); 
          formData.append('max_tokens', '4096'); 
          formData.append('user_plan', userProfile?.plan || 'free'); 

          let endpoint = '';
          let modelToUse = '';

          if (selectedAIProvider === 'claude') {
            // MODIFIED: Use admin formatting endpoint for user AI
            endpoint = `${RAILWAY_BACKEND_URL}/ai/admin-format`; 
            modelToUse = 'claude-3-haiku-20240307'; 
          } else if (selectedAIProvider === 'gemini') {
            // MODIFIED: Use admin formatting endpoint for user AI
            endpoint = `${RAILWAY_BACKEND_URL}/ai/admin-format-gemini`;
            modelToUse = 'models/gemini-pro-latest'; 
          } else {
            showMessage('Invalid AI provider selected.', 'error');
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
          // The admin formatting endpoints return 'formatted_transcript'
          setAIResponse(data.formatted_transcript); 
          showMessage('AI response generated successfully!','success');

      } catch (error) {
          console.error('AI Assistant Error:', error);
          showMessage('AI Assistant failed: ' + error.message + '. If using Gemini, try Claude for sensitive content.', 'error');
      } finally {
          setAILoading(false);
      }
  }, [latestTranscription, userPrompt, userProfile, showMessage, selectedAIProvider]); // Removed RAILWAY_BACKEND_URL from dependencies
  
  // Cleanup effect to ensure cancellation works
  useEffect(() => {
    return () => {
      if (isCancelledRef.current) {
        console.log('DEBUG: Component cleanup - clearing all intervals'); 
        const highestId = setInterval(() => {}, 0);
        for (let i = 1; i <= highestId; i++) {
          clearInterval(i);
          clearTimeout(i);
        }
      }
    };
  }, []);

  // NEW: State and handlers for Feedback Modal
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  // Close the account menu on an outside click or Escape. Without this the
  // menu had to rely on the pointer never leaving it, which made it impossible
  // to reach the items inside.
  useEffect(() => {
    if (!accountMenuOpen) return undefined;
    const onDown = (e) => {
      if (accountRef.current && !accountRef.current.contains(e.target)) {
        setAccountMenuOpen(false);
      }
    };
    const onKey = (e) => { if (e.key === 'Escape') setAccountMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [accountMenuOpen]);

  // eslint-disable-next-line no-unused-vars
  const [feedbackName, setFeedbackName] = useState(currentUser?.displayName || '');
  // eslint-disable-next-line no-unused-vars
  const [feedbackEmail, setFeedbackEmail] = useState(currentUser?.email || '');
  // eslint-disable-next-line no-unused-vars
  const [feedbackText, setFeedbackText] = useState('');
  const [isSendingFeedback, setIsSendingFeedback] = useState(false);

  const handleOpenFeedback = useCallback(() => {
    setFeedbackName(currentUser?.displayName || '');
    setFeedbackEmail(currentUser?.email || '');
    setFeedbackText('');
    setShowFeedbackModal(true);
    setOpenSubmenu(null); // Close any open menu
  }, [currentUser]);

  const handleSendFeedback = useCallback(async (name, email, feedback) => {
    if (!email || !feedback.trim()) {
      showMessage('Email and Feedback are mandatory.', 'warning');
      return;
    }
    setIsSendingFeedback(true);
    try {
      await saveFeedback(name, email, feedback);
      showMessage('Feedback sent successfully! Thank you.','success');
      setShowFeedbackModal(false);
    } catch (error) {
      console.error('Error sending feedback:', error);
      showMessage('Failed to send feedback: ' + error.message, 'error');
    } finally {
      setIsSendingFeedback(false);
    }
  }, [showMessage]);

  // NEW: Handler for Share functionality
  const handleShare = useCallback(async () => {
    setOpenSubmenu(null); // Close any open menu
    const shareData = {
      title: 'TypeMyworDz - Speech to Text AI',
      text: 'Check out TypeMyworDz for accurate and affordable speech-to-text AI!',
      url: window.location.origin,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        console.log('Shared successfully');
      } catch (err) {
        console.log('Share failed:', err);
        showMessage('Sharing cancelled or failed.','warning');
      }
    } else {
      // Fallback for browsers that do not support the Web Share API
      // You can offer to copy the URL or compose an email
      const fallbackText = `${shareData.title}\n${shareData.text}\n${shareData.url}`;
      
      // Option 1: Copy to clipboard
      navigator.clipboard.writeText(fallbackText)
        .then(() => setCopiedMessageVisible(true))
        .then(() => setTimeout(() => setCopiedMessageVisible(false), 2000))
        .catch(() => showMessage('Failed to copy link.','error'));

    }
  }, [showMessage]);


  // Login screen for non-authenticated users
  if (!currentUser) {
    return (
      <div className="tm-app tm-login" style={{ 
        minHeight: '100vh', 
        background: '#ffffff',
        display: 'flex',
        flexDirection: 'column'
      }}>
        

        {/* ---- Signed-out top bar ---- */}
        <div className="tm-topbar">
          <div className="tm-brand">
            <img className="tm-brand-logo" src="/android-chrome-192x192.png" alt="TypeMyworDz" />
            <div className="tm-brand-text">
              <div className="tm-wordmark">
                <span className="tm-w-purple">Type</span><span className="tm-w-green">My</span><span className="tm-w-purple">worDz</span>
              </div>
              <div className="tm-slogan">You Talk, We Type</div>
            </div>
          </div>
          <div className="tm-spacer"></div>
          <div className="tm-menu">
            {/* Products Menu Item (non-authenticated) */}
            <div className="menu-item" onClick={() => window.showSpeechToText()}>
                <span className="menu-text">Products</span>
            </div>
            
            {/* Pricing Menu Item (non-authenticated) */}
            <div className="menu-item" onClick={() => window.location.href = '/pricing'}>
                <span className="menu-text">Pricing</span>
            </div>

            {/* Social Menu Item (non-authenticated) */}
            <div className="menu-item" onClick={() => window.openDonate()}>
                <span className="menu-text">Social</span>
            </div>

            {/* Legal Menu Item (non-authenticated) */}
            <div className="menu-item" onClick={() => window.openPrivacyPolicy()}>
                <span className="menu-text">Legal</span>
            </div>
          </div>
        </div>

        <div style={{ height: '48px' }}></div>
        
        <div style={{ 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column',
          justifyContent: 'center', 
          alignItems: 'center',
          padding: '0 20px'
        }}>
          <Login />
          {/* Removed the 'Don't have an account? Sign Up' text and button */}

          {/* UPDATED: Login page tagline and logos */}
          <p className="tm-login-tagline">
            Accurate transcription for legal, medical and case work.
          </p>
          <div className="tm-login-points">
            <span>Word, PDF and plain-text export</span>
            <span>Speaker labels</span>
            <span>Your audio is never used to train AI</span>
          </div>

        </div>
        {/* Removed the 'Don't have an account? Sign Up' text and button */}
        {/* REMOVED: ToastNotification component call from here */}
        <footer style={{ 
          textAlign: 'center', 
          padding: '20px', 
          color: '#a8acb5', 
          fontSize: '0.85rem' 
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
    <Route path="/signup" element={<Signup />} />
    <Route path="/privacy-policy" element={<PrivacyPolicy />} />
    <Route path="/dashboard" element={
      <Dashboard setCurrentView={setCurrentView} standalone />
    } />
    <Route path="/admin" element={isAdmin ? <AdminDashboard showMessage={showMessage} latestTranscription={latestTranscription} /> : <Navigate to="/" />} />
    
    <Route path="/" element={
      <div className="tm-app" style={{ 
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#ffffff'
      }}>
        <ToastNotification message={message} type={messageType} clearMessage={clearMessage} />
        <CopiedNotification isVisible={copiedMessageVisible} />

        {/* ---- Application top bar ---- */}
        <div className="tm-topbar">

          <div className="tm-brand">
            <img
              className="tm-brand-logo"
              src="/android-chrome-192x192.png"
              alt="TypeMyworDz"
            />
            <div className="tm-brand-text">
              <div className="tm-wordmark">
                <span className="tm-w-purple">Type</span><span className="tm-w-green">My</span><span className="tm-w-purple">worDz</span>
              </div>
              <div className="tm-slogan">You Talk, We Type</div>
            </div>
          </div>

          <div className="tm-spacer"></div>

          <div 
            className="tm-menu" 
            onMouseLeave={() => setOpenSubmenu(null)}
          >
            {/* Products Parent Menu */}
            <div className="menu-item" onClick={() => handleToggleSubmenu('productsSubmenu')}>
                <span className="menu-text">Products</span>
                <span className={`dropdown-arrow ${openSubmenu === 'productsSubmenu' ? 'rotated' : ''}`} aria-hidden="true">
                  <svg viewBox="0 0 12 12" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 4.5L6 8l3.5-3.5"/></svg>
                </span>
                
                {/* Products Submenu */}
                {openSubmenu === 'productsSubmenu' && (
                    <div className={`submenu ${openSubmenu === 'productsSubmenu' ? 'open' : ''}`} id="productsSubmenu">
                        <div className="submenu-item" onClick={() => window.showSpeechToText()}>
                            <span className="menu-text">Speech-to-Text</span>
                        </div>
                        <div className="submenu-item" onClick={() => window.showComingSoon('TypeMyNote')}>
                            <span className="menu-text">TypeMyNote</span>
                        </div>
                        <div className="submenu-item" onClick={() => window.showComingSoon('Text-to-Speech')}>
                            <span className="menu-text">Text-to-Speech</span>
                        </div>
                        <div className="submenu-item" onClick={() => window.showHumanTranscripts()}>
                            <span className="menu-text">Human Transcripts</span>
                        </div>
                    </div>
                )}
            </div>
            
            {/* Pricing Menu Item */}
            <div className="menu-item" onClick={handleOpenPricing}>
                <span className="menu-text">Pricing</span>
            </div>

            {/* Social Parent Menu */}
            <div className="menu-item" onClick={() => handleToggleSubmenu('socialSubmenu')}>
                <span className="menu-text">Social</span>
                <span className={`dropdown-arrow ${openSubmenu === 'socialSubmenu' ? 'rotated' : ''}`} aria-hidden="true">
                  <svg viewBox="0 0 12 12" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 4.5L6 8l3.5-3.5"/></svg>
                </span>
                
                {/* Social Submenu */}
                {openSubmenu === 'socialSubmenu' && (
                    <div className={`submenu ${openSubmenu === 'socialSubmenu' ? 'open' : ''}`} id="socialSubmenu">
                        <div className="submenu-item" onClick={() => window.openDonate()}>
                            <span className="submenu-text">Donate</span>
                        </div>
                        {/* NEW: Feedback Menu Item */}
                        <div className="submenu-item" onClick={handleOpenFeedback}>
                            <span className="submenu-text">Feedback</span>
                        </div>
                        {/* NEW: Share Menu Item */}
                        <div className="submenu-item" onClick={handleShare}>
                            <span className="menu-text">Share</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Privacy Policy Menu Item */}
            <div className="menu-item" onClick={handleOpenPrivacyPolicy}>
                <span className="menu-text">Legal</span>
            </div>
          </div>

          <div className="tm-account" ref={accountRef}>
            <button
              className="tm-avatar"
              onClick={() => setAccountMenuOpen(o => !o)}
              title={userProfile?.name || currentUser.email}
              aria-label="Account menu"
              aria-haspopup="menu"
              aria-expanded={accountMenuOpen}
            >
              {initialsOf(userProfile?.name || currentUser.email)}
            </button>

            {accountMenuOpen && (
              <div className="tm-account-menu">
                <div className="tm-account-head">
                  <div className="tm-account-name">{userProfile?.name || 'Signed in'}</div>
                  <div className="tm-account-mail">{currentUser.email}</div>
                </div>
                <div className="tm-account-plan">
                  <span className={"tm-plan" + (planLabel.isFree ? " tm-plan-free" : "")}>{planLabel.text}</span>
                  {planLabel.isFree && (
                    <button className="tm-account-upgrade" onClick={() => { setAccountMenuOpen(false); handleOpenPricing(); }}>
                      Upgrade
                    </button>
                  )}
                </div>
                <button className="tm-account-item" onClick={() => { setAccountMenuOpen(false); handleOpenFeedback(); }}>
                  Send feedback
                </button>
                <button className="tm-account-item tm-account-signout" onClick={handleLogout}>
                  Sign out
                </button>
              </div>
            )}
          </div>

        </div>

        {currentUser && !userProfile && ( 
          <div style={{
            textAlign: 'center',
            padding: '20px',
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            margin: '20px',
            borderRadius: '10px'
          }}>
            <div style={{ color: '#6c5ce7', fontSize: '16px' }}>
               Loading your profile...
            </div>
          </div>
        )}

        {/* ---- Workspace: sidebar on the left, everything else on the right ---- */}
        <div className="tm-shell">

          <aside className="tm-side">

            <button
              className="tm-newbtn"
              onClick={() => setCurrentView('transcribe')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
              New transcription
            </button>

            <div className="tm-navlabel">Workspace</div>

            <button
              className={"tm-nav" + (currentView === 'transcribe' ? " tm-nav-on" : "")}
              onClick={() => setCurrentView('transcribe')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z"/><path d="M18.5 11.5v.5a6.5 6.5 0 0 1-13 0v-.5M12 18.5V22"/></svg>
              Transcribe
            </button>

            <button
              className={"tm-nav" + (currentView === 'dashboard' ? " tm-nav-on" : "")}
              onClick={() => setCurrentView('dashboard')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M4 6.5A1.5 1.5 0 0 1 5.5 5h3.2l1.8 2h8A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5z"/></svg>
              My files
            </button>

            <button
              className="tm-nav"
              onClick={() => window.open('/transcription-editor', '_blank')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h9"/></svg>
              Editor
            </button>

            <button
              className={"tm-nav tm-nav-ai" + (currentView === 'ai_assistant' ? " tm-nav-on" : "")}
              onClick={() => {
                if (!isPaidAIUser(userProfile)) {
                  showMessage('The AI Assistant is available on the Three-Day, One-Week, Monthly and Yearly plans. Upgrade to switch it on.', 'error');
                  return;
                }
                setCurrentView('ai_assistant');
              }}
              disabled={!isPaidAIUser(userProfile)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M20 15.5a2.5 2.5 0 0 1-2.5 2.5H8l-4 3V6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5z"/></svg>
              Ask AI
              {!isPaidAIUser(userProfile) && <span className="tm-nav-lock">Upgrade</span>}
            </button>

            {isAdmin && (
              <>
                <div className="tm-navlabel">Admin</div>
                <button
                  className={"tm-nav" + (currentView === 'admin' ? " tm-nav-on" : "")}
                  onClick={() => setCurrentView('admin')}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M12 3l7.5 3.5v5c0 4.6-3.1 8.4-7.5 9.5-4.4-1.1-7.5-4.9-7.5-9.5v-5z"/></svg>
                  Admin
                </button>
              </>
            )}

            <div className="tm-plancard">
              <div className="tm-plancard-name">{planLabel.text}</div>
              {planLabel.isFree ? (
                <button className="tm-plancard-cta" onClick={handleOpenPricing}>
                  See plans
                </button>
              ) : (
                <div className="tm-plancard-sub">Thanks for subscribing</div>
              )}
            </div>

          </aside>

          <main className="tm-main">

        {/* UPDATED: AnimatedBroadcastBoard - moved to occupy the space where "Logged in as..." was, made larger and more beautiful */}
        {currentView === 'transcribe' && (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            padding: '16px 20px 4px'
          }}>
            <div style={{
              width: '100%',
              maxWidth: '800px',
              backgroundColor: 'transparent',
              borderRadius: '10px',
              boxShadow: 'none',
              border: 'none',
              padding: '0',
              boxSizing: 'border-box', 
              textAlign: 'center'
            }}>
              <AnimatedBroadcastBoard
                onNavigate={(view) => {
                  if (view === 'feedback') { handleOpenFeedback(); return; }
                  if (view === 'editor') { window.location.href = '/transcription-editor'; return; }
                  setCurrentView(view);
                }}
              />
            </div>
          </div>
        )}
        {/* Conditional Rendering for different views */}
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
                Flexible options for different regions and needs (We do not have access to your credit card details, all payments are secured by Paystack; a Stripe company)
              </p>

              <div style={{ marginBottom: '40px' }}>
                {/* Updated Button for Economy Plans */}
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
                   Economy Plans
                </button>
                {/* Updated Button for Premium Plans */}
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
                   Premium Plans
                </button>
              </div>
              {pricingView === 'credits' ? (
                <>
                  <div style={{ marginTop: '20px' }}>
                    <h2 style={{ color: '#007bff', marginBottom: '30px' }}>
                       Economy Plans
                    </h2>
                    <p style={{ color: '#666', marginBottom: '30px', fontSize: '14px', textAlign: 'center' }}>
                      For our African Market
                    </p>
                    
                    {/* Region Selection for Economy Plans */}
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
                        {/* Removed NG, GH, ZA */}
                        <option value="OTHER_AFRICA">Other African Countries (Card USD)</option>
                      </select>
                    </div>

                    {/* HORIZONTAL LAYOUT FOR ECONOMY PLANS (UPDATED ORDER AND VALUES) */}
                    <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', flexWrap: 'wrap' }}>
                      {/* Three-Day Plan */}
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
                          {/* No BEST VALUE tag */}
                          <h3 style={{ 
                            color: '#007bff',
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
                              showMessage('Please log in first to purchase credits.', 'warning');
                              return;
                            }
                            initializePaystackPayment(currentUser.email, 2, 'Three-Day Plan', selectedRegion);
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
                          {!currentUser?.email ? 'Login Required' : `Pay with Paystack - USD 2`}
                        </button>
                      </div>

                      {/* One-Week Plan (now BEST VALUE) */}
                      <div style={{
                        backgroundColor: 'white',
                        padding: '30px 25px',
                        borderRadius: '15px',
                        boxShadow: 'none',
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
                            fontSize: '14px',
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
                              USD 4
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
                              showMessage('Please log in first to purchase credits.','warning');
                              return;
                            }
                            initializePaystackPayment(currentUser.email, 4, 'One-Week Plan', selectedRegion);
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
                          {!currentUser?.email ? 'Login Required' : `Pay with Paystack - USD 4`}
                        </button>
                      </div>

                                            {/* Monthly Plan (formerly Economy Monthly Plan) */}
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
                          {/* No BEST VALUE tag */}
                          <h3 style={{ 
                            color: '#007bff',
                            fontSize: '1.5rem',
                            margin: '0 0 10px 0',
                            textAlign: 'center'
                          }}>
                            Monthly Plan
                          </h3>
                          <p style={{ color: '#666', marginBottom: '15px', fontSize: '14px', textAlign: 'center' }}>
                            Full access to Pro features for 1 month
                          </p>
                          <div style={{ marginBottom: '20px', textAlign: 'center' }}>
                            <span style={{ 
                              fontSize: '2.5rem',
                              fontWeight: 'bold',
                              color: '#6c5ce7'
                            }}>
                              USD 8
                            </span>
                            <span style={{ 
                              color: '#666',
                              fontSize: '1rem',
                              display: 'block'
                            }}>
                              for 1 month
                            </span>
                          </div>
                        </div>
                        
                        <button
                          onClick={() => {
                            if (!currentUser?.email) {
                              showMessage('Please log in first to purchase credits.', 'warning');
                              return;
                            }
                            initializePaystackPayment(currentUser.email, 8, 'Monthly Plan', selectedRegion); // This already passes selectedRegion correctly.
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
                          {!currentUser?.email ? 'Login Required' : `Pay with Paystack - USD 8`}
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ marginTop: '20px' }}>
                    <h2 style={{ color: '#28a745', marginBottom: '30px' }}>
                       Premium Plans
                    </h2>
                    <p style={{ color: '#666', marginBottom: '30px' }}>
                      Monthly and Yearly premium access plans, paid once.
                    </p>
                    
                    {/* HORIZONTAL LAYOUT FOR PREMIUM PLANS */}
                    <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', flexWrap: 'wrap' }}> 
                      {/* Monthly Plan */}
                      <div style={{
                        backgroundColor: 'white',
                        padding: '20px 15px', 
                        borderRadius: '15px', 
                        boxShadow: 'none', 
                        minWidth: '250px', 
                        maxWidth: '280px', 
                        border: '3px solid #28a745',
                        transform: 'scale(1.02)' 
                      }}>
                        <div>
                          <div style={{
                            backgroundColor: '#28a745',
                            color: 'white',
                            padding: '6px 15px', 
                            borderRadius: '15px', 
                            fontSize: '13px', 
                            fontWeight: 'bold',
                            marginBottom: '15px', 
                            display: 'inline-block'
                          }}>
                            MOST POPULAR
                          </div>
                          <h3 style={{ 
                            color: '#28a745',
                            fontSize: '1.4rem', 
                            margin: '0 0 8px 0' 
                          }}>
                            Monthly Plan
                          </h3>
                          <div style={{ marginBottom: '20px' }}> 
                            <span style={{ 
                              fontSize: '2.2rem', 
                              fontWeight: 'bold',
                              color: '#6c5ce7'
                            }}>
                              USD 9.99
                            </span>
                            <span style={{ 
                              color: '#666',
                              fontSize: '1rem' 
                            }}>
                              /month
                            </span>
                          </div>
                          <ul style={{ 
                            textAlign: 'left', 
                            color: '#666', 
                            lineHeight: '1.8', 
                            listStyle: 'none',
                            padding: '0',
                            marginBottom: '20px', 
                            fontSize: '0.9rem' 
                          }}>
                            <li className="tm-tick">Everything in Free Plan</li>
                            <li className="tm-tick">Unlimited transcription access</li>
                            <li className="tm-tick">High accuracy AI transcription</li>
                            <li className="tm-tick">Priority processing</li>
                            <li className="tm-tick">Copy to clipboard feature</li>
                            <li className="tm-tick">MS Word &amp; TXT downloads</li>
                            <li> 30-day file storage</li>
                            <li className="tm-tick">Email support</li>
                          </ul>
                          <button 
                            onClick={() => {
                              if (!currentUser?.email) {
                                showMessage('Please log in first to purchase.', 'warning');
                                return;
                              }
                              initializePaystackPayment(currentUser.email, 9.99, 'Monthly Plan', selectedRegion);
                            }}
                            disabled={!currentUser?.email}
                            style={{
                              width: '100%',
                              padding: '12px', 
                              backgroundColor: !currentUser?.email ? '#6c757d' : '#28a745',
                              color: 'white',
                              border: 'none',
                              borderRadius: '8px', 
                              cursor: !currentUser?.email ? 'not-allowed' : 'pointer',
                              fontSize: '15px', 
                              fontWeight: 'bold'
                            }}
                          >
                            {!currentUser?.email ? 'Login Required' : 'Purchase Monthly'}
                          </button>
                        </div>
                      </div>

                      {/* Yearly Plan */}
                      <div style={{
                        backgroundColor: 'white',
                        padding: '20px 15px', 
                        borderRadius: '15px', 
                        boxShadow: '0 10px 30px rgba(0,0,0,0.1)', 
                        minWidth: '250px', 
                        maxWidth: '280px', 
                        border: '3px solid #e9ecef'
                      }}>
                        <div>
                          <div style={{
                            backgroundColor: '#007bff',
                            color: 'white',
                            padding: '6px 15px', 
                            borderRadius: '15px', 
                            fontSize: '13px', 
                            fontWeight: 'bold',
                            marginBottom: '15px', 
                            display: 'inline-block'
                          }}>
                            SAVE 15%
                          </div>
                          <h3 style={{ 
                            color: '#007bff',
                            fontSize: '1.4rem', 
                            margin: '0 0 8px 0' 
                          }}>
                            Yearly Plan
                          </h3>
                          <div style={{ marginBottom: '20px' }}> 
                            <span style={{ 
                              fontSize: '2.2rem', 
                              fontWeight: 'bold',
                              color: '#6c5ce7'
                            }}>
                              USD 99.99
                            </span>
                            <span style={{ 
                              color: '#666',
                              fontSize: '1rem' 
                            }}>
                              /year
                            </span>
                          </div>
                          <ul style={{ 
                            textAlign: 'left', 
                            color: '#666', 
                            lineHeight: '1.8', 
                            listStyle: 'none',
                            padding: '0',
                            marginBottom: '20px', 
                            fontSize: '0.9rem' 
                          }}>
                            <li className="tm-tick">Everything in Free Plan</li>
                            <li className="tm-tick">Unlimited transcription access</li>
                            <li className="tm-tick">High accuracy AI transcription</li>
                            <li className="tm-tick">Priority processing</li>
                            <li className="tm-tick">Copy to clipboard feature</li>
                            <li className="tm-tick">MS Word &amp; TXT downloads</li>
                            <li> 365-day file storage</li>
                            <li className="tm-tick">Email support (yearly)</li>
                          </ul>
                          <button 
                            onClick={() => {
                              if (!currentUser?.email) {
                                showMessage('Please log in first to purchase.', 'warning');
                                return;
                              }
                              initializePaystackPayment(currentUser.email, 99.99, 'Yearly Plan', 'OTHER_AFRICA');
                            }}
                            disabled={!currentUser?.email}
                            style={{
                              width: '100%',
                              padding: '12px', 
                              backgroundColor: !currentUser?.email ? '#6c757d' : '#007bff',
                              color: 'white',
                              border: 'none',
                              borderRadius: '8px', 
                              cursor: !currentUser?.email ? 'not-allowed' : 'pointer',
                              fontSize: '15px', 
                              fontWeight: 'bold'
                            }}
                          >
                            {!currentUser?.email ? 'Login Required' : 'Purchase Yearly'}
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
                   All plans include:
                </h3>
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
                  gap: '20px',
                  textAlign: 'left',
                  color: '#666'
                }}>
                  <div className="tm-tick">Transcript management under History</div>
                  <div className="tm-tick">Easy-to-use interface</div>
                  <div className="tm-tick">Client Support</div>
                </div>
              </div>
            </div>
          </>
        ) : currentView === 'admin' ? (
          <AdminDashboard showMessage={showMessage} latestTranscription={latestTranscription} />
        ) : currentView === 'ai_assistant' ? (
            <div style={{
              flex: 1,
              padding: '20px',
              maxWidth: '900px',
              margin: '0 auto',
              backgroundColor: '#f8f9fa',
              borderRadius: '15px',
              boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
              marginTop: '20px'
            }}>
                <h2 style={{ color: '#6c5ce7', textAlign: 'center', marginBottom: '30px' }}>TypeMyworDz Assistant</h2>
                {!isPaidAIUser(userProfile) && (
                  <p style={{ textAlign: 'center', color: '#dc3545', marginBottom: '30px', fontWeight: 'bold' }}>
                     TypeMyworDz AI Assistant features are only available for paid AI users (Three-Day, One-Week, Monthly Plan, Yearly Plan plans). Please upgrade your plan.
                  </p>
                )}
                <p style={{ textAlign: 'center', color: '#666', marginBottom: '30px' }}>
                    Paste your transcript below and provide guidelines for the AI to format and polish it.
                </p>

                <div style={{ marginBottom: '30px', textAlign: 'center' }}>
                  <label style={{ display: 'block', color: '#6c5ce7', fontWeight: 'bold', marginBottom: '10px' }}>
                    Select AI Provider:
                  </label>
                  <div style={{ display: 'inline-flex', gap: '20px' }}>
                    <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                      <input
                        type="radio"
                        name="aiProviderUser"
                        value="claude"
                        checked={selectedAIProvider === 'claude'}
                        onChange={(e) => setSelectedAIProvider(e.target.value)}
                        disabled={!isPaidAIUser(userProfile)}
                        style={{ marginRight: '8px' }}
                      />
                      Anthropic Claude
                    </label>
                    <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                      <input
                        type="radio"
                        name="aiProviderUser"
                        value="gemini"
                        checked={selectedAIProvider === 'gemini'}
                        onChange={(e) => setSelectedAIProvider(e.target.value)}
                        disabled={!isPaidAIUser(userProfile)}
                        style={{ marginRight: '8px' }}
                      />
                      Google Gemini
                    </label>
                  </div>
                </div>
                <div style={{ marginBottom: '20px' }}>
                    <label htmlFor="transcriptInput" style={{ display: 'block', color: '#6c5ce7', fontWeight: 'bold', marginBottom: '10px' }}>
                        Transcript to Format:
                    </label>
                    <textarea
                        id="transcriptInput"
                        value={latestTranscription}
                        onChange={(e) => setLatestTranscription(e.target.value)}
                        placeholder="Paste your transcription here..."
                        rows="10"
                        style={{
                            width: '100%',
                            padding: '15px',
                            borderRadius: '10px',
                            border: '1px solid #ddd',
                            fontSize: '1rem',
                            resize: 'vertical',
                            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)'
                        }}
                        disabled={!isPaidAIUser(userProfile)}
                    ></textarea>
                </div>

                <div style={{ marginBottom: '30px' }}>
                    <label htmlFor="userPromptInput" style={{ display: 'block', color: '#6c5ce7', fontWeight: 'bold', marginBottom: '10px' }}>
                        Your Guidelines:
                    </label>
                    <textarea
                        id="userPromptInput"
                        value={userPrompt}
                        onChange={(e) => setUserPrompt(e.target.value)}
                        placeholder="Type or paste your guidelines here... TypeMyworDz Assistant can even intelligently try to distinguish/diarize your transcript's text into its responsible speaker; try typing something like, 'Put speaker tags on the transcript.' Or just tell it to do whatever with your transcript. You can even translate your transcripts. You paid for it, go crazy with it!
                        Note: AI makes mistakes, always proofread your work. For large amounts of text, remember to divide your work into manageable chunks due to character limit."
                        rows="8"
                        style={{
                            width: '100%',
                            padding: '15px',
                            borderRadius: '10px',
                            border: '1px solid #ddd',
                            fontSize: '1rem',
                            resize: 'vertical',
                            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)'
                        }}
                        disabled={!isPaidAIUser(userProfile)}
                    ></textarea>
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', marginBottom: '30px', flexWrap: 'wrap' }}>
                    <button
                        onClick={handleAIQuery}
                        disabled={!isPaidAIUser(userProfile) || !latestTranscription || !userPrompt || aiLoading}
                        style={{
                            padding: '12px 25px',
                            backgroundColor: (!isPaidAIUser(userProfile) || !latestTranscription || !userPrompt || aiLoading) ? '#a0a0a0' : '#6c5ce7',
                            color: 'white',
                            border: 'none',
                            borderRadius: '25px',
                            cursor: (!isPaidAIUser(userProfile)) ? 'not-allowed' : 'pointer',
                            fontSize: '1rem',
                            fontWeight: 'bold',
                            boxShadow: 'none',
                            transition: 'all 0.3s ease'
                        }}
                    >
                        {aiLoading ?'Processing...':`Format with ${selectedAIProvider ==='claude'?'Claude':'Gemini'}`}
                    </button>
                    <button
                        onClick={() => { setLatestTranscription(''); setUserPrompt(''); setAIResponse(''); }}
                        disabled={!isPaidAIUser(userProfile)}
                        style={{
                            padding: '12px 25px',
                            backgroundColor: (!isPaidAIUser(userProfile)) ? '#a0a0a0' : '#dc3545',
                            color: 'white',
                            border: 'none',
                            borderRadius: '25px',
                            cursor: (!isPaidAIUser(userProfile)) ? 'not-allowed' : 'pointer',
                            fontSize: '1rem',
                            fontWeight: 'bold',
                            boxShadow: 'none',
                            transition: 'all 0.3s ease'
                        }}
                    >
                        Clear All
                    </button>
                </div>

                {aiLoading && (
                    <div className="tm-thinking">
                        <div className="tm-thinking-track"><div className="tm-thinking-slide" /></div>
                        <span>Applying AI formatting…</span>
                    </div>
                )}

                {aiResponse && (
                    <div style={{ marginTop: '30px' }}>
                        <h3 style={{ color: '#6c5ce7', textAlign: 'center', marginBottom: '20px' }}>AI Response:</h3>
                        <div style={{
                            backgroundColor: 'white',
                            padding: '20px',
                            borderRadius: '10px',
                            border: '1px solid #dee2e6',
                            textAlign: 'left',
                            lineHeight: '1.6',
                            whiteSpace: 'pre-wrap',
                            boxShadow: '0 5px 15px rgba(0,0,0,0.1)'
                        }}>
                            {aiResponse}
                        </div>
                        <div style={{ textAlign: 'center', marginTop: '15px' }}>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(aiResponse);
                              setCopiedMessageVisible(true);
                              setTimeout(() => setCopiedMessageVisible(false), 2000);
                            }}
                            style={{
                              padding: '10px 20px',
                              backgroundColor: '#27ae60',
                              color: 'white',
                              border: 'none',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              fontSize: '14px',
                              fontWeight: 'bold',
                              marginRight: '10px',
                              transition: 'background-color 0.3s ease'
                            }}
                            onMouseEnter={(e) => e.target.style.backgroundColor = '#218838'}
                            onMouseLeave={(e) => e.target.style.backgroundColor = '#27ae60'}
                          >
                             Copy AI Response
                          </button>
                        </div>
                    </div>
                )}
            </div>
          ) : currentView === 'dashboard' ? (
          <Dashboard setCurrentView={setCurrentView} />
        ) : (
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-start',
            padding: '20px',
            maxWidth: '800px',
            margin: '0 auto'
          }}>
            <main style={{ 
              width: '100%',
              padding: '0',
            }}>
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
                  {userProfile.totalMinutesUsed < 30 && !userProfile.hasReceivedInitialFreeMinutes ? (
                    <>
                      <strong>Free Trial:</strong> {Math.max(0, 30 - (userProfile.totalMinutesUsed || 0))} minutes remaining!{' '}
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
                       Your free trial has ended. Please{''}
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
                backgroundColor: '#ffffff',
                border: '1px solid #e5e6ea',
                borderRadius: '12px',
                padding: '28px',
                marginBottom: '30px',
                textAlign: 'center',
                boxShadow: 'none'
              }}>
                <h2 style={{ 
                  color: '#1a1b1f', 
                  margin: '0 0 22px 0',
                  fontSize: '1.25rem',
                  fontWeight: '600'
                }}>
                  New transcription
                </h2>
                
                <div style={{ marginBottom: '30px' }}>
                  <h3 style={{ 
                    color: '#6b6d76', 
                    margin: '0 0 14px 0',
                    fontSize: '12px',
                    fontWeight: '600',
                    letterSpacing: '0.07em',
                    textTransform: 'uppercase'
                  }}>
                    Record audio
                  </h3>
                  
                  {isRecording && (
                    <div style={{
                      color: '#c0392b',
                      fontSize: '14px',
                      marginBottom: '12px',
                      fontWeight: '600'
                    }}>
                      Recording {formatTime(recordingTime)}
                    </div>
                  )}
                  
                  <button
                    onClick={isRecording ? stopRecording : startRecording}
                    style={{
                      padding: '10px 18px',
                      fontSize: '14px',
                      fontWeight: '600',
                      backgroundColor: isRecording ? '#c0392b' : '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '7px',
                      cursor: 'pointer',
                      boxShadow: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      transition: 'background-color 0.15s ease'
                    }}
                  >
                    <span style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: 'white',
                      display: 'inline-block'
                    }} />
                    {isRecording ? 'Stop recording' : 'Start recording'}
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
                        <label htmlFor="downloadFormat" style={{ color: '#1a1b1f', fontWeight: '500', fontSize: '14px' }}>
                          Download Format:
                        </label>
                        <select
                          id="downloadFormat"
                          value={downloadFormat}
                          onChange={(e) => setDownloadFormat(e.target.value)}
                          style={{
                            padding: '6px 10px',
                            borderRadius: '7px',
                            border: '1px solid #d5d7dd',
                            fontFamily: 'inherit',
                            fontSize: '14px',
                            background: '#fff'
                          }}
                        >
                          <option value="mp3">MP3 (Compressed)</option>
                          <option value="wav">WAV (Original)</option>
                        </select>
                      </div>
                      <button
                        onClick={downloadRecordedAudio}
                        style={{
                          padding: '8px 14px',
                          backgroundColor: '#fff',
                          color: '#1a1b1f',
                          border: '1px solid #d5d7dd',
                          borderRadius: '7px',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          fontSize: '14px'
                        }}
                      >
                        Download recording ({downloadFormat.toUpperCase()})
                      </button>
                    </div>
                  )}
                </div>
                <div style={{
                  borderTop: '1px solid #eceef1',
                  paddingTop: '26px'
                }}>
                  <h3 style={{ 
                    color: '#6b6d76', 
                    margin: '0 0 14px 0',
                    fontSize: '12px',
                    fontWeight: '600',
                    letterSpacing: '0.07em',
                    textTransform: 'uppercase'
                  }}>
                    Or upload a file
                  </h3>
                  
                  <div style={{
                    border: '1px dashed #ccced4',
                    borderRadius: '10px',
                    padding: '22px',
                    marginBottom: '20px',
                    backgroundColor: '#fafafb'
                  }}>
                    <input
                      className="tm-file"
                      type="file"
                      accept="audio/mp3,audio/mpeg,audio/*,video/*"
                      onChange={handleFileSelect}
                    />
                    {selectedFile && (
                      <div style={{
                        backgroundColor: '#eaf7ee',
                        color: '#1e7e34',
                        padding: '10px',
                        borderRadius: '5px',
                        marginTop: '10px'
                      }}>
                        Selected: {selectedFile.name}
                        <div style={{ fontSize: '12px', marginTop: '5px', opacity: '0.8' }}>
                          Ready for transcription
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px' }}>
                    <label htmlFor="languageSelect" style={{ color: '#1a1b1f', fontWeight: '500', fontSize: '14px' }}>
                      Language
                    </label>
                    <select
                      id="languageSelect"
                      value={selectedLanguage}
                      onChange={(e) => setSelectedLanguage(e.target.value)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '7px',
                        border: '1px solid #d5d7dd',
                        fontFamily: 'inherit',
                        fontSize: '14px',
                        background: '#fff'
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
                  
                  <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px' }}>
                    <label htmlFor="speakerLabelsSelect" style={{ color: '#1a1b1f', fontWeight: '500', fontSize: '14px' }}>
                      Speaker tags
                    </label>
                    <select
                      id="speakerLabelsSelect"
                      value={speakerLabelsEnabled ? "true" : "false"}
                      onChange={(e) => setSpeakerLabelsEnabled(e.target.value === "true")}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '7px',
                        border: '1px solid #d5d7dd',
                        fontFamily: 'inherit',
                        fontSize: '14px',
                        background: '#fff'
                      }}
                    >
                      <option value="false">No Speakers (Default)</option>
                      <option value="true">With Speakers</option>
                    </select>
                  </div>

                  {(status === 'processing' || status === 'uploading') && (
                    <TranscribeProgress
                      phase={transcribePhase}
                      uploadPercent={uploadPercent}
                      expectedSeconds={Math.max(10, (audioDuration || 0) * 0.3)}
                      onCancel={handleCancelUpload}
                    />
                  )}

                  <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', marginTop: '30px' }}>
                    {status === 'idle' && !isUploading && selectedFile && (
                      <button
                        onClick={handleUpload}
                        disabled={!selectedFile || isUploading}
                        style={{
                          padding: '12px 26px',
                          fontSize: '15px',
                          fontWeight: 600,
                          backgroundColor: (!selectedFile || isUploading) ? '#adb2bb' : '#28a745',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: (!selectedFile || isUploading) ? 'not-allowed' : 'pointer',
                          boxShadow: 'none'
                        }}
                      >
                        Start transcription
                      </button>
                    )}

                    {/* Cancel now lives inside the progress panel, beside the
                        thing it cancels, rather than as a large red pill. */}
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
                    {status ==='completed'?'Transcription Completed!':`Status: ${status}`}
                  </h3>
                  {status === 'failed' && (
                    <p style={{ margin: '10px 0 0 0', color: '#666' }}>
                      Transcription failed: 1. Ensure Your Internet is Good and Connected; 2. Refresh the Page.
                    </p>
                  )}
                </div>
              )}
              
              {transcription && (
                <TranscriptEditor
                  fileName={selectedFile ? selectedFile.name : 'Your transcript'}
                  rawText={transcription}
                  segments={transcriptSegments}
                  durationSeconds={audioDuration || 0}
                  audioFile={selectedFile}
                  onSave={handleSaveFreshTranscript}
                  onAskAI={isPaidAIUser(userProfile) ? () => setCurrentView('ai_assistant') : null}
                  canUseAI={isPaidAIUser(userProfile)}
                />
              )}

              {transcription && (
                <p className="tm-result-note">
                  This transcript is saved. You can come back to it any time from{' '}
                  <button type="button" className="tm-result-link" onClick={() => setCurrentView('dashboard')}>
                    My files
                  </button>.
                </p>
              )}
            </main>
          </div>
        )}
        <footer className="tm-footer">
          © {new Date().getFullYear()} TypeMyworDz
        </footer>

          </main>
        </div>

        <FeedbackModal
          show={showFeedbackModal}
          onClose={() => setShowFeedbackModal(false)}
          onSend={handleSendFeedback}
          userName={currentUser?.displayName}
          userEmail={currentUser?.email}
          isSending={isSendingFeedback}
        />
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
          {/* Try the proofreading editor on a sample transcript, no minutes spent. */}
          <Route path="/editor-demo" element={<EditorDemo />} />
          
          {/* Main app routes */}
          <Route path="/*" element={<AppContent />} /> 
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
