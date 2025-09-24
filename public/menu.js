// Menu functionality for TypeMyworDz - Part 1

// Global variables for speech recognition and synthesis
let recognition = null;
let speechSynthesis = window.speechSynthesis;
let isRecording = false;

// Initialize speech recognition if available
function initializeSpeechRecognition() {
  if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    
    recognition.onresult = function(event) {
      const textarea = document.getElementById('typeMyNoteText');
      if (textarea) {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript + ' ';
          }
        }
        if (finalTranscript) {
          textarea.value += finalTranscript;
        }
      }
    };
    
    recognition.onerror = function(event) {
      console.error('Speech recognition error:', event.error);
      stopRecording();
    };
    
    recognition.onend = function() {
      stopRecording();
    };
  }
}

// TypeMyNote functionality
function openTypeMyNote() {
  const typeMyNoteHTML = `
    <div class="typemynote-modal" id="typeMyNoteModal">
      <div class="typemynote-content">
        <span class="close-btn" onclick="closeTypeMyNote()">&times;</span>
        <h2>🎤 TypeMyNote - Voice to Text</h2>
        
        <textarea 
          id="typeMyNoteText" 
          class="text-editor" 
          placeholder="Click 'Start Recording' and speak... Your words will appear here automatically."
        ></textarea>
        
        <div class="recording-controls">
          <button id="recordBtn" class="record-btn" onclick="startRecording()">
            🎤 Start Recording
          </button>
          <button id="stopBtn" class="stop-btn" onclick="stopRecording()" disabled>
            ⏹️ Stop Recording
          </button>
          <button class="clear-btn" onclick="clearText()">
            🗑️ Clear Text
          </button>
        </div>
        
        <div class="form-buttons">
          <button onclick="saveText()">💾 Save Text</button>
          <button onclick="copyText()">📋 Copy Text</button>
        </div>
        
        <p style="font-size: 12px; text-align: center; margin-top: 15px; opacity: 0.8;">
          Note: This feature requires microphone permission and works best in Chrome/Edge browsers.
        </p>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', typeMyNoteHTML);
  initializeSpeechRecognition();
}

function closeTypeMyNote() {
  if (isRecording) {
    stopRecording();
  }
  const modal = document.getElementById('typeMyNoteModal');
  if (modal) {
    modal.remove();
  }
}

function startRecording() {
  if (!recognition) {
    alert('Speech recognition is not supported in your browser. Please use Chrome or Edge.');
    return;
  }
  
  const recordBtn = document.getElementById('recordBtn');
  const stopBtn = document.getElementById('stopBtn');
  
  try {
    recognition.start();
    isRecording = true;
    recordBtn.disabled = true;
    recordBtn.classList.add('recording');
    recordBtn.innerHTML = '🔴 Recording...';
    stopBtn.disabled = false;
  } catch (error) {
    console.error('Error starting recording:', error);
    alert('Error starting recording. Please check your microphone permissions.');
  }
}

function stopRecording() {
  if (recognition && isRecording) {
    recognition.stop();
  }
  
  const recordBtn = document.getElementById('recordBtn');
  const stopBtn = document.getElementById('stopBtn');
  
  if (recordBtn && stopBtn) {
    isRecording = false;
    recordBtn.disabled = false;
    recordBtn.classList.remove('recording');
    recordBtn.innerHTML = '🎤 Start Recording';
    stopBtn.disabled = true;
  }
}

function clearText() {
  const textarea = document.getElementById('typeMyNoteText');
  if (textarea) {
    textarea.value = '';
  }
}

function saveText() {
  const textarea = document.getElementById('typeMyNoteText');
  if (textarea && textarea.value.trim()) {
    const blob = new Blob([textarea.value], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `typemynote_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    alert('Text saved successfully!');
  } else {
    alert('No text to save!');
  }
}

function copyText() {
  const textarea = document.getElementById('typeMyNoteText');
  if (textarea && textarea.value.trim()) {
    textarea.select();
    document.execCommand('copy');
    alert('Text copied to clipboard!');
  } else {
    alert('No text to copy!');
  }
}

