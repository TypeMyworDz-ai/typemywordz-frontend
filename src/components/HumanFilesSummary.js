import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';
const labels = { pending_admin: 'Waiting for admin', approved: 'Approved', assigned: 'Assigned', in_progress: 'In progress', submitted: 'Under review', client_review: 'Your approval needed', client_approved: 'Awaiting release', released: 'Released' };

export default function HumanFilesSummary() {
  const { currentUser } = useAuth();
  const [jobs, setJobs] = useState([]);
  const load = useCallback(async () => {
    if (!currentUser) return;
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(`${BACKEND_URL}/human-transcription/jobs?scope=mine`, { headers: { Authorization: `Bearer ${token}` } });
      if (response.ok) setJobs((await response.json()).jobs || []);
    } catch (error) { console.warn('Human files could not be loaded:', error); }
  }, [currentUser]);
  useEffect(() => { load(); }, [load]);
  if (!jobs.length) return null;
  return <section className="tm-human-files-summary"><div className="tm-human-files-summary-head"><div><p className="tm-human-eyebrow">Human work</p><h2>Proofreading and human transcripts</h2><p>These jobs stay with your files. Audio remains separate from the finished transcript.</p></div><span>{jobs.length} item{jobs.length === 1 ? '' : 's'}</span></div><div className="tm-human-files-rows">{jobs.map((job) => <div className="tm-human-files-row" key={job.id}><div><strong>{job.audio?.name || 'Human-transcription job'}</strong><span>{labels[job.status] || job.status} · {job.minutes || 0} minutes</span></div><b>{job.status === 'released' ? `${job.credits_charged || job.quote_credits || 0} credits used` : `${job.quote_credits || 0} credits quoted`}</b></div>)}</div></section>;
}
