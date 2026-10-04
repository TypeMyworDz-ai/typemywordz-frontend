import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';
const PDF_ADMIN_EMAILS = new Set(['info@typemywordz.ai', 'typemywordz@gmail.com']);
const AI_AGENT_ASSIGNMENT_EMAILS = new Set(['info@typemywordz.ai', 'typemywordz@gmail.com']);
const statusLabel = (status) => ({ approved: 'Waiting for assignment', assigned: 'Assigned', in_progress: 'In progress', split_in_progress: 'AI draft in progress', split_assigned: 'AI draft needs retry / worker', proofreading_available: 'Ready for human proofreading', proofreading_assigned: 'Human proofreading assigned', proofreading_in_progress: 'Human proofreading in progress', submitted: 'Submitted for review', released: 'Completed', cancelled: 'Cancelled' }[status] || status || 'Waiting for assignment');
const moneylessDate = (value) => { if (!value) return '—'; const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); };

export default function PdfJobsAdminPanel({ showMessage, onOpenQueue, category = 'pdf' }) {
  const { currentUser } = useAuth();
  const isText = category === 'text_messages';
  const agentId = isText ? 'text-messages-gemini' : 'pdf-gemini';
  const agentLabel = isText ? 'Text Messages Agent' : 'PDF Agent (Gemini 3.8)';
  const sectionTitle = isText ? 'Text Messages' : 'PDF Jobs';
  const [bulkRunning, setBulkRunning] = useState(false);
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
  const normalizedEmail = (currentUser?.email || '').trim().toLowerCase();
  const canAssignAiAgents = AI_AGENT_ASSIGNMENT_EMAILS.has(normalizedEmail);

  const loadJobs = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(`${BACKEND_URL}/human-transcription/admin/pdf-jobs`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || 'PDF Jobs could not be loaded.');
      setJobs((payload.jobs || []).filter((job) => (job.category || 'pdf') === category));
    } catch (error) { showMessage?.(error.message, 'error'); }
    finally { setLoading(false); }
  }, [currentUser, showMessage, category]);

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
    if (!canAssignAiAgents || working) return;
    setWorking(job.id);
    try {
      const body = { agent_id: agentId };
      if (job.ai_agent_segment_id) body.segment_id = job.ai_agent_segment_id;
      await postJson(`/human-transcription/jobs/${job.id}/ai-agent/assign`, body, `${agentLabel} draft queued. It will remain private until an approved human proofreader submits the checked work.`);
      await loadJobs();
    } catch (error) { showMessage?.(error.message, 'error'); }
    finally { setWorking(''); }
  };

  const runWholeFile = async (group) => {
    if (!canAssignAiAgents || working || bulkRunning) return;
    const waiting = group.jobs.filter((job) => job.status === 'approved');
    if (!waiting.length || waiting.length !== group.jobs.length) return;
    const batchIds = waiting.map((job) => job.id);
    if (!window.confirm(`Give all ${waiting.length} pages of "${group.name}" to the ${agentLabel} as one job? The agent reads every page together so names and formatting stay consistent. Each page still gets its own draft, which stays private until a human proofreader checks it.`)) return;
    setBulkRunning(true);
    let done = 0; const failed = [];
    for (const job of waiting) {
      try {
        const token = await currentUser.getIdToken();
        const response = await fetch(`${BACKEND_URL}/human-transcription/jobs/${job.id}/ai-agent/assign`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ agent_id: agentId, batch_job_ids: batchIds }) });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.detail || 'Not queued');
        done += 1;
      } catch (error) { failed.push(`page ${job.page_number}: ${error.message}`); }
    }
    setBulkRunning(false);
    showMessage?.(failed.length ? `${done} page${done === 1 ? '' : 's'} queued. ${failed.length} could not be queued (${failed.slice(0, 3).join('; ')}).` : `All ${done} page${done === 1 ? '' : 's'} of "${group.name}" were queued for the ${agentLabel}.`, failed.length ? 'error' : 'success');
    await loadJobs();
  };

  const createFileReview = async (group) => {
    if (working || bulkRunning) return;
    setWorking(group.key);
    try {
      await postJson('/human-transcription/admin/pdf-jobs/file-review', { job_ids: group.jobs.map((job) => job.id) }, `Whole-file review job created for "${group.name}". Assign the AI reviewer or a human worker to it in the table below.`);
      await loadJobs();
    } catch (error) { showMessage?.(error.message, 'error'); }
    finally { setWorking(''); }
  };

  const fileGroups = (() => {
    const map = new Map();
    jobs.filter((job) => !job.is_review).forEach((job) => {
      const key = job.batch_id || job.source_filename || job.id;
      if (!map.has(key)) map.set(key, { key, name: job.source_filename || job.name, jobs: [] });
      map.get(key).jobs.push(job);
    });
    return Array.from(map.values()).filter((group) => group.jobs.length > 1);
  })();

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
      form.append('category', category);
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

  if (!PDF_ADMIN_EMAILS.has(normalizedEmail)) return <section className="tm-admin-panel"><h2 className="tm-admin-panel-title">{sectionTitle}</h2><p className="tm-admin-panel-note">This section is available to the admin team.</p></section>;

  return <div className="tm-pdf-jobs-panel">
    <section className="tm-admin-panel tm-pdf-jobs-upload">
      <div className="tm-admin-panel-head"><div><p className="tm-admin-kicker">{isText ? 'Text message screenshots' : 'Image transcription'}</p><h2 className="tm-admin-panel-title">{sectionTitle}</h2><p className="tm-admin-panel-note">{isText ? 'Upload screenshots or photos of text conversations (images or a PDF of screenshots). Each screenshot becomes one separate job that you can give to a worker or to the Text Messages Agent (Gemini, with Claude Opus as backup). ' : 'Upload images or PDFs. '}Each image and each PDF page becomes one separate job. You can also send a whole multi-page file to the AI agent in one click. You choose the worker for each one, so nothing is shown on the public job board. Every job has a 20 minute deadline that you can extend. Worker pay is fixed at KES 100 for each submitted image.</p></div><button type="button" className="tm-admin-btn" onClick={onOpenQueue}>Open Human Work queue</button></div>
      <form onSubmit={uploadFiles}>
        <label className="tm-pdf-jobs-dropzone"><strong>{isText ? 'Select screenshots or a PDF of screenshots' : 'Select images or PDFs'}</strong><span>JPG, PNG, WebP, TIFF, PDF or Word (.docx) · Up to 25 MB per file · 100 pages per PDF. Word documents are turned into images before the jobs are created.</span><input key={fileInputKey} type="file" accept=".pdf,.docx,.doc,image/*" multiple onChange={(event) => setFiles(Array.from(event.target.files || []))} /></label>
        {files.length > 0 && <div className="tm-pdf-jobs-selected"><div><strong>{files.length} source file{files.length === 1 ? '' : 's'} selected</strong><button type="button" className="tm-admin-link-button" onClick={() => { setFiles([]); setFileInputKey((value) => value + 1); }}>Clear selection</button></div>{files.map((file, index) => <div className="tm-pdf-jobs-file" key={`${file.name}-${index}`}><span>{file.name}</span><small>{(file.size / (1024 * 1024)).toFixed(1)} MB</small><button type="button" aria-label={`Remove ${file.name}`} onClick={() => { setFiles((previous) => previous.filter((_, fileIndex) => fileIndex !== index)); setFileInputKey((value) => value + 1); }}>Remove</button></div>)}</div>}
        <label className="tm-pdf-jobs-dropzone" style={{ marginTop: 12 }}><strong>Attach more files (optional)</strong><span>Documents with extra instructions: PDF, Word, text, image or audio, up to 25 MB each. The AI agent reads them (audio is transcribed first) and the assigned worker can download them.</span><input key={extraKey} type="file" accept=".pdf,.docx,.doc,.txt,.jpg,.jpeg,.png,.webp,audio/*,.mp3,.wav,.m4a" multiple onChange={(event) => setExtras(Array.from(event.target.files || []).slice(0, 6))} /></label>
        {extras.length > 0 && <div className="tm-pdf-jobs-selected">{extras.map((file, index) => <div className="tm-pdf-jobs-file" key={`${file.name}-${index}`}><span>{file.name}</span><small>{(file.size / (1024 * 1024)).toFixed(1)} MB</small></div>)}</div>}
        <label style={{ display: 'grid', gap: 6, marginTop: 12 }}><strong>{isText ? 'Specific instructions for the workers or the Text Messages Agent (optional)' : 'Instructions for the workers or the PDF Agent (optional)'}</strong><textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder={isText ? "For example: label the speakers Sarah and Mike; the left side is Sarah" : "Anything the client wants followed when transcribing these images"} /></label>
        <div className="tm-pdf-jobs-actions"><span>{isText ? 'Workers and the AI agent will see your instructions above.' : 'Workers will see: “Always use Gemini for image transcription”.'}</span><button type="submit" className="tm-admin-btn" disabled={!files.length || uploading}>{uploading ? 'Preparing jobs…' : 'Create image jobs'}</button></div>
      </form>
    </section>
    <section className="tm-admin-panel tm-pdf-jobs-list">
      <div className="tm-admin-panel-head"><div><h2 className="tm-admin-panel-title">{isText ? 'Uploaded screenshot jobs' : 'Uploaded image jobs'}</h2><p className="tm-admin-panel-note">Review status and worker submissions in the Human Work queue.</p></div><button type="button" className="tm-admin-btn" onClick={loadJobs} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button></div>
      {fileGroups.length > 0 && <div className="tm-pdf-jobs-selected" style={{ marginBottom: 12 }}><strong>Whole files</strong>{fileGroups.map((group) => {
        const waiting = group.jobs.filter((job) => job.status === 'approved').length;
        const allWaiting = waiting === group.jobs.length;
        const allDone = group.jobs.every((job) => job.has_text);
        const reviewExists = jobs.some((job) => job.is_review && (job.review_of || []).includes(group.jobs[0].id));
        return <div className="tm-pdf-jobs-file" key={group.key} style={{ flexWrap: 'wrap', gap: 8 }}><span>{group.name}</span><small>{waiting} of {group.jobs.length} pages unclaimed</small>
          {canAssignAiAgents && allWaiting && <button type="button" className="tm-admin-btn" disabled={bulkRunning || !!working} onClick={() => runWholeFile(group)}>{bulkRunning ? 'Queuing…' : `Assign whole file to ${agentLabel}`}</button>}
          {canAssignAiAgents && !allWaiting && !allDone && <small>Whole-file assignment is only available while no page has been claimed.</small>}
          {allDone && !reviewExists && <button type="button" className="tm-admin-btn" disabled={!!working || bulkRunning} onClick={() => createFileReview(group)}>{working === group.key ? 'Preparing…' : 'Create whole-file review'}</button>}
          {reviewExists && <small>Whole-file review job created below.</small>}
        </div>;
      })}</div>}
      <div className="tm-admin-table-scroll"><table className="tm-admin-table"><thead><tr><th>Image / source</th><th>Status</th><th>Worker / AI agent</th><th>Assign / deadline</th><th>Worker pay</th><th>Added</th></tr></thead><tbody>{jobs.map((job) => <tr key={job.id}><td><strong>{job.name}</strong>{job.reference_files > 0 && <div className="tm-admin-name">{job.reference_files} reference file{job.reference_files === 1 ? '' : 's'} attached</div>}<div className="tm-admin-name">{job.source_filename}{job.is_review ? ` · Whole-file review of ${job.page_count} pages` : job.page_count > 1 ? ` · Page ${job.page_number} of ${job.page_count}` : ''}</div></td><td>{statusLabel(job.status)}{job.ai_agent_status && <div className="tm-admin-name">{job.ai_agent_status === 'submitted' ? 'AI draft ready' : job.ai_agent_status === 'failed' ? 'AI run failed' : 'AI agent: ' + (job.ai_agent_name || 'Gemini 3.8')}</div>}</td><td>{job.ai_agent_name || job.worker_name || job.worker_email || 'Not assigned'}{job.ai_agent_model_ids?.length ? <div className="tm-admin-name">{job.ai_agent_model_ids.join(' + ')}</div> : null}</td><td>{job.status === 'approved' ? <div style={{ display: 'grid', gap: 6 }}>{canAssignAiAgents ? <button type="button" className="tm-admin-btn" disabled={working === job.id} onClick={() => runGemini(job)}>{working === job.id ? 'Queuing…' : `Assign ${agentLabel}`}</button> : <small>AI-agent assignments are limited to authorized admin accounts.</small>}{workers.length ? <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><select aria-label="Choose a worker" value={pick[job.id] || ''} onChange={(event) => setPick((current) => ({ ...current, [job.id]: event.target.value }))}><option value="">Or choose a worker</option>{workers.map((worker) => <option key={worker.uid} value={worker.uid}>{worker.name}{worker.available ? '' : ' (unavailable)'}</option>)}</select><button type="button" className="tm-admin-btn" disabled={!pick[job.id] || working === job.id} onClick={() => assignJob(job)}>{working === job.id ? 'Assigning…' : 'Assign worker'}</button></div> : null}</div> : job.ai_agent_status === 'failed' ? (canAssignAiAgents ? <button type="button" className="tm-admin-btn" disabled={working === job.id} onClick={() => runGemini(job)}>{working === job.id ? 'Queuing…' : 'Retry AI agent'}</button> : <small>AI-agent assignments are limited to authorized admin accounts.</small>) : job.ai_agent_status === 'submitted' || job.status.startsWith('proofreading_') ? <button type="button" className="tm-admin-btn" onClick={onOpenQueue}>Open queue to assign proofreader</button> : (job.status === 'assigned' || job.status === 'in_progress') ? <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}><small>{job.deadline_at ? `Due ${moneylessDate(job.deadline_at)}` : ''}</small><select aria-label="Extend by" value={extend[job.id] || 5} onChange={(event) => setExtend((current) => ({ ...current, [job.id]: event.target.value }))}>{[5, 10, 15, 20].map((value) => <option key={value} value={value}>+{value} min</option>)}</select><button type="button" className="tm-admin-btn" disabled={working === job.id} onClick={() => extendJob(job)}>Extend</button></div> : '—'}</td><td>{job.worker_amount_kes ? `KES ${job.worker_amount_kes}` : job.status === 'approved' || job.status === 'assigned' || job.status === 'in_progress' ? 'KES 100 on submission' : 'KES 100'}</td><td>{moneylessDate(job.created_at)}</td></tr>)}</tbody></table>{!loading && !jobs.length && <div className="tm-admin-empty">{isText ? 'No text message jobs have been uploaded yet.' : 'No PDF image jobs have been uploaded yet.'}</div>}</div>
    </section>
  </div>;
}
