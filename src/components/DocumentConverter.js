import React, { useRef, useState } from 'react';
import { downloadBlob } from '../utils/transcriptExport';

const BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';

export const CONVERSIONS = [
  { id: 'word-pdf', label: 'Word to PDF', target: 'pdf', accept: '.docx,.doc,.rtf,.odt,.txt', hint: 'A Word document (.docx, .doc, .rtf, .odt or .txt)' },
  { id: 'pdf-word', label: 'PDF to Word', target: 'docx', accept: '.pdf', hint: 'A PDF with selectable text' },
  { id: 'word-jpg', label: 'Word to JPG', target: 'jpg', accept: '.docx,.doc,.rtf,.odt,.txt', hint: 'A Word document. Each page becomes a picture.' },
  { id: 'word-png', label: 'Word to PNG', target: 'png', accept: '.docx,.doc,.rtf,.odt,.txt', hint: 'A Word document. Each page becomes a picture.' },
  { id: 'pdf-jpg', label: 'PDF to JPG', target: 'jpg', accept: '.pdf', hint: 'A PDF. Each page becomes a picture.' },
  { id: 'pdf-png', label: 'PDF to PNG', target: 'png', accept: '.pdf', hint: 'A PDF. Each page becomes a picture.' },
  { id: 'image-pdf', label: 'Picture to PDF', target: 'pdf', accept: '.jpg,.jpeg,.png,.webp,.bmp,.tif,.tiff', hint: 'A JPG, PNG or similar picture' },
];

const MORE_TOOLS = [
  { href: '/tools/merge-pdf.html', label: 'Merge PDF', text: 'Combine several PDFs into one.' },
  { href: '/tools/split-pdf.html', label: 'Split PDF', text: 'Pull out pages or cut a PDF apart.' },
  { href: '/tools/compress-pdf.html', label: 'Compress PDF', text: 'Make a PDF small enough to email.' },
  { href: '/tools/audio-converter.html', label: 'Audio converter', text: 'MP3, WAV, M4A and more. Shrink recordings.' },
  { href: '/tools/audio-recorder.html', label: 'Audio recorder', text: 'A tiny recorder you can download.' },
  { href: '/typing-practice', label: 'Typing practice', text: 'Free lessons and a speed test.' },
];

const nameFromHeader = (header, fallback) => {
  const match = /filename="?([^";]+)"?/i.exec(header || '');
  return match ? match[1] : fallback;
};

export default function DocumentConverter() {
  const [selected, setSelected] = useState(CONVERSIONS[0]);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({ text: '', kind: '' });
  const inputRef = useRef(null);

  const choose = (item) => { setSelected(item); setFile(null); setMessage({ text: '', kind: '' }); if (inputRef.current) inputRef.current.value = ''; };

  const convert = async (event) => {
    event.preventDefault();
    if (!file || busy) return;
    setBusy(true); setMessage({ text: '', kind: '' });
    try {
      const form = new FormData();
      form.append('file', file, file.name);
      form.append('target', selected.target);
      const response = await fetch(`${BACKEND_URL}/tools/convert`, { method: 'POST', body: form });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || 'The conversion failed. Please try a different file.');
      }
      const blob = await response.blob();
      downloadBlob(blob, nameFromHeader(response.headers.get('Content-Disposition'), `converted.${selected.target}`));
      setMessage({ text: 'Done. Your file has been downloaded. We do not keep it.', kind: 'ok' });
    } catch (error) {
      setMessage({ text: error.message || 'The conversion failed.', kind: 'error' });
    } finally { setBusy(false); }
  };

  return (
    <div className="tm-tools" style={{ maxWidth: 820, margin: '0 auto', padding: '28px 20px 60px' }}>
      <h1 style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 30, margin: '0 0 6px', color: '#14161a' }}>Document converter</h1>
      <p style={{ margin: '0 0 22px', color: '#3f434c' }}>Free. Turn Word into PDF, PDF into Word, or either into pictures. Your file is converted and then forgotten.</p>
      <div role="tablist" aria-label="Conversion type" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
        {CONVERSIONS.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={selected.id === item.id} onClick={() => choose(item)}
            style={{ border: `1px solid ${selected.id === item.id ? '#5b44cf' : '#e5e6ea'}`, background: selected.id === item.id ? '#5b44cf' : '#fff', color: selected.id === item.id ? '#fff' : '#14161a', borderRadius: 999, padding: '7px 14px', cursor: 'pointer', fontSize: 14 }}>{item.label}</button>
        ))}
      </div>
      <form onSubmit={convert} style={{ border: '1px solid #e5e6ea', borderRadius: 10, background: '#f8f8f9', padding: 22, display: 'grid', gap: 14 }}>
        <label style={{ display: 'grid', gap: 6, border: '2px dashed #c9c4ea', borderRadius: 10, background: '#fff', padding: '26px 18px', textAlign: 'center', cursor: 'pointer' }}>
          <strong style={{ color: '#5b44cf' }}>{file ? file.name : `Choose a file for ${selected.label}`}</strong>
          <span style={{ color: '#858a95', fontSize: 13 }}>{file ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` : `${selected.hint}. Up to 15 MB.`}</span>
          <input ref={inputRef} type="file" accept={selected.accept} onChange={(event) => { setFile((event.target.files || [])[0] || null); setMessage({ text: '', kind: '' }); }} style={{ margin: '6px auto 0' }} />
        </label>
        <button type="submit" disabled={!file || busy} style={{ justifySelf: 'start', border: 0, borderRadius: 7, background: '#28a745', color: '#fff', padding: '11px 22px', fontWeight: 600, cursor: file && !busy ? 'pointer' : 'not-allowed', opacity: file && !busy ? 1 : 0.55 }}>{busy ? 'Converting…' : `Convert and download`}</button>
        {message.text && <div role="status" style={{ color: message.kind === 'error' ? '#b3261e' : '#1f7a38', fontSize: 14 }}>{message.text}</div>}
      </form>
      <p style={{ color: '#858a95', fontSize: 13, marginTop: 14 }}>Scanned PDFs have no text to move into Word, so use PDF to JPG for those, or transcribe the pages with TypeMyworDz. Limits: 15 MB a file, 20 conversions an hour.</p>
      <h2 style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 20, margin: '30px 0 12px', color: '#14161a' }}>More free tools</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
        {MORE_TOOLS.map((tool) => (
          <a key={tool.href} href={tool.href} target="_blank" rel="noopener noreferrer" style={{ display: 'block', border: '1px solid #e5e6ea', borderRadius: 8, padding: '12px 14px', textDecoration: 'none', background: '#fff' }}>
            <strong style={{ color: '#5b44cf', display: 'block' }}>{tool.label}</strong>
            <span style={{ color: '#858a95', fontSize: 13 }}>{tool.text}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
