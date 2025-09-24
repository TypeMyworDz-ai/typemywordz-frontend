// Menu functionality for TypeMyworDz - Dropdown Version with Paystack Integration

let selectedAmount = 0;

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

// Show Speech-to-Text message
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
      Send us an email or chat with us on our Live Chat for a quote
    </div>
  `;
  
  document.body.appendChild(toast);
  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
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
          Support us make Transcription AI affordable to Many
        </p>
        
        <div class="donation-amounts">
          <div class="amount-btn" onclick="donateAmount(5)">USD 5</div>
          <div class="amount-btn" onclick="donateAmount(10)">USD 10</div>
          <div class="amount-btn" onclick="donateAmount(25)">USD 25</div>
          <div class="amount-btn" onclick="donateAmount(50)">USD 50</div>
        </div>
        
        <div style="margin: 20px 0; text-align: center;">
          <input 
            type="number" 
            id="customAmount" 
            placeholder="Enter custom amount (USD)" 
            style="padding: 12px; border-radius: 8px; border: none; width: 200px; text-align: center; background-color: rgba(255, 255, 255, 0.9); color: #333;"
            min="1"
            step="0.01"
          >
          <br><br>
          <button onclick="donateCustomAmount()" class="donate-btn-main">
            💝 Donate Custom Amount
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
}

// Donate specific amount
function donateAmount(amount) {
  processPaystackPayment(amount);
}

// Donate custom amount
function donateCustomAmount() {
  const customAmount = document.getElementById('customAmount').value;
  const amount = parseFloat(customAmount);
  
  if (!amount || amount < 1) {
    showErrorToast('Please enter a valid amount (minimum USD 1)');
    return;
  }
  
  processPaystackPayment(amount);
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

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  console.log('TypeMyworDz menu system with Paystack (USD) loaded successfully!');
});
