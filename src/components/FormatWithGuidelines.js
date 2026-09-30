import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import WordLikeEditor from './WordLikeEditor';
import { copyForWord, downloadDocx, safeFileName } from '../utils/transcriptExport';

const BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';
export const FORMAT_ACCOUNT_EMAIL = 'info@typemywordz.ai';

// Shown under a finished transcript for one account only. It applies the same
// general guidelines the admin "General" thread uses, without any setup.
export default function FormatWithGuidelines({ transcript, fileName }) {
  const { currentUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState('');
  if ((currentUser?.email || '').toLowerCase() !== FORMAT_ACCOUNT_EMAIL || !(transcript || '').trim()) return null;

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
  const copy = async () => { try { await copyForWord(result.text); setMessage('Copied. Paste it into Word and the formatting stays.'); } catch { setMessage('Copying was blocked by the browser. Use Download Word instead.'); } };

  return (
    <div className="tm-format-guidelines" style={{ margin: '14px 0', display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <button type="button" className="tm-result-link" onClick={run} disabled={busy} style={{ fontWeight: 600 }}>{busy ? 'Formatting with the guidelines…' : 'Format with guidelines'}</button>
        <span style={{ fontSize: 12, color: '#7b857d' }}>Applies the TypeMyworDz general guidelines to this transcript.</span>
        {message && <span role="status" style={{ fontSize: 12, color: '#267b40' }}>{message}</span>}
      </div>
      {result && (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button type="button" onClick={copy}>Copy</button>
            <button type="button" onClick={() => downloadDocx(result.text, `${safeFileName((fileName || 'transcript').replace(/\.[^.]+$/, ''))} - formatted`)}>Download Word (.docx)</button>
          </div>
          <WordLikeEditor key={result.stamp} disabled initialHtml={result.html} initialText={result.text} minHeight={320} />
        </div>
      )}
    </div>
  );
}
