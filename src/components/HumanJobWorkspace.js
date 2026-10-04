import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import FinalTranscriptView from './FinalTranscriptView';
import PdfJobsAdminPanel from './PdfJobsAdminPanel';
import WordLikeEditor from './WordLikeEditor';
import ConfirmDialog from './ConfirmDialog';
import WorkerAudioPlayer from './WorkerAudioPlayer';
import { AdminPartReview, AdminAiReviewPanel } from './AdminPartReview';
import { copyForWord } from '../utils/transcriptExport';
import './HumanJobWorkspace.css';

const BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';
const STATUS_LABELS = {
  pending_admin: 'Waiting for admin', approved: 'Approved', assigned: 'Assigned', in_progress: 'In progress',
  submitted: 'Submitted for review', client_review: 'Waiting for client', client_approved: 'Client approved',
  released: 'Released', cancelled: 'Cancelled', split_assigned: 'Available to claim', split_in_progress: 'Parts in progress', available: 'Available to claim', proofreading_available: 'Ready for proofreading', proofreading_assigned: 'Proofreading assigned', proofreading_in_progress: 'Proofreading in progress'
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

// The server computes the worker's TAT, including the six-minute minimum for
// short jobs. This only formats the server value and counts it down locally
// between refreshes, so the number on screen never freezes.
const formatCountdown = (totalSeconds) => {
  const seconds = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
};

const PAYOUT_STATUS_LABELS = { accruing: 'Accruing this half', invoiced: 'Pending payout', paid: 'Paid', all: 'All' };
const ADMIN_QUEUE_LANES = [
  { id: 'needs_action', label: 'Needs action' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'submitted', label: 'Submitted' },
  { id: 'finished', label: 'Finished' },
];
const adminQueueLaneFor = (job) => {
  const status = String(job?.status || '').toLowerCase();
  if (['submitted', 'client_review'].includes(status)) return 'submitted';
  if (['released', 'cancelled'].includes(status)) return 'finished';
  if (['assigned', 'in_progress', 'split_assigned', 'split_in_progress', 'proofreading_assigned', 'proofreading_in_progress'].includes(status)) return 'in_progress';
  return 'needs_action';
};

export default function HumanJobWorkspace({ mode = 'client', onBack, showMessage, initialJobId = '', onInitialJobHandled, restricted = false }) {
  const { currentUser } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [messageFile, setMessageFile] = useState(null);
  const [finalAttachment, setFinalAttachment] = useState(null);
  const [proofRatings, setProofRatings] = useState({});
  const [editorText, setEditorText] = useState('');
  const [editorHtml, setEditorHtml] = useState('');
  const [aiDraftBusy, setAiDraftBusy] = useState(false);
  const [aiDraftLocal, setAiDraftLocal] = useState('');
  const [wholeWorker, setWholeWorker] = useState('');
  const [wholeConfirm, setWholeConfirm] = useState(false);
  const [aiWholeConfirm, setAiWholeConfirm] = useState(false);
  const [aiWholeAgent, setAiWholeAgent] = useState('');
  const [templateAgentGuidelines, setTemplateAgentGuidelines] = useState('');
  const [templateAgentFiles, setTemplateAgentFiles] = useState([]);
  const editorRef = useRef(null);
  const [feedback, setFeedback] = useState('');
  const [rating, setRating] = useState('5');
  const [proofreaderWorker, setProofreaderWorker] = useState('');
  const [aiAgentSegment, setAiAgentSegment] = useState('');
  const [workerAvailable, setWorkerAvailable] = useState(true);
  const [availabilitySaving, setAvailabilitySaving] = useState(false);
  const [extensionMinutes, setExtensionMinutes] = useState('5');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [audioUrl, setAudioUrl] = useState('');
  const [pdfImageUrl, setPdfImageUrl] = useState('');
  const [pdfImageError, setPdfImageError] = useState('');
  // Job-specific conversation access is admin/worker only. Client questions
  // use the separate direct-message channel.
  const [workerTab, setWorkerTab] = useState('available');
  const [workerBoardInfo, setWorkerBoardInfo] = useState({ canView: true, canClaim: true, activeAssignment: false, blockReason: '' });
  const [starterWorker, setStarterWorker] = useState('');
  const [starterSegment, setStarterSegment] = useState('');
  const [paymentHistory, setPaymentHistory] = useState(null);
  const [adminTab, setAdminTab] = useState('queue');
  const adminEmail = (currentUser?.email || '').trim().toLowerCase();
  const canManagePdfJobs = ['typemywordz@gmail.com', 'info@typemywordz.ai'].includes(adminEmail);
  const canAssignAiAgents = ['typemywordz@gmail.com', 'info@typemywordz.ai'].includes(adminEmail);
  const [adminQueueLane, setAdminQueueLane] = useState('needs_action');
  const [adminQueueType, setAdminQueueType] = useState('all');
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [jobsFetchedAt, setJobsFetchedAt] = useState(() => Date.now());
  const [workerRatingSummary, setWorkerRatingSummary] = useState({ average: null, count: 0 });
  const draftAssignmentKeyRef = useRef('');
  const lastSyncErrorAtRef = useRef(0);
  const jobsRequestIdRef = useRef(0);
  const handledInitialJobIdRef = useRef('');

  // The server tells us how many seconds are left as of the last refresh;
  // this just ticks the display down between refreshes so it never looks
  // frozen. loadJobs() re-syncs the true value from the server regularly.
  useEffect(() => {
    const interval = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const token = useCallback(() => currentUser?.getIdToken(), [currentUser]);
  const adminQueueCounts = useMemo(() => jobs.reduce((counts, job) => {
    const matchesType = adminQueueType === 'all' || (job.source_type || 'human_transcription') === adminQueueType;
    if (matchesType) counts[adminQueueLaneFor(job)] += 1;
    return counts;
  }, { needs_action: 0, in_progress: 0, submitted: 0, finished: 0 }), [adminQueueType, jobs]);
  const adminQueueJobs = useMemo(() => jobs.filter((job) =>
    (adminQueueType === 'all' || (job.source_type || 'human_transcription') === adminQueueType)
    && adminQueueLaneFor(job) === adminQueueLane
  ), [adminQueueLane, adminQueueType, jobs]);
  const jobsForCurrentView = mode === 'admin' && adminTab === 'queue' ? adminQueueJobs : jobs;
  const selectedJob = useMemo(() => jobsForCurrentView.find((job) => job.id === selectedId) || jobsForCurrentView[0] || null, [jobsForCurrentView, selectedId]);
  const workerAssignment = selectedJob?.worker_assignment || null;
  const workerAssignmentActive = mode === 'worker' && ['assigned', 'in_progress'].includes(workerAssignment?.status);
  const jobHasAssignedWorker = Boolean(selectedJob && (
    selectedJob.worker_uid || selectedJob.proofreader_uid || (selectedJob.assigned_worker_uids || []).length
    || (selectedJob.segments || []).some((part) => part?.worker_uid)
  ));
  const splitJob = ['dual', 'multi'].includes(String(selectedJob?.split_mode || '').toLowerCase());
  const aiWholeJobEligible = Boolean(splitJob && selectedJob && !jobHasAssignedWorker && !selectedJob.proofreader_status
    && (selectedJob.segments || []).length > 0
    && (selectedJob.segments || []).every((part) => ['available', 'approved'].includes(part.status) && !part.worker_uid));
  const hasJobDocxTemplate = (selectedJob?.instruction_attachments || []).some((item) => /\.docx$/i.test(String(item.name || '')) || /wordprocessingml.document/i.test(String(item.content_type || '')));
  const draftAssignmentKey = selectedJob?.id
    ? `${selectedJob.id}:${mode === 'worker' ? `${workerAssignment?.role || 'unassigned'}:${workerAssignment?.id || ''}` : 'admin'}`
    : '';

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
    const requestId = jobsRequestIdRef.current + 1;
    jobsRequestIdRef.current = requestId;
    try {
      const scope = mode === 'admin' ? 'admin' : mode === 'worker' ? (workerTab === 'available' ? 'available' : workerTab === 'finished' ? 'finished' : 'assigned') : 'mine';
      const payload = await request(`/human-transcription/jobs?scope=${scope}`);
      if (requestId !== jobsRequestIdRef.current) return;
      setJobs(payload.jobs || []);
      if (mode === 'worker') {
        if (payload.worker_rating_summary) setWorkerRatingSummary(payload.worker_rating_summary);
        setWorkerBoardInfo({
          canView: payload.worker_can_view_available !== false,
          canClaim: payload.worker_can_claim === true,
          activeAssignment: payload.worker_active_assignment === true,
          blockReason: payload.worker_claim_block_reason || '',
        });
      }
      setJobsFetchedAt(Date.now());
      lastSyncErrorAtRef.current = 0;
    } catch (error) {
      if (requestId === jobsRequestIdRef.current && Date.now() - lastSyncErrorAtRef.current > 30000) {
        lastSyncErrorAtRef.current = Date.now();
        showMessage?.(error.message, 'error');
      }
    } finally {
      if (requestId === jobsRequestIdRef.current) setLoading(false);
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

  const loadAvailability = useCallback(async () => {
    if (mode !== 'worker') return;
    try {
      const payload = await request('/human-transcription/worker/availability');
      setWorkerAvailable(payload.available !== false);
    } catch (error) {
      showMessage?.(error.message, 'error');
    }
  }, [mode, request, showMessage]);

  const updateWorkerAvailability = async (event) => {
    const nextAvailable = event.target.checked;
    setAvailabilitySaving(true);
    try {
      const payload = await request('/human-transcription/worker/availability', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ available: nextAvailable }),
      });
      setWorkerAvailable(payload.available !== false);
      await loadJobs();
      showMessage?.(nextAvailable ? 'You are available for new work.' : 'You will not receive new work until you turn availability back on.', 'success');
    } catch (error) {
      showMessage?.(error.message || 'Your availability could not be changed.', 'error');
    } finally {
      setAvailabilitySaving(false);
    }
  };

  const loadMessages = useCallback(async () => {
    if (mode === 'client' || !selectedJob?.id || (mode === 'worker' && workerTab === 'available')) {
      setMessages([]);
      return;
    }
    if (mode === 'admin' && !jobHasAssignedWorker) {
      setMessages([]);
      return;
    }
    try {
      const query = mode === 'admin' ? '?thread=worker' : '';
      const payload = await request(`/human-transcription/jobs/${selectedJob.id}/messages${query}`);
      setMessages(payload.messages || []);
    } catch (error) {
      // A quiet refresh failure should not interrupt editing.
      console.warn('Human chat refresh failed:', error);
    }
  }, [request, selectedJob?.id, mode, workerTab, jobHasAssignedWorker]);

  useEffect(() => { loadJobs(); loadWorkers(); loadPayments(); loadAvailability(); }, [loadJobs, loadWorkers, loadPayments, loadAvailability]);
  useEffect(() => {
    setTemplateAgentGuidelines('');
    setTemplateAgentFiles([]);
  }, [selectedJob?.id]);
  useEffect(() => {
    if (!initialJobId) {
      handledInitialJobIdRef.current = '';
    } else if (handledInitialJobIdRef.current !== initialJobId) {
      if (mode === 'worker') {
        handledInitialJobIdRef.current = initialJobId;
        setWorkerTab('in_progress');
        setSelectedId(initialJobId);
        onInitialJobHandled?.();
      } else {
        const requestedJob = jobs.find((job) => job.id === initialJobId);
        if (requestedJob) {
          handledInitialJobIdRef.current = initialJobId;
          setSelectedId(requestedJob.id);
          if (mode === 'admin') setAdminQueueLane(adminQueueLaneFor(requestedJob));
          onInitialJobHandled?.();
        }
      }
    }
    if (!initialJobId && !selectedId && jobs[0]?.id) setSelectedId(jobs[0].id);
    if (selectedJob && draftAssignmentKeyRef.current !== draftAssignmentKey) {
      draftAssignmentKeyRef.current = draftAssignmentKey;
      setEditorText(selectedJob.transcript || '');
      setEditorHtml(selectedJob.transcript_html || '');
      setAiDraftLocal('');
      setWholeWorker('');
      setProofreaderWorker(selectedJob.proofreader_uid || '');
      setStarterWorker('');
      setStarterSegment('');
      setFinalAttachment(null);
      setProofRatings({});
    }
  }, [initialJobId, jobs, mode, selectedId, selectedJob, draftAssignmentKey, onInitialJobHandled]);

  // The recording is fetched once per job (or per part) and then left alone.
  // The address the player uses only changes when the recording itself does,
  // so the polling that refreshes the job list can no longer reload it.
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const audioJobId = selectedJob?.id || '';
  const hasAudio = Boolean(selectedJob?.audio);
  const audioHidden = mode === 'worker' && workerTab === 'available';
  const audioSegmentId = mode === 'worker' && workerAssignment?.role === 'transcriber' && workerAssignment?.id && !['transcriber', 'main'].includes(workerAssignment.id) ? workerAssignment.id : '';
  const audioKey = audioJobId && hasAudio && !audioHidden ? `${audioJobId}|${audioSegmentId}` : '';
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioError, setAudioError] = useState('');
  useEffect(() => {
    if (!audioKey) { setAudioUrl(''); setAudioLoading(false); setAudioError(''); return undefined; }
    let cancelled = false;
    let objectUrl = '';
    setAudioUrl('');
    setAudioError('');
    setAudioLoading(true);
    (async () => {
      const [jobId, segmentId] = audioKey.split('|');
      const query = segmentId ? `?segment_id=${encodeURIComponent(segmentId)}` : '';
      for (let attempt = 0; attempt < 3 && !cancelled; attempt += 1) {
        try {
          const idToken = await tokenRef.current();
          const response = await fetch(`${BACKEND_URL}/human-transcription/jobs/${jobId}/audio${query}`, { headers: { Authorization: `Bearer ${idToken}` } });
          if (!response.ok) throw new Error(`audio ${response.status}`);
          const blob = await response.blob();
          if (cancelled) return;
          objectUrl = URL.createObjectURL(blob);
          setAudioUrl(objectUrl);
          setAudioLoading(false);
          return;
        } catch (error) {
          console.warn('Human source audio could not be loaded:', error);
          await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
        }
      }
      if (!cancelled) { setAudioLoading(false); setAudioError('The recording could not be loaded. Reload the page, or tell the admin if it keeps happening.'); }
    })();
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [audioKey]);

  useEffect(() => {
    let objectUrl = '';
    let cancelled = false;
    (async () => {
      if (!selectedJob?.id || selectedJob?.job_type !== 'pdf_job' || (mode === 'worker' && workerTab === 'available')) { setPdfImageUrl(''); setPdfImageError(''); return; }
      setPdfImageError('');
      try {
        const idToken = await token();
        const response = await fetch(`${BACKEND_URL}/human-transcription/jobs/${selectedJob.id}/image`, { headers: { Authorization: `Bearer ${idToken}` }, cache: 'no-store' });
        if (!response.ok) throw new Error('The source image could not be loaded.');
        objectUrl = URL.createObjectURL(await response.blob());
        if (!cancelled) setPdfImageUrl(objectUrl);
      } catch (error) { if (!cancelled) { setPdfImageUrl(''); setPdfImageError(error.message || 'The source image could not be loaded.'); } }
    })();
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [selectedJob?.id, selectedJob?.job_type, token, mode, workerTab]);

  // Keep using the server-filtered REST conversation endpoint: the backend
  // controls who can read the client and worker threads. Refresh promptly,
  // and also refresh as soon as the user returns to this tab.
  useEffect(() => {
    if (!selectedJob?.id) return undefined;
    const refreshWhenVisible = () => { if (document.visibilityState === 'visible') loadMessages(); };
    loadMessages();
    const interval = window.setInterval(refreshWhenVisible, 3000);
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [loadMessages, selectedJob?.id]);

  // Short visible-tab polling keeps assignments, deadlines, submissions and
  // client review states in sync without asking anyone to refresh manually.
  useEffect(() => {
    const refreshWhenVisible = () => { if (document.visibilityState === 'visible') loadJobs(); };
    const interval = window.setInterval(refreshWhenVisible, 3000);
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [loadJobs]);

  const remainingSecondsFor = (job) => {
    if (!job || typeof job.time_remaining_seconds !== 'number') return null;
    const elapsed = Math.floor((nowTick - jobsFetchedAt) / 1000);
    return Math.max(0, job.time_remaining_seconds - elapsed);
  };

  const act = async (path, options = {}, successMessage = 'Saved.') => {
    setBusy(true);
    try {
      await request(path, options);
      await loadJobs();
      await loadMessages();
      showMessage?.(successMessage, 'success');
      return true;
    } catch (error) {
      showMessage?.(error.message, 'error');
      return false;
    } finally { setBusy(false); }
  };

  const saveSharedTranscript = (text, html) => act(
    `/human-transcription/jobs/${selectedJob.id}/transcript`,
    { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transcript: text, transcript_html: html }) },
    'Transcript changes saved.',
  );

  const deleteJob = async () => {
    if (!selectedJob || mode !== 'admin' || busy) return;
    if (!window.confirm('Delete this human-work job, its stored files, and its conversation? Worker earnings and payment history will be kept. This cannot be undone.')) return;
    setBusy(true);
    try {
      await request(`/human-transcription/jobs/${selectedJob.id}`, { method: 'DELETE' });
      await loadJobs();
      setSelectedId('');
      showMessage?.('Human-work job deleted. Worker payment history was kept.', 'success');
    } catch (error) {
      showMessage?.(error.message || 'The job could not be fully removed. Worker payment history is protected.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const sendMessage = async (event) => {
    event.preventDefault();
    if (!selectedJob || busy || (!messageText.trim() && !messageFile)) return;
    const form = new FormData();
    form.append('message', messageText.trim());
    if (mode === 'admin') form.append('thread', 'worker');
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

  const saveProofreaderRatings = async () => {
    const entries = Object.entries(proofRatings).filter(([, value]) => Number(value?.rating) >= 1);
    if (!entries.length || workerAssignment?.role !== 'proofreader') return;
    try {
      await request(`/human-transcription/jobs/${selectedJob.id}/proofreader-ratings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ratings: entries.map(([segment_id, value]) => ({ segment_id, rating: Number(value.rating), note: value.note || '' })) }),
      });
    } catch {
      showMessage?.('Your ratings could not be saved, but your work will still be submitted.', 'error');
    }
  };

  const submitWorker = async () => {
    await saveProofreaderRatings();
    const form = new FormData();
    form.append('transcript', editorText);
    form.append('transcript_html', editorHtml);
    form.append('notes', feedback);
    // Some jobs only need the finished file handed back -- nothing to type
    // into the shared editor. The server accepts either real transcript
    // text or this attachment, as long as at least one is present.
    if (finalAttachment) form.append('attachment', finalAttachment);
    const saved = await act(
      `/human-transcription/jobs/${selectedJob.id}/submit`,
      { method: 'POST', body: form },
      'Submitted for review. Loading the Available Jobs board…',
    );
    if (saved) setWorkerTab('available');
  };

  const renderSubmitButton = (place) => {
    if (!(mode === 'worker' && workerAssignmentActive)) return null;
    const disabled = busy || (workerAssignment?.role === 'proofreader' && (selectedJob.proofreader_parts || []).some((part) => part.pending)) || (!editorText.trim() && !finalAttachment && !selectedJob.final_attachment);
    return <button type="button" className={`tm-human-submit-button${place === 'bottom' ? ' tm-human-submit-bottom' : ''}`} onClick={submitWorker} disabled={disabled}>Submit {workerAssignment?.role === 'proofreader' ? 'final work' : selectedJob.job_type === 'pdf_job' ? 'image transcription' : 'part'} for review</button>;
  };

  const claimWork = async (segmentId = '') => {
    if (!selectedJob || busy || !selectedJob.can_claim) return;
    setBusy(true);
    try {
      await request(`/human-transcription/jobs/${selectedJob.id}/claim`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(segmentId ? { segment_id: segmentId } : {}),
      });
      setWorkerTab('in_progress');
      showMessage?.('Work claimed. Your deadline has started.', 'success');
    } catch (error) {
      showMessage?.(error.message || 'That work is no longer available.', 'error');
      await loadJobs();
    } finally {
      setBusy(false);
    }
  };

  const workerPayload = (uid) => {
    const worker = workers.find((item) => item.uid === uid);
    return worker ? { worker_uid: worker.uid, worker_email: worker.email, worker_name: worker.name } : null;
  };

  const assignSupervisedStarter = async () => {
    const worker = workerPayload(starterWorker);
    if (!worker) return showMessage?.('Choose an approved worker for the supervised starter assignment.', 'error');
    if (splitJob && !starterSegment) return showMessage?.('Choose an available part for the supervised starter assignment.', 'error');
    const saved = await act(
      `/human-transcription/jobs/${selectedJob.id}/assign`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...worker, supervised_starter: true, segment_id: starterSegment }),
      },
      'Supervised starter assignment created.',
    );
    if (saved) {
      setStarterWorker('');
      setStarterSegment('');
      setAdminQueueLane('in_progress');
    }
  };

  const assignProofreader = () => {
    const worker = workerPayload(proofreaderWorker);
    if (!worker) return showMessage?.('Choose an approved proofreader first.', 'error');
    const proofreaderPartsOverride = editorRef.current?.getParts?.() || [];
    const useCombinedTranscript = proofreaderPartsOverride.length === 0 && Boolean(editorText.trim());
    return act(`/human-transcription/jobs/${selectedJob.id}/assign-proofreader`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...worker,
        transcript: editorText,
        transcript_html: editorHtml,
        proofreader_parts_override: proofreaderPartsOverride,
        proofreader_use_combined_transcript: useCombinedTranscript,
      }),
    }, 'Proofreader assigned with the current edited transcript.');
  };

  const insertAiReviewedTranscript = (text) => {
    if (!editorRef.current?.replaceContent) {
      showMessage?.('Open the shared editor first, then insert the reviewed transcript.', 'error');
      return;
    }
    editorRef.current.replaceContent(text);
  };

  const assignAiAgent = async (agentId, wholeJob = false) => {
    if (!selectedJob || busy) return;
    const eligible = (selectedJob.segments || []).filter((part) => ['available', 'approved'].includes(part.status) && !part.worker_uid);
    const segmentId = splitJob && !wholeJob ? (aiAgentSegment || eligible[0]?.id || '') : '';
    if (splitJob && !wholeJob && !segmentId) { showMessage?.('Choose an available part first.', 'error'); return; }
    const options = { method: 'POST' };
    if (agentId === 'template-claude') {
      const form = new FormData();
      form.append('agent_id', agentId);
      form.append('segment_id', segmentId);
      if (wholeJob) form.append('whole_job', 'true');
      if (templateAgentGuidelines.trim()) form.append('job_specific_guidelines', templateAgentGuidelines.trim());
      templateAgentFiles.forEach((file) => form.append('reference_files', file));
      options.body = form;
    } else {
      if (templateAgentGuidelines.trim() || templateAgentFiles.length) {
        showMessage?.('These extra instructions and files are only sent to the template-aware agent. Choose that agent or remove them first.', 'error');
        return;
      }
      options.headers = { 'Content-Type': 'application/json' };
      options.body = JSON.stringify({ agent_id: agentId, segment_id: segmentId, ...(wholeJob ? { whole_job: true } : {}) });
    }
    await act(`/human-transcription/jobs/${selectedJob.id}/ai-agent/assign`, options, wholeJob
      ? 'Whole-job AI draft queued. The split parts are paused; a failed run restores them. Human proofreading is still required.'
      : agentId === 'template-claude'
        ? 'Template-aware draft queued with the permanent rules and this job’s extra instructions.'
        : 'AI formatted draft queued. It will stay private until an approved human proofreader submits the final work.');
  };

  const confirmAiWholeJob = async () => {
    const agentId = aiWholeAgent;
    setAiWholeConfirm(false);
    if (agentId) await assignAiAgent(agentId, true);
    setAiWholeAgent('');
  };

  const assignWholeJob = async () => {
    const worker = workerPayload(wholeWorker);
    setWholeConfirm(false);
    if (!worker) return showMessage?.('Choose a worker for this urgent job.', 'error');
    const saved = await act(`/human-transcription/jobs/${selectedJob.id}/assign-whole`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(worker) }, 'The whole job was assigned.');
    if (saved) { setWholeWorker(''); setAdminQueueLane('in_progress'); }
    return saved;
  };

  const requestAiDraft = async () => {
    setAiDraftBusy(true);
    try {
      const payload = await request(`/human-transcription/jobs/${selectedJob.id}/ai-draft`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ segment_id: workerAssignment?.id && workerAssignment.id !== 'transcriber' ? workerAssignment.id : '' }) });
      setAiDraftLocal(payload.draft || '');
      showMessage?.(payload.already_generated ? 'Your saved AI formatted draft is shown below. You were not charged again.' : `AI formatted draft ready. ${payload.credits_charged || 0} credits were used.`, 'success');
      await loadJobs();
    } catch (error) { showMessage?.(error.message, 'error'); } finally { setAiDraftBusy(false); }
  };

  const extendTat = (segmentId = '', target = '') => act(`/human-transcription/jobs/${selectedJob.id}/extend-tat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ minutes: Number(extensionMinutes), segment_id: segmentId, target }) });

  const takeBackAssignment = async (role = 'transcriber', segmentId = '') => {
    if (!selectedJob || mode !== 'admin') return;
    const target = role === 'proofreader' ? 'the proofreading assignment' : segmentId ? 'this part' : 'this assignment';
    if (!window.confirm(`Take ${target} back from the worker? It will return to the admin queue. Any submitted parts and payment history will be kept.`)) return;
    setBusy(true);
    try {
      await request(`/human-transcription/jobs/${selectedJob.id}/take-back`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, segment_id: segmentId }),
      });
      await loadJobs();
      await loadMessages();
      showMessage?.('Assignment returned to the queue. Submitted work and payment history were kept.', 'success');
    } catch (error) {
      showMessage?.(error.message || 'The assignment could not be taken back.', 'error');
    } finally {
      setBusy(false);
    }
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
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      // Revoking straight away can cancel the download in some browsers.
      setTimeout(() => { link.remove(); URL.revokeObjectURL(url); }, 30000);
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
          <p className="tm-human-eyebrow">{mode === 'admin' ? 'Operations' : mode === 'worker' ? 'Work Room' : 'Human transcripts'}</p>
          <h1>{mode === 'admin' ? 'Human work queue' : mode === 'worker' ? 'Your Work Room' : 'Your human-transcription work'}</h1>
          <p>{mode === 'admin' ? 'Approve client requests, monitor worker claims, review delivery and release credits only after approval.' : mode === 'worker' ? 'Claim one available job or slice at a time, submit it, then return for more work.' : 'Follow each request from quote to delivery. Credits remain untouched until the finished work is approved and released.'}</p>
        </div>
        {mode === 'worker' && <label className="tm-worker-availability-toggle"><input type="checkbox" checked={workerAvailable} disabled={availabilitySaving} onChange={updateWorkerAvailability} /><span><strong>{workerAvailable ? 'Available for work' : 'Not accepting new work'}</strong><small>{availabilitySaving ? 'Saving…' : 'You can change this at any time.'}</small></span></label>}
        <button className="tm-human-refresh" type="button" onClick={() => { loadJobs(); loadWorkers(); loadPayments(); loadAvailability(); }}>Refresh</button>
      </div>

      {mode === 'worker' && (
        <div className="tm-worker-rating-card" aria-label="Your average transcriber rating">
          <div className="tm-worker-rating-score">
            <span className="tm-worker-rating-kicker">Your rating</span>
            <strong>{workerRatingSummary.average == null ? '—' : workerRatingSummary.average.toFixed(2)}</strong>
            <span className="tm-worker-rating-out-of">/ 5</span>
          </div>
          <div className="tm-worker-rating-copy">
            <span>{workerRatingSummary.count ? `${workerRatingSummary.count} rating${workerRatingSummary.count === 1 ? '' : 's'} submitted` : 'No ratings submitted yet'}</span>
            <small>{workerRatingSummary.count ? 'Ratings reflect completed jobs or periodic reviews. A 3.5/5 average is required to see Available Jobs.' : 'An admin must assign your supervised starter assessment. A 3.5/5 average is required before the public job board opens.'}</small>
          </div>
        </div>
      )}

      {mode === 'worker' && (
        <div className="tm-worker-policy-note" role="note">
          <strong>How hired work must be prepared:</strong>
          <span>Once hired, keep enough TypeMyworDz credits to create an AI formatted draft for your assigned job. Edit it in Word, then paste it into the TypeMyworDz editor and submit. Keep the research notes and spellings section at the end of your work; the proofreader and admin need them to verify names. Do not attach documents unless a job is a TEMPLATE JOB or the admin requests one.</span>
        </div>
      )}

      {mode === 'worker' && (
        <div className="tm-human-thread-tabs tm-worker-room-tabs" role="tablist" aria-label="Worker room sections">
          <button type="button" role="tab" aria-selected={workerTab === 'available'} className={workerTab === 'available' ? 'active' : ''} onClick={() => setWorkerTab('available')}>Available Jobs</button>
          <button type="button" role="tab" aria-selected={workerTab === 'in_progress'} className={workerTab === 'in_progress' ? 'active' : ''} onClick={() => setWorkerTab('in_progress')}>In Progress</button>
          <button type="button" role="tab" aria-selected={workerTab === 'finished'} className={workerTab === 'finished' ? 'active' : ''} onClick={() => setWorkerTab('finished')}>Finished Jobs</button>
          <button type="button" role="tab" aria-selected={workerTab === 'payments'} className={workerTab === 'payments' ? 'active' : ''} onClick={() => { setWorkerTab('payments'); loadPayments(); }}>Payment History · KES</button>
        </div>
      )}

      {mode === 'admin' && (
        <div className="tm-human-thread-tabs tm-worker-room-tabs" role="tablist" aria-label="Admin dashboard sections">
          <button type="button" role="tab" aria-selected={adminTab === 'queue'} className={adminTab === 'queue' ? 'active' : ''} onClick={() => setAdminTab('queue')}>Job Queue</button>
          {!restricted && <button type="button" role="tab" aria-selected={adminTab === 'payouts'} className={adminTab === 'payouts' ? 'active' : ''} onClick={() => setAdminTab('payouts')}>Worker Payments · KES</button>}
          {!restricted && <button type="button" role="tab" aria-selected={adminTab === 'rates'} className={adminTab === 'rates' ? 'active' : ''} onClick={() => setAdminTab('rates')}>Worker rates</button>}
          {!restricted && <button type="button" role="tab" aria-selected={adminTab === 'cleanup'} className={adminTab === 'cleanup' ? 'active' : ''} onClick={() => setAdminTab('cleanup')}>Job cleanup</button>}
          {canManagePdfJobs && <button type="button" role="tab" aria-selected={adminTab === 'pdf_jobs'} className={adminTab === 'pdf_jobs' ? 'active' : ''} onClick={() => setAdminTab('pdf_jobs')}>PDF Jobs</button>}
        </div>
      )}

      {mode === 'admin' && adminTab === 'pdf_jobs' && canManagePdfJobs ? (
        <PdfJobsAdminPanel showMessage={showMessage} onOpenQueue={() => { setAdminQueueType('pdf_job'); setAdminQueueLane('needs_action'); setAdminTab('queue'); }} />
      ) : mode === 'worker' && workerTab === 'payments' ? (
        <div className="tm-human-chat-card tm-worker-payment-panel">
          <div className="tm-human-chat-head"><div><strong>Payment history</strong><span>Pay accrues in two halves of each month: the 1st-15th and the 16th to month end.</span></div><span className="tm-human-live-dot">KES</span></div>
          {!paymentHistory ? <div className="tm-human-empty">Loading payment history…</div> : <>
            <div className="tm-worker-payment-totals">
              <div><small>Paid</small><strong>KES {paymentHistory.totals?.paid_kes || 0}</strong><span className="tm-worker-payment-breakdown">Transcription KES {paymentHistory.totals?.paid_transcription_kes || 0} · Proofreading KES {paymentHistory.totals?.paid_proofreading_kes || 0} · PDF KES {paymentHistory.totals?.paid_pdf_kes || 0}</span></div>
              <div><small>Pending payout</small><strong>KES {(paymentHistory.pending_payouts || []).reduce((sum, item) => sum + (item.total_amount_kes || 0), 0)}</strong></div>
              <div><small>Accruing this half ({paymentHistory.current_period?.label})</small><strong>KES {paymentHistory.current_period?.accrued_kes || 0}</strong><span className="tm-worker-payment-breakdown">Transcription KES {paymentHistory.current_period?.transcription_kes || 0} · Proofreading KES {paymentHistory.current_period?.proofreading_kes || 0} · PDF KES {paymentHistory.current_period?.pdf_kes || 0}</span></div>
            </div>
            <h3>Pending payouts (already invoiced, awaiting admin payment)</h3>
            {!(paymentHistory.pending_payouts || []).length && <p className="tm-human-empty">No half-month invoice is waiting on admin payment right now.</p>}
            {(paymentHistory.pending_payouts || []).map((item) => <div className="tm-worker-payment-row" key={item.payout_id}><span>Period {item.period_label}</span><strong>KES {item.total_amount_kes}</strong><small>{item.total_minutes} min · pays out on {item.period_label?.endsWith('-A') ? 'the 15th' : 'month end'} · Transcription KES {item.transcription_amount_kes || 0} · Proofreading KES {item.proofreading_amount_kes || 0} · PDF KES {item.pdf_amount_kes || 0}{item.total_deduction_kes > 0 ? ` · KES ${item.total_deduction_kes} in deductions` : ''}</small></div>)}
            <h3>Paid</h3>{!(paymentHistory.paid || []).length && <p className="tm-human-empty">No payments have been marked paid yet.</p>}{(paymentHistory.paid || []).map((item) => <div className="tm-worker-payment-row" key={`${item.job_id}-${item.role}-${item.payout_period_id || ''}`}><span>{item.role} · Job {item.job_id.slice(0, 8)}</span><strong>KES {item.amount_kes}</strong><small>{item.minutes} min · {moneylessDate(item.paid_at)}{item.deduction_kes > 0 ? ` · KES ${item.deduction_kes} deducted: ${item.deduction_reason}` : ''}</small></div>)}
          </>}
        </div>
      ) : mode === 'admin' && adminTab === 'payouts' && !restricted ? (
        <AdminPayoutsPanel request={request} showMessage={showMessage} workers={workers} />
      ) : mode === 'admin' && adminTab === 'rates' && !restricted ? (
        <AdminTranscriberRatePanel request={request} showMessage={showMessage} />
      ) : mode === 'admin' && adminTab === 'cleanup' && !restricted ? (
        <AdminJobCleanupPanel request={request} showMessage={showMessage} />
      ) : (
      <>
      {mode === 'admin' && adminTab === 'queue' && (
        <div className="tm-admin-queue-controls" aria-label="Filter human-work jobs">
          <div className="tm-admin-queue-lanes" role="tablist" aria-label="Job status">
            {ADMIN_QUEUE_LANES.map((lane) => (
              <button type="button" key={lane.id} role="tab" aria-selected={adminQueueLane === lane.id} className={adminQueueLane === lane.id ? 'active' : ''} onClick={() => setAdminQueueLane(lane.id)}>
                <span>{lane.label}</span><b>{adminQueueCounts[lane.id] || 0}</b>
              </button>
            ))}
          </div>
          <label className="tm-admin-queue-type">Job type
            <select value={adminQueueType} onChange={(event) => setAdminQueueType(event.target.value)}>
              <option value="all">All job types</option>
              <option value="human_transcription">Human transcription</option>
              <option value="ai_proofreading">AI transcript proofreading</option>
              <option value="pdf_job">PDF Jobs</option>
            </select>
          </label>
        </div>
      )}
      {mode === 'worker' && workerTab === 'available' && workerBoardInfo.blockReason && (
        <div className="tm-worker-board-notice" role="status">
          <strong>{workerBoardInfo.canView ? 'New claims are paused' : 'Available Jobs are not open yet'}</strong>
          <span>{workerBoardInfo.blockReason} Payment History and Finished Jobs remain available.</span>
        </div>
      )}
      <div className="tm-human-workspace-grid">
        <aside className="tm-human-job-list">
          <div className="tm-human-list-head"><strong>{jobsForCurrentView.length} job{jobsForCurrentView.length === 1 ? '' : 's'}</strong><span>Live updates</span></div>
          {jobsForCurrentView.map((job) => (
            <button type="button" key={job.id} className={`tm-human-job-row ${selectedJob?.id === job.id ? 'selected' : ''}`} onClick={() => setSelectedId(job.id)}>
              <strong>{job.pdf_image?.name || job.audio?.name || `Human job ${job.id.slice(0, 6)}`}</strong>
              <span>{mode === 'worker' && workerTab === 'available' ? (job.claimable_full_job ? 'Entire job · available to claim' : `${(job.claimable_parts || []).length} part${(job.claimable_parts || []).length === 1 ? '' : 's'} available`) : mode === 'worker' && job.worker_assignment?.role === 'proofreader' ? 'Proofreading · In progress' : (STATUS_LABELS[job.status] || job.status)}{typeof job.time_remaining_seconds === 'number' && ['assigned', 'in_progress'].includes(job.worker_assignment?.status || job.status) ? ` · ${formatCountdown(remainingSecondsFor(job))} left` : ''}</span>
              {mode === 'admin' && (() => {
                const active = ['assigned', 'in_progress'];
                const names = [];
                (job.segments || []).forEach((part) => { if (part.worker_name || part.worker_email) names.push(`${part.label || 'Part'}: ${part.worker_name || part.worker_email}${active.includes(part.status) ? ' (working)' : part.status === 'submitted' || part.status === 'approved' ? '' : ''}`); });
                if (!names.length && (job.worker_name || job.worker_email)) names.push(`${job.worker_name || job.worker_email}${active.includes(job.status) ? ' (working)' : ''}`);
                if (job.proofreader_name || job.proofreader_email) names.push(`Proofreader: ${job.proofreader_name || job.proofreader_email}`);
                return <small className="tm-human-claimed" style={{ color: names.length ? '#4b2a8a' : '#858a95', fontWeight: 600 }}>{names.length ? `Claimed by ${names.join(' | ')}` : 'Not claimed yet'}</small>;
              })()}
              <small>{mode === 'worker' ? `${job.job_type === 'pdf_job' ? 'PDF image · KES 100' : moneylessDate(job.createdAt)}${job.job_type === 'pdf_job' ? ` · ${moneylessDate(job.createdAt)}` : ''}` : `${job.quote_credits || 0} credits · ${moneylessDate(job.createdAt)}`}</small>
            </button>
          ))}
          {!jobsForCurrentView.length && <div className="tm-human-empty">{mode === 'admin' ? 'No jobs match this status and type.' : mode === 'worker' && workerTab === 'available' ? 'No new work is available right now. This board refreshes automatically.' : 'No human work is waiting here.'}</div>}
        </aside>

        <div className="tm-human-job-detail">
          {!selectedJob ? <div className="tm-human-empty">Choose a job to see its details.</div> : <>
            <div className="tm-human-detail-head">
              <div><span className="tm-human-status">{STATUS_LABELS[selectedJob.status] || selectedJob.status}</span><h2>{selectedJob.pdf_image?.name || selectedJob.audio?.name || (selectedJob.source_type === 'ai_proofreading' ? 'AI transcript for proofreading' : 'Human-transcription request')}</h2><p>{selectedJob.job_type === 'pdf_job' ? 'PDF image transcription · KES 100 per submitted image' : `${selectedJob.source_type === 'ai_proofreading' ? 'AI transcript proofreading' : 'New human transcript'} · ${selectedJob.minutes || 0} minutes${mode !== 'worker' ? ` · ${selectedJob.quote_credits || 0} credits` : ''} · ${selectedJob.turnaround || 'standard'} delivery`}</p>{mode === 'worker' && workerAssignment?.label && <p><strong>{workerAssignment.label}</strong>{workerAssignment.role === 'proofreader' ? ' · Proofread the combined text below and check the handoff between parts. You can submit once every part is in.' : selectedJob.job_type === 'pdf_job' ? ' · Transcribe the single assigned image and submit the finished Word file or transcript.' : ` · Work from ${formatCountdown(workerAssignment.start_seconds || 0)} to ${formatCountdown(workerAssignment.end_seconds || 0)} in the source recording.`}</p>}</div>
              <div className="tm-human-detail-actions">
                {mode === 'admin' && selectedJob.status === 'pending_admin' && <button type="button" onClick={() => act(`/human-transcription/jobs/${selectedJob.id}/approve`, { method: 'POST' })}>Approve request</button>}
                {renderSubmitButton('top')}
                {mode === 'client' && selectedJob.status === 'client_review' && <button type="button" onClick={() => act(`/human-transcription/jobs/${selectedJob.id}/client-approve`, { method: 'POST' })}>Approve completed work</button>}
                {mode === 'admin' && selectedJob.status === 'client_review' && <button type="button" title="Some clients are fully hands-off and trust an admin's review instead of logging in to approve it themselves." onClick={() => act(`/human-transcription/jobs/${selectedJob.id}/client-approve`, { method: 'POST' })}>Approve on client's behalf</button>}
                {mode === 'admin' && selectedJob.status === 'client_approved' && <button type="button" onClick={() => act(`/human-transcription/jobs/${selectedJob.id}/release`, { method: 'POST' })}>Release completed work</button>}
                {mode === 'admin' && !splitJob && ['assigned', 'in_progress'].includes(selectedJob.status) && <button type="button" disabled={busy} onClick={() => takeBackAssignment('transcriber')}>Take back from worker</button>}
                {mode === 'admin' && <button type="button" onClick={deleteJob}>Delete job</button>}
                {mode === 'client' && selectedJob.status === 'released' && selectedJob.transcript && <button type="button" onClick={async () => { const idToken = await token(); const response = await fetch(`${BACKEND_URL}/human-transcription/jobs/${selectedJob.id}/download`, { headers: { Authorization: `Bearer ${idToken}` } }); if (!response.ok) { showMessage?.('The completed transcript is not ready to download.', 'error'); return; } const url = URL.createObjectURL(await response.blob()); const link = document.createElement('a'); link.href = url; link.download = `human-${selectedJob.id}.txt`; link.click(); URL.revokeObjectURL(url); }}>Download transcript</button>}
              </div>
            </div>

            {mode === 'worker' && (selectedJob.my_job_ratings || []).length > 0 && (
              <section className="tm-worker-job-feedback" aria-label="Admin feedback for this job">
                <h3>Feedback on this job</h3>
                {(selectedJob.my_job_ratings || []).map((item, index) => (
                  <article className="tm-worker-job-feedback-item" key={`${item.label}-${index}`}>
                    <div><strong>{item.label}</strong><span>{item.rating}/5 · Rated by {item.rater || 'Admin'}</span></div>
                    {item.note && <p>{item.note}</p>}
                  </article>
                ))}
              </section>
            )}

            {mode === 'admin' && selectedJob && canAssignAiAgents && (
              <section className="tm-ai-agent-panel" aria-label="AI first-draft agents">
                <div className="tm-ai-agent-copy">
                  <strong>AI first draft <span>Human proofreading required</span></strong>
                  <p>Choose a general or template-aware internal agent for an available job or part. Both audio agents use Claude Opus 5.5 first and GPT-5.6 Sol only as fallback. The draft stays out of the client view until an approved proofreader submits the checked version.</p>
                </div>
                {splitJob && <label className="tm-ai-agent-part">Part
                  <select value={aiAgentSegment || (selectedJob.segments || []).find((part) => ['available', 'approved'].includes(part.status) && !part.worker_uid)?.id || ''} onChange={(event) => setAiAgentSegment(event.target.value)}>
                    <option value="">Choose an available part</option>
                    {(selectedJob.segments || []).filter((part) => ['available', 'approved'].includes(part.status) && !part.worker_uid).map((part) => <option key={part.id} value={part.id}>{part.label || part.id}</option>)}
                  </select>
                </label>}
                {hasJobDocxTemplate && selectedJob.job_type !== 'pdf_job' && <div className="tm-ai-template-guidance">
                  <p className="tm-ai-template-guidance-intro">Below are text-specific guidelines (additional guidelines only aimed at the current template job I'm giving you to format). Note that those template-specific guidelines should be given priority first over GENERAL guidelines where applicable.</p>
                  <label>Additional instructions for this template job
                    <textarea aria-label="Additional template-job instructions" rows={4} maxLength={12000} value={templateAgentGuidelines} onChange={(event) => setTemplateAgentGuidelines(event.target.value)} placeholder="Add any extra directions that apply only to this job." />
                  </label>
                  <label>Extra reference files for this template job
                    <input key={selectedJob.id} aria-label="Extra reference files for this template job" type="file" accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.gif,.webp" multiple onChange={(event) => setTemplateAgentFiles(Array.from(event.target.files || []))} />
                  </label>
                  {templateAgentFiles.length > 0 && <ul className="tm-ai-template-file-list" aria-label="Selected extra reference files">
                    {templateAgentFiles.map((file, index) => <li key={`${file.name}-${file.lastModified}-${index}`}>
                      <span><strong>{file.name}</strong>{formatAttachmentSize(file.size) ? ` · ${formatAttachmentSize(file.size)}` : ''}</span>
                      <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setTemplateAgentFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}>Remove</button>
                    </li>)}
                  </ul>}
                  <small>These extras are private to this AI run. The attached template and existing job references are included too. You can attach up to six PDF, Word, text, or image files.</small>
                </div>}
                <div className="tm-ai-agent-buttons">
                  {selectedJob.job_type === 'pdf_job' ? (
                    <button type="button" disabled={busy || ['queued', 'processing'].includes(selectedJob.ai_agent_status) || (!splitJob && selectedJob.status !== 'approved') || (splitJob && !(selectedJob.segments || []).some((part) => ['available', 'approved'].includes(part.status) && !part.worker_uid))} onClick={() => assignAiAgent('pdf-gemini')}>{['queued', 'processing'].includes(selectedJob.ai_agent_status) ? 'Gemini is drafting…' : 'Assign Gemini 3.8 to image'}</button>
                  ) : <>
                    <button type="button" disabled={busy || (!splitJob && selectedJob.status !== 'approved') || (splitJob && !(selectedJob.segments || []).some((part) => ['available', 'approved'].includes(part.status) && !part.worker_uid))} onClick={() => assignAiAgent('general-gpt')}>Assign general agent</button>
                    <button type="button" disabled={busy || !hasJobDocxTemplate || (!splitJob && selectedJob.status !== 'approved') || (splitJob && !(selectedJob.segments || []).some((part) => ['available', 'approved'].includes(part.status) && !part.worker_uid))} title={!hasJobDocxTemplate ? 'Attach exactly one job-specific .docx template first.' : undefined} onClick={() => assignAiAgent('template-claude')}>Assign template-aware agent</button>
                  </>}
                </div>
                {mode === 'admin' && splitJob && selectedJob.job_type !== 'pdf_job' && <div className="tm-ai-agent-takeover">
                  <p>Whole-job takeover pauses all split parts and prepares one draft from the full recording. It is available only before any part is claimed or submitted; a failed AI run restores the original parts.</p>
                  <div className="tm-ai-agent-buttons">
                    <button type="button" disabled={busy || !aiWholeJobEligible || ['queued', 'processing'].includes(selectedJob.ai_agent_status)} onClick={() => { setAiWholeAgent('general-gpt'); setAiWholeConfirm(true); }}>Assign whole job to general agent</button>
                    <button type="button" disabled={busy || !aiWholeJobEligible || !hasJobDocxTemplate || ['queued', 'processing'].includes(selectedJob.ai_agent_status)} title={!hasJobDocxTemplate ? 'Attach exactly one job-specific .docx template first.' : undefined} onClick={() => { setAiWholeAgent('template-claude'); setAiWholeConfirm(true); }}>Assign whole job to template-aware agent</button>
                  </div>
                  {!aiWholeJobEligible && <small role="status">Whole-job takeover is locked because at least one part has been claimed/submitted, or proofreading has started.</small>}
                </div>}
                {selectedJob.ai_agent_status === 'submitted' && selectedJob.ai_agent_id === 'template-claude' && <button type="button" onClick={() => downloadProtectedFile(`/human-transcription/admin/jobs/${selectedJob.id}/ai-agent/template-docx`, selectedJob.ai_agent_docx?.name || `${selectedJob.job_name || 'transcript'}-formatted-draft.docx`, 'The private template-formatted Word draft is not available.')}>Download template-formatted Word draft (.docx)</button>}
                {selectedJob.ai_agent_status && <p className={`tm-ai-agent-state is-${selectedJob.ai_agent_status}`} role="status">
                  {['queued', 'processing'].includes(selectedJob.ai_agent_status) ? `${selectedJob.ai_agent_name || 'AI agent'} is preparing a private draft…` : selectedJob.ai_agent_status === 'submitted' ? `${selectedJob.ai_agent_name || 'AI agent'} submitted a draft. Assign an approved human proofreader before review or release.` : selectedJob.ai_agent_status === 'failed' ? `The last AI run failed: ${selectedJob.ai_agent_error || 'Retry the agent or assign a human worker.'}` : ''}
                </p>}
              </section>
            )}

            {mode === 'worker' && workerTab === 'available' && (
              <section className="tm-human-claim-panel" aria-label="Claim available work">
                <div>
                  <h3>Claim this work</h3>
                  <p>{selectedJob.job_type === 'pdf_job' ? 'Each listing is one image and may be claimed by one worker. Your deadline begins when you claim it; the image opens after the claim.' : 'Claim one job or slice at a time. Your turnaround deadline begins as soon as you claim it. After submitting, you can return here for another available slice.'}</p>
                </div>
                {!selectedJob.can_claim && selectedJob.claim_block_reason && <p className="tm-human-claim-blocked" role="status">{selectedJob.claim_block_reason}</p>}
                {selectedJob.claimable_full_job && (
                  <button type="button" disabled={busy || !selectedJob.can_claim} onClick={() => claimWork()}>{selectedJob.job_type === 'pdf_job' ? 'Claim image' : 'Claim job'}</button>
                )}
                {(selectedJob.claimable_parts || []).map((part) => (
                  <div className="tm-human-claim-part" key={part.id}>
                    <span><strong>{part.label || 'Available part'}</strong><small>{part.minutes || 0} minutes of audio</small></span>
                    <button type="button" disabled={busy || !selectedJob.can_claim} onClick={() => claimWork(part.id)}>Claim part</button>
                  </div>
                ))}
              </section>
            )}

            {!(mode === 'worker' && workerTab === 'available') && String(selectedJob.instructions || '').trim() && (
              <div className="tm-human-instructions" role="note">
                <strong>Notes for the transcriber</strong>
                <p>{selectedJob.instructions}</p>
              </div>
            )}

            {mode === 'worker' && workerAssignmentActive && (
              <div className="tm-human-final-attach">
                <label className="tm-human-attach" title="Attach the finished file instead of typing it" aria-label="Attach the finished file">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 3.5h8l3 3V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z"/><path d="M15 3.5V7h3M9 11h6M9 15h6"/></svg>
                  <span>{workerAssignment?.role === 'proofreader' ? (finalAttachment ? 'Change final proofread file' : 'Attach final proofread file') : (finalAttachment ? 'Change finished file' : 'Attach finished file')}</span>
                  <input type="file" onChange={(event) => setFinalAttachment(event.target.files?.[0] || null)} />
                </label>
                {finalAttachment && <span className="tm-human-attachment-preview"><strong>{finalAttachment.name}</strong>{formatAttachmentSize(finalAttachment.size) ? ` · ${formatAttachmentSize(finalAttachment.size)}` : ''}<button type="button" onClick={() => setFinalAttachment(null)} aria-label="Remove attachment">Remove</button></span>}
                <p className="tm-human-editor-note">Nothing to type for this job? Attach the finished file and submit -- the editor can stay empty.</p>
              </div>
            )}

            {workerAssignmentActive && typeof selectedJob.time_remaining_seconds === 'number' && (() => {
              const remaining = remainingSecondsFor(selectedJob);
              const urgent = remaining <= 300;
              return (
                <div className={`tm-tat-timer${urgent ? ' tm-tat-timer-urgent' : ''}`}>
                  <div><strong>{remaining <= 0 ? 'Time is up' : formatCountdown(remaining)}</strong><span>{workerAssignment.role === 'proofreader' ? 'left to finish proofreading' : selectedJob.job_type === 'pdf_job' ? 'left to submit this image transcription' : 'left to submit your part'}</span></div>
                  <p className="tm-tat-hint">Tip: a quicker typing pace means faster turnarounds and more jobs you can take on. <a href="/typing-practice" target="_blank" rel="noopener noreferrer">Practice touch typing</a></p>
                </div>
              );
            })()}

            {mode === 'admin' && splitJob && <div className="tm-human-assign" style={{ display: 'grid', gap: 10 }}><strong>Parts and deadlines</strong>{(selectedJob.segments || []).map((part) => <div key={part.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}><span style={{ minWidth: 170 }}><strong>{part.label}</strong><small style={{ display: 'block', color: '#858a95' }}>{part.worker_name || 'Waiting for reassignment'} · {STATUS_LABELS[part.status] || part.status}{typeof part.time_remaining_seconds === 'number' ? ` · ${formatCountdown(part.time_remaining_seconds)} left` : ''}</small></span>{['assigned', 'in_progress'].includes(part.status) && <><select value={extensionMinutes} onChange={(event) => setExtensionMinutes(event.target.value)} aria-label={`Extra time for ${part.label}`}><option value="5">+5 minutes</option><option value="10">+10 minutes</option><option value="15">+15 minutes</option><option value="20">+20 minutes</option></select><button type="button" disabled={busy} onClick={() => extendTat(part.id)}>Add time</button><button type="button" disabled={busy} onClick={() => takeBackAssignment('transcriber', part.id)}>Take back</button></>}{['available', 'approved'].includes(part.status) && <span style={{ color: '#7a5f1b', fontSize: 12 }}>This part is available for a worker to claim.</span>}</div>)}{['assigned', 'in_progress'].includes(selectedJob.proofreader_status) && <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}><span style={{ minWidth: 170 }}><strong>Final proofreader</strong><small style={{ display: 'block', color: '#858a95' }}>{selectedJob.proofreader_name || 'Assigned worker'} · {formatCountdown(selectedJob.proofreader_time_remaining_seconds || 0)} left</small></span><select value={extensionMinutes} onChange={(event) => setExtensionMinutes(event.target.value)} aria-label="Extra time for proofreader"><option value="5">+5 minutes</option><option value="10">+10 minutes</option><option value="15">+15 minutes</option><option value="20">+20 minutes</option></select><button type="button" disabled={busy} onClick={() => extendTat('', 'proofreader')}>Add time</button><button type="button" disabled={busy} onClick={() => takeBackAssignment('proofreader')}>Take back</button></div>}</div>}

            {mode === 'admin' && !splitJob && ['assigned', 'in_progress'].includes(selectedJob.status) && typeof selectedJob.time_remaining_seconds === 'number' && <div className="tm-human-assign"><label>Add time before the deadline<select value={extensionMinutes} onChange={(event) => setExtensionMinutes(event.target.value)}><option value="5">5 minutes</option><option value="10">10 minutes</option><option value="15">15 minutes</option><option value="20">20 minutes</option></select></label><button type="button" disabled={busy} onClick={() => extendTat()}>Extend deadline</button><p className="tm-tat-hint">The job will remain with the worker while the added time is still active.</p></div>}


            {selectedJob.last_auto_reassigned_worker_name && selectedJob.status === 'approved' && (
              <p className="tm-tat-reassigned-note">This job was automatically returned from {selectedJob.last_auto_reassigned_worker_name} after the deadline passed. It is available on the workers’ claim board again; the next deadline starts when claimed.</p>
            )}

            {mode === 'admin' && selectedJob.job_type !== 'pdf_job' && ((!splitJob && selectedJob.status === 'approved') || (splitJob && !selectedJob.proofreader_status && (selectedJob.segments || []).every((part) => ['available', 'approved'].includes(part.status) && !part.worker_uid))) && <div className="tm-human-assign">
              <strong>Urgent: give the whole job to one worker</strong>
              <label>Worker
                <select value={wholeWorker} onChange={(event) => setWholeWorker(event.target.value)}>
                  <option value="">Choose an approved worker</option>
                  {workers.filter((worker) => worker.available !== false).map((worker) => <option key={worker.uid} value={worker.uid}>{worker.name} · {worker.rating == null ? 'not rated' : `${Number(worker.rating).toFixed(1)}/5`} · {worker.email}</option>)}
                </select>
              </label>
              <button type="button" disabled={busy || !wholeWorker} onClick={() => setWholeConfirm(true)}>Assign whole job</button>
              <p className="tm-tat-hint">Rating does not matter here. The job is taken off the claim board and is not split. The worker must be free of other active work.</p>
            </div>}
            <ConfirmDialog open={wholeConfirm} title="Assign the whole job to this worker?" body="The job leaves the Available Jobs board and the worker does the full recording. Use this for urgent work." confirmLabel="Assign whole job" busy={busy} onConfirm={assignWholeJob} onCancel={() => setWholeConfirm(false)} />
            <ConfirmDialog open={aiWholeConfirm} title="Pause the parts and assign one whole-job draft?" body={`${aiWholeAgent === 'template-claude' ? 'The template-aware agent' : 'The general agent'} will prepare one private draft from the full recording. This is allowed only when no part has been claimed or submitted. If the AI run fails, the original parts are restored. An approved human proofreader must still check the draft before it can reach the client.`} confirmLabel="Pause parts and continue" busy={busy} onConfirm={confirmAiWholeJob} onCancel={() => { setAiWholeConfirm(false); setAiWholeAgent(''); }} />

            {mode === 'admin' && !splitJob && selectedJob.status === 'approved' && <div className="tm-human-assign">
              <strong>Available to workers</strong>
              <p>Approved workers who meet the 3.5/5 rating standard can claim this job from the Available Jobs board. The deadline starts when they claim it.</p>
              <label>Supervised starter assessment
                <select value={starterWorker} onChange={(event) => setStarterWorker(event.target.value)}>
                  <option value="">Choose an unrated or below-threshold worker</option>
                  {workers.filter((worker) => worker.available !== false).map((worker) => <option key={worker.uid} value={worker.uid}>{worker.name} · {worker.email}</option>)}
                </select>
              </label>
              <button type="button" disabled={busy || !starterWorker} onClick={assignSupervisedStarter}>Assign supervised starter</button>
              <p className="tm-tat-hint">Use this admin-supervised exception to assess a new hire or review a worker below 3.5. The public claim board remains restricted.</p>
            </div>}

            {mode === 'admin' && splitJob && (selectedJob.segments || []).some((part) => ['available', 'approved'].includes(part.status)) && (
              <div className="tm-human-assign">
                <strong>Parts are open to claim</strong>
                <p>Workers who meet the 3.5/5 rating standard can claim these slices from the Available Jobs board. A worker’s deadline begins when they claim a slice; you can take back active work or add time below.</p>
                <label>Supervised starter part
                  <select value={starterSegment} onChange={(event) => setStarterSegment(event.target.value)}>
                    <option value="">Choose an available part</option>
                    {(selectedJob.segments || []).filter((part) => ['available', 'approved'].includes(part.status)).map((part) => <option key={part.id} value={part.id}>{part.label || 'Available part'}</option>)}
                  </select>
                </label>
                <label>Worker
                  <select value={starterWorker} onChange={(event) => setStarterWorker(event.target.value)}>
                    <option value="">Choose an unrated or below-threshold worker</option>
                    {workers.filter((worker) => worker.available !== false).map((worker) => <option key={worker.uid} value={worker.uid}>{worker.name} · {worker.email}</option>)}
                  </select>
                </label>
                <button type="button" disabled={busy || !starterWorker || !starterSegment} onClick={assignSupervisedStarter}>Assign supervised starter part</button>
                <p className="tm-tat-hint">Use this admin-supervised exception to assess a new hire or review a worker below 3.5. Rated workers should use the public claim board.</p>
              </div>
            )}

            {mode === 'admin' && splitJob && ['split_assigned', 'split_in_progress', 'proofreading_available'].includes(selectedJob.status) && (selectedJob.segments || []).some((part) => part.status === 'submitted') && !['assigned', 'in_progress'].includes(selectedJob.proofreader_status) && <div className="tm-human-assign"><label>Assign a proofreader<select value={proofreaderWorker} onChange={(event) => setProofreaderWorker(event.target.value)}><option value="">Choose a worker rated 4.5 or higher</option>{workers.filter((worker) => worker.can_proofread).map((worker) => <option key={worker.uid} value={worker.uid}>{worker.name} · {Number(worker.rating).toFixed(1)}/5 · {worker.email}</option>)}</select></label><button type="button" disabled={busy || !proofreaderWorker} onClick={assignProofreader}>Assign proofreading</button><p className="tm-tat-hint">Only workers rated 4.5/5 or higher can proofread. You can assign now, before every part is in. The proofreader gets one editor with all submitted parts, separated by dotted lines, and can load the rest as they arrive. They can submit only once every part is in.</p></div>}
            {mode === 'admin' && selectedJob.job_type !== 'pdf_job' && ((splitJob && (selectedJob.segments || []).length > 0 && (selectedJob.segments || []).every((part) => part.status === 'submitted')) || (!splitJob && ['submitted', 'client_review', 'client_approved', 'released'].includes(selectedJob.status) && String(selectedJob.transcript || '').trim())) && <AdminAiReviewPanel job={selectedJob} act={act} busy={busy} splitJob={splitJob} onInsert={insertAiReviewedTranscript} />}
            {mode === 'admin' && <AdminPartReview job={selectedJob} act={act} downloadProtectedFile={downloadProtectedFile} />}


            {mode === 'admin' && selectedJob.status === 'submitted' && <div className="tm-human-review"><label>Worker rating<select value={rating} onChange={(event) => setRating(event.target.value)}><option value="5">5 — excellent</option><option value="4">4 — strong</option><option value="3">3 — acceptable</option><option value="2">2 — needs work</option><option value="1">1 — poor</option></select></label><textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder={selectedJob.job_type === 'pdf_job' ? 'Internal review notes for this image job' : 'Notes for the client and worker'} /><button type="button" onClick={() => act(`/human-transcription/jobs/${selectedJob.id}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating, feedback }) }, selectedJob.job_type === 'pdf_job' ? 'PDF transcription approved and completed.' : 'Sent to client for review.')}>{selectedJob.job_type === 'pdf_job' ? 'Approve PDF transcription' : 'Send to client'}</button></div>}

            {selectedJob.job_type === 'pdf_job' && !(mode === 'worker' && workerTab === 'available') && <div className="tm-human-pdf-image-card"><div><strong>Assigned image</strong><span>{selectedJob.pdf_image?.source_filename || selectedJob.pdf_image?.name}{selectedJob.pdf_image?.page_count > 1 ? ` · Page ${selectedJob.pdf_image.page_number} of ${selectedJob.pdf_image.page_count}` : ''}</span></div>{pdfImageUrl ? <img src={pdfImageUrl} alt={`Transcribe ${selectedJob.pdf_image?.name || 'PDF Job'}`} /> : <p role={pdfImageError ? 'alert' : 'status'}>{pdfImageError || 'Loading the private image…'}</p>}</div>}
            {audioKey && <WorkerAudioPlayer src={audioUrl} loading={audioLoading} error={audioError} title={audioSegmentId ? 'Your part of the recording' : 'Source recording'} note={audioSegmentId ? 'Only your assigned part is played and downloaded here.' : 'Available to the client, admin and assigned worker.'} filename={audioSegmentId ? `${(workerAssignment?.label || 'part').replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}.mp3` : (selectedJob?.audio?.name || 'recording.mp3')} />}
            {mode === 'worker' && workerAssignmentActive && workerAssignment?.role !== 'proofreader' && selectedJob.job_type !== 'pdf_job' && <div className="tm-human-reference-card" style={{ display: 'grid', gap: 8 }}>
              <strong>AI formatted draft for this audio</strong>
              <span>Get a first draft of {workerAssignment?.label ? workerAssignment.label.toLowerCase() : 'this audio'}, then copy it into Word or insert it into the editor below. Drafts use your TypeMyworDz credits: about {Math.max(1, Math.ceil(((workerAssignment?.end_seconds || 0) - (workerAssignment?.start_seconds || 0)) / 60) || 1)} credit{Math.max(1, Math.ceil(((workerAssignment?.end_seconds || 0) - (workerAssignment?.start_seconds || 0)) / 60) || 1) === 1 ? '' : 's'} for this {workerAssignment?.id && workerAssignment.id !== 'transcriber' ? 'part' : 'job'}. Generating it once is charged once.</span>
              {!(aiDraftLocal || selectedJob.ai_draft) && <div><button type="button" disabled={aiDraftBusy} onClick={requestAiDraft}>{aiDraftBusy ? 'Preparing your formatted draft…' : 'Get AI formatted draft'}</button></div>}
              {(aiDraftLocal || selectedJob.ai_draft) && <>
                <div style={{ whiteSpace: 'pre-wrap', maxHeight: 280, overflow: 'auto', background: '#fafbfa', border: '1px solid #e5e9e5', borderRadius: 6, padding: 12, fontSize: 14, lineHeight: '100%' }}>{aiDraftLocal || selectedJob.ai_draft}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" onClick={async () => { try { await copyForWord(aiDraftLocal || selectedJob.ai_draft); showMessage?.('Draft copied for Word with tabs and single spacing.', 'success'); } catch { showMessage?.('Copy failed. Select the text and copy it manually.', 'error'); } }}>Copy for Word</button>
                  <button type="button" onClick={() => { editorRef.current?.insertText(aiDraftLocal || selectedJob.ai_draft); showMessage?.('Draft inserted into the editor.', 'success'); }}>Insert into editor</button>
                </div>
              </>}
            </div>}
            {mode === 'worker' && workerAssignmentActive && <div className="tm-human-reference-card" style={{ display: 'grid', gap: 6 }}>
              <strong>Your reference documents</strong>
              <span>Open these while you work.</span>
              <div className="tm-human-reference-list">
                {selectedJob.job_type !== 'pdf_job' && <a href="/guidelines" target="_blank" rel="noopener noreferrer">TypeMyworDz General Guidelines (opens in a new tab)</a>}
                <button type="button" onClick={() => downloadProtectedFile('/human-transcription/trainee/training/materials/formatting-default.docx', 'TypeMyworDz Default Document settings.docx', 'The default document settings file could not be downloaded.')}>Download: TypeMyworDz Default Document settings</button>
              </div>
              <span style={{ fontSize: 12, color: '#7b857d' }}>Reminder: create your draft with the TypeMyworDz AI above and edit it in Word. Work done without an in-app AI formatted draft may be declined.</span>
            </div>}
            {!(mode === 'worker' && workerTab === 'available') && selectedJob.instruction_attachments?.length > 0 && <div className="tm-human-reference-card"><strong>Reference files from the client</strong><span>Use these notes, spellings, and supporting documents while working.</span><div className="tm-human-reference-list">{selectedJob.instruction_attachments.map((item, index) => <button type="button" key={`${item.name}-${index}`} onClick={() => downloadProtectedFile(`/human-transcription/jobs/${selectedJob.id}/instruction/${index}`, item.name, 'The reference file could not be downloaded.')}>Download: {item.name}</button>)}</div></div>}
            {mode === 'worker' && workerAssignment?.role === 'proofreader' && (selectedJob.proofreader_parts || []).length > 0 && (
              <div className="tm-human-reference-card tm-proofreader-source-parts">
                <strong>Submitted parts</strong>
                <span>All submitted parts are already combined in the editor below. You can also download each part here.</span>
                <div className="tm-human-reference-list">
                  {selectedJob.proofreader_parts.map((part) => (
                    <div className="tm-proofreader-source-part" key={part.id}>
                      <strong>{part.label}</strong>
                      {part.transcript?.trim() && <button type="button" onClick={() => downloadProtectedFile(`/human-transcription/jobs/${selectedJob.id}/segments/${encodeURIComponent(part.id)}/transcript-download`, `${part.id}-transcript.txt`, `${part.label} transcript could not be downloaded.`)}>Download transcript (.txt)</button>}
                      {part.final_attachment && <button type="button" onClick={() => downloadProtectedFile(`/human-transcription/jobs/${selectedJob.id}/segments/${encodeURIComponent(part.id)}/attachment`, part.final_attachment.name, `${part.label} finished file could not be downloaded.`)}>Download finished file: {part.final_attachment.name}</button>}
                      {!part.transcript?.trim() && !part.final_attachment && <small>No transcript text or attachment was saved for this part.</small>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {mode === 'worker' && workerAssignmentActive && workerAssignment?.role === 'proofreader' && (selectedJob.proofreader_parts || []).length > 0 && (
              <div className="tm-human-reference-card tm-proofreader-ratings">
                <strong>Rate the parts (optional)</strong>
                <span>When you finish, you can suggest a rating for each part. It is not registered: an admin sees your suggestion and decides whether to apply it.</span>
                <div style={{ display: 'grid', gap: 8 }}>
                  {selectedJob.proofreader_parts.map((part) => {
                    const mine = proofRatings[part.id] || selectedJob.my_suggested_ratings?.[part.id] || {};
                    return (
                      <div key={part.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                        <strong style={{ minWidth: 150 }}>{part.label}{part.author_label ? ` by ${part.author_label}` : ''}</strong>
                        <select aria-label={`Rating for ${part.label}`} value={mine.rating || ''} onChange={(event) => setProofRatings((current) => ({ ...current, [part.id]: { ...mine, rating: event.target.value } }))}>
                          <option value="">No rating</option>
                          <option value="5">5 · excellent</option><option value="4">4 · strong</option><option value="3">3 · acceptable</option><option value="2">2 · needs work</option><option value="1">1 · poor</option>
                        </select>
                        <input aria-label={`Note for ${part.label}`} style={{ flex: '1 1 200px' }} placeholder="Short note (optional)" value={mine.note || ''} onChange={(event) => setProofRatings((current) => ({ ...current, [part.id]: { ...mine, note: event.target.value } }))} />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {!(mode === 'worker' && workerTab === 'available') && selectedJob.final_attachment && workerAssignment?.role !== 'proofreader' && <div className="tm-human-reference-card"><strong>Finished file from the worker</strong><span>Submitted instead of, or alongside, the shared editor text.</span><div className="tm-human-reference-list"><button type="button" onClick={() => downloadProtectedFile(`/human-transcription/jobs/${selectedJob.id}/final-attachment`, selectedJob.final_attachment.name, 'The finished file could not be downloaded.')}>Download: {selectedJob.final_attachment.name}</button></div></div>}

            {!(mode === 'worker' && workerTab === 'available') && (
            <div className="tm-human-editor-card">
              <div className="tm-human-editor-head"><div><strong>{selectedJob.job_type === 'pdf_job' ? 'Image transcription draft' : 'Shared proofreading editor'}</strong><span>{selectedJob.job_type === 'pdf_job' ? 'Enter your checked transcript here or attach your completed Word document.' : 'The same working area is used by the worker, admin and client.'}</span></div><div className="tm-human-editor-ad">Need a first draft or a quick answer? <button type="button" onClick={() => showMessage?.('Ask TypeMyworDz opens from the left navigation.', 'success')}>Use Ask TypeMyworDz</button></div></div>
              {mode === 'worker' && workerAssignmentActive && selectedJob.job_type !== 'pdf_job' && <div className="tm-research-notes-warning" role="note"><strong>Keep your research notes.</strong> Do not delete the research notes at the end of your work when you submit. The proofreader and admin need them to check your spellings.</div>}
              {mode === 'worker' && workerAssignmentActive ? (
                <WordLikeEditor
                  key={draftAssignmentKey}
                  ref={editorRef}
                  parts={workerAssignment?.role === 'proofreader' && selectedJob.proofreader_use_combined_transcript !== true ? (selectedJob.proofreader_parts || []) : null}
                  initialHtml={selectedJob.transcript_html || ''}
                  initialText={selectedJob.transcript || ''}
                  fileName={selectedJob.job_name || selectedJob.title || 'transcript'}
                  onChange={(text, html) => { setEditorText(text); setEditorHtml(html); }}
                />
              ) : (
              <FinalTranscriptView
                job={selectedJob}
                showMessage={showMessage}
                editable={mode === 'admin' || mode === 'client'}
                editorRef={editorRef}
                onChange={(text, html) => { setEditorText(text); setEditorHtml(html); }}
                onSave={saveSharedTranscript}
                saving={busy}
              />
              )}
              {mode === 'worker' && workerAssignmentActive && <div className="tm-human-submit-row">
                <span>{selectedJob.job_type === 'pdf_job' ? 'Finished? Submit your transcription.' : 'Finished? Check that your research notes are still at the end of the text, then submit.'}</span>
                {renderSubmitButton('bottom')}
              </div>}
              <p className="tm-human-editor-note">{selectedJob.job_type === 'pdf_job' ? 'Always use Gemini for image transcription, check the draft against the image, then complete and attach your Word document.' : 'AI tools can help with first drafts and questions, but the final human release stays under admin review.'}</p>
            </div>
            )}

            {mode === 'client' && <div className="tm-human-chat-card tm-human-client-conversation-note" role="note">
              <strong>Need help with this job?</strong>
              <p>Job conversations are reserved for the TypeMyworDz team and assigned workers. To contact us about your request, send a direct message from Notifications.</p>
            </div>}
            {mode !== 'client' && !(mode === 'worker' && workerTab === 'available') && <div className="tm-human-chat-card">
              <div className="tm-human-chat-head">
                <div><strong>Worker conversation</strong><span>{mode === 'admin' ? 'Admins and assigned workers only. Contact clients separately.' : 'You and the TypeMyworDz admin team. Clients are never part of this thread.'}</span></div>
                <span className="tm-human-live-dot">Live</span>
              </div>
              {mode === 'admin' && !jobHasAssignedWorker ? (
                <div className="tm-human-empty">The worker conversation opens after an approved worker claims a job or part.</div>
              ) : <>
                <div className="tm-human-messages">{messages.map((item) => {
                  const isMine = item.sender_uid === currentUser?.uid;
                  const label = item.sender_role === 'admin' ? 'TypeMyworDz admin' : isMine ? 'You' : 'Assigned worker';
                  return <article key={item.id} className="tm-human-message"><div><strong>{label}</strong><time>{moneylessDate(item.createdAt)}</time></div>{isMine && <span className={`tm-human-message-receipt${item.read_by_role ? ' is-read' : ''}`}>{item.read_by_role ? `Read by ${item.read_by_role}` : 'Not read yet'}</span>}{item.message && <p>{item.message}</p>}{item.attachment && <button type="button" className="tm-human-attachment-link" onClick={() => downloadAttachment(item)}>Download: {item.attachment.name}</button>}</article>;
                })}{!messages.length && <div className="tm-human-empty">No messages yet. Use this thread for job details between admins and assigned workers.</div>}</div>
                <form className="tm-human-message-form" onSubmit={sendMessage}>
                  <textarea value={messageText} onChange={(event) => setMessageText(event.target.value)} onKeyDown={handleMessageKeyDown} placeholder={mode === 'admin' ? 'Write to the assigned worker or workers' : 'Write to the TypeMyworDz admin team'} rows={2} aria-label="Job conversation message" />
                  {messageFile && <div className="tm-human-attachment-preview" role="status" aria-live="polite"><span><strong>Attached:</strong> {messageFile.name}{formatAttachmentSize(messageFile.size) ? ` · ${formatAttachmentSize(messageFile.size)}` : ''}</span><button type="button" onClick={() => setMessageFile(null)} aria-label={`Remove ${messageFile.name}`}>Remove</button></div>}
                  <div className="tm-human-message-actions"><label className="tm-human-attach" title="Attach any file" aria-label="Attach any file"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 3.5h8l3 3V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z"/><path d="M15 3.5V7h3M9 11h6M9 15h6"/></svg><input type="file" onChange={(event) => setMessageFile(event.target.files?.[0] || null)} /></label><span className="tm-human-message-hint">Enter to send · Shift+Enter for a new line</span><button type="submit" disabled={busy || (!messageText.trim() && !messageFile)}>Send</button></div>
                </form>
              </>}
            </div>}
          </>}
        </div>
      </div>
      </>
      )}
    </section>
  );
}

function AdminTranscriberRatePanel({ request, showMessage }) {
  const [rate, setRate] = useState('30');
  const [policy, setPolicy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadRate = useCallback(async () => {
    setLoading(true);
    try {
      const data = await request('/human-transcription/admin/rates');
      setRate(String(data.transcriber_rate_kes_per_minute || 30));
      setPolicy(data);
    } catch (error) {
      showMessage?.(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [request, showMessage]);

  useEffect(() => { loadRate(); }, [loadRate]);

  const saveRate = async (event) => {
    event.preventDefault();
    const value = Number(rate);
    const minimum = Number(policy?.minimum_rate_kes_per_minute || 1);
    const maximum = Number(policy?.maximum_rate_kes_per_minute || 500);
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
      showMessage?.(`Enter a whole-number rate from KES ${minimum} to KES ${maximum} per minute.`, 'error');
      return;
    }
    if (value === Number(policy?.transcriber_rate_kes_per_minute)) return;
    if (!window.confirm(`Change standard transcription pay to KES ${value} per audio minute? This applies to new jobs only; existing job quotes will not change.`)) return;

    setSaving(true);
    try {
      const data = await request('/human-transcription/admin/rates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ transcriber_rate_kes: String(value) }),
      });
      setRate(String(data.transcriber_rate_kes_per_minute));
      setPolicy((previous) => ({ ...previous, ...data }));
      showMessage?.(`Standard transcription pay is now KES ${data.transcriber_rate_kes_per_minute} per audio minute for new jobs.`, 'success');
    } catch (error) {
      showMessage?.(error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="tm-admin-rate-panel">
      <div className="tm-human-chat-card">
        <div className="tm-human-chat-head"><div><strong>Worker rates</strong><span>Set standard transcription pay without a code change.</span></div><span className="tm-human-live-dot">KES</span></div>
        {loading ? <div className="tm-human-empty">Loading current rates…</div> : (
          <form className="tm-admin-rate-form" onSubmit={saveRate}>
            <div className="tm-admin-rate-main">
              <label htmlFor="tm-standard-transcriber-rate">Standard transcription</label>
              <div className="tm-admin-rate-input-row">
                <span>KES</span>
                <input id="tm-standard-transcriber-rate" type="number" min={policy?.minimum_rate_kes_per_minute || 1} max={policy?.maximum_rate_kes_per_minute || 500} step="1" value={rate} disabled={!policy} onChange={(event) => setRate(event.target.value)} />
                <span>per audio minute</span>
              </div>
              <small>Applies to new Human Work requests. Existing jobs keep the rate saved in their quote.</small>
            </div>
            <div className="tm-admin-rate-reference">
              <div><span>Rush or difficult transcription</span><strong>KES {policy?.rush_rate_kes_per_minute ?? 38} / min</strong></div>
              <div><span>Proofreading</span><strong>KES {policy?.proofreading_rate_kes_per_minute ?? 10} / min</strong></div>
            </div>
            <div className="tm-admin-rate-actions">
              <button type="submit" disabled={saving || loading || !policy}>{saving ? 'Saving…' : 'Save rate'}</button>
              <button type="button" onClick={loadRate} disabled={saving || loading}>Reload</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function AdminJobCleanupPanel({ request, showMessage }) {
  const [range, setRange] = useState({ start_date: '', end_date: '' });
  const [jobs, setJobs] = useState([]);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [failures, setFailures] = useState([]);

  const loadCandidates = async () => {
    if (!range.start_date || !range.end_date) {
      showMessage?.('Choose both dates to review completed jobs.', 'error');
      return;
    }
    setLoading(true);
    setFailures([]);
    try {
      const params = new URLSearchParams(range);
      const payload = await request(`/api/admin/human-jobs/cleanup-candidates?${params.toString()}`);
      setJobs(payload.jobs || []);
      setSelectedIds(new Set());
    } catch (error) {
      showMessage?.(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const toggleJob = (jobId) => setSelectedIds((previous) => {
    const next = new Set(previous);
    if (next.has(jobId)) next.delete(jobId); else next.add(jobId);
    return next;
  });

  const toggleAll = () => setSelectedIds((previous) => previous.size === jobs.length ? new Set() : new Set(jobs.map((job) => job.job_id)));

  const deleteSelected = async () => {
    const jobIds = [...selectedIds];
    if (!jobIds.length) return;
    const confirmed = window.confirm(`Permanently delete ${jobIds.length} selected released/cancelled job${jobIds.length === 1 ? '' : 's'} and their stored files and messages? Worker earnings and payment history will be kept. This cannot be undone.`);
    if (!confirmed) return;
    setDeleting(true);
    try {
      const payload = await request('/api/admin/human-jobs/bulk-cleanup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...range, job_ids: jobIds }),
      });
      setFailures(payload.failures || []);
      setSelectedIds(new Set());
      showMessage?.(`${payload.deleted_count || 0} job${payload.deleted_count === 1 ? '' : 's'} deleted; payment history preserved.${payload.failure_count ? ` ${payload.failure_count} need review.` : ''}`, payload.failure_count ? 'error' : 'success');
      await loadCandidates();
    } catch (error) {
      showMessage?.(error.message, 'error');
    } finally {
      setDeleting(false);
    }
  };

  const allSelected = jobs.length > 0 && selectedIds.size === jobs.length;

  return (
    <div className="tm-admin-job-cleanup">
      <div className="tm-human-chat-card">
        <div className="tm-human-chat-head"><div><strong>Remove old job files</strong><span>Choose a date range, review eligible work, then select only what you want to remove.</span></div></div>
        <p className="tm-human-cleanup-note">Only released or cancelled jobs appear here. Their job records, messages, and stored files are deleted; worker earnings, deductions, invoices, and payment history stay available.</p>
        <div className="tm-admin-payout-filters tm-admin-cleanup-filters">
          <label>From<input type="date" value={range.start_date} onChange={(event) => { setRange((previous) => ({ ...previous, start_date: event.target.value })); setJobs([]); setSelectedIds(new Set()); }} /></label>
          <label>To<input type="date" value={range.end_date} onChange={(event) => { setRange((previous) => ({ ...previous, end_date: event.target.value })); setJobs([]); setSelectedIds(new Set()); }} /></label>
          <button type="button" className="tm-admin-payout-search-btn" onClick={loadCandidates} disabled={loading || deleting}>{loading ? 'Checking…' : 'Find eligible jobs'}</button>
        </div>
        {jobs.length > 0 && <>
          <div className="tm-admin-cleanup-toolbar">
            <label><input type="checkbox" checked={allSelected} onChange={toggleAll} /> Select all {jobs.length} eligible jobs</label>
            <span>{selectedIds.size} selected</span>
            <button type="button" onClick={deleteSelected} disabled={!selectedIds.size || deleting}>{deleting ? 'Deleting…' : selectedIds.size ? `Delete ${selectedIds.size} selected` : 'Delete selected'}</button>
          </div>
          <div className="tm-admin-cleanup-table-wrap">
            <table className="tm-admin-payout-table tm-admin-cleanup-table">
              <thead><tr><th>Select</th><th>Job</th><th>Last updated</th><th>Status</th><th>Worker earnings kept</th></tr></thead>
              <tbody>{jobs.map((job) => <tr key={job.job_id}>
                <td><input type="checkbox" aria-label={`Select job ${job.job_number}`} checked={selectedIds.has(job.job_id)} onChange={() => toggleJob(job.job_id)} /></td>
                <td>{job.job_number}</td><td>{moneylessDate(job.cleanup_date)}</td><td>{job.status}</td><td>{job.earnings_preserved}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </>}
        {!loading && range.start_date && range.end_date && jobs.length === 0 && <p className="tm-human-empty">No released or cancelled jobs were found in that date range.</p>}
        {failures.length > 0 && <div className="tm-admin-cleanup-failures" role="status"><strong>Some jobs need review</strong>{failures.map((failure) => <p key={failure.job_id}>{failure.job_id}: {failure.error}</p>)}</div>}
      </div>
    </div>
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
  const [workerPaymentProfile, setWorkerPaymentProfile] = useState(null);
  const [loadingWorkerProfile, setLoadingWorkerProfile] = useState(false);
  const [deductionTarget, setDeductionTarget] = useState('');
  const [deductionAmount, setDeductionAmount] = useState('');
  const [deductionReason, setDeductionReason] = useState('');
  const [savingDeduction, setSavingDeduction] = useState(false);

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

  const viewWorkerPaymentProfile = async (workerUid) => {
    if (!workerUid) return;
    setLoadingWorkerProfile(true);
    try {
      const payload = await request(`/human-transcription/admin/workers/${encodeURIComponent(workerUid)}/payment-profile`);
      setWorkerPaymentProfile(payload);
    } catch (error) {
      showMessage?.(error.message, 'error');
    } finally {
      setLoadingWorkerProfile(false);
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

  const paymentRowKey = (row) => `${row.job_id}:${row.source}:${row.segment_id || ''}`;
  const beginDeduction = (row) => {
    setDeductionTarget(paymentRowKey(row));
    setDeductionAmount('');
    setDeductionReason('');
  };
  const recordDeduction = async (event, row) => {
    event.preventDefault();
    const amount = Number(deductionAmount);
    if (!Number.isInteger(amount) || amount <= 0 || !deductionReason.trim()) {
      showMessage?.('Enter a whole-number amount and a reason for the adjustment.', 'error');
      return;
    }
    if (!window.confirm(`Record a KES ${amount} deduction from ${row.worker_name || row.worker_email} for this job? The reason will be saved in the payment audit.`)) return;
    setSavingDeduction(true);
    try {
      const result = await request(`/api/admin/human-jobs/${encodeURIComponent(row.job_id)}/payment-deduction`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: row.source, segment_id: row.segment_id, amount_kes: amount, reason: deductionReason.trim() }),
      });
      showMessage?.(`Deduction recorded. Remaining job pay: KES ${result.amount_kes}.`, 'success');
      setDeductionTarget('');
      setDeductionAmount('');
      setDeductionReason('');
      await Promise.all([runSearch(), loadInvoices()]);
    } catch (error) {
      showMessage?.(error.message, 'error');
    } finally {
      setSavingDeduction(false);
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
          <button type="button" className="tm-admin-payout-search-btn" onClick={() => viewWorkerPaymentProfile(filters.worker_uid)} disabled={!filters.worker_uid || loadingWorkerProfile}>{loadingWorkerProfile ? 'Loading details…' : 'View M-Pesa details'}</button>
          <button type="button" className="tm-admin-payout-search-btn" onClick={runSearch} disabled={searching}>{searching ? 'Searching…' : 'Search'}</button>
        </div>
        {searchResult && (
          <div className="tm-admin-payout-results">
            <div className="tm-worker-payment-totals">
              <div><small>Jobs found</small><strong>{searchResult.job_count || 0}</strong></div>
              <div><small>Total minutes</small><strong>{searchResult.total_minutes || 0}</strong></div>
              <div><small>Total net pay</small><strong>KES {searchResult.total_amount_kes || 0}</strong><span className="tm-worker-payment-breakdown">Transcription KES {searchResult.transcription_amount_kes || 0} · Proofreading KES {searchResult.proofreading_amount_kes || 0} · PDF KES {searchResult.pdf_amount_kes || 0}{searchResult.total_deduction_kes > 0 ? ` · KES ${searchResult.total_deduction_kes} deducted` : ''}</span></div>
            </div>
            {!(searchResult.jobs || []).length ? <p className="tm-human-empty">No completed jobs match that search.</p> : (
              <table className="tm-admin-payout-table">
                <thead><tr><th>Worker</th><th>Work</th><th>Job</th><th>Minutes</th><th>Amount</th><th>Status</th><th>Completed</th><th>Adjustment</th></tr></thead>
                <tbody>
                  {searchResult.jobs.map((row) => {
                    const rowKey = paymentRowKey(row);
                    return <React.Fragment key={rowKey}>
                      <tr>
                        <td>{row.worker_name || row.worker_email}</td>
                        <td>{row.role}</td>
                        <td>{row.job_id.slice(0, 8)}</td>
                        <td>{row.minutes}</td>
                        <td>KES {row.amount_kes}{row.deduction_kes > 0 && <small className="tm-admin-deduction-note">KES {row.deduction_kes} deducted · {row.deduction_reason}</small>}</td>
                        <td>{PAYOUT_STATUS_LABELS[row.payout_status] || row.payout_status}</td>
                        <td>{moneylessDate(row.completed_at)}</td>
                        <td>{row.payout_status !== 'paid' && row.amount_kes > 0 && <button type="button" onClick={() => deductionTarget === rowKey ? setDeductionTarget('') : beginDeduction(row)}>{deductionTarget === rowKey ? 'Cancel' : 'Deduct'}</button>}</td>
                      </tr>
                      {deductionTarget === rowKey && <tr className="tm-admin-deduction-row"><td colSpan="8"><form onSubmit={(event) => recordDeduction(event, row)}>
                        <strong>Record an unpaid-job deduction</strong>
                        <span>Gross KES {row.gross_amount_kes || row.amount_kes}; already deducted KES {row.deduction_kes || 0}; remaining KES {Math.max(0, (row.gross_amount_kes || row.amount_kes) - (row.deduction_kes || 0))}.</span>
                        <label>Amount (KES)<input type="number" min="1" max={Math.max(1, (row.gross_amount_kes || row.amount_kes) - (row.deduction_kes || 0))} step="1" required value={deductionAmount} onChange={(event) => setDeductionAmount(event.target.value)} /></label>
                        <label>Reason<input type="text" maxLength="500" required value={deductionReason} onChange={(event) => setDeductionReason(event.target.value)} placeholder="For example, quality adjustment" /></label>
                        <button type="submit" disabled={savingDeduction || !deductionAmount || !deductionReason.trim()}>{savingDeduction ? 'Saving…' : 'Save deduction'}</button>
                      </form></td></tr>}
                    </React.Fragment>;
                  })}
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
            <thead><tr><th>Worker</th><th>Period</th><th>Minutes</th><th>Transcription</th><th>Proofreading</th><th>PDF</th><th>Total</th><th>Status</th><th>Payment details</th><th></th></tr></thead>
            <tbody>
              {invoices.payouts.map((payout) => (
                <tr key={payout.payout_id}>
                  <td>{payout.worker_name || payout.worker_email}</td>
                  <td>{payout.period_label} <small>({payout.period_label?.endsWith('-A') ? 'pays on the 15th' : 'pays at month end'})</small></td>
                  <td>{payout.total_minutes}</td>
                  <td>KES {payout.transcription_amount_kes || 0}<small>{payout.transcription_minutes || 0} min</small></td>
                  <td>KES {payout.proofreading_amount_kes || 0}<small>{payout.proofreading_minutes || 0} min</small></td>
                  <td>KES {payout.pdf_amount_kes || 0}<small>PDF jobs</small></td>
                  <td>KES {payout.total_amount_kes}{payout.total_deduction_kes > 0 && <small>KES {payout.total_deduction_kes} deducted</small>}</td>
                  <td>{payout.status === 'paid' ? `Paid ${moneylessDate(payout.paid_at)}` : 'Pending'}</td>
                  <td><button type="button" onClick={() => viewWorkerPaymentProfile(payout.worker_uid)} disabled={loadingWorkerProfile}>View M-Pesa details</button></td>
                  <td>{payout.status !== 'paid' && <button type="button" onClick={() => markPaid(payout.payout_id)} disabled={busyPayoutId === payout.payout_id}>Mark as paid</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {loadingWorkerProfile && <div className="tm-human-chat-card tm-admin-worker-payout-details">Loading worker payment details…</div>}
      {workerPaymentProfile && !loadingWorkerProfile && (
        <div className="tm-human-chat-card tm-admin-worker-payout-details" role="region" aria-label="Worker payment details">
          <div className="tm-human-chat-head"><div><strong>{workerPaymentProfile.worker_name || workerPaymentProfile.worker_email || 'Worker'} · M-Pesa details</strong><span>Use only to make the worker’s approved payout.</span></div><button type="button" onClick={() => setWorkerPaymentProfile(null)}>Close</button></div>
          <dl><div><dt>Official name from trainee registration</dt><dd>{workerPaymentProfile.official_id_name || 'Not recorded'}</dd></div><div><dt>M-Pesa account name</dt><dd>{workerPaymentProfile.mpesa_registered_name || 'Not provided'}</dd></div><div><dt>M-Pesa number</dt><dd>{workerPaymentProfile.mpesa_number || 'Not provided'}</dd></div></dl>
        </div>
      )}
    </div>
  );
}
