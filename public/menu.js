// Menu functionality for TypeMyworDz - Dropdown Version with Enhanced UI
// Adapted to be called from React components.

let selectedAmount = 0; // Still used for donation logic

// This function will now simply return the ID of the submenu to toggle
// React component will handle the actual class manipulation
function toggleSubmenu(submenuId) {
  return submenuId; // React component will interpret this
}

// Show Speech-to-Text message
function showSpeechToText() {
  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.innerHTML = `
    <div style="font-size: 24px; margin-bottom: 10px;">🎙️</div>
    <div><strong>Speech-to-Text</strong></div>
    <div style="margin-top: 8px; font-size: 14px; line-height: 1.4;">
      Record/Upload your audios/videos and get transcripts in minutes!
    </div>
  `;
  
  document.body.appendChild(toast);
  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
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
  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
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
  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 4000);
}

// Open Privacy Policy in new tab
function openPrivacyPolicy() {
  window.open('/privacy-policy', '_blank');
}

// Select donation amount with visual feedback
function selectAmount(amount) {
  selectedAmount = amount;
  
  // These DOM manipulations will need to be handled by React state
  // when the donation modal is moved into React. For now, they remain
  // here if the modal is still plain HTML.
  document.querySelectorAll('.amount-btn').forEach(btn => {
    btn.classList.remove('selected');
  });
  
  // event.target is not available when called from React if not passed
  // The React component will manage selection state.
  // event.target.classList.add('selected'); 
  
  const customInput = document.getElementById('customAmount');
  if (customInput) {
    customInput.value = '';
  }
  
  console.log(`Selected amount: USD ${amount}`);
}

// Handle custom amount input
function handleCustomAmount() {
  const customInput = document.getElementById('customAmount');
  const customValue = parseFloat(customInput.value);
  
  if (customValue && customValue > 0) {
    selectedAmount = customValue;
    
    document.querySelectorAll('.amount-btn').forEach(btn => {
      btn.classList.remove('selected');
    });
  }
}

