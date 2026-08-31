import React from 'react';
import LegalShell from './LegalShell';

const SUPPORT_EMAIL = 'info@typemywordz.ai';

const TermsOfService = () => (
  <LegalShell title="Terms of Service" updated="31 August 2026">

    <div className="tm-legal-gist">
      <h2>The short version</h2>
      <ul>
        <li><strong>Plans do not renew by themselves.</strong> You buy a plan, it runs for a fixed period, and then it stops. Nothing is charged again unless you choose to buy again.</li>
        <li><strong>Your work belongs to you.</strong> We claim no ownership of your recordings or your transcripts.</li>
        <li><strong>You need the right to record.</strong> Only upload audio you are allowed to have and allowed to transcribe.</li>
        <li><strong>Transcription is very good, not perfect.</strong> Always check a transcript before relying on it for anything that matters.</li>
        <li><strong>If something breaks on our side, tell us.</strong> We would rather fix it or refund you than leave you stuck.</li>
      </ul>
    </div>

    <p>
      These terms are the agreement between you and TypeMyworDz when you use{' '}
      <a href="https://typemywordz.ai">typemywordz.ai</a>. By creating an account or using the
      service, you accept them. We have tried to write them so that a normal person can read them
      once and understand what they are agreeing to.
    </p>

    <h2>1. Who we are</h2>
    <p>
      TypeMyworDz is a speech-to-text service operated from Nairobi, Kenya. It converts audio and
      video into written transcripts, provides an editor for correcting them, and provides an AI
      assistant that can answer questions about them. You can reach us at{' '}
      <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
    </p>

    <h2>2. Your account</h2>
    <p>
      You need an account to use the service, and you create one by signing in with Google. You
      must be at least 18, or old enough to enter a contract where you live, and you are
      responsible for what happens under your account. Keep your sign-in secure, and tell us
      promptly if you think somebody else is using it.
    </p>
    <p>
      One account is for one person. Please do not share an account or resell access to it.
    </p>

    <h2>3. The free trial</h2>
    <p>
      New accounts get <strong>5 minutes</strong> of free transcription so you can judge the
      quality for yourself before paying anything. It is once per account, no card required, and
      it does not turn into a paid plan. When it is used up, the app will tell you and you can
      decide whether to buy a plan.
    </p>
    <p className="tm-legal-note">
      Creating extra accounts to get more free minutes is not allowed, and we may close accounts
      that do it.
    </p>

    <h2>4. Plans and payment</h2>
    <p>
      Plans are <strong>one-off purchases that last for a fixed period</strong>. They are not
      subscriptions, they do not renew automatically, and there is nothing to cancel. When the
      period ends, your access to paid features simply stops until you buy again.
    </p>
    <table className="tm-legal-table">
      <thead>
        <tr><th>Plan</th><th>How long it lasts</th></tr>
      </thead>
      <tbody>
        <tr><td>One-Day Plan</td><td>1 day</td></tr>
        <tr><td>Three-Day Plan</td><td>3 days</td></tr>
        <tr><td>One-Week Plan</td><td>7 days</td></tr>
        <tr><td>Monthly Plan</td><td>30 days</td></tr>
        <tr><td>Yearly Plan</td><td>365 days</td></tr>
      </tbody>
    </table>
    <p>
      Current prices are shown on the Pricing page, and what you see there is what you pay. Prices
      and available payment methods vary by region. Payment is handled by Paystack; your card
      details go to them and never to us.
    </p>
    <p>
      We may change prices, but never for a plan you have already bought. A change only affects
      purchases made after it takes effect.
    </p>

    <h2>5. Refunds</h2>
    <p>
      If the service fails to do what it promises &mdash; transcription will not run, your plan was
      not applied after you paid, you were charged twice, or something on our side is broken and we
      cannot fix it for you &mdash; <strong>email us and we will refund you</strong>. Write to{' '}
      <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> within 14 days of the charge, tell us
      what happened, and we will sort it out.
    </p>
    <p>
      We generally will not refund a plan that worked as described and that you simply did not use,
      or a transcript you are unhappy with purely on accuracy where the recording itself was very
      poor. That said, we would rather keep a client than win an argument, so if you think you have
      been treated unfairly, tell us and a person will look at it.
    </p>

    <h2>6. Your content, and what you promise us</h2>
    <p>
      Your recordings and your transcripts are <strong>yours</strong>. We do not claim ownership of
      them and we do not use them for anything except producing your transcript and showing it back
      to you. We do not use them to train AI. The Privacy and Security page explains exactly how
      long we hold what.
    </p>
    <p>
      You give us only the permission we need to run the service for you: to process your file, to
      pass it to the transcription provider that will convert it, and to store the resulting
      transcript for you until it expires or you delete it.
    </p>
    <p>By uploading a file, you confirm that:</p>
    <ul>
      <li>You own it, or you otherwise have the right to have it and to transcribe it.</li>
      <li>Where the law where the recording was made requires consent from the people recorded, you have it. Recording-consent rules differ by country and, in some places, by state or county. Complying with them is your responsibility, not ours.</li>
      <li>Uploading it does not break anybody's confidentiality, copyright, or privacy rights.</li>
    </ul>

    <h2>7. What you may not use the service for</h2>
    <p>Please do not use TypeMyworDz to:</p>
    <ul>
      <li>Process recordings you obtained unlawfully, including covert recordings made where that is illegal.</li>
      <li>Break any law that applies to you.</li>
      <li>Attack, overload, probe or reverse-engineer the service, or try to get at other people's data.</li>
      <li>Resell the service, or run it as a hidden engine inside another product, without a written agreement with us.</li>
      <li>Automate large-scale access in a way that degrades the service for other clients.</li>
    </ul>

    <h2>8. Accuracy: what we can and cannot promise</h2>
    <p>
      Our transcription is powered by leading speech-to-text systems and is accurate enough for
      most professional work. It is not perfect, and no system available today is. Accuracy is
      affected by recording quality, background noise, accents, crosstalk, and specialist
      vocabulary.
    </p>
    <p>
      <strong>Check any transcript before relying on it</strong> for something consequential &mdash;
      a legal filing, a medical record, a published quotation, a contract. That is exactly why the
      editor exists. We provide a tool for producing and correcting transcripts; we do not certify
      that a transcript is a complete and correct record.
    </p>

    <h3>The assistant</h3>
    <p>
      The AI assistant is genuinely useful and it is also capable of being confidently wrong. Treat
      its answers as a helpful draft, not as fact. It does not give legal, medical, or financial
      advice, and nothing it says should be relied on as such.
    </p>

    <h2>9. Availability</h2>
    <p>
      We work to keep the service running and available, but we do not promise it will never be
      down. We depend on outside providers, and occasionally we need to take things offline to
      improve them. Where we can plan an interruption, we will give notice in the app.
    </p>
    <p>
      If an outage on our side costs you paid time, tell us and we will make it right.
    </p>

    <h2>10. Closing accounts</h2>
    <p>
      You can stop using TypeMyworDz whenever you like, and you can ask us to delete your account
      and everything in it by emailing{' '}
      <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
    </p>
    <p>
      We may suspend or close an account that breaks section 7, abuses the free trial, or attempts
      to defraud us. Except where the behaviour is serious or unlawful, we will warn you first and
      give you a chance to explain or put it right. If we close a paid account for something that
      was not your fault, we will refund the unused part.
    </p>

    <h2>11. Limits on our liability</h2>
    <p>
      The service is provided as it is. To the extent the law allows, we are not liable for
      indirect or consequential losses &mdash; lost profits, lost business, or losses arising from
      a decision made on the strength of an unchecked transcript.
    </p>
    <p>
      Where we are liable, our total liability to you is limited to the amount you paid us in the
      three months before the problem arose.
    </p>
    <p>
      Nothing here removes rights you have under consumer law that cannot be signed away, and
      nothing here limits liability for fraud.
    </p>

    <h2>12. Changes to these terms</h2>
    <p>
      We may update these terms as the service grows. When we do, we will change the date at the
      top of this page, and if a change is significant we will tell you in the app before it takes
      effect. Continuing to use the service after a change means you accept the updated terms.
    </p>

    <h2>13. Which law applies</h2>
    <p>
      These terms are governed by the laws of Kenya, and the courts of Kenya have jurisdiction over
      any dispute. If you are a consumer elsewhere, this does not take away the protections of the
      law where you live.
    </p>
    <p>
      Before anybody goes near a court: email us. Nearly everything can be resolved by a person
      reading your message and fixing the problem.
    </p>

    <div className="tm-legal-contact">
      <p><strong>Questions about these terms?</strong></p>
      <p>Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></p>
      <p>We answer every message from a real person.</p>
    </div>

  </LegalShell>
);

export default TermsOfService;
