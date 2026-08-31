import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';

/**
 * Shared chrome for the legal documents (Terms of Service, Privacy & Security).
 *
 * These pages are reachable without signing in, because Google's OAuth review and
 * payment providers both need to read them from the open web.
 */
const LegalShell = ({ title, updated, children }) => {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="tm-legal">
      <div className="tm-legal-bar">
        <div className="tm-legal-bar-in">
          <Link to="/" className="tm-legal-home" aria-label="TypeMyworDz home">
            <span className="tm-w-p">Type</span>
            <span className="tm-w-g">My</span>
            <span className="tm-w-p">worDz</span>
          </Link>

          <nav className="tm-legal-tabs" aria-label="Legal documents">
            <Link
              to="/privacy-policy"
              className="tm-legal-tab"
              aria-current={pathname === '/privacy-policy' ? 'page' : undefined}
            >
              Privacy &amp; Security
            </Link>
            <Link
              to="/terms"
              className="tm-legal-tab"
              aria-current={pathname === '/terms' ? 'page' : undefined}
            >
              Terms of Service
            </Link>
          </nav>
        </div>
      </div>

      <div className="tm-legal-body">
        <h1>{title}</h1>
        <p className="tm-legal-updated">Last updated {updated}</p>

        {children}

        <div className="tm-legal-foot">
          <span>&copy; {new Date().getFullYear()} TypeMyworDz</span>
          <span>
            <Link to="/privacy-policy">Privacy &amp; Security</Link>
            {'  '}&middot;{'  '}
            <Link to="/terms">Terms of Service</Link>
            {'  '}&middot;{'  '}
            <Link to="/">Back to the app</Link>
          </span>
        </div>
      </div>
    </div>
  );
};

export default LegalShell;
