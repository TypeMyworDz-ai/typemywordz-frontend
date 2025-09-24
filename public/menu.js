// Menu functionality for TypeMyworDz - Dropdown Version

// Toggle submenu visibility
function toggleSubmenu(submenuId) {
  const submenu = document.getElementById(submenuId);
  const arrow = event.currentTarget.querySelector('.dropdown-arrow');
  
  if (submenu.classList.contains('open')) {
    submenu.classList.remove('open');
    arrow.classList.remove('rotated');
  } else {
    // Close all other submenus first
    const allSubmenus = document.querySelectorAll('.submenu');
    const allArrows = document.querySelectorAll('.dropdown-arrow');
    
    allSubmenus.forEach(menu => menu.classList.remove('open'));
    allArrows.forEach(arrow => arrow.classList.remove('rotated'));
    
    // Open the clicked submenu
    submenu.classList.add('open');
    arrow.classList.add('rotated');
  }
}

// Show Speech-to-Text message (you are already here)
function showSpeechToText() {
  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.innerHTML = `
    <div style="font-size: 24px; margin-bottom: 10px;">🎙️</div>
    <div><strong>Speech-to-Text</strong></div>
    <div style="margin-top: 8px; font-size: 14px; line-height: 1.4;">
      You are already here! Record/Upload your audios/videos and get transcripts in minutes.
    </div>
  `;
  
  document.body.appendChild(toast);
  
  // Remove toast after animation completes
  setTimeout(() => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }, 4000);
}

// Show coming soon notification
function showComingSoon(productName) {
  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.innerHTML = `
    <div style="font-size: 24px; margin-bottom: 10px;">🚀</div>
    <div><strong>${productName}</strong></div>
    <div style="margin-top: 5px; opacity: 0.9;">Coming Soon!</div>
  `;
  
  document.body.appendChild(toast);
  
  // Remove toast after animation completes
  setTimeout(() => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }, 3000);
}

// Show Human Transcripts message
function showHumanTranscripts() {
  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.innerHTML = `
    <div style="font-size: 24px; margin-bottom: 10px;">💬</div>
    <div><strong>Human Transcripts</strong></div>
    <div style="margin-top: 8px; font-size: 14px; line-height: 1.4;">
      Send Us an Email on typemywordz@gmail.com or Chat with Us on Our Live Chat to Get a Quote
    </div>
  `;
  
  document.body.appendChild(toast);
  
  // Remove toast after animation completes
  setTimeout(() => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }, 4000);
}

// Open donation modal
function openDonate() {
  const donateHTML = `
    <div class="donate-modal" id="donateModal">
      <div class="donate-content">
        <span class="close-btn" onclick="closeDonate()">&times;</span>
        <h2>💝 Support TypeMyworDz</h2>
        
        <p style="text-align: center; margin-bottom: 25px; font-size: 16px; line-height: 1.4;">
          Support Us to make Transcription AI Affordable to People Around the World
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
  
  document.body.insertAdjacentHTML('beforeend', donateHTML);
}

// Close donation modal
function closeDonate() {
  const modal = document.getElementById('donateModal');
  if (modal) {
    modal.remove();
  }
}

// Submit donation form
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
  
  // Show success toast
  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.innerHTML = `
    <div style="font-size: 24px; margin-bottom: 10px;">✅</div>
    <div><strong>Thank You!</strong></div>
    <div style="margin-top: 5px; opacity: 0.9;">Your email client will open shortly</div>
  `;
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }, 3000);
  
  closeDonate();
}

// Close submenus when clicking outside
document.addEventListener('click', function(event) {
  const sidebarMenu = document.getElementById('sidebarMenu');
  if (sidebarMenu && !sidebarMenu.contains(event.target)) {
    const allSubmenus = document.querySelectorAll('.submenu');
    const allArrows = document.querySelectorAll('.dropdown-arrow');
    
    allSubmenus.forEach(menu => menu.classList.remove('open'));
    allArrows.forEach(arrow => arrow.classList.remove('rotated'));
  }
});

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  console.log('TypeMyworDz dropdown menu system loaded successfully!');
});
