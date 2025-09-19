export const STRIPE_CONFIG = {
  publishableKey: process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY,
  plans: {
    pro: {
      priceId: 'price_pro_monthly', // You'll replace this with your actual Stripe Price ID
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
    },
    business: {
      priceId: 'price_business_monthly', // You'll replace this with your actual Stripe Price ID  
      amount: 2999, // Custom pricing - you can adjust this
      name: 'Business Plan',
      interval: 'month',
      features: [
        'Everything in Pro Plan',
        '99%+ Human-level accuracy',
        'Bulk processing',
        'API access', 
        'Custom integrations',
        'Dedicated support',
        'SLA guarantee'
      ]
    }
  }
};