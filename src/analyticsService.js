import { addDoc, collection } from 'firebase/firestore';
import { db } from './firebase';

const TRAFFIC_COLLECTION = 'trafficEvents';
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
    createdAt: new Date(),
  };

  try {
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'page_view', { page_path: pagePath, page_title: document.title });
    }
    await addDoc(collection(db, TRAFFIC_COLLECTION), event);
  } catch (error) {
    // Traffic telemetry must never interfere with the app.
  }
};
