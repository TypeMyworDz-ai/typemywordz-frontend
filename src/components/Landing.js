import React from 'react';
import { Link } from 'react-router-dom';
import Login from './Login';

/**
 * The signed-out home page.
 *
 * Three jobs, in order of importance:
 *   1. Tell a first-time visitor what this is and let them try it.
 *   2. Earn enough trust that they hand over a recording.
 *   3. Say the app's name, explain its purpose, and link the privacy policy,
 *      because Google's OAuth review checks the home page for exactly those
 *      three things before it will show our name on the sign-in screen.
 */

const WORK_TYPES = [
  {
    name: 'Legal',
    text: 'Hearings, depositions, client interviews and case notes, with each speaker separated.',
  },
  {
    name: 'Medical',
    text: 'Consultations, case discussions and dictated notes, handled with the discretion they need.',
  },
  {
    name: 'Research and academic',
    text: 'Interviews, focus groups and fieldwork, ready to code and quote.',
  },
  {
    name: 'Media and interviews',
    text: 'Podcasts, panels and press interviews, turned around fast enough to publish.',
  },
  {
    name: 'Business',
    text: 'Meetings, calls and hand-offs, so a decision is not lost because nobody wrote it down.',
  },
  {
    name: 'General',
    text: 'Anything else you need in writing. Lectures, sermons, voice notes, a long phone call.',
  },
];

const STEPS = [
  {
    n: '1',
    head: 'Bring your audio',
    text: 'Upload a file or record straight into the browser. Most common audio and video formats work.',
  },
  {
    n: '2',
    head: 'We write it down',
    text: 'Your recording is transcribed and, if you ask for it, split by speaker. Minutes, not hours.',
  },
  {
    n: '3',
    head: 'Polish and take it away',
    text: 'Correct anything you want in the editor, then export to Word or plain text, or copy it in one click.',
  },
];