// Open donation modal
function openDonate() {
  const donateHTML = `
    <div class="donate-modal" id="donateModal">
      <div class="donate-content">
        <span class="close-btn" onclick="closeDonate()">&times;</span>
        <h2>💝 Support TypeMyworDz</h2>
        
        <p style="text-align: center; margin-bottom: 25px; font-size: 16px; line-height: 1.4;">
          Support Us To Make Transcription AI affordable to Everyone Around the World
        </p>
        
        <div class="donation-amounts">
          <div class="amount-btn" onclick="selectAmount(5)">USD 5</div>
          <div class="amount-btn" onclick="selectAmount(10)">USD 10</div>
          <div class="amount-btn" onclick="selectAmount(25)">USD 25</div>
          <div class="amount-btn" onclick="selectAmount(50)">USD 50</div>
        </div>
        
        <div class="custom-amount-section">
          <input 
            type="number" 
            id="customAmount" 
            class="custom-amount"
            placeholder="Enter custom amount (USD)" 
            min="1"
            step="0.01"
            oninput="handleCustomAmount()"
          >
        </div>
        
        <div style="text-align: center; margin-top: 20px;">
          <button onclick="processDonation()" class="donate-btn-main" id="donateBtn">
            💝 Donate Now
          </button>
        </div>
        
        <p style="font-size: 12px; text-align: center; margin-top: 20px; opacity: 0.8;">
          Secure payment powered by Paystack 🙏
        </p>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', donateHTML);
}

// Close donation modal
function closeDonate() {
  const modal = document.getElementById('donateModal');
  if (modal) modal.remove();
  selectedAmount = 0;
}

// Process donation
function processDonation() {
  const customAmount = document.getElementById('customAmount').value;
  const finalAmount = customAmount && parseFloat(customAmount) > 0 ? parseFloat(customAmount) : selectedAmount;
  
  if (!finalAmount || finalAmount <= 0) {
    showErrorToast('Please select or enter a donation amount');
    return;
  }
  
  if (finalAmount < 1) {
    showErrorToast('Minimum donation amount is USD 1');
    return;
  }
  
  // Disable button and show loading
  const donateBtn = document.getElementById('donateBtn');
  donateBtn.disabled = true;
  donateBtn.innerHTML = '<span class="loading-spinner"></span>Processing...';
  
  // Process Paystack payment
  processPaystackPayment(finalAmount);
}

// Process Paystack payment
function processPaystackPayment(amount) {
  const handler = PaystackPop.setup({
    key: 'pk_live_f1f9d4b5a15b29b7c51e199b14995619fedced43',
    email: 'donor@typemywordz.com',
    amount: Math.round(amount * 100), // Convert to cents for USD
    currency: 'USD',
    ref: 'donation_' + Math.floor((Math.random() * 1000000000) + 1),
    metadata: {
      product: 'TypeMyworDz Donation',
      amount_usd: amount,
      donor_type: 'supporter'
    },
    callback: function(response) {
      // Payment successful
      console.log('Donation successful:', response);
      
      // Show success message
      const toast = document.createElement('div');
      toast.className = 'toast-notification';
      toast.style.background = 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)';
      toast.innerHTML = `
        <div style="font-size: 24px; margin-bottom: 10px;">✅</div>
        <div><strong>Thank You!</strong></div>
        <div style="margin-top: 8px; font-size: 14px;">Your donation of USD ${amount} was successful!</div>
        <div style="margin-top: 5px; font-size: 12px; opacity: 0.9;">Reference: ${response.reference}</div>
      `;
      
      document.body.appendChild(toast);
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 6000);
      
      // Log donation data for your records
      const donationData = {
        reference: response.reference,
        amount: amount,
        currency: 'USD',
        timestamp: new Date().toISOString(),
        status: 'successful'
      };
      console.log('Donation Data:', donationData);
      
      closeDonate();
    },
    onClose: function() {
      console.log('Payment cancelled');
      
      // Re-enable button
      const donateBtn = document.getElementById('donateBtn');
      if (donateBtn) {
        donateBtn.disabled = false;
        donateBtn.innerHTML = '💝 Donate Now';
      }
      
      showErrorToast('Payment was cancelled. You can try again anytime.');
    }
  });
  
  handler.openIframe();
}

// Show success toast
function showSuccessToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.style.background = 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)';
  toast.innerHTML = `
    <div style="font-size: 24px; margin-bottom: 10px;">✅</div>
    <div><strong>Success!</strong></div>
    <div style="margin-top: 8px; font-size: 14px; line-height: 1.4;">${message}</div>
  `;
  
  document.body.appendChild(toast);
  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 5000);
}

// Show error toast
function showErrorToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.style.background = 'linear-gradient(135deg, #ff6b6b 0%, #ff5252 100%)';
  toast.innerHTML = `
    <div style="font-size: 24px; margin-bottom: 10px;">❌</div>
    <div><strong>Error</strong></div>
    <div style="margin-top: 8px; font-size: 14px; line-height: 1.4;">${message}</div>
  `;
  
  document.body.appendChild(toast);
  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 4000);
}

// Expose functions to global scope for React to call
window.toggleSubmenu = toggleSubmenu;
window.showSpeechToText = showSpeechToText;
window.showComingSoon = showComingSoon;
window.showHumanTranscripts = showHumanTranscripts;
window.openPrivacyPolicy = openPrivacyPolicy;
window.openDonate = openDonate; // Expose openDonate if the modal is still handled by plain JS/HTML
window.selectAmount = selectAmount; // If donation modal is still plain HTML
window.handleCustomAmount = handleCustomAmount; // If donation modal is still plain HTML
window.closeDonate = closeDonate; // If donation modal is still plain HTML
window.processDonation = processDonation; // If donation modal is still plain HTML
window.showErrorToast = showErrorToast; // If needed by other plain JS functions
