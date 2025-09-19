export const STRIPE_CONFIG = {
  publishableKey: process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY,
  plans: {
    pro: {
      priceId: 'price_1S8xVnLgugZakECYNFDOMVwh',
      amount: 999, // $9.99 in cents
      name: 'Pro Plan',
      interval: 'month',
      features: [
        'Unlimited transcription access',
        'High accuracy AI transcription', 
        'Priority processing',
        'Copy to clipboard feature',
        'MS Word & TXT downloads',
        '7-day file storage',
        'Email support'
      ]
    }
  }
};