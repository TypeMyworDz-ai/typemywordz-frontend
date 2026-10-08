import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import FinalTranscriptView from './FinalTranscriptView';
import PdfJobsAdminPanel from './PdfJobsAdminPanel';
import LetterJobsAdminPanel from './LetterJobsAdminPanel';
import AdminAudioJobsPanel from './AdminAudioJobsPanel';
import { ImageJobQueueActions, LetterJobQueueActions } from './ImageAndLetterQueueActions';
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

const nairobiDateIso = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};
const kesThree = (value) => `KES ${Number(value || 0).toFixed(3)}`;
const subadminCategoryLabel = (category) => ({
  audio_human: 'Human audio', audio_ai: 'AI audio', image_human: 'Human image', image_ai: 'AI image',
}[category] || category || 'Human Work');

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
const workerDraftCreditEstimate = (job, assignment) => {
  const finiteNonnegative = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  };
  const start = finiteNonnegative(assignment?.start_seconds);
  const fallbackEnd = finiteNonnegative(job?.seconds) || finiteNonnegative(job?.minutes) * 60;
  const end = finiteNonnegative(assignment?.end_seconds ?? fallbackEnd);
  const seconds = Math.max(0, end - start);
  const audioMinutes = Math.max(1, Math.ceil(seconds / 60));
  return { audioMinutes, totalCredits: audioMinutes + 1 };
};

const PAYOUT_STATUS_LABELS = { accruing: 'Accruing this half', invoiced: 'Pending payout', paid: 'Paid', all: 'All' };
const JOB_TYPE_LABELS = { general_job: 'General Job', template_job: 'Template Job', letter_job: 'Letter Job', pdf_job: 'PDF image', human_transcription: 'Human transcription' };
const jobTypeLabel = (job) => JOB_TYPE_LABELS[job?.job_type] || (job?.source_type === 'ai_proofreading' ? 'AI transcript proofreading' : 'Human transcription');
const adminReviewerComplete = (job) => {
  const choice = String(job?.reviewer_choice || '').toLowerCase();
  const proofreaderDone = job?.proofreader_status === 'submitted';
  if (job?.job_type === 'letter_job') return choice === 'human' ? proofreaderDone : choice === 'ai' && job?.letter_ai_review_status === 'completed';
  if (job?.job_type === 'pdf_job') {
    if (!job?.pdf_review) return true;
    return choice === 'human'
      ? proofreaderDone || (Boolean(job?.worker_uid) && job?.reviewer_status === 'completed')
      : choice === 'ai' && job?.ai_agent_status === 'submitted';
  }
  if (choice === 'human') return proofreaderDone;
  return choice === 'ai' && job?.ai_review_applied === true && Boolean(String(job?.ai_review?.combined_text || '').trim());
};
const canFinishAdminAiDraft = (job) => {
  if (!job?.admin_uploaded || job?.ai_agent_status !== 'submitted') return false;
  if (job?.reviewer_choice === 'human' || ['assigned', 'in_progress', 'submitted'].includes(job?.proofreader_status)) return false;
  if (!['submitted', 'proofreading_available'].includes(job?.status)) return false;
  const segments = Array.isArray(job?.segments) ? job.segments : [];
  if (segments.length) return segments.every((part) => part?.status === 'submitted' && Boolean(String(part?.transcript || '').trim()));
  return job?.job_type === 'pdf_job' && Boolean(job?.pdf_review) && Boolean(String(job?.transcript || '').trim());
};
const canFinishHumanJob = (job) => {
  if (!job || !['submitted', 'proofreading_available'].includes(job.status)) return false;
  if (['assigned', 'in_progress'].includes(job.proofreader_status)) return false;
  if (['queued', 'processing'].includes(job.reviewer_status) || ['queued', 'processing'].includes(job.letter_ai_review_status)) return false;
  const segments = Array.isArray(job.segments) ? job.segments : [];
  if (segments.length) return segments.every((part) => part?.status === 'submitted' && (Boolean(String(part?.transcript || part?.transcript_html || '').trim()) || Boolean(part?.final_attachment?.storage_path)));
  return Boolean(String(job.transcript || job.transcript_html || '').trim() || job.final_attachment?.storage_path);
};
const finishIsInternal = (job) => Boolean(job?.admin_uploaded === true || ['pdf_job', 'letter_job'].includes(job?.job_type));

const ADMIN_QUEUE_LANES = [
  { id: 'needs_action', label: 'Needs action' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'submitted', label: 'Submitted' },
  { id: 'finished', label: 'Finished' },
];
const adminQueueLaneFor = (job) => {
  const status = String(job?.status || '').toLowerCase();
  if (job?.admin_finishedAt) return 'finished';
  if (['submitted', 'client_review'].includes(status)) return 'submitted';
  if (['released', 'cancelled'].includes(status)) return 'finished';
  if (['assigned', 'in_progress', 'split_assigned', 'split_in_progress', 'proofreading_assigned', 'proofreading_in_progress'].includes(status)) return 'in_progress';
  return 'needs_action';
};

const EMPTY_JOBS = [];

