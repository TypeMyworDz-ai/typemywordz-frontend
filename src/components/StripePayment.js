import React, { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  CardElement,
  useStripe,
  useElements
} from '@stripe/react-stripe-js';
import { useAuth } from '../contexts/AuthContext';
import { STRIPE_CONFIG } from '../stripe/config';

const stripePromise = loadStripe(STRIPE_CONFIG.publishableKey);

const CheckoutForm = ({ selectedPlan, onSuccess, onCancel }) => {
  const stripe = useStripe();
  const elements = useElements();
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    
    if (!stripe || !elements) return;
    
    setLoading(true);
    setError(null);

    try {
      // Create subscription
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

      const result = await response.json();

      if (response.ok && result.clientSecret) {
        // Confirm payment
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
          setError(error.message);
        } else if (paymentIntent.status === 'succeeded') {
          onSuccess(result.subscriptionId, selectedPlan);
        }
      } else {
        setError(result.error || 'Failed to create subscription');
      }
    } catch (err) {
      setError('Payment failed. Please try again.');
      console.error('Payment error:', err);
    }
    
    setLoading(false);
  };

  const plan = STRIPE_CONFIG.plans[selectedPlan];

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
        <ul style={{ textAlign: 'left', marginTop: '15px', paddingLeft: '20px' }}>
          {plan.features.map((feature, index) => (
            <li key={index} style={{ marginBottom: '5px' }}>✅ {feature}</li>
          ))}
        </ul>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{
          padding: '15px',
          border: '1px solid #ddd',
          borderRadius: '8px',
          marginBottom: '20px',
          backgroundColor: 'white'
        }}>
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
            disabled={!stripe || loading}
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
            {loading ? 'Processing...' : `Subscribe USD ${(plan.amount / 100).toFixed(2)}/${plan.interval}`}
          </button>
        </div>
      </form>
    </div>
  );
};

const StripePayment = ({ selectedPlan, onSuccess, onCancel }) => (
  <Elements stripe={stripePromise}>
    <CheckoutForm 
      selectedPlan={selectedPlan} 
      onSuccess={onSuccess} 
      onCancel={onCancel} 
    />
  </Elements>
);

export default StripePayment;