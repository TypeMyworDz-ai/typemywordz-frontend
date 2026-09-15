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

export default function HumanJobWorkspace({ mode = 'client', onBack, showMessage, initialJobId = '' }) {
  const { currentUser } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [messageFile, setMessageFile] = useState(null);
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

  const submitWorker = () => act(`/human-transcription/jobs/${selectedJob.id}/submit`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript: editorText, notes: feedback }),
  });

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

      {mode === 'worker' && workerTab === 'payments' ? (
        <div className="tm-human-chat-card tm-worker-payment-panel">
          <div className="tm-human-chat-head"><div><strong>Payment history</strong><span>Completed work accrues toward the weekly payout.</span></div><span className="tm-human-live-dot">KES</span></div>
          {!paymentHistory ? <div className="tm-human-empty">Loading payment history…</div> : <>
            <div className="tm-worker-payment-totals"><div><small>Paid</small><strong>KES {paymentHistory.totals?.paid_kes || 0}</strong></div><div><small>Upcoming</small><strong>KES {paymentHistory.totals?.upcoming_kes || 0}</strong></div></div>
            <h3>Paid</h3>{!(paymentHistory.paid || []).length && <p className="tm-human-empty">No payments have been marked paid yet.</p>}{(paymentHistory.paid || []).map((item) => <div className="tm-worker-payment-row" key={item.job_id}><span>Job {item.job_id.slice(0, 8)}</span><strong>KES {item.amount_kes}</strong><small>{item.minutes} min · {moneylessDate(item.paid_at)}</small></div>)}
            <h3>Upcoming weekly accrual</h3>{!(paymentHistory.upcoming || []).length && <p className="tm-human-empty">No upcoming accruals.</p>}{(paymentHistory.upcoming || []).map((item) => <div className="tm-worker-payment-row" key={item.job_id}><span>Job {item.job_id.slice(0, 8)}</span><strong>KES {item.amount_kes}</strong><small>{item.minutes} min · {STATUS_LABELS[item.job_status] || item.job_status}</small></div>)}
          </>}
        </div>
      ) : (
      <div className="tm-human-workspace-grid">
        <aside className="tm-human-job-list">
          <div className="tm-human-list-head"><strong>{jobs.length} job{jobs.length === 1 ? '' : 's'}</strong><span>Live updates</span></div>
          {jobs.map((job) => (
            <button type="button" key={job.id} className={`tm-human-job-row ${selectedJob?.id === job.id ? 'selected' : ''}`} onClick={() => setSelectedId(job.id)}>
              <strong>{job.audio?.name || `Human job ${job.id.slice(0, 6)}`}</strong>
              <span>{STATUS_LABELS[job.status] || job.status}</span>
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
                {mode === 'worker' && ['assigned', 'in_progress'].includes(selectedJob.status) && <button type="button" onClick={submitWorker} disabled={busy}>Submit for review</button>}
                {mode === 'client' && selectedJob.status === 'client_review' && <button type="button" onClick={() => act(`/human-transcription/jobs/${selectedJob.id}/client-approve`, { method: 'POST' })}>Approve completed work</button>}
                {mode === 'admin' && selectedJob.status === 'client_approved' && <button type="button" onClick={() => act(`/human-transcription/jobs/${selectedJob.id}/release`, { method: 'POST' })}>Release and deduct credits</button>}
                {mode === 'admin' && <button type="button" onClick={deleteJob}>Delete job</button>}
                {mode === 'client' && selectedJob.status === 'released' && <button type="button" onClick={async () => { const idToken = await token(); const response = await fetch(`${BACKEND_URL}/human-transcription/jobs/${selectedJob.id}/download`, { headers: { Authorization: `Bearer ${idToken}` } }); if (!response.ok) { showMessage?.('The completed transcript is not ready to download.', 'error'); return; } const url = URL.createObjectURL(await response.blob()); const link = document.createElement('a'); link.href = url; link.download = `human-${selectedJob.id}.txt`; link.click(); URL.revokeObjectURL(url); }}>Download transcript</button>}
              </div>
            </div>

            {mode === 'admin' && selectedJob.status === 'approved' && <div className="tm-human-assign"><label>Assign to an approved worker<select value={selectedWorker} onChange={(event) => setSelectedWorker(event.target.value)}><option value="">Choose worker</option>{workers.map((worker) => <option key={worker.uid} value={worker.uid}>{worker.name} · {worker.email}</option>)}</select></label><button type="button" disabled={!selectedWorker || busy} onClick={() => { const worker = workers.find((item) => item.uid === selectedWorker); return act(`/human-transcription/jobs/${selectedJob.id}/assign`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ worker_uid: worker.uid, worker_email: worker.email, worker_name: worker.name }) }); }}>Assign work</button></div>}

            {mode === 'admin' && selectedJob.status === 'submitted' && <div className="tm-human-review"><label>Worker rating<select value={rating} onChange={(event) => setRating(event.target.value)}><option value="5">5 — excellent</option><option value="4">4 — strong</option><option value="3">3 — acceptable</option><option value="2">2 — needs work</option><option value="1">1 — poor</option></select></label><textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="Notes for the client and worker" /><button type="button" onClick={() => act(`/human-transcription/jobs/${selectedJob.id}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating, feedback }) })}>Send to client</button></div>}

            {audioUrl && <div className="tm-human-audio-card"><strong>Source recording</strong><span>Available to the client, admin and assigned worker.</span><audio controls src={audioUrl} /></div>}
            {selectedJob.instruction_attachments?.length > 0 && <div className="tm-human-reference-card"><strong>Reference files from the client</strong><span>Use these notes, spellings, and supporting documents while working.</span><div className="tm-human-reference-list">{selectedJob.instruction_attachments.map((item, index) => <button type="button" key={`${item.name}-${index}`} onClick={() => downloadProtectedFile(`/human-transcription/jobs/${selectedJob.id}/instruction/${index}`, item.name, 'The reference file could not be downloaded.')}>Download: {item.name}</button>)}</div></div>}

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
