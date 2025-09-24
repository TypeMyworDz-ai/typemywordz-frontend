// Menu functionality for TypeMyworDz - Updated Version

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

// TypeMyNote functionality - Opens in new tab
function openTypeMyNote() {
  window.open('about:blank', '_blank');
  // For now, show alert until you create a separate page
  setTimeout(() => {
    alert('TypeMyNote will open in a separate page. Feature coming soon!');
  }, 500);
}

// Text-to-Speech functionality - Opens in new tab
function openTextToSpeech() {
  window.open('about:blank', '_blank');
  // For now, show alert until you create a separate page
  setTimeout(() => {
    alert('Text-to-Speech will open in a separate page. Feature coming soon!');
  }, 500);
}

// Collaboration functionality - Simple donation form
function openCollaborate() {
  const collaborateHTML = `
    <div class="collaborate-modal" id="collaborateModal">
      <div class="collaborate-content">
        <span class="close-btn" onclick="closeCollaborate()">&times;</span>
        <h2>💝 Support TypeMyworDz</h2>
        
        <p style="text-align: center; margin-bottom: 25px; font-size: 16px; line-height: 1.4;">
          Support us make Transcription AI affordable to Many
        </p>
        
        <form id="donationForm" onsubmit="submitDonation(event)">
          <div class="form-group">
            <label>Full Name: *</label>
            <input type="text" id="donorName" required placeholder="Enter your full name">
          </div>
          
          <div class="form-group">
            <label>Email Address: *</label>
            <input type="email" id="donorEmail" required placeholder="Enter your email address">
          </div>
          
          <div class="form-group">
            <label>Message (Optional):</label>
            <textarea id="donorMessage" rows="4" placeholder="Tell us why you're supporting TypeMyworDz or any suggestions..."></textarea>
          </div>
          
          <div class="form-buttons">
            <button type="submit" class="donate-btn-main">💝 Donate Now</button>
          </div>
        </form>
        
        <p style="font-size: 12px; text-align: center; margin-top: 20px; opacity: 0.8;">
          Your support helps us keep our services affordable for everyone! 🙏
        </p>
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

function submitDonation(event) {
  event.preventDefault();
  
  const formData = {
    name: document.getElementById('donorName').value,
    email: document.getElementById('donorEmail').value,
    message: document.getElementById('donorMessage').value,
    timestamp: new Date().toISOString()
  };
  
  // For now, show thank you message and log data
  console.log('Donation Form Data:', formData);
  
  const emailSubject = encodeURIComponent('TypeMyworDz Donation Support');
  const emailBody = encodeURIComponent(`
Hello TypeMyworDz Team,

I would like to support your mission to make Transcription AI affordable:

Name: ${formData.name}
Email: ${formData.email}
Message: ${formData.message}

Please send me payment details.

Best regards,
${formData.name}
  `);
  
  const mailtoLink = `mailto:support@typemywordz.com?subject=${emailSubject}&body=${emailBody}`;
  window.location.href = mailtoLink;
  
  alert('Thank you for your support! Your email client will open with a message to our team.');
  closeCollaborate();
}

// Load voices when the page loads
if (speechSynthesis && speechSynthesis.onvoiceschanged !== undefined) {
  speechSynthesis.onvoiceschanged = function() {
    console.log('Voices loaded');
  };
}

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  console.log('TypeMyworDz menu system loaded successfully!');
});
