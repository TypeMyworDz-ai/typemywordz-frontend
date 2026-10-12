import React, { useEffect, useRef, useState } from 'react';

const box = { border: '1px solid #e1e6e2', borderRadius: 8, padding: '12px 14px', display: 'grid', gap: 10, background: '#fff' };
const muted = { color: '#7b857d', fontSize: 12 };
const OPEN_STATES = ['split_assigned', 'split_in_progress', 'proofreading_available', 'submitted', 'approved'];
const ACTIVE_PROOFREADER = ['assigned', 'in_progress'];

// General Jobs (audio) and whole-file Text Messages / PDF jobs go through the Proofreading Agent.
export const proofreadingAgentScope = (job) => {
  if (job?.job_type === 'general_job') return 'audio';
  if (job?.job_type === 'pdf_job' && job?.pdf_review) return 'image';
  return '';
};

// Until the agent has produced the transcript, admins never see the parts.
export const proofreadingPartsHidden = (job) => {
  if (!proofreadingAgentScope(job) || job?.proofreading_agent_completedAt) return false;
  if (!OPEN_STATES.includes(job?.status)) return false;
  if (['ai', 'human'].includes(String(job?.reviewer_choice || '').toLowerCase())) return false;
  return !['assigned', 'in_progress', 'submitted'].includes(job?.proofreader_status);
};

export const proofreadingAgentReady = (job) => {
  const scope = proofreadingAgentScope(job);
  if (!scope || !OPEN_STATES.includes(job?.status)) return false;
  if (ACTIVE_PROOFREADER.includes(job?.proofreader_status)) return false;
  if (scope === 'image') return true;
  const segments = Array.isArray(job?.segments) ? job.segments : [];
  if (segments.length) return segments.every((part) => part?.status === 'submitted');
  return job?.status === 'submitted' && Boolean(String(job?.transcript || '').trim());
};

// Lines such as "Part 1 submitted for Proofreading" shown instead of the text.
export function ProofreadingPartsNotice({ job }) {
  const scope = proofreadingAgentScope(job);
  const segments = Array.isArray(job?.segments) ? job.segments : [];
  let lines = [];
  if (scope === 'image') {
    const pages = Number(job?.pdf_review?.page_count) || (job?.pdf_review?.page_texts || []).length || 1;
    lines = Array.from({ length: pages }, (_, index) => `Page ${index + 1} submitted for Proofreading`);
  } else if (segments.length) {
    lines = segments.filter((part) => part?.status === 'submitted').map((part, index) => `${part.label || `Part ${index + 1}`} submitted for Proofreading`);
  } else if (job?.status === 'submitted') {
    lines = ['Transcript submitted for Proofreading'];
  }
  return (
    <div className="tm-human-empty" role="status" data-testid="proofreading-parts-notice" style={{ display: 'grid', gap: 6, textAlign: 'left' }}>
      {lines.length ? lines.map((line) => <div key={line}>{line}</div>) : <div>The submitted work will be listed here.</div>}
    </div>
  );
}