// Text-to-Speech functionality
function openTextToSpeech() {
  const ttsHTML = `
    <div class="tts-modal" id="ttsModal">
      <div class="tts-content">
        <span class="close-btn" onclick="closeTextToSpeech()">&times;</span>
        <h2>🔊 Text-to-Speech</h2>
        
        <textarea 
          id="ttsText" 
          class="text-editor" 
          placeholder="Enter or paste your text here and click 'Speak' to hear it read aloud..."
        ></textarea>
        
        <div class="voice-controls">
          <select id="voiceSelect" class="voice-select">
            <option value="">Select Voice...</option>
          </select>
          
          <div class="speed-control">
            <label>Speed:</label>
            <input type="range" id="speedSlider" class="speed-slider" min="0.5" max="2" step="0.1" value="1">
            <span id="speedValue">1.0x</span>
          </div>
        </div>
        
        <div class="recording-controls">
          <button class="speak-btn" onclick="speakText()">
            🔊 Speak
          </button>
          <button class="pause-btn" onclick="pauseSpeech()">
            ⏸️ Pause
          </button>
          <button class="stop-speech-btn" onclick="stopSpeech()">
            ⏹️ Stop
          </button>
        </div>
        
        <p style="font-size: 12px; text-align: center; margin-top: 15px; opacity: 0.8;">
          Note: Voice options depend on your system's available voices.
        </p>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', ttsHTML);
  loadVoices();
  
  // Update speed display
  const speedSlider = document.getElementById('speedSlider');
  const speedValue = document.getElementById('speedValue');
  speedSlider.addEventListener('input', function() {
    speedValue.textContent = this.value + 'x';
  });
}
// Menu functionality for TypeMyworDz - Part 2

function closeTextToSpeech() {
  stopSpeech();
  const modal = document.getElementById('ttsModal');
  if (modal) {
    modal.remove();
  }
}

function loadVoices() {
  const voiceSelect = document.getElementById('voiceSelect');
  if (!voiceSelect) return;
  
  const voices = speechSynthesis.getVoices();
  voiceSelect.innerHTML = '<option value="">Default Voice</option>';
  
  voices.forEach((voice, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.textContent = `${voice.name} (${voice.lang})`;
    voiceSelect.appendChild(option);
  });
}

function speakText() {
  const text = document.getElementById('ttsText').value.trim();
  if (!text) {
    alert('Please enter some text to speak!');
    return;
  }
  
  // Stop any ongoing speech
  speechSynthesis.cancel();
  
  const utterance = new SpeechSynthesisUtterance(text);
  
  // Set voice
  const voiceSelect = document.getElementById('voiceSelect');
  const voices = speechSynthesis.getVoices();
  if (voiceSelect.value && voices[voiceSelect.value]) {
    utterance.voice = voices[voiceSelect.value];
  }
  
  // Set speed
  const speedSlider = document.getElementById('speedSlider');
  utterance.rate = parseFloat(speedSlider.value);
  
  speechSynthesis.speak(utterance);
}

function pauseSpeech() {
  if (speechSynthesis.speaking) {
    speechSynthesis.pause();
  }
}

function stopSpeech() {
  speechSynthesis.cancel();
}

// Collaboration functionality
function openCollaborate() {
  const collaborateHTML = `
    <div class="collaborate-modal" id="collaborateModal">
      <div class="collaborate-content">
        <span class="close-btn" onclick="closeCollaborate()">&times;</span>
        <h2>🤝 Join Our Team or Support Us</h2>
        
        <form id="collaborateForm" onsubmit="submitCollaboration(event)">
          <div class="form-group">
            <label>Full Name: *</label>
            <input type="text" id="userName" required placeholder="Enter your full name">
          </div>
          
          <div class="form-group">
            <label>Email Address: *</label>
            <input type="email" id="userEmail" required placeholder="Enter your email address">
          </div>
          
          <div class="form-group">
            <label>Phone Number:</label>
            <input type="tel" id="userPhone" placeholder="Enter your phone number (optional)">
          </div>
          
          <div class="form-group">
            <label>How would you like to help? *</label>
            <select id="helpType" required>
              <option value="">Select an option...</option>
              <option value="transcriber">Become a Human Transcriber</option>
              <option value="developer">Join Development Team</option>
              <option value="marketing">Marketing & Social Media</option>
              <option value="support">Customer Support</option>
              <option value="translator">Language Translation</option>
              <option value="other">Other (please specify in message)</option>
            </select>
          </div>
          
          <div class="form-group">
            <label>Tell us about yourself:</label>
            <textarea id="userMessage" rows="4" placeholder="Share your experience, skills, or how you'd like to contribute..."></textarea>
          </div>
          
          <div class="form-buttons">
            <button type="submit">📧 Submit Application</button>
            <button type="button" onclick="openDonation()" class="donate-btn">💝 Donate Now</button>
          </div>
        </form>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', collaborateHTML);
}

