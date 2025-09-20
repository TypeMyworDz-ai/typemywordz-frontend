import React, { useState } from 'react';

const PaymentComponent = ({ userEmail, amount, planName, currency = 'KES', onSuccess, onCancel }) => {
  const [loading, setLoading] = useState(false);

  const initializePayment = () => {
    setLoading(true);
    
    // Check if Paystack script is loaded
    if (!window.PaystackPop) {
      alert('Payment system not loaded. Please refresh the page.');
      setLoading(false);
      return;
    }

    const handler = window.PaystackPop.setup({
      key: process.env.REACT_APP_PAYSTACK_PUBLIC_KEY,
      email: userEmail,
      amount: amount * 100, // Convert to smallest currency unit (kobo, pesewa, cents, etc.)
      currency: currency,
      ref: 'TXN_' + Math.floor(Math.random() * 1000000000 + 1), // Generate unique reference
      metadata: {
        plan: planName,
        currency: currency,
        custom_fields: [
          {
            display_name: "Plan",
            variable_name: "plan",
            value: planName
          },
          {
            display_name: "Currency",
            variable_name: "currency", 
            value: currency
          }
        ]
      },
      callback: function(response) {
        setLoading(false);
        console.log('Payment successful:', response);
        verifyPayment(response.reference);
        if (onSuccess) onSuccess(response);
      },
      onClose: function() {
        setLoading(false);
        console.log('Payment cancelled');
        if (onCancel) onCancel();
      }
    });
    
    handler.openIframe();
  };

  const verifyPayment = async (reference) => {
    try {
      const response = await fetch('/api/verify-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reference }),
      });
      
      const result = await response.json();
      console.log('Payment verification:', result);
    } catch (error) {
      console.error('Payment verification failed:', error);
    }
  };

  // Get currency symbol for display
  const getCurrencySymbol = (curr) => {
    const symbols = {
      KES: 'KES',
      NGN: '₦',
      GHS: '₵',
      ZAR: 'R',
      USD: '$'
    };
    return symbols[curr] || curr;
  };

  return (
    <button 
      onClick={initializePayment} 
      disabled={loading}
      style={{
        width: '100%',
        backgroundColor: loading ? '#ccc' : '#007bff',
        color: 'white',
        padding: '15px 20px',
        border: 'none',
        borderRadius: '8px',
        cursor: loading ? 'not-allowed' : 'pointer',
        fontSize: '16px',
        fontWeight: 'bold'
      }}
    >
      {loading ? 'Processing...' : `Pay ${getCurrencySymbol(currency)} ${amount.toLocaleString()}`}
    </button>
  );
};

export default PaymentComponent;