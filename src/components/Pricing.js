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
  'One-Day Plan': { name: 'Day Pass', blurb: 'One busy day, nothing ongoing.' },
  'Three-Day Plan': { name: 'Three Days', blurb: 'A short project or a long weekend.' },
  'One-Week Plan': { name: 'One Week', blurb: 'A full week of steady work.' },
  'Monthly Plan': { name: 'Monthly', blurb: 'Our most popular. Everything unlocked.', featured: true },
  'Yearly Plan': { name: 'Yearly', blurb: 'The same as Monthly, at a lower rate.' },
};

const money = (n) => {
  const v = Number(n) || 0;
  return v % 1 === 0 ? `$${v}` : `$${v.toFixed(2)}`;
};

// A dollar figure rounds to a penny and tells the client nothing, so the
// per-minute rate is quoted in cents.
const perMinute = (price, credits) => {
  if (!credits) return '';
  return `${((price / credits) * 100).toFixed(1)} cents a minute`;
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

const useCatalogue = (country) => {
  const [catalogue, setCatalogue] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch(`${BACKEND_URL}/pricing?country_code=${encodeURIComponent(country)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('unavailable'))))
      .then((d) => alive && setCatalogue(d))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [country]);
  return { catalogue, failed };
};

const Shell = ({ title, children }) => (
  <div className="tm-pr">
    <h1 className="tm-pr-title">{title}</h1>
    {children}
  </div>
);

// Plans and credits are two separate pages.
//
// They used to share one long page, with the credit bundles hidden below the
// fold. A client told us they never knew credits existed until they were told
// to scroll. Each is now its own page, and each points clearly at the other.
const Pricing = ({ mode = 'plans', isSignedIn, currentPlan, onBuy, onGoTo }) => {
  const country = paymentCountryCode();
  const { catalogue, failed } = useCatalogue(country);
  const [busy, setBusy] = useState('');

  const buy = useCallback(
    (itemId) => {
      setBusy(itemId);
      Promise.resolve(onBuy(itemId, country)).finally(() => setBusy(''));
    },
    [onBuy, country]
  );

  const heading = mode === 'credits' ? 'Buy or top up credits' : 'Simple plans, priced by the minute';

  if (failed) {
    return (
      <Shell title={heading}>
        <p className="tm-pr-lede">
          Our prices could not be loaded just now. Please refresh the page in a
          moment, or write to info@typemywordz.ai and we will sort it out.
        </p>
      </Shell>
    );
  }

  if (!catalogue) {
    return (
      <Shell title={heading}>
        <p className="tm-pr-lede">Loading the current prices{'\u2026'}</p>
      </Shell>
    );
  }

  const { plans, topups, topup_valid_days: topupDays, free_trial_credits: freeCredits } = catalogue;

  const buyLabel = (id, fallback) =>
    !isSignedIn ? 'Sign in to buy' : busy === id ? 'Opening checkout\u2026' : fallback;

  // ----- The credits page -------------------------------------------------
  if (mode === 'credits') {
    return (
      <Shell title={heading}>
        <p className="tm-pr-lede">
          Credits work everywhere in the app. One credit is one minute of
          transcription, or one question to the assistant. They last{' '}
          {Math.round(topupDays / 30)} months, they stack on top of anything you
          already have, and they stay yours even if a plan runs out. Having
          credits gives you the same features a plan does.
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
                className="tm-pr-buy"
                disabled={!isSignedIn || busy === t.id}
                onClick={() => buy(t.id)}
              >
                {buyLabel(t.id, 'Buy these credits')}
              </button>
            </div>
          ))}
        </div>

        <p className="tm-pr-switch">
          Using the app regularly?{' '}
          <button type="button" className="tm-pr-switch-link" onClick={() => onGoTo('pricing')}>
            A plan works out cheaper
          </button>
        </p>

        <p className="tm-pr-foot">
          Prices are in US dollars. You can pay by card, and by mobile money
          where it is available to you. We never see or store your card details.
          Credits are added to your account as soon as the payment clears.
        </p>
      </Shell>
    );
  }

  // ----- The plans page ---------------------------------------------------
  return (
    <Shell title={heading}>
      <p className="tm-pr-lede">
        One credit is one minute of transcription, or one question to the
        assistant. Every plan includes both.
      </p>

      <p className="tm-pr-switch tm-pr-switch-top">
        Not ready for a plan?{' '}
        <button type="button" className="tm-pr-switch-link" onClick={() => onGoTo('credits')}>
          Buy or top up credits instead
        </button>
      </p>

      <div className="tm-pr-grid tm-pr-grid-six">
        {/* The free card. A price list with no zero on it looks like it is
            hiding something, and new visitors want to know what they get
            before handing anything over. */}
        <div className="tm-pr-card">
          <h2 className="tm-pr-name">Free</h2>
          <div className="tm-pr-price">$0</div>
          <div className="tm-pr-rate">once, on sign up</div>
          <p className="tm-pr-blurb">Try it properly before you pay anything.</p>
          <ul className="tm-pr-lines">
            <Line has>
              <strong>{freeCredits} credits</strong> to use whenever you like
            </Line>
            <Line has>
              {freeCredits} minutes of transcription, or the same number of questions
            </Line>
            <Line has>Speaker labels, timestamps and the proofreading editor</Line>
            <Line has>Word and plain text export, and one-click copy</Line>
            <Line has>Transcripts kept for 30 days</Line>
            <Line has={false}>Advanced assistant models</Line>
          </ul>
          <button type="button" className="tm-pr-buy" disabled>
            {isSignedIn ? 'Included with your account' : 'No card needed'}
          </button>
        </div>

        {plans.map((plan) => {
          const copy = PLAN_COPY[plan.id] || { name: plan.id, blurb: '' };
          const yearly = plan.monthly_refill;
          const owned = currentPlan === plan.id;
          return (
            <div key={plan.id} className={copy.featured ? 'tm-pr-card tm-pr-card-lead' : 'tm-pr-card'}>
              {copy.featured && <div className="tm-pr-flag">Most popular</div>}
              <h2 className="tm-pr-name">{copy.name}</h2>
              <div className="tm-pr-price">
                {money(plan.price)}
                {yearly && <span className="tm-pr-per"> a year</span>}
              </div>
              <div className="tm-pr-rate">
                {perMinute(plan.price, yearly ? plan.credits * 12 : plan.credits)}
              </div>
              <p className="tm-pr-blurb">{copy.blurb}</p>

              <ul className="tm-pr-lines">
                <Line has>
                  <strong>{plan.credits.toLocaleString()} credits</strong>
                  {yearly
                    ? ' every month, for a year'
                    : plan.days === 1
                    ? ' for 24 hours'
                    : ` for ${plan.days} days`}
                </Line>
                <Line has>
                  {plan.credits.toLocaleString()} minutes of transcription, or the same
                  number of questions
                </Line>
                <Line has>Speaker labels, timestamps and the proofreading editor</Line>
                <Line has>Word and plain text export, and one-click copy</Line>
                <Line has>{yearly ? 'Transcripts kept for a year' : 'Transcripts kept for 30 days'}</Line>
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

      <p className="tm-pr-foot">
        Prices are in US dollars. You can pay by card, and by mobile money where
        it is available to you. We never see or store your card details. Cancel
        any time; a plan simply stops at the end of the period you paid for.
      </p>
    </Shell>
  );
};

export default Pricing;
