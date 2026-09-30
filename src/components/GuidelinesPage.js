import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';

// The general guidelines, readable in their own tab while a worker is on a
// job. The text is served to signed-in workers, trainees and admins only.
export default function GuidelinesPage() {
  const { currentUser } = useAuth();
  const [state, setState] = useState({ loading: true, error: '', html: '', title: 'TypeMyworDz General Guidelines' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await currentUser.getIdToken();
        const response = await fetch(`${BACKEND_URL}/human-transcription/guidelines`, { headers: { Authorization: `Bearer ${token}` } });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.detail || 'The guidelines could not be loaded.');
        if (!cancelled) setState({ loading: false, error: '', html: payload.html || '', title: payload.title || 'TypeMyworDz General Guidelines' });
      } catch (error) {
        if (!cancelled) setState((current) => ({ ...current, loading: false, error: error.message }));
      }
    })();
    return () => { cancelled = true; };
  }, [currentUser]);

  useEffect(() => { document.title = 'TypeMyworDz General Guidelines'; }, []);

  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: '40px 24px 80px', color: '#202522', fontFamily: 'system-ui, sans-serif', lineHeight: 1.65 }}>
      <p style={{ margin: 0, color: '#5b44cf', fontSize: 11, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase' }}>For workers and trainees</p>
      <h1 style={{ font: '400 36px/1.15 Georgia, serif', margin: '8px 0 6px' }}>{state.title}</h1>
      <p style={{ margin: '0 0 26px', color: '#6d776f', fontSize: 14 }}>Confidential. Keep this page for your own work and do not share it.</p>
      {state.loading && <p>Loading the guidelines…</p>}
      {state.error && <p role="alert" style={{ color: '#a33' }}>{state.error}</p>}
      {!state.loading && !state.error && <article className="tm-guidelines-body" dangerouslySetInnerHTML={{ __html: state.html }} />}
      <style>{`.tm-guidelines-body h2{font:400 26px Georgia,serif;margin:34px 0 10px}.tm-guidelines-body h3{font-size:17px;margin:26px 0 8px}.tm-guidelines-body p{margin:0 0 12px}.tm-guidelines-body ul{margin:0 0 14px 22px}.tm-guidelines-body table{border-collapse:collapse;margin:14px 0;width:100%}.tm-guidelines-body td{border:1px solid #dfe5e0;padding:8px 10px;font-size:14px;vertical-align:top}`}</style>
    </main>
  );
}