export default function HumanJobWorkspace({ mode = 'client', onBack, showMessage, initialJobId = '', onInitialJobHandled, restricted = false, ownerScope = 'mine', recordedAudioFile = null }) {
  const { currentUser, refreshUserProfile } = useAuth();
  const [jobsStore, setJobsStore] = useState({});
  const [workers, setWorkers] = useState([]);
  const [adminScheduledNow, setAdminScheduledNow] = useState(null);
  const [selectedId, setSelectedId] = useState('');
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [messageFile, setMessageFile] = useState(null);
  const [finalAttachment, setFinalAttachment] = useState(null);
  const [proofRatings, setProofRatings] = useState({});
  const [adminPartRatings, setAdminPartRatings] = useState({});
  const [editorText, setEditorText] = useState('');
  const [editorHtml, setEditorHtml] = useState('');
  const [aiDraftBusy, setAiDraftBusy] = useState(false);
  const [aiDraftLocal, setAiDraftLocal] = useState('');
  const [aiProofreadBusy, setAiProofreadBusy] = useState(false);
  const [aiProofreadLocal, setAiProofreadLocal] = useState('');
  const [wholeWorker, setWholeWorker] = useState('');
  const [wholeConfirm, setWholeConfirm] = useState(false);
  const [finishJobConfirm, setFinishJobConfirm] = useState(false);
  const [aiWholeConfirm, setAiWholeConfirm] = useState(false);
  const [aiWholeAgent, setAiWholeAgent] = useState('');
  const [templateAgentGuidelines, setTemplateAgentGuidelines] = useState('');
  const [templateAgentFiles, setTemplateAgentFiles] = useState([]);
  const editorRef = useRef(null);
  const [feedback, setFeedback] = useState('');
  const [rating, setRating] = useState('5');
  const [proofreaderWorker, setProofreaderWorker] = useState('');
  const [aiAgentSegment, setAiAgentSegment] = useState('');
  const [workerAvailable, setWorkerAvailable] = useState(false);
  const [availabilitySaving, setAvailabilitySaving] = useState(false);
  const [extensionMinutes, setExtensionMinutes] = useState('5');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [audioUrl, setAudioUrl] = useState('');
  const [pdfImageUrl, setPdfImageUrl] = useState('');
  const [pdfImageError, setPdfImageError] = useState('');
  const [pdfImageUrls, setPdfImageUrls] = useState([]);
  // Job-specific conversation access is admin/worker only. Client questions
  // use the separate direct-message channel.
  const [workerTab, setWorkerTab] = useState('available');
  const [workerBoardInfo, setWorkerBoardInfo] = useState({ canView: true, canClaim: true, activeAssignment: false, blockReason: '', deadlineReturns: 0, deadlineWarning: false });
  const [starterWorker, setStarterWorker] = useState('');
  const [starterSegment, setStarterSegment] = useState('');
  const [paymentHistory, setPaymentHistory] = useState(null);
  const [adminTab, setAdminTab] = useState('queue');
  // Jobs are stored per scope so switching tabs never shows another tab's list.
  const jobsScope = mode === 'admin' ? (adminTab === 'archived' ? 'archived' : 'admin') : mode === 'worker' ? (workerTab === 'available' ? 'available' : workerTab === 'finished' ? 'finished' : 'assigned') : 'mine';
  const jobs = jobsStore[jobsScope] || EMPTY_JOBS;
  const scopeLoading = jobsStore[jobsScope] === undefined;
  const jobsScopeRef = useRef(jobsScope);
  jobsScopeRef.current = jobsScope;
  const busyRef = useRef(false);
  busyRef.current = busy;
  const adminEmail = (currentUser?.email || '').trim().toLowerCase();
  const isMainAdmin = adminEmail === 'typemywordz@gmail.com';
  const isHumanSubadmin = mode === 'admin' && !isMainAdmin && restricted && ['info@typemywordz.ai', 'gracenyaitara@gmail.com'].includes(adminEmail);
  const canManagePdfJobs = ['typemywordz@gmail.com', 'info@typemywordz.ai', 'gracenyaitara@gmail.com'].includes(adminEmail);
  const canManageLetterJobs = ['typemywordz@gmail.com', 'info@typemywordz.ai', 'gracenyaitara@gmail.com'].includes(adminEmail);
  const canAssignAiAgents = ['typemywordz@gmail.com', 'info@typemywordz.ai', 'gracenyaitara@gmail.com'].includes(adminEmail);
  const adminAssignableWorkers = workers.filter((worker) => (
    worker.approved !== false && (
      adminScheduledNow === true || (worker.call_in_active === true && worker.clocked_in === true && worker.online === true)
    )
  ));
  const [adminQueueLane, setAdminQueueLane] = useState('needs_action');
  const [adminQueueType, setAdminQueueType] = useState('all');
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [jobsFetchedAt, setJobsFetchedAt] = useState(() => Date.now());
  const [workerRatingSummary, setWorkerRatingSummary] = useState({ average: null, count: 0 });
  const draftAssignmentKeyRef = useRef('');
  const lastSyncErrorAtRef = useRef(0);
  const jobsRequestIdRef = useRef(0);
  const jobsAppliedIdRef = useRef(0);
  const pollInFlightRef = useRef(false);
  const handledInitialJobIdRef = useRef('');

  // The server tells us how many seconds are left as of the last refresh;
  // this just ticks the display down between refreshes so it never looks
  // frozen. loadJobs() re-syncs the true value from the server regularly.
  useEffect(() => {
    const interval = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const token = useCallback(() => currentUser?.getIdToken(), [currentUser]);
  const adminQueueMatchesType = useCallback((job) => {
    if (adminQueueType === 'all') return job.job_type !== 'letter_job';
    if (['general_job', 'template_job', 'letter_job'].includes(adminQueueType)) return job.job_type === adminQueueType;
    return (job.source_type || 'human_transcription') === adminQueueType;
  }, [adminQueueType]);
  const adminQueueCounts = useMemo(() => jobs.reduce((counts, job) => {
    if (adminQueueMatchesType(job)) counts[adminQueueLaneFor(job)] += 1;
    return counts;
  }, { needs_action: 0, in_progress: 0, submitted: 0, finished: 0 }), [adminQueueMatchesType, jobs]);
  const adminQueueJobs = useMemo(() => jobs.filter((job) =>
    adminQueueMatchesType(job) && adminQueueLaneFor(job) === adminQueueLane
  ), [adminQueueLane, adminQueueMatchesType, jobs]);
  const jobsForCurrentView = mode === 'admin' && adminTab === 'queue' ? adminQueueJobs : jobs;
  const selectedJob = useMemo(() => jobsForCurrentView.find((job) => job.id === selectedId) || jobsForCurrentView[0] || null, [jobsForCurrentView, selectedId]);
  const workerAssignment = selectedJob?.worker_assignment || null;
  const workerAssignmentActive = mode === 'worker' && ['assigned', 'in_progress'].includes(workerAssignment?.status);
  const workerDraftEstimate = workerDraftCreditEstimate(selectedJob, workerAssignment);
  const jobHasAssignedWorker = Boolean(selectedJob && (
    selectedJob.worker_uid || selectedJob.proofreader_uid || (selectedJob.assigned_worker_uids || []).length
    || (selectedJob.segments || []).some((part) => part?.worker_uid)
  ));
  const splitJob = ['dual', 'multi'].includes(String(selectedJob?.split_mode || '').toLowerCase());
  const canRateSubmittedWorker = mode === 'admin' && Boolean(selectedJob) && (
    splitJob
      ? (selectedJob.segments || []).some((part) => part.status === 'submitted' && part.worker_uid)
      : Boolean(selectedJob.worker_uid || (selectedJob.proofreader_status === 'submitted' && selectedJob.proofreader_uid))
        && ['submitted', 'client_review', 'client_approved', 'released'].includes(selectedJob.status)
  );
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
    } catch (error) {
      console.warn('Human Work request could not reach the server.', { path, error });
      throw new Error('This Human Work request could not reach the server. Check your connection and try again.');
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
    const scope = mode === 'admin' ? (adminTab === 'archived' ? 'archived' : 'admin') : mode === 'worker' ? (workerTab === 'available' ? 'available' : workerTab === 'finished' ? 'finished' : 'assigned') : 'mine';
    try {
      const payload = await request(`/human-transcription/jobs?scope=${scope}${mode === 'admin' && ownerScope === 'all' ? '&owner=all' : ''}`);
      // Only discard a response that is older than one already shown, or one
      // for a tab the user has since left. A slow poll never blocks newer data.
      if (requestId < jobsAppliedIdRef.current && scope === jobsScopeRef.current) return;
      jobsAppliedIdRef.current = Math.max(jobsAppliedIdRef.current, requestId);
      setJobsStore((previous) => ({ ...previous, [scope]: payload.jobs || [] }));
      if (scope !== jobsScopeRef.current) return;
      if (mode === 'worker') {
        if (payload.worker_rating_summary) setWorkerRatingSummary(payload.worker_rating_summary);
        setWorkerBoardInfo({
          canView: payload.worker_can_view_available !== false,
          canClaim: payload.worker_can_claim === true,
          activeAssignment: payload.worker_active_assignment === true,
          blockReason: payload.worker_claim_block_reason || '',
          deadlineReturns: Number(payload.worker_deadline_return_count || 0),
          deadlineWarning: payload.worker_deadline_warning === true,
        });
      }
      setJobsFetchedAt(Date.now());
      lastSyncErrorAtRef.current = 0;
    } catch (error) {
      if (mode === 'worker' && /available-work access|approved workers|training room/i.test(String(error.message || ''))) {
        refreshUserProfile().catch(() => {});
      }
      if (scope === jobsScopeRef.current && Date.now() - lastSyncErrorAtRef.current > 30000) {
        lastSyncErrorAtRef.current = Date.now();
        showMessage?.(error.message, 'error');
      }
    } finally {
      setLoading(false);
    }
  }, [adminTab, mode, ownerScope, refreshUserProfile, request, showMessage, workerTab]);

  // Upload panels announce new work so the queue refreshes at once instead of
  // waiting for the next background poll.
  useEffect(() => {
    const refreshNow = () => { loadJobs(); window.setTimeout(loadJobs, 1500); };
    window.addEventListener('tm-human-jobs-changed', refreshNow);
    return () => window.removeEventListener('tm-human-jobs-changed', refreshNow);
  }, [loadJobs]);

  const loadWorkers = useCallback(async () => {
    if (mode !== 'admin') return;
    try {
      const payload = await request('/human-transcription/workers');
      setWorkers(payload.workers || []);
      setAdminScheduledNow(payload.scheduled_now !== false);
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
      showMessage?.(nextAvailable ? 'You are marked online. Clock-in and shift rules still control work claims.' : 'You are marked offline. You can still clock in or out as needed.', 'success');
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
    if (mode !== 'admin') return undefined;
    const refreshWhenVisible = () => { if (document.visibilityState === 'visible') loadWorkers(); };
    const timer = window.setInterval(refreshWhenVisible, 15000);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refreshWhenVisible); };
  }, [mode, loadWorkers]);
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
      setAiProofreadLocal('');
      setAiProofreadBusy(false);
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
  const audioLocked = mode === 'worker' && Boolean(selectedJob?.audio_locked);
  const audioKey = audioJobId && hasAudio && !audioHidden && !audioLocked ? `${audioJobId}|${audioSegmentId}` : '';
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

  const pdfPageCount = Math.max(1, selectedJob?.pdf_images?.length || 1);
  useEffect(() => {
    let objectUrl = '';
    let cancelled = false;
    (async () => {
      if (!selectedJob?.id || selectedJob?.job_type !== 'pdf_job' || (mode === 'worker' && workerTab === 'available')) { setPdfImageUrl(''); setPdfImageUrls([]); setPdfImageError(''); return; }
      setPdfImageError('');
      const urls = [];
      try {
        const idToken = await token();
        const pageCount = pdfPageCount;
        for (let page = 1; page <= pageCount; page += 1) {
          const response = await fetch(`${BACKEND_URL}/human-transcription/jobs/${selectedJob.id}/image?page=${page}`, { headers: { Authorization: `Bearer ${idToken}` }, cache: 'no-store' });
          if (!response.ok) throw new Error('The source image could not be loaded.');
          urls.push(URL.createObjectURL(await response.blob()));
        }
        objectUrl = urls[0] || '';
        if (cancelled) { urls.forEach((url) => URL.revokeObjectURL(url)); return; }
        setPdfImageUrl(urls[0] || '');
        setPdfImageUrls(urls);
      } catch (error) { urls.forEach((url) => URL.revokeObjectURL(url)); if (!cancelled) { setPdfImageUrl(''); setPdfImageUrls([]); setPdfImageError(error.message || 'The source image could not be loaded.'); } }
    })();
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [selectedJob?.id, selectedJob?.job_type, pdfPageCount, token, mode, workerTab]);

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

  // Visible-tab polling keeps assignments, deadlines, submissions and
  // client review states in sync. Each poll starts only after the previous one
  // finished, so a slow server can never pile up overlapping requests.
  useEffect(() => {
    let stopped = false;
    let timer = null;
    const poll = async () => {
      if (stopped) return;
      if (document.visibilityState === 'visible' && !pollInFlightRef.current) {
        pollInFlightRef.current = true;
        try { await loadJobs(); } finally { pollInFlightRef.current = false; }
      }
      if (!stopped) timer = window.setTimeout(poll, 4000);
    };
    const wake = () => {
      if (document.visibilityState !== 'visible' || pollInFlightRef.current) return;
      window.clearTimeout(timer);
      poll();
    };
    timer = window.setTimeout(poll, 4000);
    window.addEventListener('focus', wake);
    document.addEventListener('visibilitychange', wake);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      window.removeEventListener('focus', wake);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [loadJobs]);

  // Every button shows a spinner as soon as it is clicked and keeps it until
  // the action it started finishes (the button re-enables) or about a second.
  const pendingButtons = useRef(new Set());
  const markButtonPending = (event) => {
    const button = event.target?.closest?.('button');
    if (!button || button.disabled || button.dataset.noPending || button.closest('.tm-human-job-row')) return;
    button.classList.add('tm-btn-pending');
    pendingButtons.current.add(button);
    const started = Date.now();
    const release = window.setInterval(() => {
      const elapsed = Date.now() - started;
      const waiting = (busyRef.current || button.disabled) && elapsed < 60000;
      if ((elapsed >= 700 && !waiting) || !button.isConnected) {
        window.clearInterval(release);
        button.classList.remove('tm-btn-pending');
        pendingButtons.current.delete(button);
      }
    }, 150);
  };

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

  const saveWorkerRatingAndNotes = async () => {
    if (!selectedJob || mode !== 'admin' || busy) return;
    const splitParts = splitJob
      ? (selectedJob.segments || []).filter((part) => part.status === 'submitted' && part.worker_uid)
      : [];
    const targets = splitJob
      ? splitParts.map((part) => ({
        segment_id: part.id,
        rating: Number(adminPartRatings[part.id]?.rating || selectedJob.part_ratings?.[part.id]?.rating || rating),
        note: String(adminPartRatings[part.id]?.note ?? selectedJob.part_ratings?.[part.id]?.note ?? '').trim(),
      }))
      : selectedJob.worker_uid
        ? [{ segment_id: '', rating: Number(rating), note: String(feedback || '').trim() }]
        : selectedJob.proofreader_status === 'submitted' && selectedJob.proofreader_uid
          ? [{ segment_id: 'proofreader', rating: Number(rating), note: String(feedback || '').trim() }]
          : [];
    if (!targets.length) {
      showMessage?.('There is no submitted worker assignment to rate yet.', 'error');
      return;
    }
    setBusy(true);
    try {
      for (const target of targets) {
        await request(`/human-transcription/jobs/${selectedJob.id}/rate-part`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(target),
        });
      }
      await loadJobs();
      showMessage?.('Worker rating and comments saved. Job status was not changed.', 'success');
    } catch (error) {
      showMessage?.(error.message || 'The worker rating could not be saved.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const finishJob = async () => {
    if (!selectedJob || busy || !canFinishHumanJob(selectedJob)) return;
    const internal = finishIsInternal(selectedJob);
    const successMessage = internal
      ? 'Job finished and moved to the Finished lane. No client charge or notification was issued.'
      : 'Admin proofreading is complete. The client has been notified; credits remain untouched until they approve.';
    const finished = await act(
      `/human-transcription/jobs/${selectedJob.id}/finish`,
      { method: 'POST' },
      successMessage,
    );
    if (finished) {
      setFinishJobConfirm(false);
      setAdminQueueLane('finished');
    }
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
    const letterJob = selectedJob.job_type === 'letter_job';
    const validLetterDocx = Boolean(finalAttachment && /\.docx$/i.test(finalAttachment.name || ''));
    const disabled = busy || (workerAssignment?.role === 'proofreader' && (selectedJob.proofreader_parts || []).some((part) => part.pending)) || (letterJob ? !validLetterDocx : (!editorText.trim() && !finalAttachment && !selectedJob.final_attachment));
    return <button type="button" className={`tm-human-submit-button${place === 'bottom' ? ' tm-human-submit-bottom' : ''}`} onClick={submitWorker} disabled={disabled}>Submit {letterJob ? 'finished letter' : workerAssignment?.role === 'proofreader' ? 'final work' : selectedJob.job_type === 'pdf_job' ? 'image transcription' : 'part'} for review</button>;
  };

  const claimWork = async (segmentId = '') => {
    const part = segmentId ? (selectedJob?.claimable_parts || []).find((item) => item.id === segmentId) : null;
    if (!selectedJob || busy || !selectedJob.can_claim || (part && part.can_claim === false)) return;
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
      showMessage?.('Open the shared editor first, then insert the proofread transcript.', 'error');
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

  const assignWholeFileAi = async (agentId, ids) => {
    if (busy || ids.length < 2) return;
    if (!window.confirm(`Give all ${ids.length} pages of this file to the AI agent as one job? Each page still gets its own private draft.`)) return;
    setBusy(true);
    let done = 0; const failed = [];
    for (const id of ids) {
      try {
        await request(`/human-transcription/jobs/${id}/ai-agent/assign`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent_id: agentId, batch_job_ids: ids }) });
        done += 1;
      } catch (error) { failed.push(error.message); }
    }
    await loadJobs();
    setBusy(false);
    showMessage?.(failed.length ? `${done} pages queued; ${failed.length} could not be queued (${failed[0]}).` : `All ${done} pages were queued for the AI agent.`, failed.length ? 'error' : 'success');
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

  const [unlockBusy, setUnlockBusy] = useState('');
  const unlockWorkerAudio = async (key) => {
    setUnlockBusy(key);
    try {
      await request(`/human-transcription/jobs/${selectedJob.id}/unlock-worker-audio`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) });
      showMessage?.('The recording is now open for the worker.', 'success');
      await loadJobs();
    } catch (error) { showMessage?.(error.message, 'error'); } finally { setUnlockBusy(''); }
  };

  const requestAiDraft = async () => {
    setAiDraftBusy(true);
    try {
      const payload = await request(`/human-transcription/jobs/${selectedJob.id}/ai-draft`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ segment_id: workerAssignment?.id && workerAssignment.id !== 'transcriber' ? workerAssignment.id : '' }) });
      setAiDraftLocal(payload.draft || '');
      setAiProofreadLocal(payload.proofread || '');
      const charged = Number(payload.credits_charged || 0);
      if (charged > 0) {
        try { await refreshUserProfile?.(); } catch { /* The draft is saved; profile data can refresh on its next poll. */ }
        showMessage?.(`Formatted draft ready. ${charged} credits used.`, 'success');
      } else {
        showMessage?.(payload.already_generated ? 'Your saved formatted draft is ready. No extra credits were used.' : 'Formatted draft ready.', 'success');
      }
      await loadJobs();
    } catch (error) { showMessage?.(error.message, 'error'); } finally { setAiDraftBusy(false); }
  };

  const requestAiProofread = async () => {
    if (!selectedJob || aiProofreadBusy) return;
    setAiProofreadBusy(true);
    try {
      const payload = await request(`/human-transcription/jobs/${selectedJob.id}/ai-draft/proofread`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segment_id: workerAssignment?.id && workerAssignment.id !== 'transcriber' ? workerAssignment.id : '' }),
      });
      setAiProofreadLocal(payload.proofread || '');
      if (Number(payload.credits_charged || 0) > 0) {
        try { await refreshUserProfile?.(); } catch { /* The proofread is saved; the account view can refresh on its next poll. */ }
      }
      showMessage?.(payload.already_proofread ? 'Your saved proofread version is ready. No additional credit was used.' : 'Proofread version ready. Five credits were used; your original draft is unchanged.', 'success');
      await loadJobs();
    } catch (error) { showMessage?.(error.message, 'error'); } finally { setAiProofreadBusy(false); }
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

  if (loading && scopeLoading) return (
    <section className="tm-human-workspace" aria-busy="true" aria-label="Loading human work">
      <div className="tm-human-progress" role="progressbar" aria-label="Loading"><span /></div>
      <div className="tm-human-skeleton tm-human-skeleton-title" />
      <div className="tm-human-skeleton tm-human-skeleton-line" />
      <div className="tm-human-skeleton-grid"><div className="tm-human-skeleton tm-human-skeleton-card" /><div className="tm-human-skeleton tm-human-skeleton-card tall" /></div>
    </section>
  );

  return (
    <section className={`tm-human-workspace${busy ? ' is-busy' : ''}`} onClickCapture={markButtonPending}>
      {(busy || scopeLoading) && <div className="tm-human-progress" role="progressbar" aria-label={busy ? 'Working' : 'Loading jobs'}><span /></div>}
      <div className="tm-human-workspace-head">
        <div>
          {onBack && <button className="tm-human-back" type="button" onClick={onBack}>← Back to workspace</button>}
          <p className="tm-human-eyebrow">{mode === 'admin' ? 'Operations' : mode === 'worker' ? 'Work Room' : 'Human transcripts'}</p>
          <h1>{mode === 'admin' ? 'Human Work Queue' : mode === 'worker' ? 'Your Work Room' : 'Your human-transcription work'}</h1>
          <p>{mode === 'admin' ? 'Approve client requests, monitor worker claims, review delivery and release credits only after approval.' : mode === 'worker' ? 'Claim one available job or slice at a time, submit it, then return for more work.' : 'Follow each request from quote to delivery. Credits remain untouched until the finished work is approved and released.'}</p>
        </div>
        {mode === 'worker' && <label className="tm-worker-availability-toggle"><input type="checkbox" role="switch" aria-label="Available for work" checked={workerAvailable} disabled={availabilitySaving} onChange={updateWorkerAvailability} /><span><strong>Available for work <em>{workerAvailable ? 'On' : 'Off'}</em></strong><small>{availabilitySaving ? 'Saving…' : 'This only shows admins whether you are online. It does not clock you in or allow work claims.'}</small></span></label>}
        <button className="tm-human-refresh" type="button" onClick={() => { loadJobs(); loadWorkers(); loadPayments(); loadAvailability(); }}>Refresh</button>
      </div>

      {mode === 'admin' && adminTab === 'queue' && isHumanSubadmin && <div className="tm-subadmin-shift-reminder" role="note"><strong>Shift reminder</strong><span>Keep all shift work inside the TypeMyworDz system unless the main admin requests or gives you other instructions. Regular shifts are Monday to Friday, 3:00 p.m.–8:00 p.m. Africa/Nairobi.</span></div>}
      {mode === 'admin' && adminScheduledNow === false && <p className="tm-tat-hint">Outside regular shift hours, worker assignment is limited to approved workers with an active admin call-in who are clocked in and currently online.</p>}
      {mode === 'worker' && workerBoardInfo.deadlineWarning && workerBoardInfo.deadlineReturns < 11 && <div className="tm-worker-board-notice tm-worker-deadline-warning" role="alert"><strong>Deadline reminder · {workerBoardInfo.deadlineReturns} returns</strong><span>One more missed deadline will pause Available Jobs access and send you to the Training Room for retraining. Claim only work you can complete on time.</span></div>}

      {mode === 'worker' && <WorkerShiftPanel showMessage={showMessage} onPresence={loadJobs} availableForWork={workerAvailable} />}

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
          <span>Once hired, generate an AI formatted draft for your assigned job; it uses credits equal to the assigned audio minutes plus 1 credit. Optional AI proofreading costs 5 credits. Edit the version you choose in Word, then paste it into the TypeMyworDz editor and submit. Keep the research notes and spellings section at the end of your work; the proofreader and admin need them to verify names. Do not attach documents unless a job is a TEMPLATE JOB or the admin requests one.</span>
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
          <button type="button" role="tab" aria-selected={adminTab === 'archived'} className={adminTab === 'archived' ? 'active' : ''} onClick={() => setAdminTab('archived')}>Archived Jobs</button>
          {canManageLetterJobs && <button type="button" role="tab" aria-selected={adminTab === 'general_jobs'} className={adminTab === 'general_jobs' ? 'active' : ''} onClick={() => setAdminTab('general_jobs')}>General Jobs</button>}
          {canManageLetterJobs && <button type="button" role="tab" aria-selected={adminTab === 'letter_jobs'} className={adminTab === 'letter_jobs' ? 'active' : ''} onClick={() => setAdminTab('letter_jobs')}>Letter Jobs</button>}
          {canManagePdfJobs && <button type="button" role="tab" aria-selected={adminTab === 'text_messages'} className={adminTab === 'text_messages' ? 'active' : ''} onClick={() => setAdminTab('text_messages')}>Text Messages</button>}
          {canManageLetterJobs && <button type="button" role="tab" aria-selected={adminTab === 'template_jobs'} className={adminTab === 'template_jobs' ? 'active' : ''} onClick={() => setAdminTab('template_jobs')}>Template Jobs</button>}
          {canManagePdfJobs && <button type="button" role="tab" aria-selected={adminTab === 'pdf_jobs'} className={adminTab === 'pdf_jobs' ? 'active' : ''} onClick={() => setAdminTab('pdf_jobs')}>PDF Jobs</button>}
          {isMainAdmin && <button type="button" role="tab" aria-selected={adminTab === 'shifts'} className={adminTab === 'shifts' ? 'active' : ''} onClick={() => setAdminTab('shifts')}>Shift attendance</button>}
          {isHumanSubadmin && <button type="button" role="tab" aria-selected={adminTab === 'my_subadmin_payments'} className={adminTab === 'my_subadmin_payments' ? 'active' : ''} onClick={() => setAdminTab('my_subadmin_payments')}>My payments · KES</button>}
          {isMainAdmin && <button type="button" role="tab" aria-selected={adminTab === 'worker_payments'} className={adminTab === 'worker_payments' ? 'active' : ''} onClick={() => setAdminTab('worker_payments')}>Worker payments · KES</button>}
          {isMainAdmin && <button type="button" role="tab" aria-selected={adminTab === 'rates'} className={adminTab === 'rates' ? 'active' : ''} onClick={() => setAdminTab('rates')}>Worker rates</button>}
          {isMainAdmin && <button type="button" role="tab" aria-selected={adminTab === 'subadmin_payments'} className={adminTab === 'subadmin_payments' ? 'active' : ''} onClick={() => setAdminTab('subadmin_payments')}>Sub-admin payments</button>}
          {isMainAdmin && <button type="button" role="tab" aria-selected={adminTab === 'subadmin_rates'} className={adminTab === 'subadmin_rates' ? 'active' : ''} onClick={() => setAdminTab('subadmin_rates')}>Sub-admin rates</button>}
          {isMainAdmin && <button type="button" role="tab" aria-selected={adminTab === 'cleanup'} className={adminTab === 'cleanup' ? 'active' : ''} onClick={() => setAdminTab('cleanup')}>Job cleanup</button>}
        </div>
      )}

      {mode === 'admin' && adminTab === 'pdf_jobs' && canManagePdfJobs ? (
        <PdfJobsAdminPanel recordedAudioFile={recordedAudioFile} showMessage={showMessage} onOpenQueue={() => { setAdminQueueType('pdf_job'); setAdminQueueLane('needs_action'); setAdminTab('queue'); }} />
      ) : mode === 'admin' && adminTab === 'text_messages' && canManagePdfJobs ? (
        <PdfJobsAdminPanel category="text_messages" recordedAudioFile={recordedAudioFile} showMessage={showMessage} onOpenQueue={() => { setAdminQueueType('text_messages'); setAdminQueueLane('needs_action'); setAdminTab('queue'); }} />
      ) : mode === 'admin' && adminTab === 'general_jobs' && canManageLetterJobs ? (
        <AdminAudioJobsPanel category="general" recordedAudioFile={recordedAudioFile} showMessage={showMessage} onOpenQueue={(job) => { setAdminQueueType('general_job'); setAdminQueueLane(adminQueueLaneFor(job)); setAdminTab('queue'); }} />
      ) : mode === 'admin' && adminTab === 'template_jobs' && canManageLetterJobs ? (
        <AdminAudioJobsPanel category="template" recordedAudioFile={recordedAudioFile} showMessage={showMessage} onOpenQueue={(job) => { setAdminQueueType('template_job'); setAdminQueueLane(adminQueueLaneFor(job)); setAdminTab('queue'); }} />
      ) : mode === 'admin' && adminTab === 'letter_jobs' && canManageLetterJobs ? (
        <LetterJobsAdminPanel recordedAudioFile={recordedAudioFile} showMessage={showMessage} onOpenQueue={() => { setAdminQueueType('letter_job'); setAdminQueueLane('needs_action'); setAdminTab('queue'); }} />
      ) : mode === 'admin' && adminTab === 'shifts' && isMainAdmin ? (
        <AdminShiftAttendancePanel showMessage={showMessage} />
      ) : mode === 'admin' && adminTab === 'my_subadmin_payments' && isHumanSubadmin ? (
        <SubadminSelfPaymentPanel request={request} showMessage={showMessage} />
      ) : mode === 'admin' && adminTab === 'subadmin_payments' && isMainAdmin ? (
        <AdminSubadminPaymentsPanel request={request} showMessage={showMessage} />
      ) : mode === 'admin' && adminTab === 'subadmin_rates' && isMainAdmin ? (
        <AdminSubadminRatesPanel request={request} showMessage={showMessage} />
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
      ) : mode === 'admin' && adminTab === 'worker_payments' && isMainAdmin ? (
        <AdminPayoutsPanel request={request} showMessage={showMessage} workers={workers} />
      ) : mode === 'admin' && adminTab === 'rates' && isMainAdmin ? (
        <AdminTranscriberRatePanel request={request} showMessage={showMessage} />
      ) : mode === 'admin' && adminTab === 'cleanup' && isMainAdmin ? (
        <AdminJobCleanupPanel request={request} showMessage={showMessage} />
      ) : (
      <>
      {mode === 'admin' && adminTab === 'archived' && <div className="tm-admin-archived-note" role="note"><strong>Archived after three days</strong><span>These older jobs are hidden from active queues, not deleted. Their files, payment history, and worker conversations remain available here.</span></div>}
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
              <option value="text_messages">Text Messages</option>
              <option value="general_job">General Jobs</option>
              <option value="template_job">Template Jobs</option>
              <option value="letter_job">Letter Jobs</option>
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
              <strong>{job.job_name || job.pdf_image?.name || job.audio?.name || `Human job ${job.id.slice(0, 6)}`}</strong>
              <span>{mode === 'worker' && workerTab === 'available' ? (job.claimable_full_job ? 'Entire job · available to claim' : `${(job.claimable_parts || []).length} part${(job.claimable_parts || []).length === 1 ? '' : 's'} available`) : mode === 'worker' && job.worker_assignment?.role === 'proofreader' ? 'Proofreading · In progress' : (STATUS_LABELS[job.status] || job.status)}{typeof job.time_remaining_seconds === 'number' && ['assigned', 'in_progress'].includes(job.worker_assignment?.status || job.status) ? ` · ${formatCountdown(remainingSecondsFor(job))} left` : ''}</span>
              {mode === 'admin' && (() => {
                const active = ['assigned', 'in_progress'];
                const names = [];
                (job.segments || []).forEach((part) => { if (part.worker_name || part.worker_email) names.push(`${part.label || 'Part'}: ${part.worker_name || part.worker_email}${active.includes(part.status) ? ' (working)' : part.status === 'submitted' || part.status === 'approved' ? '' : ''}`); });
                if (!names.length && (job.worker_name || job.worker_email)) names.push(`${job.worker_name || job.worker_email}${active.includes(job.status) ? ' (working)' : ''}`);
                if (job.proofreader_name || job.proofreader_email) names.push(`Proofreader: ${job.proofreader_name || job.proofreader_email}`);
                return <small className="tm-human-claimed" style={{ color: names.length ? '#4b2a8a' : '#858a95', fontWeight: 600 }}>{names.length ? `Claimed by ${names.join(' | ')}` : 'Not claimed yet'}</small>;
              })()}
              <small>{mode === 'worker' ? `${job.job_type === 'pdf_job' ? (job.pdf_review ? 'Whole-file proofread' : job.job_category === 'text_messages' ? 'Text Messages image · KES 50' : 'PDF image · KES 100') : jobTypeLabel(job)} · ${moneylessDate(job.createdAt)}` : `${job.quote_credits || 0} credits · ${moneylessDate(job.createdAt)}`}</small>
            </button>
          ))}
          {!jobsForCurrentView.length && <div className="tm-human-empty">{mode === 'admin' && adminTab === 'archived' ? 'No jobs have reached the three-day archive yet.' : mode === 'admin' ? 'No jobs match this status and type.' : mode === 'worker' && workerTab === 'available' ? 'No new work is available right now. This board refreshes automatically.' : 'No human work is waiting here.'}</div>}
        </aside>

        <div className="tm-human-job-detail">
          {!selectedJob ? <div className="tm-human-empty">Choose a job to see its details.</div> : <>
            <div className="tm-human-detail-head">
              <div><span className="tm-human-status">{STATUS_LABELS[selectedJob.status] || selectedJob.status}</span><h2>{selectedJob.job_name || selectedJob.pdf_image?.name || selectedJob.audio?.name || (selectedJob.source_type === 'ai_proofreading' ? 'AI transcript for proofreading' : 'Human-transcription request')}</h2><p>{selectedJob.job_type === 'letter_job' ? `Letter Job · Complete recording · ${selectedJob.minutes || 0} minutes` : selectedJob.job_type === 'pdf_job' ? (selectedJob.job_category === 'text_messages' ? 'Text message screenshot · KES 50 per submitted image' : 'PDF image transcription · KES 100 per submitted image') : `${jobTypeLabel(selectedJob)} · ${selectedJob.minutes || 0} minutes${mode !== 'worker' ? ` · ${selectedJob.quote_credits || 0} credits` : ''} · ${selectedJob.turnaround || 'standard'} delivery`}</p>{mode === 'worker' && workerAssignment?.label && <p><strong>{workerAssignment.label}</strong>{workerAssignment.role === 'proofreader' ? ' · Proofread the combined text below and check the handoff between parts. You can submit once every part is in.' : selectedJob.job_type === 'pdf_job' ? ' · Transcribe the single assigned image and submit the finished Word file or transcript.' : ` · Work from ${formatCountdown(workerAssignment.start_seconds || 0)} to ${formatCountdown(workerAssignment.end_seconds || 0)} in the source recording.`}</p>}</div>
              <div className="tm-human-detail-actions">
                {mode === 'admin' && selectedJob.status === 'pending_admin' && <button type="button" onClick={() => act(`/human-transcription/jobs/${selectedJob.id}/approve`, { method: 'POST' })}>Approve request</button>}
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

            {mode === 'admin' && selectedJob && selectedJob.job_type !== 'letter_job' && canAssignAiAgents && (
              <section className="tm-ai-agent-panel" aria-label="AI first-draft agents">
                <div className="tm-ai-agent-copy">
                  <strong>AI first draft <span>Private internal draft</span></strong>
                  <p>Choose the job-specific internal agent for an available job or part. General Jobs use GPT-5.6 Luna with DeepSeek V4 Flash fallback; Template Jobs use GPT-5.6 Sol with Claude Opus 5.5 fallback. The draft stays private until you assign proofreading or finish eligible admin-uploaded work.</p>
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
                  {selectedJob.job_type === 'pdf_job' ? (<>
                    <button type="button" disabled={busy || ['queued', 'processing'].includes(selectedJob.ai_agent_status) || (!splitJob && selectedJob.status !== 'approved') || (splitJob && !(selectedJob.segments || []).some((part) => ['available', 'approved'].includes(part.status) && !part.worker_uid))} onClick={() => assignAiAgent(selectedJob.job_category === 'text_messages' ? 'text-messages-gemini' : 'pdf-gemini')}>{['queued', 'processing'].includes(selectedJob.ai_agent_status) ? 'AI agent is drafting…' : selectedJob.pdf_review ? 'Assign AI proofreader' : selectedJob.job_category === 'text_messages' ? 'Assign Text Messages Agent' : 'Assign PDF Agent (Gemini 3.8)'}</button>
                    {(() => {
                      const siblings = selectedJob.pdf_review || !selectedJob.pdf_batch_id ? [] : jobs.filter((item) => item.job_type === 'pdf_job' && !item.pdf_review && item.pdf_batch_id === selectedJob.pdf_batch_id).sort((first, second) => (first.pdf_image?.page_number || 0) - (second.pdf_image?.page_number || 0));
                      if (siblings.length < 2) return null;
                      const unclaimed = siblings.every((item) => item.status === 'approved');
                      return <button type="button" disabled={busy || !unclaimed} title={unclaimed ? undefined : 'Available only while no page has been claimed.'} onClick={() => assignWholeFileAi(selectedJob.job_category === 'text_messages' ? 'text-messages-gemini' : 'pdf-gemini', siblings.map((item) => item.id))}>{`Assign whole file (${siblings.length} pages)`}</button>;
                    })()}
                  </>) : selectedJob.admin_uploaded === true ? <>
                    {selectedJob.job_category === 'template' ? (
                      <button type="button" disabled={busy || !hasJobDocxTemplate || (!splitJob && selectedJob.status !== 'approved') || (splitJob && !(selectedJob.segments || []).some((part) => ['available', 'approved'].includes(part.status) && !part.worker_uid))} title={!hasJobDocxTemplate ? 'Attach exactly one job-specific .docx template first.' : undefined} onClick={() => assignAiAgent('template-claude')}>Assign Template Agent</button>
                    ) : (
                      <button type="button" disabled={busy || (!splitJob && selectedJob.status !== 'approved') || (splitJob && !(selectedJob.segments || []).some((part) => ['available', 'approved'].includes(part.status) && !part.worker_uid))} onClick={() => assignAiAgent('general-gpt')}>Assign General Agent</button>
                    )}
                  </> : <>
                    <button type="button" disabled={busy || (!splitJob && selectedJob.status !== 'approved') || (splitJob && !(selectedJob.segments || []).some((part) => ['available', 'approved'].includes(part.status) && !part.worker_uid))} onClick={() => assignAiAgent('general-gpt')}>Assign general agent</button>
                    <button type="button" disabled={busy || !hasJobDocxTemplate || (!splitJob && selectedJob.status !== 'approved') || (splitJob && !(selectedJob.segments || []).some((part) => ['available', 'approved'].includes(part.status) && !part.worker_uid))} title={!hasJobDocxTemplate ? 'Attach exactly one job-specific .docx template first.' : undefined} onClick={() => assignAiAgent('template-claude')}>Assign template-aware agent</button>
                  </>}
                </div>
                {mode === 'admin' && splitJob && selectedJob.job_type !== 'pdf_job' && <div className="tm-ai-agent-takeover">
                  <p>Whole-job takeover pauses all split parts and prepares one draft from the full recording. It is available only before any part is claimed or submitted; a failed AI run restores the original parts.</p>
                  <div className="tm-ai-agent-buttons">
                    {selectedJob.admin_uploaded === true ? (selectedJob.job_category === 'template' ? (
                      <button type="button" disabled={busy || !aiWholeJobEligible || !hasJobDocxTemplate || ['queued', 'processing'].includes(selectedJob.ai_agent_status)} title={!hasJobDocxTemplate ? 'Attach exactly one job-specific .docx template first.' : undefined} onClick={() => { setAiWholeAgent('template-claude'); setAiWholeConfirm(true); }}>Assign whole job to Template Agent</button>
                    ) : (
                      <button type="button" disabled={busy || !aiWholeJobEligible || ['queued', 'processing'].includes(selectedJob.ai_agent_status)} onClick={() => { setAiWholeAgent('general-gpt'); setAiWholeConfirm(true); }}>Assign whole job to General Agent</button>
                    )) : <>
                      <button type="button" disabled={busy || !aiWholeJobEligible || ['queued', 'processing'].includes(selectedJob.ai_agent_status)} onClick={() => { setAiWholeAgent('general-gpt'); setAiWholeConfirm(true); }}>Assign whole job to general agent</button>
                      <button type="button" disabled={busy || !aiWholeJobEligible || !hasJobDocxTemplate || ['queued', 'processing'].includes(selectedJob.ai_agent_status)} title={!hasJobDocxTemplate ? 'Attach exactly one job-specific .docx template first.' : undefined} onClick={() => { setAiWholeAgent('template-claude'); setAiWholeConfirm(true); }}>Assign whole job to template-aware agent</button>
                    </>}
                  </div>
                  {!aiWholeJobEligible && <small role="status">Whole-job takeover is locked because at least one part has been claimed/submitted, or proofreading has started.</small>}
                </div>}
                {selectedJob.ai_agent_status === 'submitted' && selectedJob.ai_agent_id === 'template-claude' && <button type="button" onClick={() => downloadProtectedFile(`/human-transcription/admin/jobs/${selectedJob.id}/ai-agent/template-docx`, selectedJob.ai_agent_docx?.name || `${selectedJob.job_name || 'transcript'}-formatted-draft.docx`, 'The private template-formatted Word draft is not available.')}>Download template-formatted Word draft (.docx)</button>}
                {selectedJob.ai_agent_status && <p className={`tm-ai-agent-state is-${selectedJob.ai_agent_status}`} role="status">
                  {['queued', 'processing'].includes(selectedJob.ai_agent_status) ? `${selectedJob.ai_agent_name || 'AI agent'} is preparing a private draft…` : selectedJob.ai_agent_status === 'submitted' ? (canFinishAdminAiDraft(selectedJob) ? `${selectedJob.ai_agent_name || 'AI agent'} submitted a complete private draft. Assign a human proofreader, or finish this internal job without charging or notifying a client.` : `${selectedJob.ai_agent_name || 'AI agent'} submitted a draft. You can run AI proofreading, assign a human proofreader, or proofread it yourself before finishing the job.`) : selectedJob.ai_agent_status === 'failed' ? `The last AI run failed: ${selectedJob.ai_agent_error || 'Retry the agent or assign a human worker.'}` : ''}
                </p>}
              </section>
            )}

            {mode === 'worker' && workerTab === 'available' && (
              <section className="tm-human-claim-panel" aria-label="Claim available work">
                <div>
                  <h3>Claim this work</h3>
                  <p>{selectedJob.job_type === 'letter_job' ? 'This is one complete letter. Claim the whole job, follow the Letter Job guidelines, and return a finished Word .docx document.' : selectedJob.job_type === 'pdf_job' ? 'Each listing is one image and may be claimed by one worker. Your deadline begins when you claim it; the image opens after the claim.' : selectedJob.job_type === 'template_job' ? 'Follow the supplied .docx template and job notes. Your deadline begins when you claim this job or part.' : 'Claim one job or slice at a time. Your turnaround deadline begins as soon as you claim it. After submitting, you can return here for another available slice.'}</p>
                </div>
                {!selectedJob.can_claim && selectedJob.claim_block_reason && <p className="tm-human-claim-blocked" role="status">{selectedJob.claim_block_reason}</p>}
                {selectedJob.claimable_full_job && <>
                  <button type="button" disabled={busy || !selectedJob.can_claim} onClick={() => claimWork()}>{selectedJob.job_type === 'pdf_job' ? 'Claim image' : 'Claim job'}</button>
                  <small>{selectedJob.claim_attempt_count || 0}/{selectedJob.max_claims_per_item || 1} personal claim used. A job can be claimed only once; a second claim is blocked.</small>
                </>}
                {(selectedJob.claimable_parts || []).map((part) => (
                  <div className="tm-human-claim-part" key={part.id}>
                    <span><strong>{part.label || 'Available part'}</strong><small>{part.minutes || 0} minutes of audio · {part.claim_attempt_count || 0}/{selectedJob.max_claims_per_item || 1} personal claim used</small>{part.can_claim === false && part.claim_block_reason && <small className="tm-human-claim-blocked">{part.claim_block_reason}</small>}</span>
                    <button type="button" disabled={busy || !selectedJob.can_claim || part.can_claim === false} onClick={() => claimWork(part.id)}>Claim part</button>
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
                  <input type="file" accept={selectedJob.job_type === 'letter_job' ? '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document' : undefined} onChange={(event) => setFinalAttachment(event.target.files?.[0] || null)} />
                </label>
                {finalAttachment && <span className="tm-human-attachment-preview"><strong>{finalAttachment.name}</strong>{formatAttachmentSize(finalAttachment.size) ? ` · ${formatAttachmentSize(finalAttachment.size)}` : ''}<button type="button" onClick={() => setFinalAttachment(null)} aria-label="Remove attachment">Remove</button></span>}
                <p className="tm-human-editor-note">{selectedJob.job_type === 'letter_job' ? 'A finished Word .docx is required. The editor text alone cannot be submitted as a letter.' : 'Nothing to type for this job? Attach the finished file and submit -- the editor can stay empty.'}</p>
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

            {mode === 'admin' && canManagePdfJobs && selectedJob.job_type === 'pdf_job' && <ImageJobQueueActions job={selectedJob} jobs={jobs} showMessage={showMessage} onChanged={loadJobs} />}
            {mode === 'admin' && canManageLetterJobs && selectedJob.job_type === 'letter_job' && <LetterJobQueueActions job={selectedJob} workers={workers} scheduledNow={adminScheduledNow} showMessage={showMessage} onChanged={loadJobs} />}
            {mode === 'admin' && ((!splitJob && selectedJob.status === 'approved') || (splitJob && !selectedJob.proofreader_status && (selectedJob.segments || []).every((part) => ['available', 'approved'].includes(part.status) && !part.worker_uid))) && <div className="tm-human-assign">
              <strong>{['pdf_job', 'letter_job'].includes(selectedJob.job_type) ? 'Assign to a worker' : 'Urgent: give the whole job to one worker'}</strong>
              <label>Worker
                <select value={wholeWorker} onChange={(event) => setWholeWorker(event.target.value)}>
                  <option value="">Choose an approved worker</option>
                  {adminAssignableWorkers.map((worker) => <option key={worker.uid} value={worker.uid}>{worker.name} · {worker.rating == null ? 'not rated' : `${Number(worker.rating).toFixed(1)}/5`} · {worker.email}</option>)}
                </select>
              </label>
              <button type="button" disabled={busy || !wholeWorker} onClick={() => setWholeConfirm(true)}>Assign whole job</button>
              <p className="tm-tat-hint">Rating does not matter here. The job is taken off the claim board and is not split. The worker must be free of other active work.</p>
            </div>}
            <ConfirmDialog open={wholeConfirm} title="Assign the whole job to this worker?" body="The job leaves the Available Jobs board and the worker does the full recording. Use this for urgent work." confirmLabel="Assign whole job" busy={busy} onConfirm={assignWholeJob} onCancel={() => setWholeConfirm(false)} />
            <ConfirmDialog open={aiWholeConfirm} title="Pause the parts and assign one whole-job draft?" body={`${aiWholeAgent === 'template-claude' ? 'The template-aware agent' : 'The general agent'} will prepare one private draft from the full recording. This is allowed only when no part has been claimed or submitted. If the AI run fails, the original parts are restored. An approved human proofreader must still check the draft before it can reach the client.`} confirmLabel="Pause parts and continue" busy={busy} onConfirm={confirmAiWholeJob} onCancel={() => { setAiWholeConfirm(false); setAiWholeAgent(''); }} />
            <ConfirmDialog
              open={finishJobConfirm}
              title="Finish this job?"
              body={finishIsInternal(selectedJob)
                ? 'This moves the completed work to the Finished lane. It will not charge credits or send a client notification.'
                : 'This completes admin proofreading and moves the job to Finished. The client will be notified to check the transcript; credits are not charged unless the client approves and the work is released.'}
              confirmLabel="Finish Job"
              busy={busy}
              onConfirm={finishJob}
              onCancel={() => setFinishJobConfirm(false)}
            />

            {mode === 'admin' && !splitJob && selectedJob.status === 'approved' && <div className="tm-human-assign">
              <strong>Available to workers</strong>
              <p>Approved workers who meet the 3.5/5 rating standard can claim this job from the Available Jobs board. The deadline starts when they claim it.</p>
              <label>Supervised starter assessment
                <select value={starterWorker} onChange={(event) => setStarterWorker(event.target.value)}>
                  <option value="">Choose an unrated or below-threshold worker</option>
                  {adminAssignableWorkers.map((worker) => <option key={worker.uid} value={worker.uid}>{worker.name} · {worker.email}</option>)}
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
                    {adminAssignableWorkers.map((worker) => <option key={worker.uid} value={worker.uid}>{worker.name} · {worker.email}</option>)}
                  </select>
                </label>
                <button type="button" disabled={busy || !starterWorker || !starterSegment} onClick={assignSupervisedStarter}>Assign supervised starter part</button>
                <p className="tm-tat-hint">Use this admin-supervised exception to assess a new hire or review a worker below 3.5. Rated workers should use the public claim board.</p>
              </div>
            )}

            {mode === 'admin' && splitJob && ['split_assigned', 'split_in_progress', 'proofreading_available', 'submitted'].includes(selectedJob.status) && (selectedJob.segments || []).some((part) => part.status === 'submitted') && !['ai', 'human'].includes(selectedJob.reviewer_choice) && !['assigned', 'in_progress', 'submitted'].includes(selectedJob.proofreader_status) && <div className="tm-human-assign"><label>Assign a proofreader<select value={proofreaderWorker} onChange={(event) => setProofreaderWorker(event.target.value)}><option value="">Choose a worker rated 4.5 or higher</option>{adminAssignableWorkers.filter((worker) => worker.can_proofread).map((worker) => <option key={worker.uid} value={worker.uid}>{worker.name} · {Number(worker.rating).toFixed(1)}/5 · {worker.email}</option>)}</select></label><button type="button" disabled={busy || !proofreaderWorker} onClick={assignProofreader}>Assign human proofreader</button><p className="tm-tat-hint">Only workers rated 4.5/5 or higher can proofread. You can assign before every part is in. They will get one editor with all submitted parts and can submit after the full job is complete.</p></div>}
            {mode === 'admin' && !splitJob && selectedJob.status === 'submitted' && selectedJob.job_type !== 'pdf_job' && selectedJob.job_type !== 'letter_job' && !['ai', 'human'].includes(selectedJob.reviewer_choice) && !['assigned', 'in_progress', 'submitted'].includes(selectedJob.proofreader_status) && <div className="tm-human-assign"><strong>Human proofreader</strong><p>Choose a qualified proofreader instead of AI proofreading. You still make the final approval decision.</p><label>Proofreader rated at least 4.5/5<select value={proofreaderWorker} onChange={(event) => setProofreaderWorker(event.target.value)}><option value="">Choose a human proofreader</option>{adminAssignableWorkers.filter((worker) => worker.can_proofread).map((worker) => <option key={worker.uid} value={worker.uid}>{worker.name} · {Number(worker.rating).toFixed(1)}/5 · {worker.email}</option>)}</select></label><button type="button" disabled={busy || !proofreaderWorker} onClick={assignProofreader}>Assign human proofreader</button></div>}
            {mode === 'admin' && selectedJob.job_type !== 'pdf_job' && selectedJob.reviewer_choice !== 'human' && ((splitJob && (selectedJob.segments || []).length > 0 && (selectedJob.segments || []).every((part) => part.status === 'submitted')) || (!splitJob && ['submitted', 'client_review', 'client_approved', 'released'].includes(selectedJob.status) && String(selectedJob.transcript || '').trim())) && <AdminAiReviewPanel job={selectedJob} act={act} busy={busy} splitJob={splitJob} onInsert={insertAiReviewedTranscript} allowApply={selectedJob.status === 'submitted'} />}
            {mode === 'admin' && <AdminPartReview job={selectedJob} act={act} downloadProtectedFile={downloadProtectedFile} />}


            {canRateSubmittedWorker && <div className="tm-human-review tm-human-rating-panel"><strong className="tm-human-rating-title">Worker rating and comments</strong>{splitJob ? <div className="tm-human-rating-parts">{(selectedJob.segments || []).filter((part) => part.status === 'submitted' && part.worker_uid).map((part) => { const current = adminPartRatings[part.id] || selectedJob.part_ratings?.[part.id] || {}; return <div key={part.id} className="tm-human-rating-part"><strong>{part.label || 'Submitted part'}</strong><select aria-label={`Worker rating for ${part.label || part.id}`} value={current.rating || '5'} onChange={(event) => setAdminPartRatings((previous) => ({ ...previous, [part.id]: { ...current, rating: event.target.value } }))}><option value="5">5 — excellent</option><option value="4">4 — strong</option><option value="3">3 — acceptable</option><option value="2">2 — needs work</option><option value="1">1 — poor</option></select><input aria-label={`Worker comments for ${part.label || part.id}`} value={current.note || ''} onChange={(event) => setAdminPartRatings((previous) => ({ ...previous, [part.id]: { ...current, note: event.target.value } }))} placeholder="Comments (optional)" /></div>; })}</div> : <><label>Worker rating<select value={rating} onChange={(event) => setRating(event.target.value)}><option value="5">5 — excellent</option><option value="4">4 — strong</option><option value="3">3 — acceptable</option><option value="2">2 — needs work</option><option value="1">1 — poor</option></select></label><textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="Comments for this worker" /></>}<button type="button" disabled={busy} onClick={saveWorkerRatingAndNotes}>Save worker rating and comments</button><p>Saving feedback does not approve, finish, or change the job.</p></div>}
            {mode === 'admin' && selectedJob.status === 'submitted' && !selectedJob.admin_uploaded && <div className="tm-human-review tm-human-review-actions"><strong>Job completion</strong><p>Complete AI or human proofreading before sending this work to the client.</p><button type="button" disabled={busy || !adminReviewerComplete(selectedJob)} title={!adminReviewerComplete(selectedJob) ? 'Complete the selected AI or human proofreading before sending this work to the client.' : undefined} onClick={() => act(`/human-transcription/jobs/${selectedJob.id}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }, selectedJob.job_type === 'pdf_job' ? 'PDF transcription approved and completed.' : 'Sent to client for review.')}>{selectedJob.job_type === 'pdf_job' ? 'Approve PDF transcription' : 'Send to client'}</button></div>}
            {mode === 'admin' && canFinishHumanJob(selectedJob) && <div className="tm-human-review"><button type="button" className="tm-admin-btn" disabled={busy} onClick={() => setFinishJobConfirm(true)}>Finish Job</button><p className="tm-tat-hint">Finish complete work without assigning a proofreader. Active proofreading assignments must be completed or taken back first.</p></div>}

            {selectedJob.job_type === 'pdf_job' && !(mode === 'worker' && workerTab === 'available') && <div className="tm-human-pdf-image-card"><div><strong>{selectedJob.pdf_review ? 'Whole-file review: all pages' : 'Assigned image'}</strong><span>{selectedJob.pdf_image?.source_filename || selectedJob.pdf_image?.name}{selectedJob.pdf_image?.page_count > 1 && !selectedJob.pdf_review ? ` · Page ${selectedJob.pdf_image.page_number} of ${selectedJob.pdf_image.page_count}` : ''}</span></div>{pdfImageUrls.length > 1 ? pdfImageUrls.map((url, index) => <img key={url} src={url} alt={`Page ${index + 1} of ${pdfImageUrls.length}`} />) : pdfImageUrl ? <img src={pdfImageUrl} alt={`Transcribe ${selectedJob.pdf_image?.name || 'PDF Job'}`} /> : <p role={pdfImageError ? 'alert' : 'status'}>{pdfImageError || 'Loading the private image…'}</p>}</div>}
            {mode === 'worker' && audioLocked && hasAudio && !audioHidden && <div className="tm-human-reference-card" role="note" style={{ borderLeft: '4px solid #1f7a4d', display: 'grid', gap: 6 }}>
              <strong>Your recording is locked for now</strong>
              <span>You will be able to play and download the audio once you generate the formatted draft. Click Generate formatted draft below. If the draft fails, contact the admin and they will open the recording for you.</span>
            </div>}
            {mode === 'admin' && (selectedJob.audio_locked_assignments || []).length > 0 && <div className="tm-human-reference-card" role="note" style={{ display: 'grid', gap: 8 }}>
              <strong>Recording locked for the worker</strong>
              <span>The worker gets the recording after generating the formatted draft. If their draft keeps failing, open it for them.</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(selectedJob.audio_locked_assignments || []).map((entry) => <button type="button" key={entry.key} disabled={unlockBusy === entry.key} onClick={() => unlockWorkerAudio(entry.key)}>{unlockBusy === entry.key ? 'Opening the recording…' : `Open recording for ${entry.label}`}</button>)}
              </div>
            </div>}
            {audioKey && <WorkerAudioPlayer src={audioUrl} loading={audioLoading} error={audioError} title={audioSegmentId ? 'Your part of the recording' : 'Source recording'} note={audioSegmentId ? 'Only your assigned part is played and downloaded here.' : 'Available to the client, admin and assigned worker.'} filename={audioSegmentId ? `${(workerAssignment?.label || 'part').replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}.mp3` : (selectedJob?.audio?.name || 'recording.mp3')} />}
            {mode === 'worker' && workerAssignmentActive && selectedJob.job_type === 'letter_job' && <div className="tm-human-reference-card tm-letter-guidelines" role="note"><strong>Letter Job guidelines</strong><p>Use the standard Letter Standard Indentation template. Preserve the dictated wording and paragraph breaks, keep the required Date, Re:, and Dear : fields, remove undictated template content, and attach the finished .docx. Staff instructions must be bold in square brackets. The full job instructions and reference files remain available above.</p>{selectedJob.letter_guidelines && <details><summary>Read the complete Letter Agent guidelines</summary><pre>{selectedJob.letter_guidelines}</pre></details>}</div>}
            {mode === 'worker' && workerAssignmentActive && workerAssignment?.role !== 'proofreader' && selectedJob.job_type !== 'pdf_job' && selectedJob.job_type !== 'letter_job' && <div className="tm-human-reference-card" style={{ display: 'grid', gap: 8 }}>
              <strong>AI formatted draft for this audio</strong>
              <span>Generate a formatted draft of {workerAssignment?.label ? workerAssignment.label.toLowerCase() : 'this audio'}, then copy it into Word or insert it into the editor. Your recording becomes available to play and download only after the draft is generated; if the draft fails, contact the admin. It costs {workerDraftEstimate.totalCredits} credits: {workerDraftEstimate.audioMinutes} per started audio minute (rounded up) plus 1 formatting credit. A successful proofreading costs 5 additional credits.</span>
              {!(aiDraftLocal || selectedJob.ai_draft) && <div><button type="button" disabled={aiDraftBusy} onClick={requestAiDraft}>{aiDraftBusy ? 'Preparing your formatted draft…' : `Generate formatted draft · ${workerDraftEstimate.totalCredits} credits`}</button></div>}
              {(aiDraftLocal || selectedJob.ai_draft) && <>
                <div className="tm-worker-ai-text-preview" style={{ whiteSpace: 'pre-wrap', tabSize: '0.5in', maxHeight: 280, overflow: 'auto', background: '#fafbfa', border: '1px solid #e5e9e5', borderRadius: 6, padding: 12, fontSize: 14, lineHeight: '100%' }}>{aiDraftLocal || selectedJob.ai_draft}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" onClick={async () => { try { await copyForWord(aiDraftLocal || selectedJob.ai_draft); showMessage?.('Draft copied for Word with tabs and single spacing.', 'success'); } catch { showMessage?.('Copy failed. Select the text and copy it manually.', 'error'); } }}>Copy original draft for Word</button>
                  <button type="button" onClick={() => { editorRef.current?.insertText(aiDraftLocal || selectedJob.ai_draft); showMessage?.('Original draft inserted into the editor.', 'success'); }}>Insert original draft</button>
                </div>
                <div className="tm-worker-ai-proofread" style={{ display: 'grid', gap: 8, paddingTop: 8 }}>
                  <strong>Proofread this draft here before you start transcribing</strong>
                  <span>The proofreader checks the draft against the TypeMyworDz guidelines, job notes, reference files, and an independent audio comparison. A successful proofreading uses 5 credits. Your original draft stays available and is never replaced automatically.</span>
                  {!(aiProofreadLocal || selectedJob.ai_draft_proofread) && <button type="button" disabled={aiProofreadBusy} onClick={requestAiProofread}>{aiProofreadBusy ? 'Proofreading your draft…' : 'Proofread this draft · 5 credits'}</button>}
                  {(aiProofreadLocal || selectedJob.ai_draft_proofread) && <>
                    <strong>Proofread version</strong>
                    <div className="tm-worker-ai-text-preview" style={{ whiteSpace: 'pre-wrap', tabSize: '0.5in', maxHeight: 280, overflow: 'auto', background: '#fafbfa', border: '1px solid #e5e9e5', borderRadius: 6, padding: 12, fontSize: 14, lineHeight: '100%' }}>{aiProofreadLocal || selectedJob.ai_draft_proofread}</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button type="button" onClick={async () => { try { await copyForWord(aiProofreadLocal || selectedJob.ai_draft_proofread); showMessage?.('Proofread version copied for Word.', 'success'); } catch { showMessage?.('Copy failed. Select the text and copy it manually.', 'error'); } }}>Copy proofread version</button>
                      <button type="button" onClick={() => { editorRef.current?.insertText(aiProofreadLocal || selectedJob.ai_draft_proofread); showMessage?.('Proofread version inserted into the editor.', 'success'); }}>Insert proofread text into editor</button>
                    </div>
                  </>}
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
              <span style={{ fontSize: 12, color: '#7b857d' }}>Reminder: generate the formatted draft above, optionally proofread it for one credit, and edit it in Word. Work done without an in-app AI formatted draft may be declined.</span>
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
              <p className="tm-human-editor-note">{selectedJob.job_type === 'pdf_job' ? (selectedJob.job_category === 'text_messages' ? 'Follow the job instructions and the Text Messages guidelines, check your transcript against the screenshot, then complete and attach your Word document.' : 'Always use Gemini for image transcription, check the draft against the image, then complete and attach your Word document.') : 'AI tools can help with first drafts and questions, but the final human release stays under admin review.'}</p>
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

function WorkerShiftPanel({ showMessage, onPresence, availableForWork }) {
  const { currentUser } = useAuth();
  const [shift, setShift] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadShift = useCallback(async (quiet = false) => {
    if (!currentUser) return;
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(`${BACKEND_URL}/human-transcription/worker/shift`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || 'Shift status could not be loaded.');
      setShift(payload);
      setError('');
    } catch (loadError) {
      if (!quiet) setError(loadError.message || 'Shift status could not be loaded.');
    }
  }, [currentUser]);

  useEffect(() => {
    loadShift();
    const timer = window.setInterval(() => loadShift(true), 30000);
    return () => window.clearInterval(timer);
  }, [loadShift]);

  useEffect(() => {
    if (!currentUser) return undefined;
    const canRefreshPresence = shift?.clocked_in || availableForWork === true;
    if (!canRefreshPresence) return undefined;
    let active = true;
    const ping = async () => {
      try {
        const token = await currentUser.getIdToken();
        const response = await fetch(`${BACKEND_URL}/human-transcription/worker/shift/presence`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}',
        });
        if (response.ok && active) {
          setShift(await response.json());
          onPresence?.();
        }
      } catch { /* Presence is refreshed again on the next interval. */ }
    };
    ping();
    const timer = window.setInterval(ping, 60000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [currentUser, shift?.clocked_in, availableForWork, onPresence]);

  const act = async (path) => {
    if (busy || !currentUser) return;
    setBusy(true);
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(`${BACKEND_URL}${path}`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || 'The shift update could not be saved.');
      setShift(payload);
      setError('');
      showMessage?.(path.endsWith('clock-in') ? 'You are clocked in.' : 'You are clocked out.', 'success');
    } catch (actionError) {
      showMessage?.(actionError.message || 'The shift update could not be saved.', 'error');
    } finally {
      setBusy(false);
      loadShift(true);
    }
  };

  const onShift = Boolean(shift?.clocked_in);
  const statusLabel = shift?.online === true
    ? (shift?.clocked_in ? (shift?.scheduled_now ? 'On shift · online' : 'Outside shift · online') : 'Online · not clocked in')
    : ({ online: 'Online', clocked_in_idle: 'Clocked in · offline', called_in_not_clocked_in: 'Admin call-in · clock in to start', not_arrived: 'Shift open · clock in to claim', clocked_out: 'Clocked out', missed: 'Shift ended · not clocked in', off_shift: 'Outside shift hours', retraining: 'Training Room' }[shift?.status] || 'Checking shift status');
  return <section className={`tm-worker-shift-card${shift?.warning ? ' has-warning' : ''}`} aria-label="Your shift status">
    <div className="tm-worker-shift-main">
      <span className={`tm-worker-shift-indicator is-${shift?.online === true ? 'online' : shift?.status || 'loading'}`} aria-hidden="true" />
      <div className="tm-worker-shift-copy">
        <div className="tm-worker-shift-heading"><strong>{statusLabel}</strong>{shift?.misses_consecutive > 0 && <span className="tm-worker-shift-count">{shift.misses_consecutive}/6 missed</span>}</div>
        <p>{shift?.message || 'Loading today’s shift details…'}</p>
        <small>The Available for work switch only shows admins whether you are online. It does not record attendance or allow claims. During a scheduled shift, clock in; outside shift hours, an admin call-in and clock-in are required.</small>
        {shift?.warning && <small className="tm-worker-shift-warning">Five missed shifts in a row. Attend your next scheduled shift to keep your work access.</small>}
        {onShift && shift?.has_active_assignment && <small className="tm-worker-shift-warning">Finish your active job before clocking out.</small>}
        {error && <small className="tm-worker-shift-error" role="alert">{error}</small>}
      </div>
    </div>
    <div className="tm-worker-shift-actions">
      <span>Mon–Fri · 3:00 p.m.–8:00 p.m. Kenya time</span>
      {shift?.can_clock_in && <button type="button" onClick={() => act('/human-transcription/worker/shift/clock-in')} disabled={busy}>{busy ? 'Saving…' : 'Clock in'}</button>}
      {onShift && <button type="button" onClick={() => act('/human-transcription/worker/shift/clock-out')} disabled={busy || shift?.has_active_assignment} title={shift?.has_active_assignment ? 'Finish your active job before clocking out.' : undefined}>{busy ? 'Saving…' : 'Clock out'}</button>}
    </div>
  </section>;
}

function AdminShiftAttendancePanel({ showMessage }) {
  const { currentUser } = useAuth();
  const [workers, setWorkers] = useState([]);
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [workingUid, setWorkingUid] = useState('');
  const [error, setError] = useState('');

  const loadAttendance = useCallback(async (quiet = false) => {
    if (!currentUser) return;
    if (!quiet) setLoading(true);
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(`${BACKEND_URL}/human-transcription/admin/shifts`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || 'Shift attendance could not be loaded.');
      setWorkers(payload.workers || []);
      setDate(payload.date || '');
      setError('');
    } catch (loadError) {
      setError(loadError.message || 'Shift attendance could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    loadAttendance();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') loadAttendance(true);
    }, 10000);
    return () => window.clearInterval(timer);
  }, [loadAttendance]);

  const callIn = async (worker) => {
    if (workingUid || !currentUser) return;
    if (!window.confirm(`Call ${worker.name} in for up to four hours? They will receive an alert and must clock in before claiming work.`)) return;
    setWorkingUid(worker.uid);
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(`${BACKEND_URL}/human-transcription/admin/workers/${encodeURIComponent(worker.uid)}/shift-call-in`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'Admin call-in' }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || 'The worker could not be called in.');
      showMessage?.(`${worker.name} has been called in and can clock in for four hours.`, 'success');
      await loadAttendance(true);
    } catch (callError) {
      showMessage?.(callError.message || 'The worker could not be called in.', 'error');
    } finally {
      setWorkingUid('');
    }
  };

  const statusText = (status) => ({ online: 'Clocked in', clocked_in_idle: 'Clocked in', called_in_not_clocked_in: 'Called in · not clocked in', not_arrived: 'Not arrived', missed: 'Missed shift', clocked_out: 'Clocked out', off_shift: 'Off shift', retraining: 'Training Room' }[status] || status || 'Unknown');
  const onlineCount = workers.filter((worker) => worker.online).length;
  const notArrivedCount = workers.filter((worker) => worker.status === 'not_arrived').length;
  const trainingCount = workers.filter((worker) => worker.status === 'retraining').length;

  return <section className="tm-admin-panel tm-human-shift-admin">
    <div className="tm-admin-panel-head">
      <div><p className="tm-admin-kicker">Africa/Nairobi · {date || 'today'}</p><h2 className="tm-admin-panel-title">Shift attendance</h2><p className="tm-admin-panel-note">Regular shifts run Monday to Friday, 3:00 p.m. to 8:00 p.m. Kenya time. Online requires the toggle to be on and a fresh Work Room heartbeat; shift attendance and call-in remain separate.</p></div>
      <button type="button" className="tm-admin-btn" onClick={() => loadAttendance()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
    </div>
    <div className="tm-human-shift-summary"><span><strong>{onlineCount}</strong> online</span><span><strong>{notArrivedCount}</strong> not arrived</span><span><strong>{trainingCount}</strong> in retraining</span><small>Warning at 5 consecutive missed shifts · Training Room at 6</small></div>
    {error && <p className="tm-letter-job-error" role="alert">{error}</p>}
    {loading && !workers.length ? <div className="tm-admin-empty">Loading shift attendance…</div> : !workers.length ? <div className="tm-admin-empty">No approved workers are on the shift roster yet.</div> : <div className="tm-admin-table-scroll"><table className="tm-admin-table"><thead><tr><th>Worker</th><th>Attendance</th><th>Recent presence</th><th>Missed shifts</th><th>Admin action</th></tr></thead><tbody>
      {workers.map((worker) => <tr key={worker.uid}>
        <td><strong>{worker.name}</strong><div className="tm-admin-name">{worker.email}{worker.rating != null ? ` · ${Number(worker.rating).toFixed(2)}/5` : ''}</div></td>
        <td><span className={`tm-human-shift-status ${worker.online ? 'is-online' : 'is-offline'}`}>{worker.online ? 'Online' : 'Offline'}</span><div className="tm-admin-name">{statusText(worker.status)}</div>{worker.message && <div className="tm-admin-name">{worker.message}</div>}</td>
        <td>{worker.last_presence_at ? moneylessDate(worker.last_presence_at) : 'Not recorded'}{worker.call_in_expires_at && worker.call_in_active && <div className="tm-admin-name">Call-in ends {moneylessDate(worker.call_in_expires_at)}</div>}</td>
        <td>{worker.misses_consecutive || 0} / 6{worker.warning && <div className="tm-worker-shift-warning">Warning issued</div>}</td>
        <td>{worker.status === 'retraining' ? 'No call-in while retraining' : <button type="button" className="tm-admin-btn" disabled={workingUid === worker.uid || (worker.call_in_active && worker.clocked_in)} onClick={() => callIn(worker)}>{workingUid === worker.uid ? 'Calling in…' : worker.call_in_active ? 'Extend call-in' : 'Call in'}</button>}</td>
      </tr>)}
    </tbody></table></div>}
  </section>;
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

function SubadminSelfPaymentPanel({ request, showMessage }) {
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setHistory(await request('/human-transcription/subadmin/payment-history'));
    } catch (error) {
      showMessage?.(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [request, showMessage]);
  useEffect(() => { load(); }, [load]);
  const totals = history?.totals || {};
  const earnings = history?.earnings || [];
  const payouts = history?.payouts || [];
  return (
    <section className="tm-subadmin-panel" aria-label="Your Human Work payments">
      <div className="tm-subadmin-panel-head">
        <div><p className="tm-human-eyebrow">Human Work · Payroll</p><h2>Your payment record</h2><p>Approved work is recorded here. Earnings build across each half-month; payment is recorded only after it has actually been sent.</p></div>
        <button type="button" className="tm-admin-payout-search-btn" onClick={load} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
      </div>
      <div className="tm-subadmin-metrics">
        <div><span>Still accruing</span><strong>{kesThree(totals.accruing_kes)}</strong><small>Current half-month</small></div>
        <div><span>Pending payout</span><strong>{kesThree(totals.pending_kes)}</strong><small>Invoiced; not marked paid</small></div>
        <div><span>Paid and recorded</span><strong>{kesThree(totals.paid_kes)}</strong><small>Past invoices</small></div>
      </div>
      <div className="tm-human-chat-card tm-subadmin-section">
        <div className="tm-human-chat-head"><div><strong>Half-month invoices</strong><span>1st–15th and 16th–month end</span></div></div>
        {loading && !history ? <p className="tm-human-empty">Loading your payment record…</p> : payouts.length ? <div className="tm-subadmin-table-wrap"><table className="tm-admin-payout-table"><thead><tr><th>Period</th><th>Amount</th><th>Status</th><th>Payment recorded</th></tr></thead><tbody>{payouts.map((item) => <tr key={item.payout_id}><td>{item.period_label}</td><td>{kesThree(item.total_amount_kes)}</td><td>{item.status === 'paid' ? 'Paid' : 'Pending'}</td><td>{item.paid_at ? moneylessDate(item.paid_at) : 'Not recorded'}</td></tr>)}</tbody></table></div> : <p className="tm-human-empty">No half-month invoices yet. Your eligible work will appear here after approval.</p>}
      </div>
      <div className="tm-human-chat-card tm-subadmin-section">
        <div className="tm-human-chat-head"><div><strong>Approved work</strong><span>Each item keeps the rate that applied when it was approved.</span></div></div>
        {loading && !history ? <p className="tm-human-empty">Loading your approved work…</p> : earnings.length ? <div className="tm-subadmin-table-wrap"><table className="tm-admin-payout-table"><thead><tr><th>Date</th><th>Work</th><th>Category</th><th>Units</th><th>Rate</th><th>Amount</th><th>Status</th></tr></thead><tbody>{earnings.map((item) => <tr key={item.earning_id}><td>{item.shift_date || '—'}</td><td>{item.job_name || item.job_id}</td><td>{subadminCategoryLabel(item.category)}</td><td>{item.quantity} {item.measure}</td><td>{kesThree(item.rate_kes_per_unit)} / {item.measure === 'minutes' ? 'min' : 'word'}</td><td>{kesThree(item.amount_kes)}</td><td>{PAYOUT_STATUS_LABELS[item.payout_status] || item.payout_status}</td></tr>)}</tbody></table></div> : <p className="tm-human-empty">No eligible work has been approved yet.</p>}
      </div>
    </section>
  );
}

function AdminSubadminPaymentsPanel({ request, showMessage }) {
  const [options, setOptions] = useState([]);
  const [filters, setFilters] = useState({ subadmin_uid: '', start_date: nairobiDateIso(), end_date: nairobiDateIso() });
  const [invoiceStatus, setInvoiceStatus] = useState('pending');
  const [earningsData, setEarningsData] = useState(null);
  const [invoiceData, setInvoiceData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState('');

  const loadOptions = useCallback(async () => {
    try {
      const payload = await request('/api/admin/subadmin-options');
      setOptions(payload.subadmins || []);
    } catch (error) { showMessage?.(error.message, 'error'); }
  }, [request, showMessage]);
  const loadData = useCallback(async (range = {}, status = 'pending') => {
    setLoading(true);
    const selected = { start_date: nairobiDateIso(), end_date: nairobiDateIso(), ...range };
    try {
      const params = new URLSearchParams();
      if (selected.start_date) params.set('start_date', selected.start_date);
      if (selected.end_date) params.set('end_date', selected.end_date);
      if (selected.subadmin_uid) params.set('subadmin_uid', selected.subadmin_uid);
      const invoiceParams = new URLSearchParams({ status: status || 'all' });
      if (selected.subadmin_uid) invoiceParams.set('subadmin_uid', selected.subadmin_uid);
      const [earnings, invoices] = await Promise.all([
        request(`/api/admin/subadmin-earnings?${params.toString()}`),
        request(`/api/admin/subadmin-payouts?${invoiceParams.toString()}`),
      ]);
      setEarningsData(earnings);
      setInvoiceData(invoices);
    } catch (error) { showMessage?.(error.message, 'error'); }
    finally { setLoading(false); }
  }, [request, showMessage]);
  useEffect(() => { loadOptions(); loadData({ start_date: nairobiDateIso(), end_date: nairobiDateIso() }, 'pending'); }, [loadOptions, loadData]);

  const chooseRange = (kind) => {
    const today = nairobiDateIso();
    if (kind === 'today') setFilters((value) => ({ ...value, start_date: today, end_date: today }));
    if (kind === 'week') {
      const start = new Date(`${today}T12:00:00+03:00`);
      start.setDate(start.getDate() - 6);
      setFilters((value) => ({ ...value, start_date: nairobiDateIso(start), end_date: today }));
    }
  };
  const search = () => loadData(filters, invoiceStatus);
  const markPaid = async (payout) => {
    const amount = kesThree(payout.total_amount_kes);
    if (!window.confirm(`Mark the ${payout.period_label} invoice for ${payout.subadmin_email} (${amount}) as paid? Only continue after the money has actually been sent.`)) return;
    setBusyId(payout.payout_id);
    try {
      await request(`/api/admin/subadmin-payouts/${encodeURIComponent(payout.payout_id)}/mark-paid`, { method: 'POST' });
      showMessage?.('Sub-admin invoice marked paid.', 'success');
      await loadData(filters, invoiceStatus);
    } catch (error) { showMessage?.(error.message, 'error'); }
    finally { setBusyId(''); }
  };
  const daily = earningsData?.daily_totals || [];
  const earnings = earningsData?.earnings || [];
  const invoices = invoiceData?.payouts || [];
  const totals = earningsData?.totals || {};
  return (
    <section className="tm-subadmin-panel" aria-label="Sub-admin payment management">
      <div className="tm-subadmin-panel-head">
        <div><p className="tm-human-eyebrow">Human Work · Payroll</p><h2>Sub-admin payments</h2><p>Daily accruals, half-month invoices and recorded payments. This page tracks balances only; it does not send money.</p></div>
        <button type="button" className="tm-admin-payout-search-btn" onClick={search} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
      </div>
      <div className="tm-human-chat-card tm-subadmin-section">
        <div className="tm-human-chat-head"><div><strong>Find earnings</strong><span>Filter by sub-admin and shift date.</span></div></div>
        <div className="tm-admin-payout-filters tm-subadmin-filters">
          <label>Sub-admin<select value={filters.subadmin_uid} onChange={(event) => setFilters((value) => ({ ...value, subadmin_uid: event.target.value }))}><option value="">All sub-admins</option>{options.map((item) => <option key={item.uid} value={item.uid}>{item.name ? `${item.name} · ` : ''}{item.email}</option>)}</select></label>
          <label>From<input type="date" value={filters.start_date} onChange={(event) => setFilters((value) => ({ ...value, start_date: event.target.value }))} /></label>
          <label>To<input type="date" value={filters.end_date} onChange={(event) => setFilters((value) => ({ ...value, end_date: event.target.value }))} /></label>
          <div className="tm-admin-payout-quickranges"><button type="button" onClick={() => chooseRange('today')}>Today</button><button type="button" onClick={() => chooseRange('week')}>Last 7 days</button></div>
          <button type="button" className="tm-admin-payout-search-btn" onClick={search} disabled={loading}>{loading ? 'Searching…' : 'Search'}</button>
        </div>
      </div>
      <div className="tm-subadmin-metrics tm-subadmin-metrics-four">
        <div><span>All selected work</span><strong>{kesThree(totals.total_kes)}</strong><small>{filters.start_date} to {filters.end_date}</small></div>
        <div><span>Human audio</span><strong>{kesThree(totals.audio_human)}</strong><small>Approved by a human</small></div>
        <div><span>AI audio</span><strong>{kesThree(totals.audio_ai)}</strong><small>AI-assisted</small></div>
        <div><span>Image work</span><strong>{kesThree((totals.image_human || 0) + (totals.image_ai || 0))}</strong><small>Human {kesThree(totals.image_human)} · AI {kesThree(totals.image_ai)}</small></div>
      </div>
      <div className="tm-human-chat-card tm-subadmin-section">
        <div className="tm-human-chat-head"><div><strong>Daily accumulation</strong><span>Grouped by the sub-admin’s eligible shift date.</span></div></div>
        {loading && !earningsData ? <p className="tm-human-empty">Loading daily totals…</p> : daily.length ? <div className="tm-subadmin-table-wrap"><table className="tm-admin-payout-table"><thead><tr><th>Date</th><th>Human audio</th><th>AI audio</th><th>Human images</th><th>AI images</th><th>Total</th></tr></thead><tbody>{daily.map((day) => <tr key={day.date}><td>{day.date}</td><td>{kesThree(day.audio_human)}</td><td>{kesThree(day.audio_ai)}</td><td>{kesThree(day.image_human)}</td><td>{kesThree(day.image_ai)}</td><td><strong>{kesThree(day.total_kes)}</strong></td></tr>)}</tbody></table></div> : <p className="tm-human-empty">No eligible earnings in this date range.</p>}
      </div>
      <div className="tm-human-chat-card tm-subadmin-section">
        <div className="tm-human-chat-head"><div><strong>Approved work details</strong><span>Rates are snapshotted on each earning; later changes do not alter this history.</span></div></div>
        {earnings.length ? <div className="tm-subadmin-table-wrap"><table className="tm-admin-payout-table"><thead><tr><th>Date</th><th>Sub-admin</th><th>Job</th><th>Category</th><th>Units</th><th>Rate</th><th>Amount</th><th>Status</th></tr></thead><tbody>{earnings.map((item) => <tr key={item.earning_id}><td>{item.work_date}</td><td>{item.subadmin_email}</td><td title={item.job_id}>{item.job_name}</td><td>{subadminCategoryLabel(item.category)}</td><td>{item.quantity} {item.measure}</td><td>{kesThree(item.rate_kes_per_unit)} / {item.measure === 'minutes' ? 'min' : 'word'}</td><td>{kesThree(item.amount_kes)}</td><td>{PAYOUT_STATUS_LABELS[item.payout_status] || item.payout_status}</td></tr>)}</tbody></table></div> : !loading && <p className="tm-human-empty">No approved work matched this range.</p>}
      </div>
      <div className="tm-human-chat-card tm-subadmin-section">
        <div className="tm-human-chat-head"><div><strong>Half-month invoices</strong><span>Each completed period is invoiced once the half ends; the next half accrues independently.</span></div><label className="tm-subadmin-invoice-filter">Status<select value={invoiceStatus} onChange={(event) => { const status = event.target.value; setInvoiceStatus(status); loadData(filters, status); }}><option value="pending">Pending payout</option><option value="paid">Paid</option><option value="all">All invoices</option></select></label></div>
        {invoiceData && <div className="tm-subadmin-invoice-totals"><span>Pending <strong>{kesThree(invoiceData.totals?.pending_kes)}</strong></span><span>Paid <strong>{kesThree(invoiceData.totals?.paid_kes)}</strong></span></div>}
        {invoices.length ? <div className="tm-subadmin-table-wrap"><table className="tm-admin-payout-table"><thead><tr><th>Sub-admin</th><th>Period</th><th>Human audio</th><th>AI audio</th><th>Human images</th><th>AI images</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody>{invoices.map((item) => <tr key={item.payout_id}><td>{item.subadmin_email}</td><td>{item.period_label}</td><td>{kesThree(item.category_totals_kes?.audio_human)}</td><td>{kesThree(item.category_totals_kes?.audio_ai)}</td><td>{kesThree(item.category_totals_kes?.image_human)}</td><td>{kesThree(item.category_totals_kes?.image_ai)}</td><td><strong>{kesThree(item.total_amount_kes)}</strong></td><td>{item.status === 'paid' ? `Paid ${moneylessDate(item.paid_at)}` : 'Pending'}</td><td>{item.status !== 'paid' && <button type="button" onClick={() => markPaid(item)} disabled={busyId === item.payout_id}>{busyId === item.payout_id ? 'Saving…' : 'Mark paid'}</button>}</td></tr>)}</tbody></table></div> : !loading && <p className="tm-human-empty">No invoices in this view yet.</p>}
      </div>
    </section>
  );
}

function ratesFromServer(data) {
  return {
    audio_human_kes_per_minute: String(data.audio_human_kes_per_minute ?? 10),
    audio_ai_kes_per_minute: String(data.audio_ai_kes_per_minute ?? 20),
    image_human_kes_per_word: String(data.image_human_kes_per_word ?? 0.2),
    image_ai_kes_per_word: String(data.image_ai_kes_per_word ?? 0.15),
  };
}

function AdminSubadminRatesPanel({ request, showMessage }) {
  const [rates, setRates] = useState(null);
  const [saving, setSaving] = useState(false);
  const [recalc, setRecalc] = useState({ start_date: nairobiDateIso(), end_date: nairobiDateIso() });
  const [recalcPreview, setRecalcPreview] = useState(null);
  const [recalcBusy, setRecalcBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const data = await request('/api/admin/subadmin-rates');
      setRates(ratesFromServer(data));
    } catch (error) { showMessage?.(error.message, 'error'); }
  }, [request, showMessage]);
  useEffect(() => { load(); }, [load]);
  const save = async (event) => {
    event.preventDefault();
    if (!rates) return;
    setSaving(true);
    try {
      const data = await request('/api/admin/subadmin-rates', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        audio_human_kes_per_minute: Number(rates.audio_human_kes_per_minute),
        audio_ai_kes_per_minute: Number(rates.audio_ai_kes_per_minute),
        image_human_kes_per_word: Number(rates.image_human_kes_per_word),
        image_ai_kes_per_word: Number(rates.image_ai_kes_per_word),
      }) });
      setRates(ratesFromServer(data));
      setRecalcPreview(null);
      showMessage?.('Sub-admin rates saved for future earnings.', 'success');
    } catch (error) { showMessage?.(error.message, 'error'); }
    finally { setSaving(false); }
  };
  const runRecalculate = async (apply) => {
    setRecalcBusy(true);
    try {
      const data = await request('/api/admin/subadmin-earnings/recalculate-images', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...recalc, apply }) });
      setRecalcPreview(apply ? { ...data, done: true } : data);
      showMessage?.(apply ? `Updated ${data.changed_count} image earnings.` : `${data.changed_count} image earnings would change.`, 'success');
    } catch (error) { showMessage?.(error.message, 'error'); }
    finally { setRecalcBusy(false); }
  };
  if (!rates) return <div className="tm-human-chat-card tm-human-empty">Loading sub-admin rates…</div>;
  const setRate = (key, value) => setRates((current) => ({ ...current, [key]: value }));
  return (
    <form className="tm-human-chat-card tm-subadmin-rates" onSubmit={save}>
      <div className="tm-human-chat-head"><div><strong>Sub-admin rates</strong><span>Saving changes the rate for new earnings. Use the correction tool below for earnings that are still accruing.</span></div></div>
      <div className="tm-subadmin-rate-grid">
        <label>Human-submitted audio <span>KES per minute</span><input type="number" min="0" max="10000" step="1" required value={rates.audio_human_kes_per_minute} onChange={(event) => setRate('audio_human_kes_per_minute', event.target.value)} /></label>
        <label>AI-assisted audio <span>KES per minute</span><input type="number" min="0" max="10000" step="1" required value={rates.audio_ai_kes_per_minute} onChange={(event) => setRate('audio_ai_kes_per_minute', event.target.value)} /></label>
        <label>Human-submitted images <span>KES per word</span><input type="number" min="0" max="1000" step="0.001" required value={rates.image_human_kes_per_word} onChange={(event) => setRate('image_human_kes_per_word', event.target.value)} /></label>
        <label>AI agent images <span>KES per word</span><input type="number" min="0" max="1000" step="0.001" required value={rates.image_ai_kes_per_word} onChange={(event) => setRate('image_ai_kes_per_word', event.target.value)} /></label>
      </div>
      <p className="tm-subadmin-rate-note">Image work is paid per word: human-submitted work and AI agent work have separate rates. AI proofreading never counts as AI agent work. Earnings keep three decimal places.</p>
      <div className="tm-subadmin-rate-actions"><button type="submit" className="tm-admin-payout-search-btn" disabled={saving}>{saving ? 'Saving…' : 'Save rates'}</button><button type="button" onClick={load} disabled={saving}>Reload</button></div>
      <div className="tm-subadmin-recalc">
        <strong>Correct image earnings</strong>
        <p>Re-prices image earnings that are still accruing (not yet in an invoice) using the saved rates. Audio earnings are never changed. Save the rates first, preview, then apply.</p>
        <div className="tm-subadmin-recalc-row">
          <label>From<input type="date" value={recalc.start_date} onChange={(event) => { setRecalc((previous) => ({ ...previous, start_date: event.target.value })); setRecalcPreview(null); }} /></label>
          <label>To<input type="date" value={recalc.end_date} onChange={(event) => { setRecalc((previous) => ({ ...previous, end_date: event.target.value })); setRecalcPreview(null); }} /></label>
          <button type="button" onClick={() => runRecalculate(false)} disabled={recalcBusy || saving}>{recalcBusy ? 'Working…' : 'Preview changes'}</button>
          <button type="button" className="tm-admin-payout-search-btn" onClick={() => runRecalculate(true)} disabled={recalcBusy || saving || !recalcPreview || recalcPreview.done || !recalcPreview.changed_count}>Apply corrections</button>
        </div>
        {recalcPreview && (
          <div className="tm-subadmin-recalc-result" role="status">
            <p><strong>{recalcPreview.done ? 'Applied' : 'Preview'}:</strong> {recalcPreview.changed_count} image earnings, KES {recalcPreview.old_total_kes.toFixed(3)} to KES {recalcPreview.new_total_kes.toFixed(3)}{recalcPreview.skipped_invoiced_count ? `. ${recalcPreview.skipped_invoiced_count} already invoiced were left untouched.` : '.'}</p>
            {recalcPreview.changes.length > 0 && (
              <table className="tm-admin-payout-table"><thead><tr><th>Sub-admin</th><th>Type</th><th>Words</th><th>Old</th><th>New</th></tr></thead><tbody>
                {recalcPreview.changes.map((change) => <tr key={change.earning_id}><td>{change.subadmin_email}</td><td>{change.old_category && change.old_category !== change.category ? `${change.old_category === 'image_ai' ? 'AI' : 'Human'} → ${change.category === 'image_ai' ? 'AI' : 'Human'} image` : (change.category === 'image_ai' ? 'AI image' : 'Human image')}</td><td>{change.words}</td><td>KES {change.old_amount_kes.toFixed(3)}</td><td>KES {change.new_amount_kes.toFixed(3)}</td></tr>)}
              </tbody></table>
            )}
          </div>
        )}
      </div>
    </form>
  );
}
