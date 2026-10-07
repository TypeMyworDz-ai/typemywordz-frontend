import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';
const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const DONE_STATUSES = ['submitted', 'released', 'client_review', 'client_approved', 'completed'];

const orderImageJobs = (jobs) => [...jobs].sort((a, b) => {
  const order = (job) => Number(job.pdf_upload_page_number || job.pdf_image?.page_number || 0);
  return order(a) - order(b) || String(a.id).localeCompare(String(b.id));
});

function useAdminCalls(showMessage) {
  const { currentUser } = useAuth();
  const [working, setWorking] = useState('');
  const post = useCallback(async (path, body, success) => {
    const token = await currentUser.getIdToken();
    const response = await fetch(`${BACKEND_URL}${path}`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || 'That action could not be completed.');
    if (success) showMessage?.(success, 'success');
    return payload;
  }, [currentUser, showMessage]);
  const run = async (key, task) => {
    if (working) return;
    setWorking(key);
    try { await task(); } catch (error) { showMessage?.(error.message, 'error'); } finally { setWorking(''); }
  };
  return { currentUser, working, post, run };
}

/** Whole-upload proofreading for image jobs. Everything else for image jobs lives in the queue detail already. */
export function ImageJobQueueActions({ job, jobs, showMessage, onChanged }) {
  const { working, post, run } = useAdminCalls(showMessage);
  if (!job || job.job_type !== 'pdf_job') return null;
  if (job.pdf_review) {
    return <div className="tm-human-assign tm-queue-extra" role="note"><strong>Whole-upload proofreading</strong><p>This job holds every image of the upload in order, with each draft. Use the AI agent above to proofread it into one final document, or assign it to a worker. Submitted work is approved with Finish Job.</p></div>;
  }
  const batchId = job.pdf_upload_batch_id || '';
  const siblings = orderImageJobs((jobs || []).filter((item) => item.job_type === 'pdf_job' && !item.pdf_review && (batchId ? item.pdf_upload_batch_id === batchId : item.pdf_batch_id && item.pdf_batch_id === job.pdf_batch_id)));
  if (siblings.length < 2) return null;
  const ids = siblings.map((item) => item.id);
  const review = (jobs || []).find((item) => {
    const of = item.pdf_review?.source_job_ids || [];
    return item.pdf_review && of.length === ids.length && ids.every((id) => of.includes(id));
  });
  const done = siblings.filter((item) => DONE_STATUSES.includes(item.status)).length;
  const ready = done === siblings.length;
  const imageTotal = siblings.reduce((sum, item) => sum + Math.max(1, item.pdf_images?.length || 1), 0);
  const create = () => run('review', async () => {
    const body = { job_ids: ids };
    if (batchId) body.upload_batch_id = batchId;
    await post('/human-transcription/admin/pdf-jobs/file-review', body, 'Whole-upload proofreading job created. Find it in Needs action and give it to the AI agent or a worker.');
    await onChanged?.();
  });
  return <div className="tm-human-assign tm-queue-extra" role="group" aria-label="Whole-upload proofreading">
    <strong>Whole upload: {siblings.length} jobs, {imageTotal} images</strong>
    <p>{review ? 'The whole-upload proofreading job already exists. Open it from Needs action or In progress.' : ready ? 'Every part is submitted. Create one proofreading job that combines all images and drafts in upload order, then the AI agent or a worker produces one final document.' : `${done} of ${siblings.length} parts are submitted. Whole-upload proofreading unlocks when all parts are in.`}</p>
    {!review && <button type="button" disabled={!ready || !!working || siblings.length > 60} onClick={create}>{working === 'review' ? 'Preparing proofread…' : 'Create whole-upload proofread job'}</button>}
    {siblings.length > 60 && <small>Whole-upload proofreading supports up to 60 jobs at a time.</small>}
  </div>;
}

