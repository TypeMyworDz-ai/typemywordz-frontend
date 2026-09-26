import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Login from './Login';
import FloatingWhatsApp from './FloatingWhatsApp';
import { recordPageView } from '../analyticsService';

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

// Three slides: two short privacy-promise clips and a still photo, cycling
// automatically so the hero spot does not depend on a single asset. Videos
// stay muted/looping in the background; only opacity changes between slides,
// so nothing restarts or stutters when the active one changes.
const HERO_SLIDES = [
  {
    type: 'video',
    src: '/privacy-promise-animation.mp4',
    caption: <><strong>Private by design.</strong> Never used to train AI.</>
  },
  {
    type: 'video',
    src: '/privacy-promise-animation-2.mp4',
    caption: <><strong>Zero model training.</strong> Your audio stays yours.</>
  },
  {
    type: 'image',
    src: '/hero-confidential-audio.jpg',
    caption: <><strong>Protect confidential audio.</strong> 100% data privacy, zero auto-renewals.</>
  }
];

const Landing = () => {
  useEffect(() => {
    recordPageView(`${window.location.pathname}#landing`);
  }, []);

  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveSlide((current) => (current + 1) % HERO_SLIDES.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const go = (id) => (e) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="tm-app tm-login tm-lp tm-app-with-sitefoot">
      <FloatingWhatsApp />

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
            <div className="tm-slogan">Your everyday AI companion</div>
          </div>
        </div>
        <div className="tm-spacer"></div>
        <div className="tm-menu">
          <div className="menu-item" onClick={go('what')}>
            <span className="menu-text">What we do</span>
          </div>
          <div className="menu-item" onClick={go('assistant')}>
            <span className="menu-text">Ask TypeMyworDz</span>
          </div>
          <Link className="menu-item" to="/typing-practice" target="_blank" rel="noopener noreferrer">
            <span className="menu-text">Free typing practice</span>
          </Link>
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
          <p className="tm-lp-lede">
            <strong>TypeMyworDz AI</strong> turns interviews, meetings, research recordings and everyday audio into clean, speaker-separated text, then lets you ask AI what matters. Use one tool or both—the same credits cover the workflow.
          </p>
          <p className="tm-lp-audience">Built for researchers, legal teams, journalists, podcasters and busy professionals.</p>

          <ul className="tm-lp-ticks">
            <li><strong>Transcription</strong> with speaker labels, timestamps and a proper editor</li>
            <li><strong>Not happy with an AI transcript, or prefer it proofread?</strong> Sign up for proofreading services and get a quote.</li>
            <li><strong>Ask TypeMyworDz</strong> for research, drafting and questions of any kind</li>
            <li>Free touch-typing lessons for anyone, with no account required</li>
            <li>Export to Word or plain text, or copy in one click</li>
            <li>Multiple AI models behind one simple workflow</li>
            <li>Your recordings and your questions are never used to train AI</li>
          </ul>

          {/* Above the fold on purpose: a visitor can price their own
              recording before they scroll, and without an account. */}
          <p className="tm-lp-calc">
            <a className="tm-lp-calc-link" href="/cost-calculator.html">
              Work out what your recording would cost
            </a>
            <span className="tm-lp-calc-note">
              Enter the length of your audio and see the price for your region.
              No account needed.
            </span>
          </p>
        </div>

        <div className="tm-lp-hero-animation" aria-label="TypeMyworDz privacy promise">
          <div className="tm-lp-hero-slideshow">
            {HERO_SLIDES.map((slide, index) => (
              <div
                key={slide.src}
                className={`tm-lp-hero-slide${index === activeSlide ? ' tm-lp-hero-slide-active' : ''}`}
              >
                {slide.type === 'video' ? (
                  <video
                    className="tm-lp-privacy-video"
                    autoPlay
                    loop
                    muted
                    playsInline
                    preload="metadata"
                  >
                    <source src={slide.src} type="video/mp4" />
                    <p className="sr-only">TypeMyworDz privacy promise: your recordings are never used to train AI.</p>
                  </video>
                ) : (
                  <img className="tm-lp-privacy-video" src={slide.src} alt="Protect confidential audio" />
                )}
              </div>
            ))}
          </div>
          <p className="tm-lp-hero-animation-caption">
            {HERO_SLIDES[activeSlide].caption}
          </p>
          <div className="tm-lp-hero-slide-dots">
            {HERO_SLIDES.map((slide, index) => (
              <span
                key={slide.src}
                className={`tm-lp-hero-slide-dot${index === activeSlide ? ' tm-lp-hero-slide-dot-active' : ''}`}
              />
            ))}
          </div>
        </div>

        <div className="tm-lp-hero-card">
          <Login />
          <Link className="tm-lp-trainee-link" to="/trainee-signup">
            <strong>Want to become a TypeMyworDz Trainee and Potentially a Proofreader?</strong>
            <span>Click here</span>
          </Link>
          <p className="tm-lp-freenote">
            <strong>30 free credits</strong> when you sign up, worth up to 30 minutes of transcription. No card, no automatic charges.
          </p>
        </div>
      </section>

      {/* ---- What we transcribe ---- */}
      <section className="tm-lp-band" id="what">
        <div className="tm-lp-inner">
          <h2>What we transcribe</h2>
          <p className="tm-lp-eyebrow">Product one</p>
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

      {/* ---- A free typing utility for visitors and trainees ---- */}
      <section className="tm-lp-band tm-lp-typing" id="typing-practice">
        <div className="tm-lp-inner tm-lp-typing-inner">
          <div>
            <p className="tm-lp-eyebrow">Free tool · open to everyone</p>
            <h2>Practise the skill behind every transcript.</h2>
            <p className="tm-lp-sub">Learn touch typing with guided home-row lessons, short drills and a 30-second speed test. No sign-up is needed to practise.</p>
            <Link className="tm-lp-typing-link" to="/typing-practice" target="_blank" rel="noopener noreferrer">Open typing practice</Link>
          </div>
          <div className="tm-lp-home-row" aria-label="Home row keyboard keys">
            <span>A</span><span>S</span><span>D</span><span className="is-anchor">F</span><span>J</span><span className="is-anchor">K</span><span>L</span><span>;</span>
            <small>Return here after every reach.</small>
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
                <span>Included with credits or any plan</span>
              </div>
              <p className="tm-lp-eyebrow">Product two</p>
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
              <tr><td>Free trial</td><td>30 credits (up to 30 transcription minutes), once, no card</td></tr>
              <tr><td>One-Day Plan</td><td>1 day, 4 hours of transcription included</td></tr>
              <tr><td>Three-Day Plan</td><td>3 days, 8 hours of transcription included</td></tr>
              <tr><td>One-Week Plan</td><td>7 days, 15 hours of transcription included</td></tr>
              <tr><td>Monthly Plan</td><td>30 days, 25 hours of transcription included</td></tr>
              <tr><td>Yearly Plan</td><td>365 days, 25 hours of transcription each month, transcripts kept a full year</td></tr>
            </tbody>
          </table>
          <p className="tm-lp-readmore">
            If you need more than your plan includes, you can add extra hours without
            changing plan. Prices, and which plans are offered, depend on where you are, so
            that you pay in a currency and by a method that works locally.
          </p>
          <p className="tm-lp-calc">
            <a className="tm-lp-calc-link" href="/cost-calculator.html">
              Work out what your recording would cost
            </a>
            <span className="tm-lp-calc-note">
              Enter the length of your audio and see the price for your region. No account
              needed.
            </span>
          </p>
        </div>
      </section>

      {/* ---- Closing call to action ---- */}
      <section className="tm-lp-cta">
        <div className="tm-lp-inner tm-lp-narrow">
          <h2>Try it on a real recording</h2>
          <p>
            Start with 30 free credits, upload a short recording, and judge the result on your own work.
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
          <a href="/cost-calculator.html">What it costs</a>
          <Link to="/privacy-policy">Privacy &amp; Security</Link>
          <Link to="/terms">Terms of Service</Link>
          <Link to="/refund-policy">Refund Policy</Link>
        </span>
        <span className="tm-sitefoot-badges">
          <a
            className="tm-sitefoot-badge"
            href="https://www.saashub.com/typemywordz-ai?utm_source=badge&amp;utm_campaign=badge&amp;utm_content=typemywordz-ai&amp;badge_variant=color&amp;badge_kind=approved"
            target="_blank"
            rel="noreferrer"
          >
            <img src="https://cdn-b.saashub.com/img/badges/approved-color.png?v=1" alt="Approved on SaaSHub" />
          </a>
          <a
            className="tm-sitefoot-badge"
            href="https://alternativeto.net/software/typemywordz/about/?utm_source=badge&amp;utm_medium=referral"
            target="_blank"
            rel="noreferrer"
          >
            <img
              src="https://alternativeto.net/static/badges/badge-compact-light.svg"
              alt="TypeMyworDz | AlternativeTo"
            />
          </a>
        </span>
      </footer>
    </div>
  );
};

export default Landing;
