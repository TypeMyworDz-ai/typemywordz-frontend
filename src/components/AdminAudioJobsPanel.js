import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './AdminAudioJobsPanel.css';

const BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';
const ADMIN_EMAILS = new Set(['typemywordz@gmail.com', 'info@typemywordz.ai']);
const dateLabel = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

function jobStatus(job) {
  if (job.ai_agent_status === 'failed') return 'Ready to retry';
  if (job.status === 'approved') return 'Available to claim';
  if (['split_assigned', 'split_in_progress'].includes(job.status)) return 'Parts available';
  if (['assigned', 'in_progress'].includes(job.status)) return 'Worker assigned';
  if (job.status === 'submitted') return 'Submitted for review';
  if (job.status === 'released') return 'Reviewed';
  return job.status || '—';
}

export default function AdminAudioJobsPanel({ category = 'general', showMessage, onOpenQueue }) {
  const { currentUser } = useAuth();
  const templateJob = category === 'template';
  const email = (currentUser?.email || '').trim().toLowerCase();
  const isAdmin = ADMIN_EMAILS.has(email);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [workingFile, setWorkingFile] = useState(null);
  const [fileKey, setFileKey] = useState(0);
  const [title, setTitle] = useState('');
  const [seconds, setSeconds] = useState('');
  const [durationNote, setDurationNote] = useState('The length is detected when your browser can read the recording. Check it before creating the job.');
  const [instructions, setInstructions] = useState('');
  const [references, setReferences] = useState([]);
  const [referenceKey, setReferenceKey] = useState(0);
  const [templateFile, setTemplateFile] = useState(null);
  const [templateFileKey, setTemplateFileKey] = useState(0);

  const loadJobs = useCallback(async (quiet = false) => {
    if (!currentUser || !isAdmin) return;
    if (!quiet) setLoading(true);
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(`${BACKEND_URL}/human-transcription/jobs?scope=admin`, {
        headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || 'Admin-uploaded jobs could not be loaded.');
      setJobs((payload.jobs || []).filter((job) => job.admin_uploaded === true && job.job_category === category));
    } catch (error) {
      if (!quiet) showMessage?.(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [currentUser, isAdmin, category, showMessage]);

  useEffect(() => {
    loadJobs();
    if (!currentUser || !isAdmin) return undefined;
    const timer = window.setInterval(() => loadJobs(true), 15000);
    return () => window.clearInterval(timer);
  }, [currentUser, isAdmin, loadJobs]);

  const onAudioSelected = (file) => {
    setWorkingFile(file || null);
    setSeconds('');
    setDurationNote('The length is detected when your browser can read the recording. Check it before creating the job.');
    if (!file || typeof window.Audio !== 'function' || !window.URL?.createObjectURL) return;
    const url = window.URL.createObjectURL(file);
    const probe = new window.Audio();
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => {
      if (Number.isFinite(probe.duration) && probe.duration > 0) {
        setSeconds(String(Math.ceil(probe.duration)));
        setDurationNote(`Detected ${Math.ceil(probe.duration)} seconds. Adjust the length if needed.`);
      } else setDurationNote('Enter the recording length in seconds.');
      window.URL.revokeObjectURL(url);
    };
    probe.onerror = () => {
      setDurationNote('The browser could not read the duration. Enter the recording length in seconds.');
      window.URL.revokeObjectURL(url);
    };
    probe.src = url;
  };

  const maxReferences = templateJob ? 5 : 6;
  const referencesValid = references.length <= maxReferences;
  const templateFilePresent = !templateJob || Boolean(templateFile && /\.docx$/i.test(templateFile.name));

  const createJob = async (event) => {
    event.preventDefault();
    if (!workingFile || uploading || !Number(seconds) || !templateFilePresent || !referencesValid) return;
    setUploading(true);
    try {
      const token = await currentUser.getIdToken();
      const form = new FormData();
      form.append('audio', workingFile, workingFile.name);
      form.append('title', title.trim() || workingFile.name);
      form.append('seconds', String(seconds));
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
      setTitle(''); setSeconds(''); setInstructions(''); setReferences([]); setTemplateFile(null);
      setReferenceKey((value) => value + 1);
      setTemplateFileKey((value) => value + 1);
      setDurationNote('The length is detected when your browser can read the recording. Check it before creating the job.');
      const parts = Number(payload.parts_count || 0);
      showMessage?.(`${templateJob ? 'Template' : 'General'} Job created${parts ? ` with ${parts} available parts` : ' and added to Available Jobs'}.`, 'success');
      await loadJobs(true);
    } catch (error) {
      showMessage?.(error.message, 'error');
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
            ? 'Upload a recording with its Word template and any reference material. Eligible workers can claim the job directly; the Template Agent and AI proofreader remain available in the queue.'
            : 'Upload a recording and instructions. Eligible workers can claim the work directly; the General Agent and AI proofreader remain available in the queue.'}</p>
        </div>
        <button type="button" className="tm-admin-audio-secondary" onClick={() => onOpenQueue?.(jobs[0])}>Open Job Queue</button>
      </header>

      <div className="tm-admin-audio-policy" role="note">
        <strong>No client quote or credits.</strong>
        <span>Worker pay is calculated when work is submitted. New uploads skip the initial approval queue, while final admin review remains in place.</span>
      </div>

      <form className="tm-admin-audio-form" onSubmit={createJob}>
        <div className="tm-admin-audio-form-head"><div><span className="tm-admin-audio-step">01</span><div><h3>Build a work item</h3><p>The recording is stored privately and becomes available to qualified workers after upload.</p></div></div></div>
        <div className="tm-admin-audio-fields">
          <label><span>Recording</span><input key={fileKey} type="file" accept=".mp3,.wav,.m4a,.mp4,.webm,.ogg,.flac,.aac,.mov,.mkv,.avi,audio/*,video/*" required onChange={(event) => onAudioSelected(event.target.files?.[0] || null)} /></label>
          <label><span>Job name</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Optional · defaults to the filename" maxLength={180} /></label>
          <label><span>Recording length (seconds)</span><input type="number" min="1" step="1" value={seconds} onChange={(event) => setSeconds(event.target.value)} required /></label>
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
        <footer className="tm-admin-audio-form-footer"><span>{templateJob ? 'Template Agent: Claude Opus 5.5, with GPT-5.6 Sol fallback.' : 'General Agent: Claude Opus 5.5, with GPT-5.6 Sol fallback.'}</span><button type="submit" disabled={uploading || !workingFile || !Number(seconds) || !templateFilePresent || !referencesValid}>{uploading ? 'Uploading securely…' : `Create ${templateJob ? 'Template' : 'General'} Job`}</button></footer>
      </form>

      <section className="tm-admin-audio-list" aria-labelledby="tm-admin-audio-list-title">
        <div className="tm-admin-audio-list-head"><div><h3 id="tm-admin-audio-list-title">Recent {titleText.toLowerCase()}</h3><p>New work appears on the main Job Queue and eligible workers' Available Jobs board.</p></div><button type="button" className="tm-admin-audio-secondary" onClick={() => loadJobs()}>Refresh</button></div>
        {loading ? <p className="tm-admin-audio-empty">Loading recent uploads…</p> : jobs.length ? <div className="tm-admin-audio-table" role="list">{jobs.slice(0, 25).map((job) => <article className="tm-admin-audio-row" role="listitem" key={job.id}><div><strong>{job.job_name || job.audio?.name || titleText}</strong><span>{job.minutes || 0} min · {job.segments?.length ? `${job.segments.length} parts` : 'whole recording'} · {dateLabel(job.createdAt)}</span></div><span className="tm-admin-audio-status">{jobStatus(job)}</span></article>)}</div> : <p className="tm-admin-audio-empty">No admin uploads in this category yet.</p>}
      </section>
    </section>
  );
}
