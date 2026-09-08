const BACKEND_URL =
  process.env.REACT_APP_RAILWAY_BACKEND_URL ||
  'https://backendforrailway-production-7128.up.railway.app';

const VISITOR_KEY = 'tmwd.anonymousVisitorId';

const visitorId = () => {
  try {
    const existing = window.localStorage.getItem(VISITOR_KEY);
    if (existing) return existing;
    const created = window.crypto?.randomUUID?.() || `v-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(VISITOR_KEY, created);
    return created;
  } catch (error) {
    return `v-${Date.now()}`;
  }
};

const sourceFrom = (url) => {
  const explicit = url.searchParams.get('utm_source');
  if (explicit) return explicit.slice(0, 80);
  if (!document.referrer) return 'Direct';
  try {
    return new URL(document.referrer).hostname.replace(/^www\./, '').slice(0, 120);
  } catch (error) {
    return 'Other';
  }
};

export const recordPageView = async (page) => {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  const pagePath = String(page || url.pathname || '/').slice(0, 180);
  const event = {
    visitorId: visitorId(),
    page: pagePath,
    source: sourceFrom(url),
    locale: (navigator.language || 'unknown').slice(0, 30),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown',
  };

  try {
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'page_view', { page_path: pagePath, page_title: document.title });
    }
    await fetch(`${BACKEND_URL}/api/traffic-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
      keepalive: true,
    });
  } catch (error) {
    // Traffic telemetry must never interfere with the app.
  }
};
