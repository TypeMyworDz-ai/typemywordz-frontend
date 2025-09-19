import React, { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  CardElement,
  useStripe,
  useElements
} from '@stripe/react-stripe-js';
import { useAuth } from '../contexts/AuthContext';

// Load Stripe directly without config file
const stripePromise = loadStripe('pk_test_your_publishable_key_here'); // We'll use a placeholder for now

const TestCheckoutForm = ({ selectedPlan, onCancel }) => {
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    
    // Just show an alert for now
    setTimeout(() => {
      alert(`This would upgrade you to ${selectedPlan} plan!\n\nNext steps:\n1. Set up real Stripe account\n2. Add backend API\n3. Complete payment flow`);
      setLoading(false);
      onCancel(); // Close modal
    }, 1000);
  };

  return (
    <div style={{ maxWidth: '400px', margin: '0 auto', padding: '20px' }}>
      <h3 style={{ color: '#6c5ce7', marginBottom: '20px' }}>
        Upgrade to {selectedPlan?.toUpperCase()} Plan
      </h3>
      
      <div style={{
        backgroundColor: '#f8f9fa',
        padding: '20px',
        borderRadius: '10px',
        marginBottom: '20px',
        textAlign: 'center'
      }}>
        <p>🚧 Payment integration in progress</p>
        <p>This will connect to Stripe when backend is ready!</p>
      </div>
      
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              flex: 1,
              padding: '12px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            style={{
              flex: 2,
              padding: '12px',
              backgroundColor: loading ? '#6c757d' : '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Processing...' : `Preview ${selectedPlan} Upgrade`}
          </button>
        </div>
      </form>
    </div>
  );
};

const StripePayment = ({ selectedPlan, onSuccess, onCancel }) => {
  // For now, don't use Elements wrapper to avoid the useMemo error
  return (
    <TestCheckoutForm 
      selectedPlan={selectedPlan} 
      onSuccess={onSuccess} 
      onCancel={onCancel} 
    />
  );
};

export default StripePayment;