function closeCollaborate() {
  const modal = document.getElementById('collaborateModal');
  if (modal) {
    modal.remove();
  }
}

function submitCollaboration(event) {
  event.preventDefault();
  
  const formData = {
    name: document.getElementById('userName').value,
    email: document.getElementById('userEmail').value,
    phone: document.getElementById('userPhone').value,
    helpType: document.getElementById('helpType').value,
    message: document.getElementById('userMessage').value,
    timestamp: new Date().toISOString()
  };
  
  // For now, we'll just show the data and provide email option
  // Later you can integrate with your backend API
  console.log('Collaboration Form Data:', formData);
  
  const emailSubject = encodeURIComponent('TypeMyworDz Collaboration Application');
  const emailBody = encodeURIComponent(`
Hello TypeMyworDz Team,

I would like to collaborate with your team:

Name: ${formData.name}
Email: ${formData.email}
Phone: ${formData.phone}
How I want to help: ${formData.helpType}
Message: ${formData.message}

Best regards,
${formData.name}
  `);
  
  const mailtoLink = `mailto:support@typemywordz.com?subject=${emailSubject}&body=${emailBody}`;
  window.location.href = mailtoLink;
  
  alert('Thank you for your interest! Your default email client will open with a pre-filled message.');
  closeCollaborate();
}

function openDonation() {
  // Simple donation options - you can integrate with PayPal, Stripe, etc.
  const donationHTML = `
    <div class="collaborate-modal" id="donationModal">
      <div class="collaborate-content">
        <span class="close-btn" onclick="closeDonation()">&times;</span>
        <h2>💝 Support TypeMyworDz</h2>
        
        <p style="text-align: center; margin-bottom: 20px;">
          Your donation helps us maintain our servers and improve our services for everyone!
        </p>
        
        <div class="form-buttons" style="flex-direction: column; gap: 15px;">
          <button onclick="donate(5)" style="background-color: #4CAF50;">💵 Donate USD 5</button>
          <button onclick="donate(10)" style="background-color: #2196F3;">💵 Donate USD 10</button>
          <button onclick="donate(25)" style="background-color: #FF9800;">💵 Donate USD 25</button>
          <button onclick="donate(50)" style="background-color: #9C27B0;">💵 Donate USD 50</button>
          <button onclick="customDonation()" style="background-color: #607D8B;">💵 Custom Amount</button>
        </div>
        
        <p style="font-size: 12px; text-align: center; margin-top: 20px; opacity: 0.8;">
          All donations are processed securely. Thank you for your support! 🙏
        </p>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', donationHTML);
}

function closeDonation() {
  const modal = document.getElementById('donationModal');
  if (modal) {
    modal.remove();
  }
}

function donate(amount) {
  // For now, just show an alert. Later integrate with payment gateway
  alert(`Thank you for wanting to donate USD ${amount}! Payment integration coming soon.`);
  // TODO: Integrate with PayPal, Stripe, or other payment processors
  closeDonation();
}

function customDonation() {
  const amount = prompt('Enter your donation amount (USD):');
  if (amount && !isNaN(amount) && parseFloat(amount) > 0) {
    donate(parseFloat(amount));
  }
}

// Load voices when the page loads
if (speechSynthesis.onvoiceschanged !== undefined) {
  speechSynthesis.onvoiceschanged = loadVoices;
}

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  console.log('TypeMyworDz menu system loaded successfully!');
});
