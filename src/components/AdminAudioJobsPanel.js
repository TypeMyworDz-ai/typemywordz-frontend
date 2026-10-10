import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './AdminAudioJobsPanel.css';
import UploadResultBanner, { announceJobsChanged } from './UploadResultBanner';
import JobAudioRecorder from './JobAudioRecorder';

const BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';
const ADMIN_EMAILS = new Set(['typemywordz@gmail.com', 'info@typemywordz.ai', 'gracenyaitara@gmail.com']);
const DEFAULT_ADMIN_NOTE = 'Client provided spellings: None\n\nClient Word List: None\n\nHint names from the Filename: None:\n\nOther instructions: None';
const uploadedLabel = (file) => (file?.name ? `"${file.name}"` : 'your job');

export default function AdminAudioJobsPanel({ category = 'general', showMessage, onOpenQueue, recordedAudioFile = null, onRecordedAudioReady }) {
  const { currentUser } = useAuth();
  const templateJob = category === 'template';
  const email = (currentUser?.email || '').trim().toLowerCase();
  const isAdmin = ADMIN_EMAILS.has(email);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [workingFile, setWorkingFile] = useState(null);
  const [fileKey, setFileKey] = useState(0);
  const [title, setTitle] = useState('');
  const [minutes, setMinutes] = useState('');
  const [durationNote, setDurationNote] = useState('The length is detected when your browser can read the recording. Check it before creating the job.');
  const [instructions, setInstructions] = useState(DEFAULT_ADMIN_NOTE);
  const [references, setReferences] = useState([]);
  const [referenceKey, setReferenceKey] = useState(0);
  const [templateFile, setTemplateFile] = useState(null);
  const [templateFileKey, setTemplateFileKey] = useState(0);

  const onAudioSelected = (file, recordedSeconds = 0) => {
    setWorkingFile(file || null);
    if (Number.isFinite(Number(recordedSeconds)) && Number(recordedSeconds) > 0) {
      const seconds = Math.round(Number(recordedSeconds));
      const recordedMinutes = Number((seconds / 60).toFixed(2));
      setMinutes(String(recordedMinutes));
      setDurationNote(`Recorded ${seconds} seconds (${recordedMinutes} minutes). Check or adjust it before creating the job.`);
      return;
    }
    setMinutes('');
    setDurationNote('The length is detected when your browser can read the recording. Check it before creating the job.');
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

  const maxReferences = templateJob ? 5 : 6;
  const referencesValid = references.length <= maxReferences;
  const templateFilePresent = !templateJob || Boolean(templateFile && /\.docx$/i.test(templateFile.name));

  const createJob = async (event) => {
    event.preventDefault();
    if (!workingFile || uploading || !Number(minutes) || !templateFilePresent || !referencesValid) return;
    setUploading(true);
    setResult(null);
    const uploadedName = title.trim() || workingFile.name;
    try {
      const token = await currentUser.getIdToken();
      const form = new FormData();
      form.append('audio', workingFile, workingFile.name);
      form.append('title', title.trim() || workingFile.name);
      form.append('seconds', String(Number(minutes) * 60));
      form.append('instructions', instructions.trim());
      form.append('category', category);
      if (templateJob && templateFile) form.append('template_file', templateFile, templateFile.name);
      references.forEach((file) => form.append('attachments', file, file.name));
      const response = await fetch(`${BACKEND_URL}/human-transcription/admin/audio-jobs`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || 'The job could not be created.');
      setWorkingFile(null);
      setFileKey((value) => value + 1);
      setTitle(''); setMinutes(''); setInstructions(DEFAULT_ADMIN_NOTE); setReferences([]); setTemplateFile(null);
      setReferenceKey((value) => value + 1);
      setTemplateFileKey((value) => value + 1);
      setDurationNote('The length is detected when your browser can read the recording. Check it before creating the job.');
      const parts = Number(payload.parts_count || 0);
      setResult({ kind: 'success', title: uploadedName, detail: `${templateJob ? 'Template' : 'General'} Job created${parts ? ` with ${parts} parts` : ''}. It is under Needs action in the Job Queue, where you choose to send it to workers or give it to an AI agent.`, at: Date.now() });
      announceJobsChanged();
    } catch (error) {
      setResult({ kind: 'error', title: uploadedName, detail: error.message, at: Date.now() });
    } finally {
      setUploading(false);
    }
  };

  if (!isAdmin) return null;
  const titleText = templateJob ? 'Template Jobs' : 'General Jobs';

  return (
    <section className="tm-admin-audio-jobs" aria-labelledby="tm-admin-audio-title">
      <header className="tm-admin-audio-heading">
        <div>
          <p className="tm-admin-audio-eyebrow">Human Work · Admin uploads</p>
          <h2 id="tm-admin-audio-title">{titleText}</h2>
          <p>{templateJob
            ? 'Upload a recording with its Word template and any reference material. Once uploaded, the job appears under Needs action in the Job Queue, where you choose to send it live to workers or give the whole job to the Template Agent.'
            : 'Upload a recording and instructions. Once uploaded, the job appears under Needs action in the Job Queue, where you choose to send it live to workers or give the whole job to the General Agent.'}</p>
        </div>
        <button type="button" className="tm-admin-audio-secondary" onClick={() => onOpenQueue?.({ status: 'approved' })}>Go to Job Queue</button>
      </header>

      <div className="tm-admin-audio-policy" role="note">
        <strong>No client quote or credits.</strong>
        <span>Worker pay is calculated when work is submitted. New uploads skip the initial approval queue, while final admin review remains in place.</span>
      </div>

      <UploadResultBanner working={uploading ? `Uploading ${uploadedLabel(workingFile)}…` : ''} result={result} onDismiss={() => setResult(null)} onOpenQueue={() => onOpenQueue?.({ status: 'approved' })} />

      <form className="tm-admin-audio-form" onSubmit={createJob}>
        <div className="tm-admin-audio-form-head"><div><span className="tm-admin-audio-step">01</span><div><h3>Build a work item</h3><p>The recording is stored privately and becomes available to qualified workers after upload.</p></div></div></div>
        <div className="tm-admin-audio-fields">
          <label><span>Recording</span><input key={fileKey} type="file" accept=".mp3,.wav,.m4a,.mp4,.webm,.ogg,.flac,.aac,.mov,.mkv,.avi,audio/*,video/*" onChange={(event) => onAudioSelected(event.target.files?.[0] || null)} /></label>
          <JobAudioRecorder onRecordingReady={(file, seconds) => { onAudioSelected(file, seconds); onRecordedAudioReady?.(file); }} onRecordingError={(message) => showMessage?.(message, 'error')} />
          {workingFile && <small className="tm-admin-audio-attached" role="status">Audio attached to this job: {workingFile.name}</small>}
          {recordedAudioFile && <div className="tm-admin-audio-recorded-choice"><button type="button" className="tm-admin-audio-secondary" onClick={() => onAudioSelected(recordedAudioFile)}>Use recorded audio</button><small role="status">Last recording: {recordedAudioFile.name}</small></div>}
          <label><span>Job name</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Optional · defaults to the filename" maxLength={180} /></label>
          <label><span>Recording length (minutes)</span><input type="number" min="0.01" step="0.01" value={minutes} onChange={(event) => setMinutes(event.target.value)} required /></label>
          <p className="tm-admin-audio-duration" role="status">{durationNote}</p>
          <label className="tm-admin-audio-wide"><span>Admin notes and special instructions</span><textarea rows={4} maxLength={12000} value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Optional instructions that apply to this recording. The job type's hardcoded rules remain in force." /></label>
          {templateJob && <label className="tm-admin-audio-wide"><span>Job-specific Word template (.docx)</span><input key={templateFileKey} type="file" aria-label="Job-specific Word template" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required onChange={(event) => setTemplateFile(event.target.files?.[0] || null)} />
            <small>Choose the one paragraph-based template the Template Agent must format into.</small>
            {templateFile && <ul className="tm-admin-audio-file-list"><li><span>{templateFile.name}</span><button type="button" aria-label={`Remove ${templateFile.name}`} onClick={() => { setTemplateFile(null); setTemplateFileKey((value) => value + 1); }}>Remove</button></li></ul>}
            {!templateFilePresent && <small className="tm-admin-audio-error" role="alert">Attach exactly one .docx file to create a Template Job.</small>}
          </label>}
          <label className="tm-admin-audio-wide"><span>Supporting files</span><input key={referenceKey} type="file" aria-label="Supporting files" accept=".pdf,.docx,.doc,.txt,.jpg,.jpeg,.png,.webp,.mp3,.wav,.m4a,.mp4,.ogg,.webm,.aac,.flac" multiple onChange={(event) => setReferences(Array.from(event.target.files || []))} />
            <small>{templateJob ? 'Attach up to five notes or reference files. Word, PDF, text, images, and audio are supported.' : 'Attach up to six notes or reference files. PDF, Word, text, images, and audio are supported.'}</small>
            {references.length > 0 && <ul className="tm-admin-audio-file-list">{references.map((file, index) => <li key={`${file.name}-${file.lastModified}-${index}`}><span>{file.name}</span><button type="button" aria-label={`Remove ${file.name}`} onClick={() => setReferences((current) => current.filter((_, fileIndex) => fileIndex !== index))}>Remove</button></li>)}</ul>}
            {!referencesValid && <small className="tm-admin-audio-error" role="alert">Attach no more than {maxReferences} supporting files.</small>}
          </label>
        </div>
        <footer className="tm-admin-audio-form-footer"><span>{templateJob ? 'Template Agent: GPT-5.6 Sol, with Claude Opus 5.5 fallback.' : 'General Agent: GPT-5.6 Luna, with DeepSeek V4 Flash fallback.'}</span><button type="submit" disabled={uploading || !workingFile || !Number(minutes) || !templateFilePresent || !referencesValid}>{uploading ? 'Uploading securely…' : `Create ${templateJob ? 'Template' : 'General'} Job`}</button></footer>
      </form>
    </section>
  );
}
