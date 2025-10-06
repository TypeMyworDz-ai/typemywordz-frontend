import React, { useState, useRef, useEffect, useCallback } from 'react';
import './App.css';
import { AuthProvider, useAuth, ToastNotification } from './contexts/AuthContext'; // CORRECTED: Import ToastNotification from AuthContext
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import AdminDashboard from './components/AdminDashboard';
import TranscriptionDetail from './components/TranscriptionDetail';
import RichTextEditor from './components/RichTextEditor';
import Signup from './components/Signup'; // NEW: Import Signup component
import FeedbackModal from './components/FeedbackModal'; // NEW: Import FeedbackModal
import { canUserTranscribe, updateUserUsage, saveTranscription, createUserProfile, updateUserPlan } from './userService';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import FloatingTranscribeButton from './components/FloatingTranscribeButton';
import PrivacyPolicy from './components/PrivacyPolicy';
import AnimatedBroadcastBoard from './components/AnimatedBroadcastBoard'; // NEW: Import the new component
import { db } from './firebase'; // Import the db instance from your firebase.js
import { doc, getDoc } from 'firebase/firestore'; // Import doc and getDoc functions


// UPDATED Configuration - RE-ADDED Render Whisper URL
// MODIFIED: Use the new Railway Backend URL
const RAILWAY_BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';
const RENDER_WHISPER_URL = process.env.REACT_APP_RENDER_WHISPER_URL || 'https://whisper-backend-render.onrender.com/'; // This URL is for TypeMyworDz2 (Render)

// Helper function to determine if a user has access to AI features
const isPaidAIUser = (userProfile) => {
  if (!userProfile || !userProfile.plan) return false;
  // UPDATED: 'Monthly Plan' and 'Yearly Plan' added for AI features
  const paidPlansForAI = ['One-Day Plan', 'Three-Day Plan', 'One-Week Plan', 'Monthly Plan', 'Yearly Plan'];
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
      📋 Copied to clipboard!
    </div>
  );
};

