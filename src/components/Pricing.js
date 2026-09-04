import React, { useCallback, useEffect, useState } from 'react';

const BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';

// Where the client is paying from.
//
// This is worked out from the clock setting the browser already knows about,
// which costs nothing and asks no permission. It decides two things: which
// price list the server quotes, and which ways of paying are offered. It is
// never shown on screen and never mentioned in the wording.
const TIMEZONE_COUNTRY = {
  'Africa/Nairobi': 'KE',
  'Africa/Lagos': 'NG',
  'Africa/Accra': 'GH',
  'Africa/Johannesburg': 'ZA',
};

export const paymentCountryCode = () => {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (TIMEZONE_COUNTRY[zone]) return TIMEZONE_COUNTRY[zone];
    if (zone.startsWith('Africa/')) return 'OTHER_AFRICA';
  } catch (e) {
    /* fall through to the standard list */
  }
  return 'GLOBAL';
};

const PLAN_COPY = {
  'One-Day Plan': {
    name: 'Day Pass',
    blurb: 'One busy day, nothing ongoing.',
  },
  'Three-Day Plan': {
    name: 'Three Days',
    blurb: 'A short project or a long weekend.',
  },
  'One-Week Plan': {
    name: 'One Week',
    blurb: 'A full week of steady work.',
  },
  'Monthly Plan': {
    name: 'Monthly',
    blurb: 'Our most popular. Everything unlocked.',
    featured: true,
  },
  'Yearly Plan': {
    name: 'Yearly',
    blurb: 'The same as Monthly, at a lower rate.',
  },
};

const money = (n) => {
  const v = Number(n) || 0;
  return v % 1 === 0 ? `$${v}` : `$${v.toFixed(2)}`;
};

// A dollar figure rounds to a penny and tells the client nothing, so the
// per-minute rate is quoted in cents.
const perMinute = (price, credits) => {
  if (!credits) return '';
  const cents = (price / credits) * 100;
  return `${cents.toFixed(1)} cents a minute`;
};

const Tick = () => (
  <svg className="tm-pr-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path d="M2.5 8.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const Dash = () => (
  <svg className="tm-pr-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path d="M3.5 8h9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const Line = ({ has, children }) => (
  <li className={has ? 'tm-pr-line' : 'tm-pr-line tm-pr-line-off'}>
    {has ? <Tick /> : <Dash />}
    <span>{children}</span>
  </li>
);

const Pricing = ({ isSignedIn, currentPlan, onBuy }) => {
  const [catalogue, setCatalogue] = useState(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState('');
  const country = paymentCountryCode();

  useEffect(() => {
    let alive = true;
    fetch(`${BACKEND_URL}/pricing?country_code=${encodeURIComponent(country)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('unavailable'))))
      .then((data) => {
        if (alive) setCatalogue(data);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [country]);

  const buy = useCallback(
    (itemId) => {
      setBusy(itemId);
      Promise.resolve(onBuy(itemId, country)).finally(() => setBusy(''));
    },
    [onBuy, country]
  );

  if (failed) {
    return (
      <div className="tm-pr">
        <h1 className="tm-pr-title">Plans</h1>
        <p className="tm-pr-lede">
          Our prices could not be loaded just now. Please refresh the page in a
          moment, or write to info@typemywordz.ai and we will sort it out.
        </p>
      </div>
    );
  }

  if (!catalogue) {
    return (
      <div className="tm-pr">
        <h1 className="tm-pr-title">Plans</h1>
        <p className="tm-pr-lede">Loading the current prices{'\u2026'}</p>
      </div>
    );
  }

  const { plans, topups, topup_valid_days: topupDays, free_trial_credits: freeCredits } = catalogue;

  return (
    <div className="tm-pr">
      <h1 className="tm-pr-title">Simple plans, priced by the minute</h1>
      <p className="tm-pr-lede">
        One credit is one minute of transcription, or one question to the
        assistant. Every plan below includes both. New accounts get{' '}
        {freeCredits} credits free to try it.
      </p>

      <div className="tm-pr-grid">
        {plans.map((plan) => {
          const copy = PLAN_COPY[plan.id] || { name: plan.id, blurb: '' };
          const yearly = plan.monthly_refill;
          const owned = currentPlan === plan.id;
          return (
            <div
              key={plan.id}
              className={copy.featured ? 'tm-pr-card tm-pr-card-lead' : 'tm-pr-card'}
            >
              {copy.featured && <div className="tm-pr-flag">Most popular</div>}
              <h2 className="tm-pr-name">{copy.name}</h2>
              <div className="tm-pr-price">
                {money(plan.price)}
                {yearly && <span className="tm-pr-per"> a year</span>}
              </div>
              <div className="tm-pr-rate">{perMinute(plan.price, yearly ? plan.credits * 12 : plan.credits)}</div>
              <p className="tm-pr-blurb">{copy.blurb}</p>

              <ul className="tm-pr-lines">
                <Line has>
                  <strong>{plan.credits.toLocaleString()} credits</strong>
                  {yearly ? ' every month, for a year' : plan.days === 1 ? ' for 24 hours' : ` for ${plan.days} days`}
                </Line>
                <Line has>
                  {plan.credits.toLocaleString()} minutes of transcription, or the
                  same number of questions
                </Line>
                <Line has>Speaker labels, timestamps and the proofreading editor</Line>
                <Line has>Word and plain text export, and one-click copy</Line>
                <Line has>
                  {yearly ? 'Transcripts kept for a year' : 'Transcripts kept for 30 days'}
                </Line>
                <Line has={plan.premium_ai}>
                  {plan.premium_ai
                    ? 'The advanced assistant models as well as the standard ones'
                    : 'Advanced assistant models'}
                </Line>
              </ul>

              <button
                type="button"
                className="tm-pr-buy"
                disabled={!isSignedIn || owned || busy === plan.id}
                onClick={() => buy(plan.id)}
              >
                {owned
                  ? 'Your current plan'
                  : !isSignedIn
                  ? 'Sign in to choose this'
                  : busy === plan.id
                  ? 'Opening checkout\u2026'
                  : `Choose ${copy.name}`}
              </button>
            </div>
          );
        })}
      </div>

      <div className="tm-pr-topups">
        <h2 className="tm-pr-h2">Need more credits?</h2>
        <p className="tm-pr-lede tm-pr-lede-tight">
          Buy credits on their own, whenever you like. They last{' '}
          {Math.round(topupDays / 30)} months, they stack on top of whatever your
          plan gives you, and they stay yours even if your plan runs out.
        </p>
        <div className="tm-pr-bundles">
          {topups.map((t) => (
            <div key={t.id} className="tm-pr-bundle">
              <div className="tm-pr-bundle-cr">{t.credits.toLocaleString()}</div>
              <div className="tm-pr-bundle-lbl">credits</div>
              <div className="tm-pr-bundle-price">{money(t.price)}</div>
              <div className="tm-pr-bundle-rate">{perMinute(t.price, t.credits)}</div>
              <button
                type="button"
                className="tm-pr-buy tm-pr-buy-quiet"
                disabled={!isSignedIn || busy === t.id}
                onClick={() => buy(t.id)}
              >
                {!isSignedIn
                  ? 'Sign in to buy'
                  : busy === t.id
                  ? 'Opening checkout\u2026'
                  : 'Buy these credits'}
              </button>
            </div>
          ))}
        </div>
      </div>

      <p className="tm-pr-foot">
        Prices are in US dollars. You can pay by card, and by mobile money where
        it is available to you. We never see or store your card details. Cancel
        any time; a plan simply stops at the end of the period you paid for.
      </p>
    </div>
  );
};

export default Pricing;
