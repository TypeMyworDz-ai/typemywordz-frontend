import React from 'react';
import LegalShell from './LegalShell';

const SUPPORT_EMAIL = 'info@typemywordz.com';

const PrivacyPolicy = () => (
  <LegalShell title="Privacy and Security" updated="31 August 2026">

    <div className="tm-legal-gist">
      <h2>The short version</h2>
      <ul>
        <li><strong>We do not keep your audio.</strong> Your recording is held only for as long as it takes to transcribe it, then deleted. It is never saved to our storage.</li>
        <li><strong>Your recordings are never used to train AI.</strong> We have switched this off with every transcription provider we use.</li>
        <li><strong>We never sell your data</strong>, and we never share it for advertising.</li>
        <li><strong>Your transcripts are yours.</strong> You can read, export or delete them at any time, and we delete them automatically once your retention period ends.</li>
        <li><strong>We cannot see your card details.</strong> Payments are handled entirely by our payment provider.</li>
      </ul>
    </div>

    <p>
      This page explains what TypeMyworDz collects, why, who else touches it, and what you can
      do about it. It is written to be read, not to be skipped. If anything here is unclear,
      email us at <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> and we will explain it
      in plain language.
    </p>

    <h2>Who we are</h2>
    <p>
      TypeMyworDz is a speech-to-text service operated from Nairobi, Kenya, and available at{' '}
      <a href="https://typemywordz.ai">typemywordz.ai</a>. For anything to do with your data,
      including requests to see it or delete it, write to{' '}
      <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
    </p>

    <h2>What we collect</h2>
    <table className="tm-legal-table">
      <thead>
        <tr><th>What</th><th>Why we need it</th></tr>
      </thead>
      <tbody>
        <tr>
          <td>Your name, email address and profile picture</td>
          <td>To create your account and show you as signed in. These come from your Google account when you sign in; we never see your Google password.</td>
        </tr>
        <tr>
          <td>Audio and video files you upload or record</td>
          <td>To produce your transcript. Nothing else. See the section below on how briefly we hold them.</td>
        </tr>
        <tr>
          <td>The transcripts we produce</td>
          <td>So you can find, edit and export your work later from My files.</td>
        </tr>
        <tr>
          <td>Minutes used, plan, and payment status</td>
          <td>To apply your plan correctly and to know when a trial or plan has ended.</td>
        </tr>
        <tr>
          <td>The country you are connecting from</td>
          <td>To show you prices in a currency and payment method that works where you are.</td>
        </tr>
        <tr>
          <td>Basic usage statistics</td>
          <td>To understand which parts of the app are used and which are broken. Collected through Google Analytics.</td>
        </tr>
      </tbody>
    </table>
    <p>
      We do not ask for and do not want your card number, your national ID, your date of birth,
      or any other information the service does not need.
    </p>

    <h2>Your recordings: how long we hold them</h2>
    <p>
      This is the part most people care about, so here it is precisely.
    </p>
    <p>
      When you upload or record audio, that file is written to temporary working space on our
      transcription server, sent to a transcription provider, and <strong>deleted as soon as the
      job finishes</strong> &mdash; whether it succeeded or failed. We do not copy it to any
      permanent storage. There is no archive of your audio at TypeMyworDz.
    </p>
    <p>
      A practical consequence: once you leave the editor, the audio is gone from our side. Your
      transcript stays in My files, but if you want to listen along while proofreading later,
      you will need to open your own copy of the recording from your device. The app tells you
      this at the point it matters.
    </p>

    <h3>Your transcripts</h3>
    <table className="tm-legal-table">
      <thead>
        <tr><th>Your plan</th><th>How long we keep transcripts</th></tr>
      </thead>
      <tbody>
        <tr><td>Yearly Plan</td><td>365 days from the day the transcript was created</td></tr>
        <tr><td>Every other plan, and free accounts</td><td>30 days from the day the transcript was created</td></tr>
      </tbody>
    </table>
    <p>
      After that they are deleted automatically. You can also delete any transcript yourself at
      any time, and that takes effect immediately. Export anything you want to keep for longer
      &mdash; Word, plain text, and copy to clipboard are all available in the editor.
    </p>

    <h2>Your recordings are not used to train AI</h2>
    <p>
      Speech-to-text companies often improve their models using the audio their customers send
      them. That is usually switched <em>on</em> unless the customer turns it off. We have
      turned it off:
    </p>
    <ul>
      <li><strong>AssemblyAI</strong> &mdash; our account is opted out of their model improvement programme, and we have set their copy of your audio and transcript to be deleted after one day.</li>
      <li><strong>Deepgram</strong> &mdash; every request we send is marked as excluded from their model improvement programme.</li>
      <li><strong>OpenAI</strong> &mdash; data sent through their programming interface is not used to train their models by default.</li>
    </ul>
    <p>
      The same applies to the assistant. Questions you ask about your transcript are sent to an
      AI provider to answer and are not used to train anybody's models.
    </p>

    <h2>Who else handles your data</h2>
    <p>
      We are a small team and we build on top of specialist providers rather than running
      everything ourselves. Each one below sees only what it needs to do its job.
    </p>
    <table className="tm-legal-table">
      <thead>
        <tr><th>Provider</th><th>What it does for us</th></tr>
      </thead>
      <tbody>
        <tr><td>Google Firebase</td><td>Sign-in, and the database that holds your account and transcripts</td></tr>
        <tr><td>Vercel</td><td>Serves the website itself</td></tr>
        <tr><td>Railway</td><td>Runs our main transcription service</td></tr>
        <tr><td>Render</td><td>Runs two supporting transcription services</td></tr>
        <tr><td>AssemblyAI</td><td>Speech-to-text</td></tr>
        <tr><td>OpenAI</td><td>Speech-to-text, and part of the assistant</td></tr>
        <tr><td>Deepgram</td><td>Speech-to-text, used as a backup</td></tr>
        <tr><td>Anthropic and Google</td><td>Power the assistant's answers</td></tr>
        <tr><td>Paystack</td><td>Takes payments</td></tr>
        <tr><td>Google Analytics</td><td>Anonymous usage statistics</td></tr>
      </tbody>
    </table>
    <p>
      These providers operate servers outside Kenya, mainly in the United States and Europe, so
      using TypeMyworDz means your data crosses borders. We choose providers that publish their
      security practices and commit to protecting data they process on our behalf.
    </p>
    <p className="tm-legal-note">
      We will update this list when it changes. If a provider is added or removed, the change
      appears here.
    </p>

    <h2>Payments</h2>
    <p>
      We never see your card. When you buy a plan you are handed to Paystack, who collect and
      process the payment. What comes back to us is confirmation that a payment succeeded, the
      amount, and which plan it was for. Your card number never touches our systems.
    </p>

    <h2>How we protect your data</h2>
    <ul>
      <li>Everything travels over an encrypted connection. There is no unencrypted route into the app.</li>
      <li>Your account and transcripts sit in Google Firebase, protected by rules that tie every transcript to the account that created it.</li>
      <li>Signing in is handled by Google. We never receive, store or have any way of seeing your password.</li>
      <li>Keys used to talk to our providers are stored as server-side secrets and are never sent to your browser.</li>
      <li>Audio is deleted as soon as a job finishes, which means the most sensitive thing you send us is also the thing we hold for the shortest time.</li>
    </ul>
    <p>
      We will be straight with you about the limits: no online service can promise perfect
      security, and we are not going to pretend otherwise. If we ever discover a breach that
      affects your data, we will tell you what happened, what was affected, and what we are
      doing about it.
    </p>

    <h2>What you can ask us to do</h2>
    <p>Whatever country you are in, you can ask us to:</p>
    <ul>
      <li><strong>Show you</strong> what we hold about you.</li>
      <li><strong>Correct</strong> anything that is wrong.</li>
      <li><strong>Delete</strong> your transcripts, or your whole account and everything in it.</li>
      <li><strong>Send you a copy</strong> of your transcripts in a form you can take elsewhere.</li>
      <li><strong>Stop emailing you</strong> anything that is not essential to your account.</li>
    </ul>
    <p>
      Most of this you can do yourself inside the app. For anything else, email{' '}
      <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> and we will act on it within 30 days.
      There is no charge, and you do not have to give a reason.
    </p>
    <p className="tm-legal-note">
      If you are in the European Economic Area or the United Kingdom, you also have the right to
      complain to your national data protection authority. In Kenya, that is the Office of the
      Data Protection Commissioner.
    </p>

    <h2>Cookies and tracking</h2>
    <p>
      We use the minimum that makes the app work: a sign-in cookie so you are not asked to sign in
      on every page, a small amount of local storage to remember preferences such as your copy
      setting, and Google Analytics to count page visits. We do not run advertising trackers and
      we do not sell data to advertisers.
    </p>

    <h2>Children</h2>
    <p>
      TypeMyworDz is not intended for children under 13, and we do not knowingly collect their
      information. If you believe a child has created an account, tell us and we will remove it.
    </p>

    <h2>Changes to this page</h2>
    <p>
      When we change how we handle data, we will update this page and change the date at the top.
      If a change materially affects your privacy, we will tell you in the app rather than hope
      you notice.
    </p>

    <div className="tm-legal-contact">
      <p><strong>Questions about your data?</strong></p>
      <p>Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></p>
      <p>We answer every message from a real person.</p>
    </div>

  </LegalShell>
);

export default PrivacyPolicy;
