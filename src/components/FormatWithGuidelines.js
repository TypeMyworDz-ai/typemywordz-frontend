import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import AIOutputWindow from './AIOutputWindow';
import { safeFileName } from '../utils/transcriptExport';

const BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';
export const FORMAT_ACCOUNT_EMAILS = new Set([
  'info@typemywordz.ai',
  'typemywordz@gmail.com',
  'gracenyaitara@gmail.com',
]);

export const canUseGuidelineFormatter = (email) => FORMAT_ACCOUNT_EMAILS.has(String(email || '').trim().toLowerCase());

// Shown under a finished transcript for the three approved test accounts. It
// applies the same general guidelines the admin "General" thread uses.
export default function FormatWithGuidelines({ transcript, fileName }) {
  const { currentUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState('');
  if (!canUseGuidelineFormatter(currentUser?.email) || !(transcript || '').trim()) return null;

  const run = async () => {
    if (busy) return;
    setBusy(true); setMessage('');
    try {
      const token = await currentUser.getIdToken();
      let model = '';
      try { model = window.localStorage.getItem('tmwd.askModel') || ''; } catch { model = ''; }
      const response = await fetch(`${BACKEND_URL}/api/format-transcript`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: transcript, model }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || 'The formatting could not be completed.');
      setResult({ text: payload.text || '', html: payload.html || '', stamp: Date.now() });
    } catch (error) {
      setMessage(error.message || 'The formatting could not be completed.');
    } finally { setBusy(false); }
  };
  return (
    <div className="tm-format-guidelines" style={{ margin: '14px 0', display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <button type="button" className="tm-result-link" onClick={run} disabled={busy} style={{ fontWeight: 600 }}>{busy ? 'Formatting with the guidelines…' : 'Format with guidelines'}</button>
        <span style={{ fontSize: 12, color: '#7b857d' }}>Applies the TypeMyworDz general guidelines to this transcript.</span>
        {message && <span role="status" style={{ fontSize: 12, color: '#267b40' }}>{message}</span>}
      </div>
      {result && (
        <AIOutputWindow
          key={result.stamp}
          title="Shared proofreading editor"
          description="The same working area is used by the worker, admin and client."
          text={result.text}
          html={result.html}
          fileName={`${safeFileName((fileName || 'transcript').replace(/\.[^.]+$/, ''))} - formatted`}
          minHeight={320}
          revision={`format-${result.stamp}`}
        />
      )}
    </div>
  );
}
