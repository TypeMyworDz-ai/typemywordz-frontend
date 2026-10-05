import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './LetterJobsAdminPanel.css';

const BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';
const LETTER_ADMIN_EMAILS = new Set(['typemywordz@gmail.com', 'info@typemywordz.ai']);
const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const statusLabel = (job) => {
  if (job.status === 'approved' && job.letter_agent_status === 'failed') return 'Ready to reassign';
  if (job.status === 'approved') return 'Ready for assignment';
  if (job.status === 'assigned' || job.status === 'in_progress') return job.letter_agent_status === 'processing' || job.letter_agent_status === 'queued' ? 'Letter Agent working' : 'Worker assigned';
  if (job.status === 'submitted') return 'Submitted for human review';
  if (job.status === 'released') return 'Released';
  return job.status || '—';
};

const dateLabel = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

const formatBytes = (bytes) => {
  const size = Number(bytes || 0);
  if (!size) return '';
  return size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

export default function LetterJobsAdminPanel({ showMessage }) {
  const { currentUser } = useAuth();
  const email = (currentUser?.email || '').trim().toLowerCase();
  const isAdmin = LETTER_ADMIN_EMAILS.has(email);
  const [jobs, setJobs] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [working, setWorking] = useState('');
  const [audioFile, setAudioFile] = useState(null);
  const [audioInputKey, setAudioInputKey] = useState(0);
  const [title, setTitle] = useState('');
  const [seconds, setSeconds] = useState('');
  const [durationNote, setDurationNote] = useState('Recording length is detected when the browser can read it; check or adjust the value.');
  const [instructions, setInstructions] = useState('');
  const [references, setReferences] = useState([]);
  const [referenceInputKey, setReferenceInputKey] = useState(0);
  const [workerChoices, setWorkerChoices] = useState({});
  const [releaseConfirmId, setReleaseConfirmId] = useState('');

  const loadJobs = useCallback(async (quiet = false) => {
    if (!currentUser || !isAdmin) return;
    if (!quiet) setLoading(true);
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(`${BACKEND_URL}/human-transcription/admin/letter-jobs`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || 'Letter Jobs could not be loaded.');
      setJobs(payload.jobs || []);
    } catch (error) {
      if (!quiet) showMessage?.(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [currentUser, isAdmin, showMessage]);

  useEffect(() => {
    loadJobs();
    if (!currentUser || !isAdmin) return undefined;
    const timer = window.setInterval(() => loadJobs(true), 10000);
    return () => window.clearInterval(timer);
  }, [currentUser, isAdmin, loadJobs]);

  useEffect(() => {
    if (!currentUser || !isAdmin) return;
    (async () => {
      try {
        const token = await currentUser.getIdToken();
        const response = await fetch(`${BACKEND_URL}/human-transcription/admin/worker-options`, { headers: { Authorization: `Bearer ${token}` } });
        const payload = await response.json().catch(() => ({}));
        if (response.ok) setWorkers((payload.workers || []).filter((worker) => worker.available !== false));
      } catch { /* the assignment control remains empty if the worker list is unavailable */ }
    })();
  }, [currentUser, isAdmin]);

  const onAudioSelected = (file) => {
    setAudioFile(file || null);
    setSeconds('');
    setDurationNote('Recording length is detected when the browser can read it; check or adjust the value.');
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

  const createJob = async (event) => {
    event.preventDefault();
    if (!audioFile || uploading || !Number(seconds)) return;
    setUploading(true);
    try {
      const token = await currentUser.getIdToken();
      const form = new FormData();
      form.append('audio', audioFile, audioFile.name);
      form.append('title', title.trim() || audioFile.name);
      form.append('seconds', String(seconds));
      form.append('instructions', instructions.trim());
      references.forEach((file) => form.append('attachments', file, file.name));
      const response = await fetch(`${BACKEND_URL}/human-transcription/admin/letter-jobs`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || 'The Letter Job could not be created.');
      setAudioFile(null); setAudioInputKey((value) => value + 1);
      setTitle(''); setSeconds(''); setDurationNote('Recording length is detected when the browser can read it; check or adjust the value.');
      setInstructions(''); setReferences([]); setReferenceInputKey((value) => value + 1);
      showMessage?.('Letter Job created as one complete, unsplit job.', 'success');
      await loadJobs(true);
    } catch (error) {
      showMessage?.(error.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const postJson = async (path, body, success) => {
    const token = await currentUser.getIdToken();
    const response = await fetch(`${BACKEND_URL}${path}`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || 'That Letter Job action could not be completed.');
    showMessage?.(success, 'success');
    return payload;
  };

  const assignWorker = async (job) => {
    const workerUid = workerChoices[job.id];
    if (!workerUid || working) return;
    setWorking(job.id);
    try {
      await postJson(`/human-transcription/jobs/${job.id}/assign-whole`, { worker_uid: workerUid }, 'The complete Letter Job was assigned to one worker.');
      await loadJobs(true);
    } catch (error) { showMessage?.(error.message, 'error'); }
    finally { setWorking(''); }
  };

  const assignAgent = async (job) => {
    if (working) return;
    setWorking(job.id);
    try {
      await postJson(`/human-transcription/jobs/${job.id}/letter-agent/assign`, undefined, 'The complete Letter Job was assigned to the Opus-first Letter Agent.');
      await loadJobs(true);
    } catch (error) { showMessage?.(error.message, 'error'); }
    finally { setWorking(''); }
  };

  const retryReview = async (job) => {
    if (working) return;
    setWorking(job.id);
    try {
      await postJson(`/human-transcription/jobs/${job.id}/letter-ai-review`, undefined, 'The independent Letter AI review has been queued.');
      await loadJobs(true);
    } catch (error) { showMessage?.(error.message, 'error'); }
    finally { setWorking(''); }
  };

  const releaseJob = async (job) => {
    if (working || releaseConfirmId !== job.id) return;
    setWorking(job.id);
    try {
      await postJson(`/human-transcription/jobs/${job.id}/review`, { feedback: 'Letter document and independent AI review checked by admin.' }, 'Letter Job approved and marked released.');
      setReleaseConfirmId('');
      await loadJobs(true);
    } catch (error) { showMessage?.(error.message, 'error'); }
    finally { setWorking(''); }
  };

  const downloadFile = async (path, filename, errorMessage) => {
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(`${BACKEND_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || errorMessage);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(new Blob([blob], { type: DOCX_TYPE }));
      const link = document.createElement('a');
      link.href = url; link.download = filename; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { showMessage?.(error.message || errorMessage, 'error'); }
  };

  if (!isAdmin) return <section className="tm-admin-panel"><h2 className="tm-admin-panel-title">Letter Jobs</h2><p className="tm-admin-panel-note">This section is available to the admin team.</p></section>;

  return <div className="tm-pdf-jobs-panel tm-letter-jobs-panel">
    <section className="tm-admin-panel tm-pdf-jobs-upload">
      <div className="tm-admin-panel-head">
        <div>
          <p className="tm-admin-kicker">Complete audio · one assignment</p>
          <h2 className="tm-admin-panel-title">Letter Jobs</h2>
          <p className="tm-admin-panel-note">Upload a dictated letter recording, then assign the entire job to one worker or the dedicated Letter Agent. Letter Agent drafts use Claude Opus 5.5 first and GPT-5.6 Sol only as fallback. The Letter Standard Indentation Word template and letter-only guidelines are built in. No letter is split into slices.</p>
        </div>
      </div>
      <form onSubmit={createJob}>
        <label className="tm-pdf-jobs-dropzone">
          <strong>Select the complete letter recording</strong>
          <span>MP3, WAV, M4A, MP4, WebM, OGG, FLAC, AAC, MOV, MKV or AVI. The recording remains one unsplit job.</span>
          <input key={audioInputKey} type="file" accept="audio/*,video/*,.mp3,.wav,.m4a,.mp4,.webm,.ogg,.flac,.aac,.mov,.mkv,.avi" onChange={(event) => onAudioSelected(event.target.files?.[0] || null)} />
        </label>
        {audioFile && <div className="tm-pdf-jobs-selected"><div className="tm-pdf-jobs-file"><span>{audioFile.name}</span><small>{formatBytes(audioFile.size)}</small><button type="button" onClick={() => { setAudioFile(null); setAudioInputKey((value) => value + 1); setSeconds(''); }}>Remove</button></div></div>}
        <div className="tm-letter-job-fields">
          <label><strong>Job name</strong><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={audioFile?.name || 'For example, Client letter · October 2026'} /></label>
          <label><strong>Recording length (seconds)</strong><input type="number" min="1" step="1" value={seconds} onChange={(event) => setSeconds(event.target.value)} required /><small>{durationNote}</small></label>
        </div>
        <label className="tm-pdf-jobs-dropzone" style={{ marginTop: 12 }}>
          <strong>Attach instructions or references (optional)</strong>
          <span>PDF, Word, text, image or audio reference files, up to 20 MB each and six files total. The built-in letter guide and standard template are applied separately.</span>
          <input key={referenceInputKey} type="file" accept=".pdf,.docx,.doc,.txt,.jpg,.jpeg,.png,.webp,audio/*,.mp3,.wav,.m4a,.mp4,.ogg,.webm,.aac,.flac" multiple onChange={(event) => setReferences(Array.from(event.target.files || []).slice(0, 6))} />
        </label>
        {references.length > 0 && <div className="tm-pdf-jobs-selected">{references.map((file, index) => <div className="tm-pdf-jobs-file" key={`${file.name}-${index}`}><span>{file.name}</span><small>{formatBytes(file.size)}</small><button type="button" onClick={() => { setReferences((previous) => previous.filter((_, fileIndex) => fileIndex !== index)); setReferenceInputKey((value) => value + 1); }}>Remove</button></div>)}</div>}
        <label className="tm-letter-job-instructions"><strong>Specific letter instructions</strong><textarea rows={3} value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Add job-specific spellings, names, or layout directions. These supplement the permanent Letter Job guidelines." /></label>
        <div className="tm-pdf-jobs-actions"><span>Only the final admin review releases a submitted .docx. AI drafting and AI review do not approve or release the letter.</span><button type="submit" className="tm-admin-btn" disabled={!audioFile || !Number(seconds) || uploading}>{uploading ? 'Creating Letter Job…' : 'Create complete Letter Job'}</button></div>
      </form>
    </section>

    <section className="tm-admin-panel tm-pdf-jobs-list">
      <div className="tm-admin-panel-head"><div><h2 className="tm-admin-panel-title">Letter Job queue</h2><p className="tm-admin-panel-note">Assign one whole job, review both Word files, then approve it manually.</p></div><button type="button" className="tm-admin-btn" onClick={() => loadJobs()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button></div>
      {loading && !jobs.length ? <div className="tm-admin-empty">Loading Letter Jobs…</div> : !jobs.length ? <div className="tm-admin-empty">No Letter Jobs have been uploaded yet.</div> : (
        <div className="tm-admin-table-scroll"><table className="tm-admin-table"><thead><tr><th>Letter / recording</th><th>Status</th><th>Assignment</th><th>Actions</th><th>Added</th></tr></thead><tbody>
          {jobs.map((job) => <tr key={job.id}>
            <td><strong>{job.job_name || job.audio?.name || 'Letter Job'}</strong><div className="tm-admin-name">{job.minutes || 0} min · {job.audio?.name || 'Source recording'}</div>{job.instruction_attachments?.length > 0 && <div className="tm-admin-name">{job.instruction_attachments.length} reference file{job.instruction_attachments.length === 1 ? '' : 's'}</div>}</td>
            <td>{statusLabel(job)}<div className="tm-admin-name">{job.letter_agent_status && job.letter_agent_status !== 'available' ? `Letter Agent: ${job.letter_agent_status}` : ''}{job.letter_ai_review_status && job.letter_ai_review_status !== 'not_started' ? ` · AI review: ${job.letter_ai_review_status}` : ''}</div>{job.letter_agent_error && <div className="tm-letter-job-error" role="alert">{job.letter_agent_error}</div>}{job.letter_ai_review_error && <div className="tm-letter-job-error" role="alert">{job.letter_ai_review_error}</div>}</td>
            <td>{job.worker_name || job.worker_email || job.letter_agent_name || 'Unassigned'}{job.letter_agent_model_ids?.length > 0 && <div className="tm-admin-name">{job.letter_agent_model_ids.join(' + ')}</div>}</td>
            <td><div className="tm-letter-job-actions">
              {job.status === 'approved' && <>
                {workers.length > 0 && <div className="tm-letter-job-assign"><select aria-label={`Choose a worker for ${job.job_name || job.audio?.name || 'Letter Job'}`} value={workerChoices[job.id] || ''} onChange={(event) => setWorkerChoices((current) => ({ ...current, [job.id]: event.target.value }))}><option value="">Choose one worker</option>{workers.map((worker) => <option key={worker.uid} value={worker.uid}>{worker.name || worker.email}</option>)}</select><button type="button" className="tm-admin-btn" disabled={!workerChoices[job.id] || working === job.id} onClick={() => assignWorker(job)}>{working === job.id ? 'Assigning…' : 'Assign whole job'}</button></div>}
                <button type="button" className="tm-admin-btn tm-letter-agent-btn" disabled={working === job.id} onClick={() => assignAgent(job)}>{working === job.id ? 'Queuing…' : 'Assign Letter Agent'}</button>
              </>}
              {job.status === 'submitted' && job.final_attachment?.name && <button type="button" className="tm-admin-link-button" onClick={() => downloadFile(`/human-transcription/jobs/${job.id}/final-attachment`, job.final_attachment.name, 'The submitted Word document is not available.')}>Download submitted Word document</button>}
              {job.status === 'submitted' && job.letter_ai_review_status === 'completed' && job.letter_ai_review_attachment?.name && <button type="button" className="tm-admin-link-button" onClick={() => downloadFile(`/human-transcription/admin/jobs/${job.id}/letter-ai-review-docx`, job.letter_ai_review_attachment.name, 'The AI-reviewed Word document is not available.')}>Download AI-reviewed Word document</button>}
              {job.status === 'submitted' && job.letter_ai_review_status === 'failed' && <button type="button" className="tm-admin-btn" disabled={working === job.id} onClick={() => retryReview(job)}>{working === job.id ? 'Queuing…' : 'Retry AI review'}</button>}
              {job.status === 'submitted' && ['queued', 'processing'].includes(job.letter_ai_review_status) && <span className="tm-letter-review-running" role="status">The independent review is running.</span>}
              {job.status === 'submitted' && job.letter_ai_review_status === 'completed' && <>
                {releaseConfirmId === job.id ? <div className="tm-letter-release-confirm" role="group" aria-label="Confirm letter release"><span>Confirm you reviewed both Word documents.</span><button type="button" className="tm-admin-btn" disabled={working === job.id} onClick={() => releaseJob(job)}>Confirm release</button><button type="button" className="tm-admin-link-button" onClick={() => setReleaseConfirmId('')}>Cancel</button></div> : <button type="button" className="tm-admin-btn" onClick={() => setReleaseConfirmId(job.id)}>Approve &amp; release</button>}
              </>}
              {job.status === 'released' && <span className="tm-letter-review-running">Human-approved and released.</span>}
            </div></td>
            <td>{dateLabel(job.createdAt)}</td>
          </tr>)}
        </tbody></table></div>
      )}
    </section>
  </div>;
}