function AppContent() {
  const navigate = useNavigate();
  // FIX: Destructure showMessage, message, messageType, clearMessage from useAuth()
  const { currentUser, logout, userProfile, refreshUserProfile, signInWithGoogle, showMessage, message, messageType, clearMessage } = useAuth(); 
  
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
  const [pricingView, setPricingView] = useState('credits'); // 'credits' for one-time, 'subscription' for recurring (now also one-time)
  const [selectedRegion, setSelectedRegion] = useState('KE'); // Default to Kenya
  const [convertedAmounts, setConvertedAmounts] = useState({ 
    'oneday': { amount: 1.00, currency: 'USD' }, 
    'threeday': { amount: 2.00, currency: 'USD' },
    'oneweek': { amount: 3.00, currency: 'USD' },
    'monthly': { amount: 9.99, currency: 'USD' }, // NEW: Monthly Plan
    'yearly': { amount: 99.99, currency: 'USD' } // NEW: Yearly Plan
  });
  
  // NEW: State for revenue in Admin Dashboard
  const [monthlyRevenue, setMonthlyRevenue] = useState(0);

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
    "Translate this transcript into Spanish.",
  ]);
  
  // Refs
  const mediaRecorderRef = useRef(null);
  const recordingIntervalRef = useRef(null);
  const recordedAudioBlobRef = useRef(null); 
  const abortControllerRef = useRef(null);
  const transcriptionIntervalRef = useRef(null);
  const statusCheckTimeoutRef = useRef(null);
  const isCancelledRef = useRef(false);

  // UPDATED: Admin emails are now referenced from your backend configuration
  const ADMIN_EMAILS = ['typemywordz@gmail.com', 'gracenyaitara@gmail.com']; 
  const isAdmin = ADMIN_EMAILS.includes(currentUser?.email); 

  // NEW: State to prevent duplicate payment verification
  const [isVerifyingPayment, setIsVerifyingPayment] = useState(false);

  // --- Menu State & Functions (React-managed) ---
  const [openSubmenu, setOpenSubmenu] = useState(null); // Tracks which submenu is open

  // NEW: Effect to fetch monthly revenue for Admin Dashboard
  useEffect(() => {
    // Only fetch if user is admin and currentView is 'admin'
    if (isAdmin && currentView === 'admin') {
      const fetchRevenue = async () => {
        try {
          const response = await fetch(`${RAILWAY_BACKEND_URL}/api/admin/monthly-revenue`); // Call new backend endpoint
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          const data = await response.json();
          setMonthlyRevenue(data.monthlyRevenue);
        } catch (error) {
          console.error('Error fetching monthly revenue:', error);
          showMessage('Failed to fetch revenue data', 'error');
        }
      };
      
      fetchRevenue();
      
      // Refresh revenue data every 5 minutes when admin dashboard is open
      const revenueInterval = setInterval(fetchRevenue, 5 * 60 * 1000);
      
      return () => clearInterval(revenueInterval);
    }
  }, [isAdmin, currentView, showMessage, RAILWAY_BACKEND_URL]);

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

      // Override countryCode and currency for Monthly/Yearly plans to force USD
      let actualCountryCode = countryCode;
      let actualAmount = amount;
      let actualCurrency = 'USD'; // Default to USD for all plans on the frontend

      if (planName === 'Monthly Plan' || planName === 'Yearly Plan') {
          actualCountryCode = 'OTHER_AFRICA'; // Use a generic code that defaults to USD
          actualCurrency = 'USD';
          // Amount is already in USD for these plans, so no conversion needed here.
      }
      
      const response = await fetch(`${RAILWAY_BACKEND_URL}/api/initialize-paystack-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email,
          amount: actualAmount, // Pass the USD amount directly for Monthly/Yearly
          plan_name: planName,
          user_id: currentUser.uid,
          country_code: actualCountryCode, // Use the potentially overridden country code
          callback_url: `${window.location.origin}/?payment=success`,
          update_admin_revenue: true // NEW: Flag to update admin revenue stats
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
  }, [currentUser, showMessage, RAILWAY_BACKEND_URL]); // Dependencies

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
            
            if (isAdmin) {
              try {
                const response = await fetch(`${RAILWAY_BACKEND_URL}/api/admin/monthly-revenue`); // Call new backend endpoint
                if (!response.ok) {
                  throw new Error(`HTTP error! status: ${response.status}`);
                }
                const revenueData = await response.json();
                setMonthlyRevenue(revenueData.monthlyRevenue);
              } catch (error) {
                console.error('Error updating revenue after payment:', error);
              }
            }
            
            showMessage(`🎉 Payment successful! ${data.data.plan} activated.`, 'success');
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
  }, [currentUser, showMessage, refreshUserProfile, setCurrentView, RAILWAY_BACKEND_URL, isAdmin, isVerifyingPayment]); // Add isVerifyingPayment to dependencies

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
  }, [currentUser, handlePaystackCallback]); // Keep currentUser and handlePaystackCallback as dependencies

  // Enhanced reset function with better job cancellation - ADDING LOGS
  const resetTranscriptionProcessUI = useCallback(() => { 
    console.log('🔄 DEBUG: resetTranscriptionProcessUI called. Stopping ongoing processes and resetting UI states.');
    
    isCancelledRef.current = true;
    
    setJobId(null); // FIX: Ensure jobId is cleared
    setStatus('idle'); // FIX: Ensure status is reset
    setTranscription(''); // FIX: Clear transcription text
    setAudioDuration(0); // FIX: Clear audio duration
    setIsUploading(false);
    setUploadProgress(0);
    setTranscriptionProgress(0); 
    setSpeakerLabelsEnabled(false); // Reset speaker labels to default (No Speakers)
    
    recordedAudioBlobRef.current = null;
    
    if (abortControllerRef.current) {
      console.log('🔄 DEBUG: Aborting active fetch request.');
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

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
          showMessage('Error getting file info: ' + error.message, 'error');
        }
      };
      audio.onerror = (e) => { // NEW: Add onerror handler for audio loading
        console.error('❌ DEBUG: Audio element error during metadata loading:', e);
        showMessage('Error loading audio file. Please ensure it is a valid audio/video format.', 'error');
        resetTranscriptionProcessUI(); // Reset if audio file itself is problematic
      };
      const audioUrl = URL.createObjectURL(file);
      audio.src = audioUrl;
      console.log('📁 DEBUG: Audio URL created and assigned:', audioUrl);
    } else {
      console.log('📁 DEBUG: Selected file is not an audio/video type. No audio metadata loading.');
      showMessage('Selected file is not a valid audio or video format.', 'error');
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
      showMessage('Could not access microphone: ' + error.message, 'error');
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
    
    // Try to cancel job on Railway backend
    if (jobId) { 
      try {
        console.log(`🛑 DEBUG: Attempting to cancel job ${jobId} on Railway backend.`); // Corrected 'job_id' to 'jobId'
        await fetch(`${RAILWAY_BACKEND_URL}/cancel/${jobId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        console.log('✅ DEBUG: Previous job cancelled successfully on Railway.');
      } catch (error) {
        console.log('⚠️ DEBUG: Failed to cancel previous job on Railway, but continuing with force cancel:', error);
      }
    }
    
    showMessage("🛑 Transcription cancelled! Reloading page...", 'warning');
    
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
      currentUser.uid // Pass the userId here!
    );
    console.log('DEBUG: saveTranscription call completed.');
    
    await refreshUserProfile();
    console.log('DIAGNOSTIC: After refreshUserProfile - userProfile.totalMinutesUsed:', userProfile?.totalMinutesUsed);

    // Success message with favicon and brand name
    showMessage('✅ <img src="/favicon-32x32.png" alt="TypeMyworDz Logo" style="width: 16px; height: 16px; vertical-align: middle; margin-right: 5px;"> TypeMyworDz, Done!', 'success');
    
    // Save the latest transcription for the AI Assistant
    setLatestTranscription(transcriptionText);

  } catch (error) {
    console.error('Error updating usage or saving transcription:', error);
    showMessage('Failed to save transcription or update usage.', 'error');
  } finally {
    // No changes here, as processingMessage state was removed
  }
}, [audioDuration, selectedFile, currentUser, refreshUserProfile, showMessage, recordedAudioBlobRef, userProfile]);

  // Handle successful payment
  const handlePaymentSuccess = useCallback(async (planName, subscriptionId) => {
    try {
      await updateUserPlan(currentUser.uid, planName, subscriptionId);
      
      await refreshUserProfile();
      
      showMessage(`🎉 Successfully upgraded to ${planName.charAt(0).toUpperCase() + planName.slice(1)} plan! You now have unlimited transcription access.`, 'success');
      
      setCurrentView('transcribe');
    } catch (error) {
      console.error('Error updating user plan:', error);
      showMessage('Payment successful but there was an error updating your account. Please contact support.', 'error');
    }
  }, [currentUser?.uid, refreshUserProfile, showMessage, setCurrentView]);

  const checkJobStatus = useCallback(async (jobIdToPass, transcriptionInterval) => {
    if (isCancelledRef.current) {
      console.log('🛑 DEBUG: Status check aborted - job was cancelled'); // NEW LOG
      clearInterval(transcriptionInterval);
      return;
    }
    
    let timeoutId;
    
    try {
      const controller = new AbortController();
      abortControllerRef.current = controller;
      
      timeoutId = setTimeout(() => {
        console.log('⏰ DEBUG: Status check timeout - aborting'); // NEW LOG
        controller.abort();
      }, 10000); 
      
      const statusUrl = `${RAILWAY_BACKEND_URL}/status/${jobIdToPass}`;
      
      const response = await fetch(statusUrl, {
        signal: controller.signal 
      });
      
      clearTimeout(timeoutId);
      
      if (isCancelledRef.current) {
        console.log('🛑 DEBUG: Job cancelled during fetch - stopping immediately'); // NEW LOG
        clearInterval(transcriptionInterval);
        return;
      }
      
      const result = await response.json();
      
      if (isCancelledRef.current) {
        console.log('🛑 DEBUG: Job cancelled after response - stopping immediately'); // NEW LOG
        clearInterval(transcriptionInterval);
        return;
      }
      
      if (response.ok && result.status === 'completed') {
        if (isCancelledRef.current) {
          console.log('🛑 DEBUG: Job cancelled - ignoring completion'); // NEW LOG
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
          showMessage('❌ Transcription failed: ' + result.error + '. Please try again.', 'error');
          clearInterval(transcriptionInterval); 
          setTranscriptionProgress(0);
          setStatus('failed'); 
          setIsUploading(false);
          resetTranscriptionProcessUI();
        }
        
      } else if (response.ok && (result.status === 'cancelled' || result.status === 'canceled')) {
        console.log('✅ DEBUG: Backend confirmed job cancellation'); // NEW LOG
        clearInterval(transcriptionInterval);
        setTranscriptionProgress(0);
        setStatus('idle');
        setIsUploading(false);
        showMessage('🛑 Transcription was cancelled. Please start a new one.', 'warning');
        resetTranscriptionProcessUI();
        
      } else {
        if (result.status === 'processing' && !isCancelledRef.current) {
          console.log('⏳ DEBUG: Job still processing - will check again'); // NEW LOG
          statusCheckTimeoutRef.current = setTimeout(() => {
            if (!isCancelledRef.current) {
              checkJobStatus(jobIdToPass, transcriptionInterval); 
            } else {
              console.log('🛑 DEBUG: Recursive call cancelled'); // NEW LOG
              clearInterval(transcriptionInterval);
              showMessage('🛑 Transcription process interrupted. Please start a new one.', 'warning');
              resetTranscriptionProcessUI();
            }
          }, 2000);
        } else if (isCancelledRef.current) {
          console.log('🛑 DEBUG: Job cancelled - stopping status checks'); // NEW LOG
          clearInterval(transcriptionInterval);
          showMessage('🛑 Transcription process interrupted. Please start a new one.', 'warning');
          resetTranscriptionProcessUI();
        } else {
          const errorDetail = result.detail || `Unexpected status: ${result.status}`;
          showMessage('❌ Status check failed: ' + errorDetail + '. Please try again.', 'error');
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
        console.log('🛑 DEBUG: Request aborted or job cancelled'); // NEW LOG
        clearInterval(transcriptionInterval);
        if (!isCancelledRef.current) {
          setIsUploading(false);
        }
        showMessage('🛑 Transcription process interrupted. Please start a new one.', 'warning');
        resetTranscriptionProcessUI();
        return;
      } else if (!isCancelledRef.current) {
        console.error('❌ DEBUG: Status check error:', error); // NEW LOG
        clearInterval(transcriptionInterval); 
        setTranscriptionProgress(0);
        setStatus('failed'); 
        setIsUploading(false); 
        showMessage('❌ Status check failed: ' + error.message + '. Please try again.', 'error');
        resetTranscriptionProcessUI();
      }
    } finally {
      abortControllerRef.current = null;
    }
  }, [handleTranscriptionComplete, showMessage, RAILWAY_BACKEND_URL, resetTranscriptionProcessUI]);
  // handleUpload with new backend logic for model selection
  const handleUpload = useCallback(async () => {
    console.log('🚀 DEBUG: handleUpload called.'); // NEW LOG
    if (!selectedFile) {
      showMessage('Please select a file first', 'warning');
      console.log('❌ DEBUG: No file selected for upload..'); // NEW LOG
      return;
    }

    if (userProfile === undefined) { // Only show loading profile if currentUser exists but profile hasn't loaded
      showMessage('Loading user profile... Please wait.', 'info');
      console.log('⏳ DEBUG: User profile still loading or not available.'); // NEW LOG
      return;
    }

    const estimatedDuration = audioDuration || Math.max(60, selectedFile.size / 100000);
    console.log('📊 DEBUG: Estimated duration for upload:', estimatedDuration); // NEW LOG

    const transcribeCheck = await canUserTranscribe(currentUser.uid, estimatedDuration);
    console.log('✅ DEBUG: canUserTranscribe check result:', transcribeCheck); // NEW LOG
    
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
        console.log('❌ DEBUG: Blocking transcription due to plan/limit. Redirecting to pricing.'); // NEW LOG
        
        setTimeout(() => {
          setCurrentView('pricing');
          resetTranscriptionProcessUI();
        }, 2000);
        return;
      } else {
        showMessage('You do not have permission to transcribe audio. Please contact support if this is an error.', 'error');
        console.log('❌ DEBUG: Blocking transcription due to insufficient permissions.'); // NEW LOG
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
    // NEW: Send user's free minutes remaining for accurate backend checks
    if (userProfile && userProfile.plan === 'free') {
      const freeMinutesRemaining = Math.max(0, 30 - (userProfile.totalMinutesUsed || 0));
      formData.append('free_minutes_remaining', freeMinutesRemaining.toString());
      formData.append('has_received_initial_free_minutes', userProfile.hasReceivedInitialFreeMinutes ? 'true' : 'false');
    }

    try {
      console.log(`🎯 DEBUG: Using unified transcription endpoint: ${RAILWAY_BACKEND_URL}/transcribe`);
      const response = await fetch(`${RAILWAY_BACKEND_URL}/transcribe`, {
        method: 'POST',
        body: formData,
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        const errorText = await response.text(); // Get raw error text
        console.error('❌ DEBUG: Backend transcription service failed. Status:', response.status, 'Text:', errorText); // NEW LOG
        throw new Error(`Transcription service failed with status: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log('✅ DEBUG: Backend transcription endpoint responded:', result); // NEW LOG

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
        console.error(`❌ DEBUG: Transcription service returned no job ID: ${JSON.stringify(result)}`); // NEW LOG
        throw new Error(`Transcription service returned no job ID: ${JSON.stringify(result)}`);
      }

    } catch (transcriptionError) {
      console.error('❌ DEBUG: Transcription failed in handleUpload catch block:', transcriptionError); // NEW LOG
      showMessage('❌ Transcription service is currently unavailable. Please try again later.', 'error');
      setUploadProgress(0);
      setTranscriptionProgress(0);
      setStatus('failed'); 
      setIsUploading(false);
    }

  }, [selectedFile, audioDuration, currentUser?.uid, currentUser?.email, showMessage, setCurrentView, resetTranscriptionProcessUI, userProfile, selectedLanguage, speakerLabelsEnabled, RAILWAY_BACKEND_URL, checkJobStatus]);

  // Copy to clipboard (now triggers CopiedNotification)
  const copyToClipboard = useCallback(() => { 
    // Check for AI paid user eligibility for this feature
    if (!isPaidAIUser(userProfile)) {
      showMessage('Copy to clipboard is only available for paid AI users (One-Day, Three-Day, One-Week, Monthly Plan, Yearly Plan plans). Please upgrade to access this feature.', 'warning');
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
      showMessage('MS Word download is only available for paid AI users (One-Day, Three-Day, One-Week, Monthly Plan, Yearly Plan plans). Please upgrade to access this feature.', 'warning');
      return;
    }
    
    try {
      showMessage('Generating formatted Word document...', 'info');
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
        const errorText = await response.text(); // NEW LOG
        console.error('❌ DEBUG: Word document generation failed. Status:', response.status, 'Text:', errorText); // NEW LOG
        throw new Error(`Failed to generate Word document: ${response.status} - ${errorText}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transcription_${Date.now()}.docx`; // Use .docx extension
      a.click();
      URL.revokeObjectURL(url);
      showMessage('Word document generated successfully!', 'success');

    } catch (error) {
      console.error('Error downloading Word document:', error);
      showMessage('Failed to generate Word document: ' + error.message, 'error');
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
  }, [showMessage, downloadFormat]);

  const handleLogout = useCallback(async () => {
    try {
      await logout();
    } catch (error) {
      showMessage('Failed to log out', 'error');
    }
  }, [logout, showMessage]);

  const createMissingProfile = useCallback(async () => {
    try {
      await createUserProfile(currentUser.uid, currentUser.email);
      showMessage('Profile created successfully! Refreshing page...', 'success');
      window.location.reload();
    } catch (error) {
      console.error('Error creating profile:', error);
      showMessage('Error creating profile: ' + error.message, 'error');
    }
  }, [currentUser?.uid, currentUser?.email, showMessage]);

  const handleUpgradeClick = useCallback((planType) => {
    console.log('Upgrade clicked for plan:', planType);
    setCurrentView('pricing');
  }, [setCurrentView]);

  // handleAIQuery for User AI Assistant with FormData - UPDATED for Gemini option and fallback
  const handleAIQuery = useCallback(async () => {
      if (!userProfile) { 
          showMessage('Loading user profile... Please wait.', 'info');
          return;
      }
      // Check if user is eligible for AI features
      if (!isPaidAIUser(userProfile)) {
          showMessage('❌ TypeMyworDz AI Assistant features are only available for paid AI users (One-Day, Three-Day, One-Week, Monthly Plan, Yearly Plan plans). Please upgrade your plan.', 'error');
          return;
      }

      if (!latestTranscription || !userPrompt) {
          showMessage('Please provide both a transcript and a prompt for the AI Assistant.', 'warning');
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
          setAIResponse(data.ai_response || data.formatted_transcript); 
          showMessage('✨ AI response generated successfully!', 'success');

      } catch (error) {
          console.error('AI Assistant Error:', error);
          showMessage('❌ AI Assistant failed: ' + error.message + '. If using Gemini, try Claude for sensitive content.', 'error');
      } finally {
          setAILoading(false);
      }
  }, [latestTranscription, userPrompt, userProfile, showMessage, RAILWAY_BACKEND_URL, selectedAIProvider]);
  
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

  // NEW: State and handlers for Feedback Modal
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackName, setFeedbackName] = useState(currentUser?.displayName || '');
  const [feedbackEmail, setFeedbackEmail] = useState(currentUser?.email || '');
  const [feedbackText, setFeedbackText] = useState('');
  const [isSendingFeedback, setIsSendingFeedback] = useState(false);

  const handleOpenFeedback = useCallback(() => {
    setFeedbackName(currentUser?.displayName || '');
    setFeedbackEmail(currentUser?.email || '');
    setFeedbackText('');
    setShowFeedbackModal(true);
    setOpenSubmenu(null); // Close any open menu
  }, [currentUser]);

  const handleSendFeedback = useCallback(async (name, email, feedback) => { // Updated to accept parameters
    if (!email || !feedback.trim()) {
      showMessage('Email and Feedback are mandatory.', 'warning');
      return;
    }
    setIsSendingFeedback(true);
    try {
      await saveFeedback(name, email, feedback); // Call saveFeedback with passed parameters
      showMessage('✅ Feedback sent successfully! Thank you.', 'success');
      setShowFeedbackModal(false);
    } catch (error) {
      console.error('Error sending feedback:', error);
      showMessage('❌ Failed to send feedback: ' + error.message, 'error');
    } finally {
      setIsSendingFeedback(false);
    }
  }, [showMessage]); // Dependencies for useCallback

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
        showMessage('❌ Sharing cancelled or failed.', 'warning');
      }
    } else {
      // Fallback for browsers that do not support the Web Share API
      // You can offer to copy the URL or compose an email
      const fallbackText = `${shareData.title}\n${shareData.text}\n${shareData.url}`;
      
      // Option 1: Copy to clipboard
      navigator.clipboard.writeText(fallbackText)
        .then(() => setCopiedMessageVisible(true)) // Use copied message
        .then(() => setTimeout(() => setCopiedMessageVisible(false), 2000)) // Hide after 2 seconds
        .catch(() => showMessage('❌ Failed to copy link.', 'error'));

    }
  }, [showMessage]);


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
          <Login />
          {/* Removed the 'Don't have an account? Sign Up' text and button */}

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
              textShadow: '0 2px 4px rgba(255,255,255,0.8)',
              marginLeft: '5px'
            }}>Claude</span>
            <span style={{ color: 'white', fontSize: '1.2rem', margin: '0 8px' }}>&amp;</span>
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
        {/* REMOVED: ToastNotification component call from here */}
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
    <Route path="/signup" element={<Signup />} /> {/* Move this here */}
    <Route path="/privacy-policy" element={<PrivacyPolicy />} />
    <Route path="/dashboard" element={
      <>
        <FloatingTranscribeButton />
        <Dashboard setCurrentView={setCurrentView} />
      </>
    } />
    {/* NEW: Route for Signup component */}
    {/* FIXED: Passing showMessage and monthlyRevenue props to AdminDashboard */}
    <Route path="/admin" element={isAdmin ? <AdminDashboard showMessage={showMessage} monthlyRevenue={monthlyRevenue} /> : <Navigate to="/" />} />
    
    <Route path="/" element={
      <div style={{ 
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: (currentView === 'dashboard' || currentView === 'admin' || currentView === 'pricing' || currentView === 'ai_assistant') ? '#f8f9fa' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
      }}>
        {/* NEW: ToastNotification component call re-added here */}
        <ToastNotification message={message} type={messageType} clearMessage={clearMessage} />
        <CopiedNotification isVisible={copiedMessageVisible} />

        {/* The Menu (sidebar-menu) will be rendered here directly when authenticated */}
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
            onMouseLeave={() => setOpenSubmenu(null)}
        >
            {/* Products Parent Menu */}
            <div className="menu-item" onClick={() => handleToggleSubmenu('productsSubmenu')}>
                <span className="menu-icon">📦</span>
                <span className="menu-text">Products</span>
                <span className={`dropdown-arrow ${openSubmenu === 'productsSubmenu' ? 'rotated' : ''}`}>▼</span>
                
                {/* Products Submenu */}
                {openSubmenu === 'productsSubmenu' && (
                    <div className={`submenu ${openSubmenu === 'productsSubmenu' ? 'open' : ''}`} id="productsSubmenu">
                        <div className="submenu-item" onClick={() => window.showSpeechToText()}>
                            <span className="submenu-icon">🎙️</span>
                            <span className="menu-text">Speech-to-Text</span>
                        </div>
                        <div className="submenu-item" onClick={() => window.showComingSoon('TypeMyNote')}>
                            <span className="submenu-icon">🎤</span>
                            <span className="menu-text">TypeMyNote</span>
                        </div>
                        <div className="submenu-item" onClick={() => window.showComingSoon('Text-to-Speech')}>
                            <span className="submenu-icon">🔊</span>
                            <span className="menu-text">Text-to-Speech</span>
                        </div>
                        <div className="submenu-item" onClick={() => window.showHumanTranscripts()}>
                            <span className="submenu-icon">👥</span>
                            <span className="menu-text">Human Transcripts</span>
                        </div>
                    </div>
                )}
            </div>
            
            {/* Pricing Menu Item */}
            <div className="menu-item" onClick={handleOpenPricing}>
                <span className="menu-icon">💰</span>
                <span className="menu-text">Pricing</span>
            </div>

            {/* Social Parent Menu */}
            <div className="menu-item" onClick={() => handleToggleSubmenu('socialSubmenu')}>
                <span className="menu-icon">🤝</span>
                <span className="menu-text">Social</span>
                <span className={`dropdown-arrow ${openSubmenu === 'socialSubmenu' ? 'rotated' : ''}`}>▼</span>
                
                {/* Social Submenu */}
                {openSubmenu === 'socialSubmenu' && (
                    <div className={`submenu ${openSubmenu === 'socialSubmenu' ? 'open' : ''}`} id="socialSubmenu">
                        <div className="submenu-item" onClick={() => window.openDonate()}>
                            <span className="submenu-icon">💝</span>
                            <span className="submenu-text">Donate</span>
                        </div>
                        {/* NEW: Feedback Menu Item */}
                        <div className="submenu-item" onClick={handleOpenFeedback}>
                            <span className="submenu-icon">📝</span>
                            <span className="submenu-text">Feedback</span>
                        </div>
                        {/* NEW: Share Menu Item */}
                        <div className="submenu-item" onClick={handleShare}>
                            <span className="submenu-icon">📤</span>
                            <span className="menu-text">Share</span>
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

        {/* UPDATED HEADER: Moved company name and tagline below logout button */}
        {currentView === 'transcribe' && (
          <header style={{ 
            textAlign: 'center', 
            padding: '20px 20px 10px',
            color: 'white',
            position: 'relative'
          }}>
            {/* Centered user info section at the top with Logout on LEFT */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'center', 
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '15px',
              fontSize: '14px',
              opacity: '0.9',
              marginBottom: '20px',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              padding: '10px 20px',
              borderRadius: '25px',
              backdropFilter: 'blur(10px)',
              position: 'relative'
            }}>
              {/* MOVED: Logout button to the LEFT */}
              <button
                onClick={handleLogout}
                style={{
                  position: 'absolute',
                  left: '20px',
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
              
              {/* UPDATED: Removed "Logged in as:" text, just show user name */}
              <span>{userProfile?.name || currentUser.email}</span>
              {userProfile && userProfile.plan === 'Yearly Plan' ? ( 
                <span>Plan: Yearly Plan (Unlimited Transcription) {userProfile.expiresAt && `until ${new Date(userProfile.expiresAt).toLocaleDateString()}`}</span> 
              ) : userProfile && userProfile.plan === 'Monthly Plan' ? ( 
                <span>Plan: Monthly Plan (Unlimited Transcription) {userProfile.expiresAt && `until ${new Date(userProfile.expiresAt).toLocaleDateString()}`}</span> 
              ) : userProfile && userProfile.plan === 'One-Week Plan' ? ( // NEW: One-Week Plan
                <span>Plan: One-Week Plan {userProfile.expiresAt && `until ${new Date(userProfile.expiresAt).toLocaleDateString()}`}</span>
              ) : userProfile && userProfile.plan === 'Three-Day Plan' ? ( // NEW: Three-Day Plan
                <span>Plan: Three-Day Plan {userProfile.expiresAt && `until ${new Date(userProfile.expiresAt).toLocaleDateString()}`}</span>
              ) : userProfile && userProfile.plan === 'One-Day Plan' ? ( // NEW: One-Day Plan
                <span>Plan: One-Day Plan {userProfile.expiresAt && `until ${new Date(userProfile.expiresAt).toLocaleDateString()}`}</span>
              ) : userProfile && userProfile.plan === 'free' && !userProfile.hasReceivedInitialFreeMinutes ? ( // FIX: Only show remaining if initial minutes not used
                <span>Plan: Free Trial ({Math.max(0, 30 - (userProfile.totalMinutesUsed || 0))} minutes remaining)</span>
              ) : userProfile && userProfile.plan === 'free' && userProfile.hasReceivedInitialFreeMinutes ? ( // FIX: Show used if initial minutes used
                <span>Plan: Free Trial (Used - Upgrade for Transcription)</span>
              ) : (
                <span>Plan: Free (Recording Only - Upgrade for Transcription)</span>
              )}
            </div>
            
                       {/* NEW: Company name and tagline positioned below the logout button */}
            <div style={{ 
              position: 'absolute', 
              top: '80px', 
              left: '20px', 
              zIndex: 100
            }}>
              <div style={{ position: 'relative', display: 'inline-block' }}>
                {/* Removed the small favicon image completely */}
                <h1 style={{ 
                  fontSize: '1.8rem', 
                  margin: '0 0 5px 0',
                  fontWeight: 'bold', 
                  textShadow: '0 2px 4px rgba(0,0,0,0.3)',
                  color: '#20cdd3ff' 
                }}>
                  TypeMyworDz
                </h1>
              </div>
              <p style={{ 
                fontSize: '1rem', 
                margin: '0',
                opacity: '0.9',
                color: '#000000', 
                fontStyle: 'italic', 
                fontWeight: 'bold' 
              }}>
                You Talk, We Type
              </p>
            </div>



            
            {/* BIG LOGO now positioned after the login info */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'center', 
              marginBottom: '20px' 
            }}>
              <img 
                src="/android-chrome-192x192.png" 
                alt="TypeMyworDz Logo" 
                style={{ 
                  width: '80px', 
                  height: '80px',
                  filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
                }} 
              />
            </div>
          </header>
        )}

        {/* Transcription Editor button above other navigation buttons */}
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
                transition: 'all 0.3s ease'
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
              {/* Removed the favicon image here as well */}
              ✏️ Transcription Editor
            </button>
          </div>
        )}
        {currentUser && !userProfile && ( // Only show loading profile if currentUser exists but profile hasn't loaded
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

        {/* Main Navigation Buttons */}
        <div style={{ 
          textAlign: 'center', 
          padding: currentView === 'transcribe' ? '0 20px 40px' : '20px',
          backgroundColor: (currentView === 'dashboard' || currentView === 'admin' || currentView === 'pricing' || currentView === 'ai_assistant') ? 'white' : 'transparent'
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
          
          {/* AI Assistant Button in Main Navigation */}
          <button
            onClick={() => {
              if (!isPaidAIUser(userProfile)) {
                showMessage('❌ TypeMyworDz AI Assistant features are only available for paid AI users (One-Day, Three-Day, One-Week, Monthly Plan, Yearly Plan plans). Please upgrade your plan.', 'error');
                return;
              }
              setCurrentView('ai_assistant');
            }}
            disabled={!isPaidAIUser(userProfile)}
            style={{
              padding: '12px 25px',
              margin: '0 10px',
              backgroundColor: (!isPaidAIUser(userProfile)) ? '#a0a0a0' : (currentView === 'ai_assistant' ? '#6c5ce7' : '#6c757d'),
              color: 'white',
              border: 'none',
              borderRadius: '25px',
              cursor: (!isPaidAIUser(userProfile)) ? 'not-allowed' : 'pointer',
              fontSize: '16px',
              boxShadow: (!isPaidAIUser(userProfile)) ? 'none' : '0 4px 15px rgba(108, 92, 231, 0.4)',
              transition: 'all 0.3s ease'
            }}
          >
            ✨ Assistant
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

        {/* UPDATED: AnimatedBroadcastBoard - moved to occupy the space where "Logged in as..." was, made larger and more beautiful */}
        {currentView === 'transcribe' && (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            padding: '0 20px 20px',
            marginTop: '-20px' // Pull it up slightly to fill the space better
          }}>
            <div style={{
              width: '100%',
              maxWidth: '800px', // Increased width to stretch and make it more beautiful
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              borderRadius: '15px',
              boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
              border: '1px solid #e9ecef',
              padding: '20px', // Increased padding for better spacing
              boxSizing: 'border-box', 
              textAlign: 'center'
            }}>
              <AnimatedBroadcastBoard />
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
                  💸 Economy Plans
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
                  💳 Premium Plans
                </button>
              </div>
              {pricingView === 'credits' ? (
                <>
                  <div style={{ marginTop: '20px' }}>
                    <h2 style={{ color: '#007bff', marginBottom: '30px' }}>
                      💸 Economy Plans
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

                    {/* HORIZONTAL LAYOUT FOR ECONOMY PLANS */}
                    <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', flexWrap: 'wrap' }}>
                      {/* One-Day Plan */}
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
                              showMessage('Please log in first to purchase credits.', 'warning');
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
                      
                      {/* Three-Day Plan */}
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

                      {/* One-Week Plan */}
                      <div style={{
                        backgroundColor: 'white',
                        padding: '30px 25px',
                        borderRadius: '10px',
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
                              showMessage('Please log in first to purchase credits.', 'warning');
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
                      💳 Premium Plans
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
                        boxShadow: '0 10px 30px rgba(40, 167, 69, 0.2)', 
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
                            <li>✅ Everything in Free Plan</li>
                            <li>✅ Unlimited transcription access</li>
                            <li>✅ High accuracy AI transcription</li>
                            <li>✅ Priority processing</li>
                            <li>✅ Copy to clipboard feature</li>
                            <li>✅ MS Word &amp; TXT downloads</li>
                            <li>✅ 30-day file storage</li>
                            <li>✅ Email support</li>
                          </ul>
                          <button 
                            onClick={() => {
                              if (!currentUser?.email) {
                                showMessage('Please log in first to purchase.', 'warning');
                                return;
                              }
                              initializePaystackPayment(currentUser.email, 9.99, 'Monthly Plan', 'OTHER_AFRICA'); // Force USD
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
                            <li>✅ Everything in Free Plan</li>
                            <li>✅ Unlimited transcription access</li>
                            <li>✅ High accuracy AI transcription</li>
                            <li>✅ Priority processing</li>
                            <li>✅ ✅ Copy to clipboard feature</li>
                            <li>✅ MS Word &amp; TXT downloads</li>
                            <li>✅ 365-day file storage</li>
                            <li>✅ Email support (yearly)</li>
                          </ul>
                          <button 
                            onClick={() => {
                              if (!currentUser?.email) {
                                showMessage('Please log in first to purchase.', 'warning');
                                return;
                              }
                              initializePaystackPayment(currentUser.email, 99.99, 'Yearly Plan', 'OTHER_AFRICA'); // Force USD
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
                  🔒 All plans include:
                </h3>
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
                  gap: '20px',
                  textAlign: 'left',
                  color: '#666'
                }}>
                  <div>✅ Transcript management under History</div>
                  <div>✅ Easy-to-use interface</div>
                  <div>✅ Client Support</div>
                </div>
              </div>
            </div>
          </>
        ) : currentView === 'admin' ? (
          <AdminDashboard showMessage={showMessage} monthlyRevenue={monthlyRevenue} />
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
                {/* Conditional message for non-paid users */}
                {!isPaidAIUser(userProfile) && (
                  <p style={{ textAlign: 'center', color: '#dc3545', marginBottom: '30px', fontWeight: 'bold' }}>
                    ❌ TypeMyworDz AI Assistant features are only available for paid AI users (One-Day, Three-Day, One-Week, Monthly Plan, Yearly Plan plans). Please upgrade your plan.
                  </p>
                )}
                <p style={{ textAlign: 'center', color: '#666', marginBottom: '30px' }}>
                    Paste your transcript below and tell me what you'd like me to do!
                    I can summarize, answer questions, create bullet points, and more.
                </p>

                {/* NEW: AI Provider Selection for User AI Assistant */}
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
                        Your Transcript:
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

                {/* NEW: Predefined Query Options */}
                <div style={{ marginBottom: '20px', textAlign: 'center' }}>
                  <label style={{ display: 'block', color: '#6c5ce7', fontWeight: 'bold', marginBottom: '10px' }}>
                    Quick Query Options:
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '10px' }}>
                    {predefinedPrompts.map((prompt, index) => (
                      <button
                        key={index}
                        onClick={() => handlePredefinedPromptClick(prompt)}
                        disabled={!isPaidAIUser(userProfile) || aiLoading}
                        style={{
                          padding: '8px 15px',
                          backgroundColor: (!isPaidAIUser(userProfile) || aiLoading) ? '#a0a0a0' : '#4CAF50',
                          color: 'white',
                          border: 'none',
                          borderRadius: '20px',
                          cursor: (!isPaidAIUser(userProfile) || aiLoading) ? 'not-allowed' : 'pointer',
                          fontSize: '0.9rem',
                          transition: 'background-color 0.3s ease'
                        }}
                        onMouseEnter={(e) => { if (!e.target.disabled) e.target.style.backgroundColor = '#45a049'; }}
                        onMouseLeave={(e) => { if (!e.target.disabled) e.target.style.backgroundColor = '#4CAF50'; }}
                      >
                        {prompt.split(' ')[0]}...
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: '30px' }}>
                    <label htmlFor="userPromptInput" style={{ display: 'block', color: '#6c5ce7', fontWeight: 'bold', marginBottom: '10px' }}>
                        Your Custom Request:
                    </label>
                    <input
                        type="text"
                        id="userPromptInput"
                        value={userPrompt}
                        onChange={(e) => setUserPrompt(e.target.value)}
                        placeholder="Type your request for the AI here..."
                        style={{
                            width: '100%',
                            padding: '15px',
                            borderRadius: '10px',
                            border: '1px solid #ddd',
                            fontSize: '1rem',
                            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)'
                        }}
                        disabled={!isPaidAIUser(userProfile)}
                    />
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
                            boxShadow: (!isPaidAIUser(userProfile)) ? 'none' : '0 4px 15px rgba(108, 92, 231, 0.4)',
                            transition: 'all 0.3s ease'
                        }}
                    >
                        {aiLoading ? 'Processing...' : `✨ Get AI Response with ${selectedAIProvider === 'claude' ? 'Claude' : 'Gemini'}`}
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
                            boxShadow: (!isPaidAIUser(userProfile)) ? 'none' : '0 4px 15px rgba(220, 53, 69, 0.4)',
                            transition: 'all 0.3s ease'
                        }}
                    >
                        Clear All
                    </button>
                </div>

                {aiLoading && (
                    <div style={{ textAlign: 'center', color: '#6c5ce7', marginBottom: '20px' }}>
                        <div className="progress-bar-indeterminate" style={{
                            backgroundColor: '#6c5ce7',
                            height: '20px',
                            width: '100%',
                            borderRadius: '10px',
                            marginBottom: '10px'
                        }}></div>
                        Generating AI response...
                    </div>
                )}

                {aiResponse && (
                    <div style={{ marginTop: '30px' }}>
                        <h3 style={{ color: '#6c5ce7', textAlign: 'center', marginBottom: '20px' }}
                        >AI Response:</h3>
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
                        {/* NEW: Copy button for AI Response */}
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
                            📋 Copy AI Response
                          </button>
                        </div>
                        
                    </div>
                )}
            </div>
          ) : currentView === 'dashboard' ? (
          <Dashboard setCurrentView={setCurrentView} />
        ) : (
          // This is the 'transcribe' view, where the main content will be displayed without the broadcast board in the layout
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
                  {userProfile.totalMinutesUsed < 30 && !userProfile.hasReceivedInitialFreeMinutes ? ( // FIX: Only show remaining if initial minutes not used
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
                  ) : ( // FIX: Show used if initial minutes used, and remove the minute count
                    <>
                      🎵 Your free trial has ended. Please{' '}
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
                      marginBottom: '10px',
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
                  borderTop: '2px solid #e9ece2',
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
                      <div className="progress-bar-container" style={{
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
                        🎯 Processing...
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
                      Transcription failed: 1. Ensure Your Internet is Good and Connected; 2. Refresh the Page.
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
                      disabled={!isPaidAIUser(userProfile)}
                      style={{
                        padding: '10px 20px',
                        backgroundColor: (!isPaidAIUser(userProfile)) ? '#a0a0a0' : '#27ae60',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: (!isPaidAIUser(userProfile)) ? 'not-allowed' : 'pointer',
                        fontSize: '14px',
                        opacity: (!isPaidAIUser(userProfile)) ? 0.6 : 1
                      }}
                    >
                      {!isPaidAIUser(userProfile) ? '🔒 Copy (Pro AI Only)' : '📋 Copy to Clipboard'}
                    </button>
                    
                    <button
                      onClick={downloadAsWord}
                      disabled={!isPaidAIUser(userProfile)}
                      style={{
                        padding: '10px 20px',
                        backgroundColor: (!isPaidAIUser(userProfile)) ? '#a0a0a0' : '#007bff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: (!isPaidAIUser(userProfile)) ? 'not-allowed' : 'pointer',
                        fontSize: '14px',
                        opacity: (!isPaidAIUser(userProfile)) ? 0.6 : 1
                      }}
                    >
                      {!isPaidAIUser(userProfile) ? '🔒 Word (Pro AI Only)' : '📄 MS Word'}
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

                    <button
                      onClick={() => {
                        if (!isPaidAIUser(userProfile)) {
                          showMessage('❌ TypeMyworDz AI Assistant features are only available for paid AI users (One-Day, Three-Day, One-Week, Monthly Plan, Yearly Plan plans). Please upgrade your plan.', 'error');
                          return;
                        }
                        setCurrentView('ai_assistant');
                      }}
                      disabled={!isPaidAIUser(userProfile)}
                      style={{
                        padding: '10px 20px',
                        backgroundColor: (!isPaidAIUser(userProfile)) ? '#a0a0a0' : '#6c5ce7',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: (!isPaidAIUser(userProfile)) ? 'not-allowed' : 'pointer',
                        fontSize: '14px',
                        opacity: (!isPaidAIUser(userProfile)) ? 0.6 : 1
                      }}
                    >
                      ✨ TypeMyworDz Assistant
                    </button>
                  </div>
                  
                  {!isPaidAIUser(userProfile) && (
                    <div style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.95)',
                      color: '#856404',
                      padding: '10px',
                      borderRadius: '5px',
                      marginBottom: '20px',
                      textAlign: 'center',
                      fontSize: '14px'
                    }}>
                      🔒 Copy to clipboard, MS Word downloads, and AI Assistant are available for paid AI users (One-Day, Three-Day, One-Week, Monthly Plan, Yearly Plan plans).{' '}
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
                    lineHeight: '1.6',
                    whiteSpace: 'pre-wrap',
                    border: '1px solid #dee2e6'
                  }}>
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
          </div>
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

        {/* NEW: Feedback Modal Component */}
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
          
          {/* Main app routes */}
          {/* Ensure the root path (/) is handled last or specifically if other paths match parts of it. */}
          {/* The "/*" route catches all unmatched paths after specific ones. */}
          <Route path="/*" element={<AppContent />} /> 
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
