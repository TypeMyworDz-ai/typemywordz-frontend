import React, { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  CardElement,
  useStripe,
  useElements
} from '@stripe/react-stripe-js';
import { useAuth } from '../contexts/AuthContext';
import { STRIPE_CONFIG } from '../stripe/config';

// Load Stripe once outside of component render cycle
const stripePromise = loadStripe(STRIPE_CONFIG.publishableKey);

const CheckoutForm = ({ selectedPlan, onSuccess, onCancel }) => {
  const stripe = useStripe();
  const elements = useElements();
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Log the status of stripe and elements when component mounts or updates
    console.log('CheckoutForm mounted/updated.');
    console.log('Stripe instance:', stripe ? 'loaded' : 'null');
    console.log('Elements instance:', elements ? 'loaded' : 'null');
    if (!stripe || !elements) {
      setError('Stripe payment elements are not fully loaded. Please wait a moment or refresh.');
    } else {
      setError(null); // Clear error if elements load
    }
  }, [stripe, elements]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    
    if (!stripe || !elements) {
      setError('Stripe payment elements are not ready. Please try again.');
      return;
    }
    
    setLoading(true);
    setError(null);

    try {
      console.log('Initiating payment process for plan:', selectedPlan);
      
      // Create subscription with your backend
      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/create-subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          priceId: STRIPE_CONFIG.plans[selectedPlan].priceId,
          userId: currentUser.uid,
          userEmail: currentUser.email,
          userName: currentUser.displayName || currentUser.email
        }),
      });

      console.log('Backend response status:', response.status);
      const result = await response.json();
      console.log('Backend response:', result);

      if (response.ok && result.clientSecret) {
        // Confirm payment with Stripe
        const { error, paymentIntent } = await stripe.confirmCardPayment(result.clientSecret, {
          payment_method: {
            card: elements.getElement(CardElement),
            billing_details: {
              name: currentUser.displayName || 'Customer',
              email: currentUser.email,
            },
          }
        });

        if (error) {
          console.error('Stripe error:', error);
          setError(error.message);
        } else if (paymentIntent.status === 'succeeded') {
          console.log('Payment succeeded!');
          onSuccess(result.subscriptionId, selectedPlan);
        }
      } else {
        // Handle backend errors
        setError(result.detail || result.error || 'Failed to create subscription on backend.');
      }
    } catch (err) {
      console.error('Frontend payment submission error:', err);
      setError('Payment failed. Please check your internet connection and try again.');
    }
    
    setLoading(false);
  };

  const plan = STRIPE_CONFIG.plans[selectedPlan];
  
  if (!plan) {
    return <div>Error: Plan configuration not found.</div>;
  }

  return (
    <div style={{ maxWidth: '400px', margin: '0 auto', padding: '20px' }}>
      <div style={{
        backgroundColor: '#f8f9fa',
        padding: '20px',
        borderRadius: '10px',
        marginBottom: '20px',
        textAlign: 'center'
      }}>
        <h3 style={{ color: '#6c5ce7', marginBottom: '10px' }}>
          {plan.name}
        </h3>
        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#28a745' }}>
          USD {(plan.amount / 100).toFixed(2)}
          <span style={{ fontSize: '1rem', fontWeight: 'normal' }}>/{plan.interval}</span>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{
          padding: '15px',
          border: '1px solid #ddd',
          borderRadius: '8px',
          marginBottom: '20px',
          backgroundColor: 'white'
        }}>
          {/* CardElement is rendered here */}
          <CardElement
            options={{
              style: {
                base: {
                  fontSize: '16px',
                  color: '#424770',
                  '::placeholder': {
                    color: '#aab7c4',
                  },
                },
                invalid: {
                  color: '#fa755a',
                  iconColor: '#fa755a',
                },
              },
            }}
          />
        </div>
        
        {error && (
          <div style={{
            color: '#e74c3c',
            backgroundColor: '#ffeaea',
            padding: '10px',
            borderRadius: '5px',
            marginBottom: '15px'
          }}>
            {error}
          </div>
        )}
        
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
            disabled={!stripe || !elements || loading} // Disable if stripe/elements not ready
            style={{
              flex: 2,
              padding: '12px',
              backgroundColor: (!stripe || !elements || loading) ? '#6c757d' : '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: (!stripe || !elements || loading) ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Processing...' : `Pay USD ${(plan.amount / 100).toFixed(2)}`}
          </button>
        </div>
      </form>
    </div>
  );
};

const StripePayment = ({ selectedPlan, onSuccess, onCancel }) => {
  if (!selectedPlan) {
    return <div>Error: No plan selected for payment.</div>;
  }

  // Ensure Elements wraps the CheckoutForm
  return (
    <Elements stripe={stripePromise}>
      <CheckoutForm 
        selectedPlan={selectedPlan} 
        onSuccess={onSuccess} 
        onCancel={onCancel} 
      />
    </Elements>
  );
};

export default StripePayment;