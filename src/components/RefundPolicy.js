import React from 'react';
import LegalShell from './LegalShell';

// ---------------------------------------------------------------------------
// Refund Policy.
//
// This is a page of its own rather than a section inside the Terms because
// payment providers ask for "Terms and Conditions, Refund Policy, and Privacy
// Policy" as three named documents reachable from the site's navigation, and a
// client looking for their money back should not have to read a contract to
// find the paragraph that helps them.
//
// It must say the same thing as section 5 of the Terms. If one changes, change
// the other.
// ---------------------------------------------------------------------------

const SUPPORT_EMAIL = 'info@typemywordz.ai';

const RefundPolicy = () => (
  <LegalShell title="Refund Policy" updated="7 September 2026">
    <p>
      TypeMyworDz is operated by James Gituku Njoki, a sole proprietor based in Nairobi, Kenya.
      This page explains when we give money back, how to ask, and how long it takes. It is written
      in plain language on purpose.
    </p>

    <h2>1. When we will refund you</h2>
    <p>
      If the service did not do what it promised, we refund you. You do not have to argue the
      point. That includes:
    </p>
    <ul>
      <li>Transcription would not run, or produced nothing usable because of a fault on our side.</li>
      <li>You paid and the plan or credits were never applied to your account.</li>
      <li>You were charged twice for the same thing.</li>
      <li>You were charged after cancelling.</li>
      <li>Something on our side is broken, and we cannot fix it for you within a reasonable time.</li>
    </ul>
    <p>
      Write to us within <strong>14 days</strong> of the charge, tell us what happened, and we will
      sort it out.
    </p>

    <h2>2. When we generally will not refund you</h2>
    <ul>
      <li>
        A plan that worked as described and that you simply did not use. Credits keep their value
        for a year, so if you bought credits you have not lost them.
      </li>
      <li>
        A transcript you are unhappy with purely on accuracy, where the recording itself was very
        poor. Automatic transcription is only ever as good as the audio, which is why we give every
        new account free credits to test the service on your own real recordings before you pay
        anything.
      </li>
      <li>Credits you have already spent.</li>
    </ul>
    <p>
      That said, we would rather keep a client than win an argument. If you think you have been
      treated unfairly, tell us and a person will look at it.
    </p>

    <h2>3. How to ask</h2>
    <p>
      Email us at <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> from the address on
      your account, and include:
    </p>
    <ul>
      <li>What you bought, and roughly when.</li>
      <li>What went wrong.</li>
    </ul>
    <p>
      That is all. You do not need an order number, and there is no form to fill in.
    </p>

    <h2>4. How long it takes</h2>
    <p>
      We reply within <strong>2 business days</strong>. Once a refund is approved, the money is
      returned to the same payment method you used. How quickly it appears is up to your bank or
      card provider, and is usually 5 to 10 business days.
    </p>
    <p>
      Where a payment was taken by one of our payment providers acting as the merchant of record,
      the refund is issued through that provider and will appear on your statement under their
      name, the same way the original charge did.
    </p>

    <h2>5. Cancelling a renewing plan</h2>
    <p>
      A plan that renews can be cancelled at any time from your account settings, and cancelling is
      immediate: you keep the time you have already paid for until it runs out, and you are not
      charged again. We do not ask you to email anyone or to explain yourself in order to cancel.
    </p>

    <h2>6. Chargebacks</h2>
    <p>
      If you think you have been wrongly charged, please email us before contacting your bank. We
      can almost always fix it faster than a chargeback can, and a chargeback locks the account
      while the bank investigates, which helps nobody.
    </p>

    <h2>Contact</h2>
    <p>
      TypeMyworDz, operated by James Gituku Njoki, Nairobi, Kenya. Email
      <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
    </p>
  </LegalShell>
);

export default RefundPolicy;
