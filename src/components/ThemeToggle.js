import React, { useEffect, useState } from 'react';

const KEY = 'tmwd.theme';

const readTheme = () => {
  try { return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'; } catch (e) { return 'light'; }
};

const applyTheme = (theme) => {
  document.documentElement.setAttribute('data-theme', theme);
};

// Apply the saved choice before the first paint of the app.
applyTheme(readTheme());

export default function ThemeToggle() {
  const [theme, setTheme] = useState(readTheme);
  useEffect(() => { applyTheme(theme); }, [theme]);
  const next = theme === 'dark' ? 'light' : 'dark';
  const toggle = () => {
    try { localStorage.setItem(KEY, next); } catch (e) { /* storage unavailable */ }
    setTheme(next);
  };
  return (
    <button type="button" className="tm-theme-toggle" onClick={toggle} aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`}>
      {theme === 'dark' ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
      )}
    </button>
  );
}
