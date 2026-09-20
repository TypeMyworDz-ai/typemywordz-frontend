import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import TranscriptEditor from './TranscriptEditor';
import './HumanJobWorkspace.css';

const BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';
const STATUS_LABELS = {
  pending_admin: 'Waiting for admin', approved: 'Approved', assigned: 'Assigned', in_progress: 'In progress',
  submitted: 'Submitted for review', client_review: 'Waiting for client', client_approved: 'Client approved',
  released: 'Released', cancelled: 'Cancelled'
};

const moneylessDate = (value) => {
  if (!value) return 'Not recorded';
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

const formatAttachmentSize = (bytes) => {
  const size = Number(bytes || 0);
  if (!size) return '';
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

// A worker gets 3 minutes of turnaround time per 1 minute of assigned
// audio. This only formats what the server already computed and counts it
// down locally between refreshes, so the number on screen never freezes.
const formatCountdown = (totalSeconds) => {
  const seconds = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
};

const PAYOUT_STATUS_LABELS = { accruing: 'Accruing this half', invoiced: 'Pending payout', paid: 'Paid', all: 'All' };

export default function HumanJobWorkspace({ mode = 'client', onBack, showMessage, initialJobId = '', restricted = false }) {
  const { currentUser } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [messageFile, setMessageFile] = useState(null);
  const [finalAttachment, setFinalAttachment] = useState(null);
  const [editorText, setEditorText] = useState('');
  const [feedback, setFeedback] = useState('');
  const [rating, setRating] = useState('5');
  const [selectedWorker, setSelectedWorker] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [audioUrl, setAudioUrl] = useState('');
  // Admin is the only role that can see both sides of a job, and even admin
  // sees them as two separate conversations, never merged: one with the
  // client, one with the assigned worker. A client or worker never chooses
  // this; the server decides their thread from their role regardless of
  // what this is set to.
  const [adminThread, setAdminThread] = useState('client');
  const [workerTab, setWorkerTab] = useState('in_progress');
  const [paymentHistory, setPaymentHistory] = useState(null);
  const [adminTab, setAdminTab] = useState('queue');
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [jobsFetchedAt, setJobsFetchedAt] = useState(() => Date.now());

  // The server tells us how many seconds are left as of the last refresh;
  // this just ticks the display down between refreshes so it never looks
  // frozen. loadJobs() re-syncs the true value from the server regularly.
  useEffect(() => {
    const interval = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const token = useCallback(() => currentUser?.getIdToken(), [currentUser]);
  const selectedJob = useMemo(() => jobs.find((job) => job.id === selectedId) || jobs[0] || null, [jobs, selectedId]);

  const request = useCallback(async (path, options = {}) => {
    const idToken = await token();
    let response;
    try {
      response = await fetch(`${BACKEND_URL}${path}`, {
        ...options,
        headers: { ...(options.headers || {}), Authorization: `Bearer ${idToken}` },
      });
    } catch {
      throw new Error('The conversation could not reach the server. Please try again.');
    }
    const responseText = await response.text();
    let payload = {};
    try { payload = responseText ? JSON.parse(responseText) : {}; } catch { /* use the fallback below */ }
    if (!response.ok) throw new Error(payload.detail || 'The workflow request failed.');
    return payload;
  }, [token]);

  const loadJobs = useCallback(async () => {
    try {
      const scope = mode === 'admin' ? 'admin' : mode === 'worker' ? (workerTab === 'finished' ? 'finished' : 'assigned') : 'mine';
      const payload = await request(`/human-transcription/jobs?scope=${scope}`);
      setJobs(payload.jobs || []);
      setJobsFetchedAt(Date.now());
    } catch (error) {
      showMessage?.(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [mode, request, showMessage, workerTab]);

  const loadWorkers = useCallback(async () => {
    if (mode !== 'admin') return;
    try {
      const payload = await request('/human-transcription/workers');
      setWorkers(payload.workers || []);
    } catch (error) {
      showMessage?.(error.message, 'error');
    }
  }, [mode, request, showMessage]);

  const loadPayments = useCallback(async () => {
    if (mode !== 'worker') return;
    try {
      const payload = await request('/human-transcription/worker/payment-history');
      setPaymentHistory(payload);
    } catch (error) {
      showMessage?.(error.message, 'error');
    }
  }, [mode, request, showMessage]);

  const loadMessages = useCallback(async () => {
    if (!selectedJob?.id) return;
    try {
      const query = mode === 'admin' ? `?thread=${adminThread}` : '';
      const payload = await request(`/human-transcription/jobs/${selectedJob.id}/messages${query}`);
      setMessages(payload.messages || []);
    } catch (error) {
      // A quiet refresh failure should not interrupt editing.
      console.warn('Human chat refresh failed:', error);
    }
  }, [request, selectedJob?.id, mode, adminThread]);

  useEffect(() => { loadJobs(); loadWorkers(); loadPayments(); }, [loadJobs, loadWorkers, loadPayments]);
  useEffect(() => {
    if (initialJobId && jobs.some((job) => job.id === initialJobId)) setSelectedId(initialJobId);
    else if (!selectedId && jobs[0]?.id) setSelectedId(jobs[0].id);
    if (selectedJob) {
      setEditorText(selectedJob.transcript || '');
      setSelectedWorker(selectedJob.worker_uid || '');
      setFinalAttachment(null);
    }
  }, [initialJobId, jobs, selectedId, selectedJob]);
  useEffect(() => {
    let objectUrl = '';
    (async () => {
      if (!selectedJob?.id || !selectedJob.audio) { setAudioUrl(''); return; }
      try {
        const idToken = await token();
        const response = await fetch(`${BACKEND_URL}/human-transcription/jobs/${selectedJob.id}/audio`, { headers: { Authorization: `Bearer ${idToken}` } });
        if (!response.ok) return;
        objectUrl = URL.createObjectURL(await response.blob());
        setAudioUrl(objectUrl);
      } catch (error) { console.warn('Human source audio could not be loaded:', error); }
    })();
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [selectedJob?.id, selectedJob?.audio, token]);

  // Messages come from the backend's REST endpoint, never straight from
  // Firestore. The server is the only thing that knows which of the two
  // separate conversations (client<->admin or worker<->admin) this actor is
  // allowed to see, so a direct Firestore listener here could only either
  // be blocked outright or, worse, end up reading both threads unfiltered.
  // Polling every few seconds is a deliberate trade of a little latency for
  // that guarantee.
  useEffect(() => {
    if (!selectedJob?.id) return undefined;
    loadMessages();
    const interval = window.setInterval(loadMessages, 3000);
    return () => window.clearInterval(interval);
  }, [loadMessages, selectedJob?.id]);

  // While any job on screen is running against its TAT deadline, re-sync
  // from the server every 20 seconds. This is what actually notices a job
  // that expired and was auto-returned to the admin queue, and keeps the
  // countdown accurate rather than drifting from clock skew alone.
  const hasActiveTimer = jobs.some((job) => ['assigned', 'in_progress'].includes(job.status) && typeof job.time_remaining_seconds === 'number');
  useEffect(() => {
    if (!hasActiveTimer) return undefined;
    const interval = window.setInterval(loadJobs, 20000);
    return () => window.clearInterval(interval);
  }, [hasActiveTimer, loadJobs]);

  const remainingSecondsFor = (job) => {
    if (!job || typeof job.time_remaining_seconds !== 'number') return null;
    const elapsed = Math.floor((nowTick - jobsFetchedAt) / 1000);
    return Math.max(0, job.time_remaining_seconds - elapsed);
  };

  const act = async (path, options = {}) => {
    setBusy(true);
    try {
      await request(path, options);
      await loadJobs();
      await loadMessages();
      showMessage?.('Saved.', 'success');
    } catch (error) {
      showMessage?.(error.message, 'error');
    } finally { setBusy(false); }
  };

  const deleteJob = async () => {
    if (!selectedJob || mode !== 'admin') return;
    if (!window.confirm('Delete this human-work job and its conversation? This cannot be undone.')) return;
    await act(`/human-transcription/jobs/${selectedJob.id}`, { method: 'DELETE' });
    setSelectedId('');
  };

  const sendMessage = async (event) => {
    event.preventDefault();
    if (!selectedJob || busy || (!messageText.trim() && !messageFile)) return;
    const form = new FormData();
    form.append('message', messageText.trim());
    if (mode === 'admin') form.append('thread', adminThread);
    if (messageFile) form.append('attachment', messageFile);
    setBusy(true);
    try {
      const payload = await request(`/human-transcription/jobs/${selectedJob.id}/messages`, { method: 'POST', body: form });
      if (payload.message) setMessages((previous) => previous.concat(payload.message));
      setMessageText('');
      setMessageFile(null);
      event.target.reset();
    } catch (error) {
      showMessage?.(error.message || 'The message could not be sent. Please try again.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleMessageKeyDown = (event) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    if (!busy && (messageText.trim() || messageFile)) event.currentTarget.form?.requestSubmit();
  };

  const submitWorker = () => {
    const form = new FormData();
    form.append('transcript', editorText);
    form.append('notes', feedback);
    // Some jobs only need the finished file handed back -- nothing to type
    // into the shared editor. The server accepts either real transcript
    // text or this attachment, as long as at least one is present.
    if (finalAttachment) form.append('attachment', finalAttachment);
    return act(`/human-transcription/jobs/${selectedJob.id}/submit`, { method: 'POST', body: form });
  };

  const downloadProtectedFile = async (path, filename, unavailableMessage) => {
    try {
      const idToken = await token();
      const response = await fetch(`${BACKEND_URL}${path}`, { headers: { Authorization: `Bearer ${idToken}` } });
      if (!response.ok) throw new Error(unavailableMessage);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = filename || 'human-work-file';
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      showMessage?.(error.message, 'error');
    }
  };

  const downloadAttachment = (message) => {
    if (!selectedJob?.id || !message?.id || !message.attachment) return;
    return downloadProtectedFile(
      `/human-transcription/jobs/${selectedJob.id}/messages/${message.id}/attachment`,
      message.attachment.name,
      'The chat attachment could not be downloaded.',
    );
  };

  if (loading) return <div className="tm-human-workspace-loading">Loading human work…</div>;

  return (
    <section className="tm-human-workspace">
      <div className="tm-human-workspace-head">
        <div>
          {onBack && <button className="tm-human-back" type="button" onClick={onBack}>← Back to workspace</button>}
          <p className="tm-human-eyebrow">{mode === 'admin' ? 'Operations' : mode === 'worker' ? 'Assigned work' : 'Human transcripts'}</p>
          <h1>{mode === 'admin' ? 'Human work queue' : mode === 'worker' ? 'Your assigned work' : 'Your human-transcription work'}</h1>
          <p>{mode === 'admin' ? 'Approve requests, assign the right worker, review delivery and release credits only after approval.' : mode === 'worker' ? 'Open an assignment, work in the shared editor, and send it back for review.' : 'Follow each request from quote to delivery. Credits remain untouched until the finished work is approved and released.'}</p>
        </div>
        <button className="tm-human-refresh" type="button" onClick={() => { loadJobs(); loadWorkers(); loadPayments(); }}>Refresh</button>
      </div>

      {mode === 'worker' && (
        <div className="tm-human-thread-tabs tm-worker-room-tabs" role="tablist" aria-label="Worker room sections">
          <button type="button" role="tab" aria-selected={workerTab === 'in_progress'} className={workerTab === 'in_progress' ? 'active' : ''} onClick={() => setWorkerTab('in_progress')}>In Progress</button>
          <button type="button" role="tab" aria-selected={workerTab === 'finished'} className={workerTab === 'finished' ? 'active' : ''} onClick={() => setWorkerTab('finished')}>Finished Jobs</button>
          <button type="button" role="tab" aria-selected={workerTab === 'payments'} className={workerTab === 'payments' ? 'active' : ''} onClick={() => { setWorkerTab('payments'); loadPayments(); }}>Payment History · KES</button>
        </div>
      )}

      {mode === 'admin' && !restricted && (
        <div className="tm-human-thread-tabs tm-worker-room-tabs" role="tablist" aria-label="Admin dashboard sections">
          <button type="button" role="tab" aria-selected={adminTab === 'queue'} className={adminTab === 'queue' ? 'active' : ''} onClick={() => setAdminTab('queue')}>Job Queue</button>
          <button type="button" role="tab" aria-selected={adminTab === 'payouts'} className={adminTab === 'payouts' ? 'active' : ''} onClick={() => setAdminTab('payouts')}>Worker Payments · KES</button>
        </div>
      )}

      {mode === 'worker' && workerTab === 'payments' ? (
        <div className="tm-human-chat-card tm-worker-payment-panel">
          <div className="tm-human-chat-head"><div><strong>Payment history</strong><span>Pay accrues in two halves of each month: the 1st-15th and the 16th to month end.</span></div><span className="tm-human-live-dot">KES</span></div>
          {!paymentHistory ? <div className="tm-human-empty">Loading payment history…</div> : <>
            <div className="tm-worker-payment-totals">
              <div><small>Paid</small><strong>KES {paymentHistory.totals?.paid_kes || 0}</strong></div>
              <div><small>Pending payout</small><strong>KES {(paymentHistory.pending_payouts || []).reduce((sum, item) => sum + (item.total_amount_kes || 0), 0)}</strong></div>
              <div><small>Accruing this half ({paymentHistory.current_period?.label})</small><strong>KES {paymentHistory.current_period?.accrued_kes || 0}</strong></div>
            </div>
            <h3>Pending payouts (already invoiced, awaiting admin payment)</h3>
            {!(paymentHistory.pending_payouts || []).length && <p className="tm-human-empty">No half-month invoice is waiting on admin payment right now.</p>}
            {(paymentHistory.pending_payouts || []).map((item) => <div className="tm-worker-payment-row" key={item.payout_id}><span>Period {item.period_label}</span><strong>KES {item.total_amount_kes}</strong><small>{item.total_minutes} min · pays out on {item.period_label?.endsWith('-A') ? 'the 15th' : 'month end'}</small></div>)}
            <h3>Paid</h3>{!(paymentHistory.paid || []).length && <p className="tm-human-empty">No payments have been marked paid yet.</p>}{(paymentHistory.paid || []).map((item) => <div className="tm-worker-payment-row" key={item.job_id}><span>Job {item.job_id.slice(0, 8)}</span><strong>KES {item.amount_kes}</strong><small>{item.minutes} min · {moneylessDate(item.paid_at)}</small></div>)}
          </>}
        </div>
      ) : mode === 'admin' && !restricted && adminTab === 'payouts' ? (
        <AdminPayoutsPanel request={request} showMessage={showMessage} workers={workers} />
      ) : (
      <div className="tm-human-workspace-grid">
        <aside className="tm-human-job-list">
          <div className="tm-human-list-head"><strong>{jobs.length} job{jobs.length === 1 ? '' : 's'}</strong><span>Live updates</span></div>
          {jobs.map((job) => (
            <button type="button" key={job.id} className={`tm-human-job-row ${selectedJob?.id === job.id ? 'selected' : ''}`} onClick={() => setSelectedId(job.id)}>
              <strong>{job.audio?.name || `Human job ${job.id.slice(0, 6)}`}</strong>
              <span>{STATUS_LABELS[job.status] || job.status}{typeof job.time_remaining_seconds === 'number' && ['assigned', 'in_progress'].includes(job.status) ? ` · ${formatCountdown(remainingSecondsFor(job))} left` : ''}</span>
              <small>{mode === 'worker' ? moneylessDate(job.createdAt) : `${job.quote_credits || 0} credits · ${moneylessDate(job.createdAt)}`}</small>
            </button>
          ))}
          {!jobs.length && <div className="tm-human-empty">No human work is waiting here.</div>}
        </aside>

        <div className="tm-human-job-detail">
          {!selectedJob ? <div className="tm-human-empty">Choose a job to see its details.</div> : <>
            <div className="tm-human-detail-head">
              <div><span className="tm-human-status">{STATUS_LABELS[selectedJob.status] || selectedJob.status}</span><h2>{selectedJob.audio?.name || (selectedJob.source_type === 'ai_proofreading' ? 'AI transcript for proofreading' : 'Human-transcription request')}</h2><p>{selectedJob.source_type === 'ai_proofreading' ? 'AI transcript proofreading' : 'New human transcript'} · {selectedJob.minutes || 0} minutes{mode !== 'worker' ? ` · ${selectedJob.quote_credits || 0} credits` : ''} · {selectedJob.turnaround || 'standard'} delivery</p></div>
              <div className="tm-human-detail-actions">
                {mode === 'admin' && selectedJob.status === 'pending_admin' && <button type="button" onClick={() => act(`/human-transcription/jobs/${selectedJob.id}/approve`, { method: 'POST' })}>Approve request</button>}
                {mode === 'worker' && ['assigned', 'in_progress'].includes(selectedJob.status) && <button type="button" onClick={() => act(`/human-transcription/jobs/${selectedJob.id}/start`, { method: 'POST' })}>Start work</button>}
                {mode === 'worker' && ['assigned', 'in_progress'].includes(selectedJob.status) && <button type="button" onClick={submitWorker} disabled={busy || (!editorText.trim() && !finalAttachment && !selectedJob.final_attachment)}>Submit for review</button>}
                {mode === 'client' && selectedJob.status === 'client_review' && <button type="button" onClick={() => act(`/human-transcription/jobs/${selectedJob.id}/client-approve`, { method: 'POST' })}>Approve completed work</button>}
                {mode === 'admin' && selectedJob.status === 'client_review' && <button type="button" title="Some clients are fully hands-off and trust an admin's review instead of logging in to approve it themselves." onClick={() => act(`/human-transcription/jobs/${selectedJob.id}/client-approve`, { method: 'POST' })}>Approve on client's behalf</button>}
                {mode === 'admin' && selectedJob.status === 'client_approved' && <button type="button" onClick={() => act(`/human-transcription/jobs/${selectedJob.id}/release`, { method: 'POST' })}>Release completed work</button>}
                {mode === 'admin' && !restricted && <button type="button" onClick={deleteJob}>Delete job</button>}
                {mode === 'client' && selectedJob.status === 'released' && selectedJob.transcript && <button type="button" onClick={async () => { const idToken = await token(); const response = await fetch(`${BACKEND_URL}/human-transcription/jobs/${selectedJob.id}/download`, { headers: { Authorization: `Bearer ${idToken}` } }); if (!response.ok) { showMessage?.('The completed transcript is not ready to download.', 'error'); return; } const url = URL.createObjectURL(await response.blob()); const link = document.createElement('a'); link.href = url; link.download = `human-${selectedJob.id}.txt`; link.click(); URL.revokeObjectURL(url); }}>Download transcript</button>}
              </div>
            </div>

            {mode === 'worker' && ['assigned', 'in_progress'].includes(selectedJob.status) && (
              <div className="tm-human-final-attach">
                <label className="tm-human-attach" title="Attach the finished file instead of typing it" aria-label="Attach the finished file">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 3.5h8l3 3V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z"/><path d="M15 3.5V7h3M9 11h6M9 15h6"/></svg>
                  <span>{finalAttachment ? 'Change finished file' : 'Attach finished file'}</span>
                  <input type="file" onChange={(event) => setFinalAttachment(event.target.files?.[0] || null)} />
                </label>
                {finalAttachment && <span className="tm-human-attachment-preview"><strong>{finalAttachment.name}</strong>{formatAttachmentSize(finalAttachment.size) ? ` · ${formatAttachmentSize(finalAttachment.size)}` : ''}<button type="button" onClick={() => setFinalAttachment(null)} aria-label="Remove attachment">Remove</button></span>}
                <p className="tm-human-editor-note">Nothing to type for this job? Attach the finished file and submit -- the editor can stay empty.</p>
              </div>
            )}

            {['assigned', 'in_progress'].includes(selectedJob.status) && typeof selectedJob.time_remaining_seconds === 'number' && (() => {
              const remaining = remainingSecondsFor(selectedJob);
              const urgent = remaining <= 300;
              return (
                <div className={`tm-tat-timer${urgent ? ' tm-tat-timer-urgent' : ''}`}>
                  <div>
                    <strong>{remaining <= 0 ? 'Time is up' : formatCountdown(remaining)}</strong>
                    <span>{mode === 'worker' ? 'left to submit this job' : `left for ${selectedJob.worker_name || 'the assigned worker'} to submit`}</span>
                  </div>
                  {mode === 'worker' && <p className="tm-tat-hint">Tip: a quicker typing pace means faster turnarounds and more jobs you can take on.</p>}
                  {mode === 'admin' && <p className="tm-tat-hint">If the deadline passes before submission, this job automatically returns here, unassigned, for reassignment.</p>}
                </div>
              );
            })()}

            {selectedJob.last_auto_reassigned_worker_name && selectedJob.status === 'approved' && (
              <p className="tm-tat-reassigned-note">This job was automatically returned from {selectedJob.last_auto_reassigned_worker_name} after the turnaround deadline passed. Assign it to a worker again below.</p>
            )}

            {mode === 'admin' && selectedJob.status === 'approved' && <div className="tm-human-assign"><label>Assign to an approved worker<select value={selectedWorker} onChange={(event) => setSelectedWorker(event.target.value)}><option value="">Choose worker</option>{workers.map((worker) => <option key={worker.uid} value={worker.uid}>{worker.name} · {worker.email}</option>)}</select></label><button type="button" disabled={!selectedWorker || busy} onClick={() => { const worker = workers.find((item) => item.uid === selectedWorker); return act(`/human-transcription/jobs/${selectedJob.id}/assign`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ worker_uid: worker.uid, worker_email: worker.email, worker_name: worker.name }) }); }}>Assign work</button></div>}

            {mode === 'admin' && selectedJob.status === 'submitted' && <div className="tm-human-review"><label>Worker rating<select value={rating} onChange={(event) => setRating(event.target.value)}><option value="5">5 — excellent</option><option value="4">4 — strong</option><option value="3">3 — acceptable</option><option value="2">2 — needs work</option><option value="1">1 — poor</option></select></label><textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="Notes for the client and worker" /><button type="button" onClick={() => act(`/human-transcription/jobs/${selectedJob.id}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating, feedback }) })}>Send to client</button></div>}

            {audioUrl && <div className="tm-human-audio-card"><strong>Source recording</strong><span>Available to the client, admin and assigned worker.</span><audio controls src={audioUrl} /></div>}
            {selectedJob.instruction_attachments?.length > 0 && <div className="tm-human-reference-card"><strong>Reference files from the client</strong><span>Use these notes, spellings, and supporting documents while working.</span><div className="tm-human-reference-list">{selectedJob.instruction_attachments.map((item, index) => <button type="button" key={`${item.name}-${index}`} onClick={() => downloadProtectedFile(`/human-transcription/jobs/${selectedJob.id}/instruction/${index}`, item.name, 'The reference file could not be downloaded.')}>Download: {item.name}</button>)}</div></div>}
            {selectedJob.final_attachment && <div className="tm-human-reference-card"><strong>Finished file from the worker</strong><span>Submitted instead of, or alongside, the shared editor text.</span><div className="tm-human-reference-list"><button type="button" onClick={() => downloadProtectedFile(`/human-transcription/jobs/${selectedJob.id}/final-attachment`, selectedJob.final_attachment.name, 'The finished file could not be downloaded.')}>Download: {selectedJob.final_attachment.name}</button></div></div>}

            <div className="tm-human-editor-card">
              <div className="tm-human-editor-head"><div><strong>Shared proofreading editor</strong><span>The same working area is used by the worker, admin and client.</span></div><div className="tm-human-editor-ad">Need a first draft or a quick answer? <button type="button" onClick={() => showMessage?.('Ask TypeMyworDz opens from the left navigation.', 'success')}>Use Ask TypeMyworDz</button></div></div>
              <TranscriptEditor
                key={selectedJob.id}
                fileName={selectedJob.audio?.name || `Human job ${selectedJob.id.slice(0, 6)}`}
                rawText={selectedJob.transcript || editorText}
                durationSeconds={Number(selectedJob.minutes || 0) * 60}
                audioUrl={audioUrl || null}
                readOnly={mode === 'client' && !['client_review', 'released'].includes(selectedJob.status)}
                onChange={setEditorText}
              />
              <p className="tm-human-editor-note">AI tools can help with first drafts and questions, but the final human release stays under admin review.</p>
            </div>

            <div className="tm-human-chat-card">
              <div className="tm-human-chat-head">
                <div><strong>Conversation</strong><span>{mode === 'admin' ? 'Two separate threads: the worker never sees the client, and the client never sees the worker.' : mode === 'worker' ? 'You and TypeMyworDz admin only. The client is never part of this thread.' : 'You and TypeMyworDz admin only. The worker is never part of this thread.'}</span></div>
                <span className="tm-human-live-dot">Live</span>
              </div>
              {mode === 'admin' && (
                <div className="tm-human-thread-tabs" role="tablist" aria-label="Choose which conversation to view">
                  <button type="button" role="tab" aria-selected={adminThread === 'client'} className={adminThread === 'client' ? 'active' : ''} onClick={() => setAdminThread('client')}>Message client</button>
                  <button type="button" role="tab" aria-selected={adminThread === 'worker'} className={adminThread === 'worker' ? 'active' : ''} disabled={!selectedJob.worker_uid} title={selectedJob.worker_uid ? '' : 'Assign a worker first'} onClick={() => setAdminThread('worker')}>Message worker</button>
                </div>
              )}
              <div className="tm-human-messages">{messages.map((item) => {
                const isMine = item.sender_uid === currentUser?.uid;
                const label = item.sender_role === 'admin' ? 'TypeMyworDz admin' : isMine ? 'You' : item.sender_role === 'worker' ? 'Worker' : 'Client';
                return <article key={item.id} className="tm-human-message"><div><strong>{label}</strong><time>{moneylessDate(item.createdAt)}</time></div>{item.message && <p>{item.message}</p>}{item.attachment && <button type="button" className="tm-human-attachment-link" onClick={() => downloadAttachment(item)}>Download: {item.attachment.name}</button>}</article>;
              })}{!messages.length && <div className="tm-human-empty">No messages yet. Keep the job conversation here so nobody has to move to another app.</div>}</div>
              <form className="tm-human-message-form" onSubmit={sendMessage}>
                <textarea value={messageText} onChange={(event) => setMessageText(event.target.value)} onKeyDown={handleMessageKeyDown} placeholder="Write to the people on this job" rows={2} aria-label="Job conversation message" />
                {messageFile && <div className="tm-human-attachment-preview" role="status" aria-live="polite"><span><strong>Attached:</strong> {messageFile.name}{formatAttachmentSize(messageFile.size) ? ` · ${formatAttachmentSize(messageFile.size)}` : ''}</span><button type="button" onClick={() => setMessageFile(null)} aria-label={`Remove ${messageFile.name}`}>Remove</button></div>}
                <div className="tm-human-message-actions"><label className="tm-human-attach" title="Attach any file" aria-label="Attach any file"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 3.5h8l3 3V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z"/><path d="M15 3.5V7h3M9 11h6M9 15h6"/></svg><input type="file" onChange={(event) => setMessageFile(event.target.files?.[0] || null)} /></label><span className="tm-human-message-hint">Enter to send · Shift+Enter for a new line</span><button type="submit" disabled={busy || (!messageText.trim() && !messageFile)}>Send</button></div>
              </form>
            </div>
          </>}
        </div>
      </div>
      )}
    </section>
  );
}

// Admin-only searchable payment dashboard: find a worker's earnings by day,
// week, or any custom range, and separately manage the bi-monthly payout
// invoices (mark a half-month invoice as paid once it has actually gone out).
function AdminPayoutsPanel({ request, showMessage, workers }) {
  const [filters, setFilters] = useState({ worker_uid: '', start_date: '', end_date: '', status: 'all' });
  const [searchResult, setSearchResult] = useState(null);
  const [searching, setSearching] = useState(false);
  const [invoices, setInvoices] = useState(null);
  const [invoiceStatus, setInvoiceStatus] = useState('pending');
  const [invoiceWorker, setInvoiceWorker] = useState('');
  const [busyPayoutId, setBusyPayoutId] = useState('');

  const loadInvoices = useCallback(async (status = invoiceStatus, workerUid = invoiceWorker) => {
    try {
      const params = new URLSearchParams({ status: status || 'all' });
      if (workerUid) params.set('worker_uid', workerUid);
      const payload = await request(`/api/admin/worker-payouts?${params.toString()}`);
      setInvoices(payload);
    } catch (error) {
      showMessage?.(error.message, 'error');
    }
  }, [request, showMessage, invoiceStatus, invoiceWorker]);

  useEffect(() => { loadInvoices('pending', ''); }, [loadInvoices]);

  const runSearch = async () => {
    setSearching(true);
    try {
      const params = new URLSearchParams({ status: filters.status || 'all' });
      if (filters.worker_uid) params.set('worker_uid', filters.worker_uid);
      if (filters.start_date) params.set('start_date', filters.start_date);
      if (filters.end_date) params.set('end_date', filters.end_date);
      const payload = await request(`/api/admin/worker-payments/search?${params.toString()}`);
      setSearchResult(payload);
    } catch (error) {
      showMessage?.(error.message, 'error');
    } finally {
      setSearching(false);
    }
  };

  const quickRange = (kind) => {
    const today = new Date();
    const iso = (d) => d.toISOString().slice(0, 10);
    if (kind === 'today') {
      setFilters((f) => ({ ...f, start_date: iso(today), end_date: iso(today) }));
    } else if (kind === 'week') {
      const start = new Date(today); start.setDate(start.getDate() - 6);
      setFilters((f) => ({ ...f, start_date: iso(start), end_date: iso(today) }));
    } else if (kind === 'month') {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      setFilters((f) => ({ ...f, start_date: iso(start), end_date: iso(today) }));
    }
  };

  const markPaid = async (payoutId) => {
    if (!window.confirm('Mark this half-month payout as paid? Only do this once the money has actually gone out to the worker.')) return;
    setBusyPayoutId(payoutId);
    try {
      await request(`/api/admin/worker-payouts/${payoutId}/mark-paid`, { method: 'POST' });
      showMessage?.('Payout marked as paid.', 'success');
      await loadInvoices();
    } catch (error) {
      showMessage?.(error.message, 'error');
    } finally {
      setBusyPayoutId('');
    }
  };

  return (
    <div className="tm-admin-payouts">
      <div className="tm-human-chat-card tm-admin-payout-search">
        <div className="tm-human-chat-head"><div><strong>Search worker earnings</strong><span>Pull any worker's totals by day, week, or a custom date range.</span></div></div>
        <div className="tm-admin-payout-filters">
          <label>Worker
            <select value={filters.worker_uid} onChange={(e) => setFilters((f) => ({ ...f, worker_uid: e.target.value }))}>
              <option value="">All workers</option>
              {workers.map((w) => <option key={w.uid} value={w.uid}>{w.name} · {w.email}</option>)}
            </select>
          </label>
          <label>From<input type="date" value={filters.start_date} onChange={(e) => setFilters((f) => ({ ...f, start_date: e.target.value }))} /></label>
          <label>To<input type="date" value={filters.end_date} onChange={(e) => setFilters((f) => ({ ...f, end_date: e.target.value }))} /></label>
          <label>Status
            <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
              <option value="all">All</option>
              <option value="accruing">Accruing this half</option>
              <option value="invoiced">Pending payout</option>
              <option value="paid">Paid</option>
            </select>
          </label>
          <div className="tm-admin-payout-quickranges">
            <button type="button" onClick={() => quickRange('today')}>Today</button>
            <button type="button" onClick={() => quickRange('week')}>Last 7 days</button>
            <button type="button" onClick={() => quickRange('month')}>This month</button>
          </div>
          <button type="button" className="tm-admin-payout-search-btn" onClick={runSearch} disabled={searching}>{searching ? 'Searching…' : 'Search'}</button>
        </div>
        {searchResult && (
          <div className="tm-admin-payout-results">
            <div className="tm-worker-payment-totals">
              <div><small>Jobs found</small><strong>{searchResult.job_count || 0}</strong></div>
              <div><small>Total minutes</small><strong>{searchResult.total_minutes || 0}</strong></div>
              <div><small>Total earned</small><strong>KES {searchResult.total_amount_kes || 0}</strong></div>
            </div>
            {!(searchResult.jobs || []).length ? <p className="tm-human-empty">No completed jobs match that search.</p> : (
              <table className="tm-admin-payout-table">
                <thead><tr><th>Worker</th><th>Job</th><th>Minutes</th><th>Amount</th><th>Status</th><th>Completed</th></tr></thead>
                <tbody>
                  {searchResult.jobs.map((row) => (
                    <tr key={row.job_id}>
                      <td>{row.worker_name || row.worker_email}</td>
                      <td>{row.job_id.slice(0, 8)}</td>
                      <td>{row.minutes}</td>
                      <td>KES {row.amount_kes}</td>
                      <td>{PAYOUT_STATUS_LABELS[row.payout_status] || row.payout_status}</td>
                      <td>{moneylessDate(row.completed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      <div className="tm-human-chat-card tm-admin-payout-invoices">
        <div className="tm-human-chat-head">
          <div><strong>Bi-monthly payout invoices</strong><span>One invoice per worker per half-month (1st-15th, 16th-end of month). The next half keeps accruing even if this one is still unpaid.</span></div>
          <div className="tm-admin-payout-invoice-filter">
            <select value={invoiceWorker} onChange={(e) => { setInvoiceWorker(e.target.value); loadInvoices(invoiceStatus, e.target.value); }}>
              <option value="">All workers</option>
              {workers.map((w) => <option key={w.uid} value={w.uid}>{w.name}</option>)}
            </select>
            <select value={invoiceStatus} onChange={(e) => { setInvoiceStatus(e.target.value); loadInvoices(e.target.value, invoiceWorker); }}>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="all">All</option>
            </select>
          </div>
        </div>
        {invoices && (
          <div className="tm-worker-payment-totals">
            <div><small>Total pending</small><strong>KES {invoices.totals?.pending_kes || 0}</strong></div>
            <div><small>Total paid</small><strong>KES {invoices.totals?.paid_kes || 0}</strong></div>
          </div>
        )}
        {!invoices ? <div className="tm-human-empty">Loading payout invoices…</div> : !(invoices.payouts || []).length ? <p className="tm-human-empty">No payout invoices in this view yet.</p> : (
          <table className="tm-admin-payout-table">
            <thead><tr><th>Worker</th><th>Period</th><th>Minutes</th><th>Amount</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {invoices.payouts.map((payout) => (
                <tr key={payout.payout_id}>
                  <td>{payout.worker_name || payout.worker_email}</td>
                  <td>{payout.period_label} <small>({payout.period_label?.endsWith('-A') ? 'pays on the 15th' : 'pays at month end'})</small></td>
                  <td>{payout.total_minutes}</td>
                  <td>KES {payout.total_amount_kes}</td>
                  <td>{payout.status === 'paid' ? `Paid ${moneylessDate(payout.paid_at)}` : 'Pending'}</td>
                  <td>{payout.status !== 'paid' && <button type="button" onClick={() => markPaid(payout.payout_id)} disabled={busyPayoutId === payout.payout_id}>Mark as paid</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
