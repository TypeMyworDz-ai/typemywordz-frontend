import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';
const PDF_ADMIN_EMAIL = 'info@typemywordz.ai';
const statusLabel = (status) => ({ approved: 'Waiting for assignment', assigned: 'Assigned', in_progress: 'In progress', split_in_progress: 'AI draft in progress', split_assigned: 'AI draft needs retry / worker', proofreading_available: 'Ready for human proofreading', proofreading_assigned: 'Human proofreading assigned', proofreading_in_progress: 'Human proofreading in progress', submitted: 'Submitted for review', released: 'Completed', cancelled: 'Cancelled' }[status] || status || 'Waiting for assignment');
const moneylessDate = (value) => { if (!value) return '—'; const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); };

export default function PdfJobsAdminPanel({ showMessage, onOpenQueue }) {
  const { currentUser } = useAuth();
  const [files, setFiles] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [extras, setExtras] = useState([]);
  const [extraKey, setExtraKey] = useState(0);
  const [note, setNote] = useState('');
  const [workers, setWorkers] = useState([]);
  const [pick, setPick] = useState({});
  const [extend, setExtend] = useState({});
  const [working, setWorking] = useState('');

  const loadJobs = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(`${BACKEND_URL}/human-transcription/admin/pdf-jobs`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || 'PDF Jobs could not be loaded.');
      setJobs(payload.jobs || []);
    } catch (error) { showMessage?.(error.message, 'error'); }
    finally { setLoading(false); }
  }, [currentUser, showMessage]);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  useEffect(() => {
    if (!currentUser) return;
    (async () => {
      try {
        const token = await currentUser.getIdToken();
        const response = await fetch(`${BACKEND_URL}/human-transcription/admin/worker-options`, { headers: { Authorization: `Bearer ${token}` } });
        const payload = await response.json().catch(() => ({}));
        if (response.ok) setWorkers(payload.workers || []);
      } catch { /* the list stays empty and the admin is told below */ }
    })();
  }, [currentUser]);

  const postJson = async (path, body, success) => {
    const token = await currentUser.getIdToken();
    const response = await fetch(`${BACKEND_URL}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || 'That could not be saved.');
    showMessage?.(success, 'success');
    return payload;
  };

  const assignJob = async (job) => {
    const workerUid = pick[job.id];
    if (!workerUid || working) return;
    setWorking(job.id);
    try { await postJson(`/human-transcription/jobs/${job.id}/assign-whole`, { worker_uid: workerUid }, 'Assigned. The worker has 20 minutes and has been notified.'); await loadJobs(); }
    catch (error) { showMessage?.(error.message, 'error'); }
    finally { setWorking(''); }
  };

  const runGemini = async (job) => {
    if (working) return;
    setWorking(job.id);
    try {
      const body = { agent_id: 'pdf-gemini' };
      if (job.ai_agent_segment_id) body.segment_id = job.ai_agent_segment_id;
      await postJson(`/human-transcription/jobs/${job.id}/ai-agent/assign`, body, 'Gemini draft queued. It will remain private until an approved human proofreader submits the checked work.');
      await loadJobs();
    } catch (error) { showMessage?.(error.message, 'error'); }
    finally { setWorking(''); }
  };

  const extendJob = async (job) => {
    const minutes = Number(extend[job.id] || 5);
    if (working) return;
    setWorking(job.id);
    try { await postJson(`/human-transcription/jobs/${job.id}/extend-tat`, { minutes }, `Deadline extended by ${minutes} minutes.`); await loadJobs(); }
    catch (error) { showMessage?.(error.message, 'error'); }
    finally { setWorking(''); }
  };

  const uploadFiles = async (event) => {
    event.preventDefault();
    if (!files.length || uploading) return;
    setUploading(true);
    try {
      const token = await currentUser.getIdToken();
      const form = new FormData();
      files.forEach((file) => form.append('files', file, file.name));
      extras.forEach((file) => form.append('attachments', file, file.name));
      if (note.trim()) form.append('instructions', note.trim());
      const response = await fetch(`${BACKEND_URL}/human-transcription/admin/pdf-jobs`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || 'The selected files could not be added.');
      setFiles([]);
      setFileInputKey((value) => value + 1);
      setExtras([]); setExtraKey((value) => value + 1); setNote('');
      showMessage?.(`${payload.created_count || 0} image job${payload.created_count === 1 ? '' : 's'} ready. Choose a worker for each one below.`, 'success');
      await loadJobs();
    } catch (error) { showMessage?.(error.message, 'error'); }
    finally { setUploading(false); }
  };

  if ((currentUser?.email || '').toLowerCase() !== PDF_ADMIN_EMAIL) return <section className="tm-admin-panel"><h2 className="tm-admin-panel-title">PDF Jobs</h2><p className="tm-admin-panel-note">This section is available to the dedicated PDF Jobs admin account.</p></section>;

  return <div className="tm-pdf-jobs-panel">
    <section className="tm-admin-panel tm-pdf-jobs-upload">
      <div className="tm-admin-panel-head"><div><p className="tm-admin-kicker">Image transcription</p><h2 className="tm-admin-panel-title">PDF Jobs</h2><p className="tm-admin-panel-note">Upload images or PDFs. Each image and each PDF page becomes one separate job. You choose the worker for each one, so nothing is shown on the public job board. Every job has a 20 minute deadline that you can extend. Worker pay is fixed at KES 100 for each submitted image.</p></div><button type="button" className="tm-admin-btn" onClick={onOpenQueue}>Open Human Work queue</button></div>
      <form onSubmit={uploadFiles}>
        <label className="tm-pdf-jobs-dropzone"><strong>Select images or PDFs</strong><span>JPG, PNG, WebP, TIFF, PDF or Word (.docx) · Up to 25 MB per file · 100 pages per PDF. Word documents are turned into images before the jobs are created.</span><input key={fileInputKey} type="file" accept=".pdf,.docx,.doc,image/*" multiple onChange={(event) => setFiles(Array.from(event.target.files || []))} /></label>
        {files.length > 0 && <div className="tm-pdf-jobs-selected"><div><strong>{files.length} source file{files.length === 1 ? '' : 's'} selected</strong><button type="button" className="tm-admin-link-button" onClick={() => { setFiles([]); setFileInputKey((value) => value + 1); }}>Clear selection</button></div>{files.map((file, index) => <div className="tm-pdf-jobs-file" key={`${file.name}-${index}`}><span>{file.name}</span><small>{(file.size / (1024 * 1024)).toFixed(1)} MB</small><button type="button" aria-label={`Remove ${file.name}`} onClick={() => { setFiles((previous) => previous.filter((_, fileIndex) => fileIndex !== index)); setFileInputKey((value) => value + 1); }}>Remove</button></div>)}</div>}
        <label className="tm-pdf-jobs-dropzone" style={{ marginTop: 12 }}><strong>Attach more files (optional)</strong><span>The client's special guidelines for these images: PDF, Word or audio, up to 25 MB each. The assigned worker can download them.</span><input key={extraKey} type="file" accept=".pdf,.docx,.doc,.txt,audio/*,.mp3,.wav,.m4a" multiple onChange={(event) => setExtras(Array.from(event.target.files || []).slice(0, 6))} /></label>
        {extras.length > 0 && <div className="tm-pdf-jobs-selected">{extras.map((file, index) => <div className="tm-pdf-jobs-file" key={`${file.name}-${index}`}><span>{file.name}</span><small>{(file.size / (1024 * 1024)).toFixed(1)} MB</small></div>)}</div>}
        <label style={{ display: 'grid', gap: 6, marginTop: 12 }}><strong>Note for the worker (optional)</strong><textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Anything the client wants followed when transcribing these images" /></label>
        <div className="tm-pdf-jobs-actions"><span>Workers will see: “Always use Gemini for image transcription”.</span><button type="submit" className="tm-admin-btn" disabled={!files.length || uploading}>{uploading ? 'Preparing jobs…' : 'Create image jobs'}</button></div>
      </form>
    </section>
    <section className="tm-admin-panel tm-pdf-jobs-list">
      <div className="tm-admin-panel-head"><div><h2 className="tm-admin-panel-title">Uploaded image jobs</h2><p className="tm-admin-panel-note">Review status and worker submissions in the Human Work queue.</p></div><button type="button" className="tm-admin-btn" onClick={loadJobs} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button></div>
      <div className="tm-admin-table-scroll"><table className="tm-admin-table"><thead><tr><th>Image / source</th><th>Status</th><th>Worker / AI agent</th><th>Assign / deadline</th><th>Worker pay</th><th>Added</th></tr></thead><tbody>{jobs.map((job) => <tr key={job.id}><td><strong>{job.name}</strong>{job.reference_files > 0 && <div className="tm-admin-name">{job.reference_files} reference file{job.reference_files === 1 ? '' : 's'} attached</div>}<div className="tm-admin-name">{job.source_filename}{job.page_count > 1 ? ` · Page ${job.page_number} of ${job.page_count}` : ''}</div></td><td>{statusLabel(job.status)}{job.ai_agent_status && <div className="tm-admin-name">{job.ai_agent_status === 'submitted' ? 'AI draft ready' : job.ai_agent_status === 'failed' ? 'AI run failed' : 'AI agent: ' + (job.ai_agent_name || 'Gemini 3.8')}</div>}</td><td>{job.ai_agent_name || job.worker_name || job.worker_email || 'Not assigned'}{job.ai_agent_model_ids?.length ? <div className="tm-admin-name">{job.ai_agent_model_ids.join(' + ')}</div> : null}</td><td>{job.status === 'approved' ? <div style={{ display: 'grid', gap: 6 }}><button type="button" className="tm-admin-btn" disabled={working === job.id} onClick={() => runGemini(job)}>{working === job.id ? 'Queuing…' : 'Assign Gemini 3.8'}</button>{workers.length ? <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><select aria-label="Choose a worker" value={pick[job.id] || ''} onChange={(event) => setPick((current) => ({ ...current, [job.id]: event.target.value }))}><option value="">Or choose a worker</option>{workers.map((worker) => <option key={worker.uid} value={worker.uid}>{worker.name}{worker.available ? '' : ' (unavailable)'}</option>)}</select><button type="button" className="tm-admin-btn" disabled={!pick[job.id] || working === job.id} onClick={() => assignJob(job)}>{working === job.id ? 'Assigning…' : 'Assign worker'}</button></div> : null}</div> : job.ai_agent_status === 'failed' ? <button type="button" className="tm-admin-btn" disabled={working === job.id} onClick={() => runGemini(job)}>{working === job.id ? 'Queuing…' : 'Retry Gemini'}</button> : job.ai_agent_status === 'submitted' || job.status.startsWith('proofreading_') ? <button type="button" className="tm-admin-btn" onClick={onOpenQueue}>Open queue to assign proofreader</button> : (job.status === 'assigned' || job.status === 'in_progress') ? <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}><small>{job.deadline_at ? `Due ${moneylessDate(job.deadline_at)}` : ''}</small><select aria-label="Extend by" value={extend[job.id] || 5} onChange={(event) => setExtend((current) => ({ ...current, [job.id]: event.target.value }))}>{[5, 10, 15, 20].map((value) => <option key={value} value={value}>+{value} min</option>)}</select><button type="button" className="tm-admin-btn" disabled={working === job.id} onClick={() => extendJob(job)}>Extend</button></div> : '—'}</td><td>{job.worker_amount_kes ? `KES ${job.worker_amount_kes}` : job.status === 'approved' || job.status === 'assigned' || job.status === 'in_progress' ? 'KES 100 on submission' : 'KES 100'}</td><td>{moneylessDate(job.created_at)}</td></tr>)}</tbody></table>{!loading && !jobs.length && <div className="tm-admin-empty">No PDF image jobs have been uploaded yet.</div>}</div>
    </section>
  </div>;
}
