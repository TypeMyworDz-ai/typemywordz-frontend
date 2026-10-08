import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './LetterJobsAdminPanel.css';
import UploadResultBanner, { announceJobsChanged } from './UploadResultBanner';

const BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';
const LETTER_ADMIN_EMAILS = new Set(['typemywordz@gmail.com', 'info@typemywordz.ai', 'gracenyaitara@gmail.com']);
const DEFAULT_ADMIN_NOTE = 'Client provided spellings and other instructions: None';

const formatBytes = (bytes) => {
  const size = Number(bytes || 0);
  if (!size) return '';
  return size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

export default function LetterJobsAdminPanel({ showMessage, onOpenQueue, recordedAudioFile = null }) {
  const { currentUser } = useAuth();
  const email = (currentUser?.email || '').trim().toLowerCase();
  const isAdmin = LETTER_ADMIN_EMAILS.has(email);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [audioFile, setAudioFile] = useState(null);
  const [audioInputKey, setAudioInputKey] = useState(0);
  const [title, setTitle] = useState('');
  const [minutes, setMinutes] = useState('');
  const [durationNote, setDurationNote] = useState('Recording length is detected when the browser can read it; check or adjust the value.');
  const [instructions, setInstructions] = useState(DEFAULT_ADMIN_NOTE);
  const [references, setReferences] = useState([]);
  const [referenceInputKey, setReferenceInputKey] = useState(0);
  const onAudioSelected = (file) => {
    setAudioFile(file || null);
    setMinutes('');
    setDurationNote('Recording length is detected when the browser can read it; check or adjust the value.');
    if (!file || typeof window.Audio !== 'function' || !window.URL?.createObjectURL) return;
    const url = window.URL.createObjectURL(file);
    const probe = new window.Audio();
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => {
      if (Number.isFinite(probe.duration) && probe.duration > 0) {
        const detectedMinutes = Number((probe.duration / 60).toFixed(2));
        setMinutes(String(detectedMinutes));
        setDurationNote(`Detected ${detectedMinutes} minutes (${Math.ceil(probe.duration)} seconds). Adjust if needed.`);
      } else setDurationNote('Enter the recording length in minutes.');
      window.URL.revokeObjectURL(url);
    };
    probe.onerror = () => {
      setDurationNote('The browser could not read the duration. Enter the recording length in minutes.');
      window.URL.revokeObjectURL(url);
    };
    probe.src = url;
  };

  const createJob = async (event) => {
    event.preventDefault();
    if (!audioFile || uploading || !Number(minutes)) return;
    setUploading(true);
    setResult(null);
    const uploadedName = title.trim() || audioFile.name;
    try {
      const token = await currentUser.getIdToken();
      const form = new FormData();
      form.append('audio', audioFile, audioFile.name);
      form.append('title', title.trim() || audioFile.name);
      form.append('seconds', String(Number(minutes) * 60));
      form.append('instructions', instructions.trim());
      references.forEach((file) => form.append('attachments', file, file.name));
      const response = await fetch(`${BACKEND_URL}/human-transcription/admin/letter-jobs`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || 'The Letter Job could not be created.');
      setAudioFile(null); setAudioInputKey((value) => value + 1);
      setTitle(''); setMinutes(''); setDurationNote('Recording length is detected when the browser can read it; check or adjust the value.');
      setInstructions(DEFAULT_ADMIN_NOTE); setReferences([]); setReferenceInputKey((value) => value + 1);
      setResult({ kind: 'success', title: uploadedName, detail: 'Letter Job created as one complete job. It is now under Needs action in the Job Queue.', at: Date.now() });
      announceJobsChanged();
    } catch (error) {
      setResult({ kind: 'error', title: uploadedName, detail: error.message, at: Date.now() });
    } finally {
      setUploading(false);
    }
  };

  if (!isAdmin) return <section className="tm-admin-panel"><h2 className="tm-admin-panel-title">Letter Jobs</h2><p className="tm-admin-panel-note">This section is available to the admin team.</p></section>;

  return <div className="tm-pdf-jobs-panel tm-letter-jobs-panel">
    <section className="tm-admin-panel tm-pdf-jobs-upload">
      <div className="tm-admin-panel-head">
        <div>
          <p className="tm-admin-kicker">Complete audio · one assignment</p>
          <h2 className="tm-admin-panel-title">Letter Jobs</h2>
          <p className="tm-admin-panel-note">Upload a dictated letter recording. It then appears under Needs action in the Job Queue, where you assign the whole job to one worker or the Letter Agent, choose AI or human proofreading and approve it. The Letter Standard Indentation template and letter-only guidelines are built in. No letter is split into slices.</p>
        </div>
        <button type="button" className="tm-admin-btn" onClick={() => onOpenQueue?.()}>Go to Job Queue</button>
      </div>
      <UploadResultBanner working={uploading ? `Uploading "${audioFile?.name || 'your letter'}"…` : ''} result={result} onDismiss={() => setResult(null)} onOpenQueue={() => onOpenQueue?.()} />
      <form onSubmit={createJob}>
        <label className="tm-pdf-jobs-dropzone">
          <strong>Select the complete letter recording</strong>
          <span>MP3, WAV, M4A, MP4, WebM, OGG, FLAC, AAC, MOV, MKV or AVI. The recording remains one unsplit job.</span>
          <input key={audioInputKey} type="file" accept="audio/*,video/*,.mp3,.wav,.m4a,.mp4,.webm,.ogg,.flac,.aac,.mov,.mkv,.avi" onChange={(event) => onAudioSelected(event.target.files?.[0] || null)} />
        </label>
        {recordedAudioFile && <div className="tm-pdf-jobs-selected"><button type="button" className="tm-admin-btn" onClick={() => onAudioSelected(recordedAudioFile)}>Use recorded audio</button><small role="status">Last recording: {recordedAudioFile.name}</small></div>}
        {audioFile && <div className="tm-pdf-jobs-selected"><div className="tm-pdf-jobs-file"><span>{audioFile.name}</span><small>{formatBytes(audioFile.size)}</small><button type="button" onClick={() => { setAudioFile(null); setAudioInputKey((value) => value + 1); setMinutes(''); }}>Remove</button></div></div>}
        <div className="tm-letter-job-fields">
          <label><strong>Job name</strong><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={audioFile?.name || 'For example, Client letter · October 2026'} /></label>
          <label><strong>Recording length (minutes)</strong><input type="number" min="0.01" step="0.01" value={minutes} onChange={(event) => setMinutes(event.target.value)} required /><small>{durationNote}</small></label>
        </div>
        <label className="tm-pdf-jobs-dropzone" style={{ marginTop: 12 }}>
          <strong>Attach instructions or references (optional)</strong>
          <span>PDF, Word, text, image or audio reference files, up to 20 MB each and six files total. The built-in letter guide and standard template are applied separately.</span>
          <input key={referenceInputKey} type="file" accept=".pdf,.docx,.doc,.txt,.jpg,.jpeg,.png,.webp,audio/*,.mp3,.wav,.m4a,.mp4,.ogg,.webm,.aac,.flac" multiple onChange={(event) => setReferences(Array.from(event.target.files || []).slice(0, 6))} />
        </label>
        {references.length > 0 && <div className="tm-pdf-jobs-selected">{references.map((file, index) => <div className="tm-pdf-jobs-file" key={`${file.name}-${index}`}><span>{file.name}</span><small>{formatBytes(file.size)}</small><button type="button" onClick={() => { setReferences((previous) => previous.filter((_, fileIndex) => fileIndex !== index)); setReferenceInputKey((value) => value + 1); }}>Remove</button></div>)}</div>}
        <label className="tm-letter-job-instructions"><strong>Admin notes and special instructions</strong><textarea rows={3} value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Add job-specific spellings, names, or layout directions. These supplement the permanent Letter Job guidelines." /></label>
        <div className="tm-pdf-jobs-actions"><span>Only your final admin approval releases a submitted .docx. AI drafting and AI proofreading do not approve or release the letter.</span><button type="submit" className="tm-admin-btn" disabled={!audioFile || !Number(minutes) || uploading}>{uploading ? 'Creating Letter Job…' : 'Create complete Letter Job'}</button></div>
      </form>
    </section>
  </div>;
}
