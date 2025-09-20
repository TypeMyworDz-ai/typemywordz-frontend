import React, { useState } from 'react';
import PaymentComponent from './PaymentComponent';

const CreditPurchase = () => {
  const [userEmail, setUserEmail] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState('KES');

  // Currency options for African countries
  const currencies = {
    KES: { name: 'Kenyan Shilling', symbol: 'KES', flag: '🇰🇪' },
    NGN: { name: 'Nigerian Naira', symbol: 'NGN', flag: '🇳🇬' },
    GHS: { name: 'Ghanaian Cedi', symbol: 'GHS', flag: '🇬🇭' },
    ZAR: { name: 'South African Rand', symbol: 'ZAR', flag: '🇿🇦' },
    USD: { name: 'US Dollar', symbol: 'USD', flag: '🌍' }
  };

  // Base prices in USD, converted to local currencies
  const exchangeRates = {
    KES: 150,  // 1 USD = 150 KES
    NGN: 800,  // 1 USD = 800 NGN
    GHS: 12,   // 1 USD = 12 GHS
    ZAR: 18,   // 1 USD = 18 ZAR
    USD: 1     // Base currency
  };

  const basePlans = [
    { 
      name: '24 Hours Pro Access', 
      priceUSD: 2.50, // Base price in USD
      duration: '24 hours',
      description: 'Full access to Pro features for 24 hours',
      features: [
        'Unlimited transcription for 24 hours',
        'Copy to clipboard',
        'MS Word & TXT downloads',
        'Priority processing',
        'High accuracy AI'
      ]
    },
    { 
      name: '5 Days Pro Access', 
      priceUSD: 5.00, // Base price in USD
      duration: '5 days',
      description: 'Full access to Pro features for 5 days',
      features: [
        'Unlimited transcription for 5 days',
        'Copy to clipboard',
        'MS Word & TXT downloads',
        'Priority processing',
        'High accuracy AI',
        'Extended file storage'
      ],
      popular: true
    }
  ];

  // Convert prices based on selected currency
  const getLocalPrice = (priceUSD) => {
    return Math.round(priceUSD * exchangeRates[selectedCurrency]);
  };

  const handlePaymentSuccess = (response, plan) => {
    alert(`Payment successful! You now have ${plan.name} starting immediately. Enjoy unlimited transcription!`);
    console.log('Payment details:', response);
    window.location.reload(); // Refresh to update user status
  };

  const handlePaymentCancel = () => {
    alert('Payment was cancelled');
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif', maxWidth: '1000px', margin: '0 auto' }}>
      <h2 style={{ textAlign: 'center', color: '#6c5ce7', marginBottom: '10px' }}>
        🌍 Buy Credits - Pro Feature Access
      </h2>
      <p style={{ textAlign: 'center', color: '#666', marginBottom: '30px' }}>
        Purchase temporary access to Pro features. Available across Africa with local currency support.
      </p>
      
      {/* Currency Selection */}
      <div style={{ marginBottom: '30px', textAlign: 'center' }}>
        <label style={{ fontSize: '16px', fontWeight: 'bold', color: '#333', marginRight: '10px' }}>
          Select Your Currency:
        </label>
        <select
          value={selectedCurrency}
          onChange={(e) => setSelectedCurrency(e.target.value)}
          style={{
            padding: '10px',
            border: '2px solid #6c5ce7',
            borderRadius: '8px',
            fontSize: '16px',
            marginRight: '20px',
            backgroundColor: 'white'
          }}
        >
          {Object.entries(currencies).map(([code, currency]) => (
            <option key={code} value={code}>
              {currency.flag} {currency.symbol} - {currency.name}
            </option>
          ))}
        </select>
      </div>

      {/* Email Input */}
      <div style={{ marginBottom: '30px', textAlign: 'center' }}>
        <label style={{ fontSize: '16px', fontWeight: 'bold', color: '#333' }}>Your Email: </label>
        <input
          type="email"
          value={userEmail}
          onChange={(e) => setUserEmail(e.target.value)}
          placeholder="Enter your email for payment"
          style={{
            padding: '10px',
            marginLeft: '10px',
            border: '2px solid #6c5ce7',
            borderRadius: '8px',
            width: '300px',
            fontSize: '16px'
          }}
        />
      </div>

      {/* Credit Plans */}
      <div style={{ display: 'flex', gap: '30px', justifyContent: 'center', flexWrap: 'wrap' }}>
        {basePlans.map((plan, index) => {
          const localPrice = getLocalPrice(plan.priceUSD);
          return (
            <div key={index} style={{
              border: plan.popular ? '3px solid #28a745' : '2px solid #ddd',
              borderRadius: '15px',
              padding: '30px',
              width: '350px',
              textAlign: 'center',
              backgroundColor: 'white',
              boxShadow: plan.popular ? '0 15px 40px rgba(40, 167, 69, 0.2)' : '0 10px 30px rgba(0,0,0,0.1)',
              position: 'relative',
              transform: plan.popular ? 'scale(1.05)' : 'none'
            }}>
              {plan.popular && (
                <div style={{
                  position: 'absolute',
                  top: '-15px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  backgroundColor: '#28a745',
                  color: 'white',
                  padding: '8px 20px',
                  borderRadius: '20px',
                  fontSize: '14px',
                  fontWeight: 'bold'
                }}>
                  BEST VALUE
                </div>
              )}
              
              <h3 style={{ color: plan.popular ? '#28a745' : '#6c5ce7', fontSize: '1.5rem', margin: '0 0 10px 0' }}>
                {plan.name}
              </h3>
              
              <p style={{ color: '#666', fontSize: '14px', margin: '0 0 20px 0' }}>
                {plan.description}
              </p>
              
              <div style={{ marginBottom: '20px' }}>
                <span style={{ 
                  fontSize: '3rem',
                  fontWeight: 'bold',
                  color: '#6c5ce7'
                }}>
                  {currencies[selectedCurrency].symbol} {localPrice.toLocaleString()}
                </span>
                <div style={{ color: '#666', fontSize: '14px', marginTop: '5px' }}>
                  for {plan.duration}
                </div>
                {selectedCurrency !== 'USD' && (
                  <div style={{ color: '#999', fontSize: '12px', marginTop: '5px' }}>
                    (≈ ${plan.priceUSD} USD)
                  </div>
                )}
              </div>

              <div style={{ textAlign: 'left', marginBottom: '30px' }}>
                <h4 style={{ color: '#333', fontSize: '16px', marginBottom: '15px' }}>
                  What you get:
                </h4>
                <ul style={{ 
                  listStyle: 'none',
                  padding: '0',
                  margin: '0',
                  lineHeight: '2'
                }}>
                  {plan.features.map((feature, idx) => (
                    <li key={idx} style={{ color: '#666', fontSize: '14px' }}>
                      ✅ {feature}
                    </li>
                  ))}
                </ul>
              </div>
              
              {userEmail ? (
                <PaymentComponent
                  userEmail={userEmail}
                  amount={localPrice}
                  planName={plan.name}
                  currency={selectedCurrency}
                  onSuccess={(response) => handlePaymentSuccess(response, plan)}
                  onCancel={handlePaymentCancel}
                />
              ) : (
                <div style={{
                  padding: '15px',
                  backgroundColor: '#f8f9fa',
                  border: '2px dashed #dee2e6',
                  borderRadius: '8px',
                  color: '#6c757d',
                  fontSize: '14px'
                }}>
                  Please enter your email above to proceed with payment
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {/* Supported Countries */}
      <div style={{
        marginTop: '50px',
        padding: '30px',
        backgroundColor: '#f8f9fa',
        borderRadius: '15px',
        textAlign: 'center'
      }}>
        <h3 style={{ color: '#6c5ce7', marginBottom: '20px' }}>
          🌍 Supported African Countries:
        </h3>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center',
          flexWrap: 'wrap',
          gap: '20px',
          marginBottom: '30px'
        }}>
          <div style={{ color: '#666' }}>🇰🇪 Kenya</div>
          <div style={{ color: '#666' }}>🇳🇬 Nigeria</div>
          <div style={{ color: '#666' }}>🇬🇭 Ghana</div>
          <div style={{ color: '#666' }}>🇿🇦 South Africa</div>
          <div style={{ color: '#666' }}>🌍 Other African Countries (USD)</div>
        </div>
        
        <h3 style={{ color: '#6c5ce7', marginBottom: '20px' }}>
          How it works:
        </h3>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
          gap: '20px',
          textAlign: 'left',
          color: '#666'
        }}>
          <div>
            <strong>1. Choose Currency:</strong> Select your local currency
          </div>
          <div>
            <strong>2. Choose Plan:</strong> 24 hours or 5 days access
          </div>
          <div>
            <strong>3. Pay Securely:</strong> Mobile money, cards, or bank transfer
          </div>
          <div>
            <strong>4. Instant Access:</strong> Pro features activate immediately
          </div>
        </div>
        
        <div style={{ marginTop: '20px', fontSize: '14px', color: '#666' }}>
          💡 <strong>Perfect for:</strong> Students, professionals, content creators across Africa
        </div>
        
        <div style={{ marginTop: '15px', fontSize: '12px', color: '#999' }}>
          Payment powered by Paystack - Supporting mobile money, cards, and bank transfers across Africa
        </div>
      </div>
    </div>
  );
};

export default CreditPurchase;