/** Letter Job actions that used to live in the Letter Jobs tab. */
export function LetterJobQueueActions({ job, showMessage, onChanged, workers = [], scheduledNow = null }) {
  const { currentUser, working, post, run } = useAdminCalls(showMessage);
  const [reviewer, setReviewer] = useState('');
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [options, setOptions] = useState({ workers, scheduledNow });
  const loadOptions = useCallback(async () => {
    if (!currentUser) return;
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(`${BACKEND_URL}/human-transcription/admin/worker-options`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) setOptions({ workers: payload.workers || [], scheduledNow: payload.scheduled_now === true });
    } catch { /* the list stays as it was */ }
  }, [currentUser]);
  useEffect(() => { loadOptions(); }, [loadOptions, job?.id]);
  if (!job || job.job_type !== 'letter_job') return null;

  const eligible = options.workers.filter((worker) => options.scheduledNow === true || (worker.call_in_active === true && worker.clocked_in === true && worker.online === true));
  const qualified = eligible.filter((worker) => worker.can_proofread);
  const humanActive = ['assigned', 'in_progress'].includes(job.proofreader_status);
  const humanDone = job.reviewer_choice === 'human' && job.proofreader_status === 'submitted';
  const aiDone = job.reviewer_choice === 'ai' && job.letter_ai_review_status === 'completed';
  const reviewRunning = humanActive || ['queued', 'processing'].includes(job.letter_ai_review_status);
  const download = (path, filename, fallback) => run('download', async () => {
    const token = await currentUser.getIdToken();
    const response = await fetch(`${BACKEND_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(payload.detail || fallback); }
    const url = URL.createObjectURL(new Blob([await response.blob()], { type: DOCX_TYPE }));
    const link = document.createElement('a');
    link.href = url; link.download = filename; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const assignAgent = () => run('agent', async () => { await post(`/human-transcription/jobs/${job.id}/letter-agent/assign`, undefined, 'The complete Letter Job was assigned to the Letter Agent.'); await onChanged?.(); });
  const aiReview = () => run('ai', async () => { await post(`/human-transcription/jobs/${job.id}/letter-ai-review`, undefined, 'The Letter AI proofreader has been queued. Final admin approval is still required.'); await onChanged?.(); });
  const humanReview = () => run('human', async () => {
    const worker = qualified.find((item) => item.uid === reviewer);
    if (!worker) throw new Error('Choose a qualified proofreader first.');
    await post(`/human-transcription/jobs/${job.id}/assign-proofreader`, { worker_uid: worker.uid, worker_email: worker.email, worker_name: worker.name }, 'The Letter Job was assigned to a human proofreader. Final admin approval is still required.');
    setReviewer(''); await onChanged?.();
  });
  const release = () => run('release', async () => {
    const feedback = job.reviewer_choice === 'human' ? 'Human-proofread Letter Job checked by admin.' : 'AI-proofread Letter Job checked by admin.';
    await post(`/human-transcription/jobs/${job.id}/review`, { feedback }, 'Letter Job approved and marked released.');
    setConfirmRelease(false); await onChanged?.();
  });

  return <div className="tm-human-assign tm-queue-extra tm-letter-queue-actions" role="group" aria-label="Letter Job actions">
    <strong>Letter Job</strong>
    {job.letter_agent_error && <p className="tm-letter-job-error" role="alert">{job.letter_agent_error}</p>}
    {job.letter_ai_review_error && <p className="tm-letter-job-error" role="alert">{job.letter_ai_review_error}</p>}
    {job.status === 'approved' && <>
      <p>Give the whole letter to one worker (use the assignment box below) or to the Letter Agent. Letters are never split.</p>
      <button type="button" disabled={!!working || ['queued', 'processing'].includes(job.letter_agent_status)} onClick={assignAgent}>{working === 'agent' ? 'Queuing…' : ['queued', 'processing'].includes(job.letter_agent_status) ? 'Letter Agent is drafting…' : job.letter_agent_status === 'failed' ? 'Retry Letter Agent' : 'Assign Letter Agent'}</button>
    </>}
    {job.status === 'submitted' && job.final_attachment?.name && <button type="button" disabled={working === 'download'} onClick={() => download(`/human-transcription/jobs/${job.id}/final-attachment`, job.final_attachment.name, 'The submitted Word document is not available.')}>{working === 'download' ? 'Preparing…' : 'Download submitted Word document'}</button>}
    {job.status === 'submitted' && aiDone && job.letter_ai_review_attachment?.name && <button type="button" disabled={working === 'download'} onClick={() => download(`/human-transcription/admin/jobs/${job.id}/letter-ai-review-docx`, job.letter_ai_review_attachment.name, 'The AI-proofread Word document is not available.')}>Download AI-proofread Word document</button>}
    {['proofreading_assigned', 'proofreading_in_progress'].includes(job.status) && <p role="status">The human proofreader is working on this letter.</p>}
    {job.status === 'submitted' && reviewRunning && <p role="status">{humanActive ? 'The human proofreader is working on this letter.' : 'The AI proofreader is checking the letter.'}</p>}
    {job.status === 'submitted' && !reviewRunning && !humanDone && !aiDone && <button type="button" disabled={!!working} onClick={aiReview}>{working === 'ai' ? 'Queuing…' : job.letter_ai_review_status === 'failed' ? 'Retry AI proofreading' : 'Run AI proofreading'}</button>}
    {job.status === 'submitted' && !reviewRunning && !humanDone && <div className="tm-letter-review-choice">
      <label>Human proofreader (rated at least 4.5/5)
        <select value={reviewer} onChange={(event) => setReviewer(event.target.value)}><option value="">{qualified.length ? 'Choose a qualified proofreader' : 'No qualified proofreader available'}</option>{qualified.map((worker) => <option key={worker.uid} value={worker.uid}>{worker.name || worker.email}{worker.rating != null ? ` · ${Number(worker.rating).toFixed(2)}/5` : ''}</option>)}</select>
      </label>
      <button type="button" disabled={!reviewer || !!working} onClick={humanReview}>{working === 'human' ? 'Assigning…' : 'Assign human proofreader'}</button>
    </div>}
    {job.status === 'submitted' && (humanDone || aiDone) && (confirmRelease
      ? <div role="group" aria-label="Confirm letter release"><p>{job.reviewer_choice === 'human' ? 'Confirm you checked the human proofreader’s submission.' : 'Confirm you checked the AI-proofread Word document.'}</p><button type="button" disabled={!!working} onClick={release}>{working === 'release' ? 'Releasing…' : 'Confirm release'}</button> <button type="button" onClick={() => setConfirmRelease(false)}>Cancel</button></div>
      : <button type="button" onClick={() => setConfirmRelease(true)}>Approve &amp; release</button>)}
    {job.status === 'released' && <p role="status">Letter approved and released.</p>}
  </div>;
}