const Landing = () => {
  const go = (id) => (e) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="tm-app tm-login tm-lp">

      {/* ---- Signed-out top bar ---- */}
      <div className="tm-topbar">
        <div className="tm-brand">
          <img className="tm-brand-logo" src="/android-chrome-192x192.png" alt="TypeMyworDz" />
          <div className="tm-brand-text">
            <div className="tm-wordmark">
              <span className="tm-w-purple">Type</span>
              <span className="tm-w-green">My</span>
              <span className="tm-w-purple">worDz</span>
            </div>
            <div className="tm-slogan">You Talk, We Type</div>
          </div>
        </div>
        <div className="tm-spacer"></div>
        <div className="tm-menu">
          <div className="menu-item" onClick={go('what')}>
            <span className="menu-text">What we transcribe</span>
          </div>
          <div className="menu-item" onClick={go('assistant')}>
            <span className="menu-text">Ask TypeMyworDz</span>
          </div>
          <div className="menu-item" onClick={go('how')}>
            <span className="menu-text">How it works</span>
          </div>
          <div className="menu-item" onClick={go('plans')}>
            <span className="menu-text">Pricing</span>
          </div>
          <Link className="menu-item" to="/faq">
            <span className="menu-text">Help and FAQ</span>
          </Link>
          <Link className="menu-item" to="/privacy-policy">
            <span className="menu-text">Legal</span>
          </Link>
        </div>
      </div>

      {/* ---- Hero ---- */}
      <section className="tm-lp-hero" id="top">
        <div className="tm-lp-hero-copy">
          <h1>
            Turn recordings into<br />text you can actually use.
          </h1>
          <p className="tm-lp-lede">
            TypeMyworDz is a transcription service for people whose work depends on getting
            the words right. Upload a recording or record in your browser, and get back a
            clean, speaker-separated transcript you can edit and export in minutes.
          </p>

          <ul className="tm-lp-ticks">
            <li>Speaker labels, so you know who said what</li>
            <li>A proper editor for correcting as you listen</li>
            <li>Export to Word or plain text, or copy in one click</li>
            <li>An assistant that answers questions about your transcript</li>
            <li>Your recordings are never used to train AI</li>
          </ul>
        </div>

        <div className="tm-lp-hero-card">
          <Login />
          <p className="tm-lp-freenote">
            <strong>5 minutes free</strong> when you sign up. No card, no trial that quietly
            becomes a bill.
          </p>
        </div>
      </section>

      {/* ---- What we transcribe ---- */}
      <section className="tm-lp-band" id="what">
        <div className="tm-lp-inner">
          <h2>What we transcribe</h2>
          <p className="tm-lp-sub">
            The work below is what our clients bring us most. If yours is not on the list, it
            almost certainly still fits.
          </p>
          <div className="tm-lp-grid">
            {WORK_TYPES.map((w) => (
              <div className="tm-lp-card" key={w.name}>
                <h3>{w.name}</h3>
                <p>{w.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Ask TypeMyworDz. A second reason to be here, not just a feature. ---- */}
      <section className="tm-lp-band tm-lp-band-plain" id="assistant">
        <div className="tm-lp-inner">
          <div className="tm-lp-ask">
            <div className="tm-lp-ask-copy">
              <div className="tm-lp-ask-badge">
                <img src="/android-chrome-192x192.png" alt="" width="22" height="22" />
                <span>Included with every paid plan</span>
              </div>
              <h2>Ask TypeMyworDz</h2>
              <p className="tm-lp-sub">
                An assistant built into your account. Ask it about a transcript you have just
                had done, or about anything else you are working on, and stop paying for a
                second subscription somewhere else.
              </p>
              <ul className="tm-lp-ticks">
                <li>Ask questions about any transcript without pasting it anywhere</li>
                <li>Summaries, action points, and tidied-up wording in seconds</li>
                <li>Attach images, PDFs and Word documents and ask about those too</li>
                <li>No limit on how long your question can be</li>
                <li>Your chats are saved, and only you can read them</li>
                <li>Choose the model you prefer in your settings</li>
              </ul>
            </div>

            <div className="tm-lp-ask-demo" aria-hidden="true">
              <div className="tm-lp-ask-turn">
                <div className="tm-lp-ask-who">You</div>
                <div className="tm-lp-ask-said">
                  Summarise this interview and list what I promised to send.
                </div>
              </div>
              <div className="tm-lp-ask-turn">
                <div className="tm-lp-ask-who tm-lp-ask-who-ai">
                  <img src="/android-chrome-192x192.png" alt="" width="18" height="18" />
                </div>
                <div className="tm-lp-ask-answer">
                  <p>A forty minute call about the Wright placement. Three things were agreed.</p>
                  <ul>
                    <li>Confirm the school start date on Tuesday</li>
                    <li>Send the special needs funding form</li>
                    <li>Arrange transport, he will be a bus rider</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---- How it works ---- */}
      <section className="tm-lp-band tm-lp-band-plain" id="how">
        <div className="tm-lp-inner">
          <h2>How it works</h2>
          <div className="tm-lp-steps">
            {STEPS.map((s) => (
              <div className="tm-lp-step" key={s.n}>
                <div className="tm-lp-stepnum">{s.n}</div>
                <h3>{s.head}</h3>
                <p>{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Privacy. The strongest thing we have to say, so it gets its own space. ---- */}
      <section className="tm-lp-band" id="privacy">
        <div className="tm-lp-inner tm-lp-narrow">
          <h2>Your recording does not stick around</h2>
          <p className="tm-lp-sub">
            Most services keep your audio. We do not, and we have gone out of our way to make
            that true rather than merely say it.
          </p>
          <div className="tm-lp-promises">
            <div className="tm-lp-promise">
              <h3>Audio is deleted when the job ends</h3>
              <p>
                Your file is held only for as long as it takes to transcribe it. It is never
                copied to permanent storage, so there is no archive of your recordings for
                anyone to lose.
              </p>
            </div>
            <div className="tm-lp-promise">
              <h3>Never used to train AI</h3>
              <p>
                Transcription providers usually train on customer audio by default. We have
                switched that off with every provider we use, and check it.
              </p>
            </div>
            <div className="tm-lp-promise">
              <h3>Your transcripts stay yours</h3>
              <p>
                Delete any transcript whenever you like. We never sell your data and we never
                share it for advertising.
              </p>
            </div>
          </div>
          <p className="tm-lp-readmore">
            The full detail, including every company that touches your data, is in our{' '}
            <Link to="/privacy-policy">Privacy and Security page</Link>.
          </p>
        </div>
      </section>

      {/* ---- Plans ---- */}
      <section className="tm-lp-band tm-lp-band-plain" id="plans">
        <div className="tm-lp-inner tm-lp-narrow">
          <h2>Plans</h2>
          <p className="tm-lp-sub">
            Buy the time you need. Plans are one-off purchases that last a fixed period, so
            nothing renews behind your back and there is nothing to cancel.
          </p>
          <table className="tm-lp-plans">
            <tbody>
              <tr><td>Free trial</td><td>5 minutes, once, no card</td></tr>
              <tr><td>One-Day Plan</td><td>1 day, 4 hours of transcription included</td></tr>
              <tr><td>Three-Day Plan</td><td>3 days, 8 hours of transcription included</td></tr>
              <tr><td>One-Week Plan</td><td>7 days, 15 hours of transcription included</td></tr>
              <tr><td>Monthly Plan</td><td>30 days, 25 hours of transcription included</td></tr>
              <tr><td>Yearly Plan</td><td>365 days, 25 hours of transcription each month, transcripts kept a full year</td></tr>
            </tbody>
          </table>
          <p className="tm-lp-readmore">
            If you need more than your plan includes, you can add extra hours without changing plan. Prices depend on where you are, so that you pay in a currency and by a method that
            works locally. Sign in to see the prices for your region.
          </p>
        </div>
      </section>

      {/* ---- Closing call to action ---- */}
      <section className="tm-lp-cta">
        <div className="tm-lp-inner tm-lp-narrow">
          <h2>Try it on a real recording</h2>
          <p>
            Five minutes free is enough to judge the quality on your own audio, which is the
            only test that matters.
          </p>
          <button className="tm-lp-cta-btn" onClick={go('top')}>
            Get started
          </button>
        </div>
      </section>

      <footer className="tm-sitefoot">
        <span>&copy; {new Date().getFullYear()} TypeMyworDz</span>
        <span className="tm-sitefoot-links">
          <Link to="/faq">Help and FAQ</Link>
          <Link to="/privacy-policy">Privacy &amp; Security</Link>
          <Link to="/terms">Terms of Service</Link>
        </span>
      </footer>
    </div>
  );
};

export default Landing;