export function ProofreadingAgentPanel({ job, act, busy, onDownloadCombined }) {
  const [starting, setStarting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [note, setNote] = useState('');
  const run = job?.proofreading_run || {};
  const startedMs = run.startedAt ? Date.parse(run.startedAt) : 0;
  const serverRunning = ['queued', 'processing'].includes(run.status) && startedMs > 0 && (now - startedMs) < 30 * 60 * 1000;
  const running = starting || serverRunning;
  const failed = !running && run.status === 'failed' ? (run.error || 'The Proofreading Agent could not finish.') : '';
  const percent = Math.max(2, Math.min(100, Number(run.progress) || 2));
  const elapsed = startedMs ? Math.max(0, Math.round((now - startedMs) / 1000)) : 0;
  const ready = proofreadingAgentReady(job);
  const done = Boolean(job?.proofreading_agent_completedAt);
  const review = job?.ai_review?.agent === 'proofreading_agent' ? job.ai_review : null;
  const wasRunning = useRef(false);

  useEffect(() => {
    if (!running) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);
  useEffect(() => {
    if (wasRunning.current && !serverRunning && run.status === 'completed') setNote('The client-ready transcript is now in the editor.');
    wasRunning.current = serverRunning;
  }, [serverRunning, run.status]);

  if (!running && !failed && !ready && !done) {
    return proofreadingAgentScope(job) ? (
      <div className="tm-human-assign" style={box}>
        <strong>Proofreading Agent</strong>
        <div style={muted}>The button appears here once every part has been submitted.</div>
      </div>
    ) : null;
  }

  const start = async () => {
    if (running) return;
    if (done && !window.confirm('Run the Proofreading Agent again? The transcript in the editor will be replaced.')) return;
    setStarting(true);
    setNow(Date.now());
    setNote('');
    try {
      await act(`/human-transcription/jobs/${job.id}/proofreading-agent`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }, 'Proofreading Agent started. You can leave this page; progress shows here.');
    } finally {
      window.setTimeout(() => setStarting(false), 5000);
    }
  };

  const downloadCombined = async () => {
    if (downloading || !onDownloadCombined) return;
    setDownloading(true);
    try { await onDownloadCombined(job); } finally { setDownloading(false); }
  };

  return (
    <div className="tm-human-assign" style={box} data-testid="proofreading-agent-panel">
      <div>
        <strong>Proofreading Agent</strong>
        <div style={muted}>Combines every submitted part into one client-ready transcript, checked against an AssemblyAI transcript of the whole recording. It keeps dictated paragraphs, joins the parts smoothly, standardises names and adds one spellings and research section at the end. A successful run costs 3 credits; a failed run costs nothing.</div>
      </div>
      <style>{'@keyframes tmPaSpin{to{transform:rotate(360deg)}}.tm-pa-spin{display:inline-block;width:14px;height:14px;margin-right:8px;vertical-align:-2px;border:2px solid rgba(91,45,158,.25);border-top-color:#5b2d9e;border-radius:50%;animation:tmPaSpin .8s linear infinite}'}</style>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        <button type="button" className="tm-admin-btn" disabled={busy || running || !ready} aria-busy={running} onClick={start}>
          {running ? <><span className="tm-pa-spin" aria-hidden="true" />Proofreading...</> : (done ? 'Run Proofreading Agent again' : 'Run Proofreading Agent')}
        </button>
        {onDownloadCombined && (ready || done) && (
          <button type="button" className="tm-admin-btn" disabled={downloading} aria-busy={downloading} onClick={downloadCombined} title="Backup copy of every submitted part, combined, before any proofreading">
            {downloading ? 'Preparing Word file...' : 'Download all parts (Word)'}
          </button>
        )}
        {running && <span role="status" style={{ ...muted, color: '#4b2a8a' }}>{run.stage || 'Starting'} ({elapsed}s). It keeps running if you leave or reload this page.</span>}
      </div>
      {running && (
        <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Proofreading Agent progress" style={{ height: 8, background: '#e9e4f5', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{ width: `${percent}%`, height: '100%', background: '#5b2d9e', transition: 'width .6s ease' }} />
        </div>
      )}
      {failed && <div role="alert" style={{ color: '#9a2b2b', fontSize: 13 }}>{failed} Nothing was changed. You can try again.</div>}
      {note && !running && <span role="status" style={{ ...muted, color: '#267b40' }}>{note}</span>}
      {review && !running && (review.changes || []).length > 0 && (
        <details>
          <summary style={{ cursor: 'pointer', fontSize: 13 }}>What the agent corrected ({review.changes.length})</summary>
          <ul style={{ margin: '6px 0 0 18px', padding: 0, fontSize: 13, display: 'grid', gap: 4 }}>
            {review.changes.map((item, index) => <li key={index}>{item.before ? <>&ldquo;{item.before}&rdquo; to &ldquo;{item.after}&rdquo;. </> : null}<span style={muted}>{item.why}</span></li>)}
          </ul>
        </details>
      )}
    </div>
  );
}
