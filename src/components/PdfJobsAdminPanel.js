import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';
const PDF_ADMIN_EMAIL = 'info@typemywordz.ai';
const statusLabel = (status) => ({ approved: 'Available to claim', assigned: 'Claimed', in_progress: 'In progress', submitted: 'Submitted for review', released: 'Completed', cancelled: 'Cancelled' }[status] || status || 'Available to claim');
const moneylessDate = (value) => { if (!value) return '—'; const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); };

export default function PdfJobsAdminPanel({ showMessage, onOpenQueue }) {
  const { currentUser } = useAuth();
  const [files, setFiles] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);

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

  const uploadFiles = async (event) => {
    event.preventDefault();
    if (!files.length || uploading) return;
    setUploading(true);
    try {
      const token = await currentUser.getIdToken();
      const form = new FormData();
      files.forEach((file) => form.append('files', file, file.name));
      const response = await fetch(`${BACKEND_URL}/human-transcription/admin/pdf-jobs`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || 'The selected files could not be added.');
      setFiles([]);
      setFileInputKey((value) => value + 1);
      showMessage?.(`${payload.created_count || 0} image job${payload.created_count === 1 ? '' : 's'} added to Available Jobs.`, 'success');
      await loadJobs();
    } catch (error) { showMessage?.(error.message, 'error'); }
    finally { setUploading(false); }
  };

  if ((currentUser?.email || '').toLowerCase() !== PDF_ADMIN_EMAIL) return <section className="tm-admin-panel"><h2 className="tm-admin-panel-title">PDF Jobs</h2><p className="tm-admin-panel-note">This section is available to the dedicated PDF Jobs admin account.</p></section>;

  return <div className="tm-pdf-jobs-panel">
    <section className="tm-admin-panel tm-pdf-jobs-upload">
      <div className="tm-admin-panel-head"><div><p className="tm-admin-kicker">Image transcription</p><h2 className="tm-admin-panel-title">PDF Jobs</h2><p className="tm-admin-panel-note">Upload images or PDFs. Each image and each PDF page becomes one separate job for one worker. Worker pay is fixed at KES 100 for each submitted image.</p></div><button type="button" className="tm-admin-btn" onClick={onOpenQueue}>Open Human Work queue</button></div>
      <form onSubmit={uploadFiles}>
        <label className="tm-pdf-jobs-dropzone"><strong>Select images or PDFs</strong><span>JPG, PNG, WebP, TIFF, or PDF · Up to 25 MB per file · 100 pages per PDF</span><input key={fileInputKey} type="file" accept=".pdf,image/*" multiple onChange={(event) => setFiles(Array.from(event.target.files || []))} /></label>
        {files.length > 0 && <div className="tm-pdf-jobs-selected"><div><strong>{files.length} source file{files.length === 1 ? '' : 's'} selected</strong><button type="button" className="tm-admin-link-button" onClick={() => { setFiles([]); setFileInputKey((value) => value + 1); }}>Clear selection</button></div>{files.map((file, index) => <div className="tm-pdf-jobs-file" key={`${file.name}-${index}`}><span>{file.name}</span><small>{(file.size / (1024 * 1024)).toFixed(1)} MB</small><button type="button" aria-label={`Remove ${file.name}`} onClick={() => { setFiles((previous) => previous.filter((_, fileIndex) => fileIndex !== index)); setFileInputKey((value) => value + 1); }}>Remove</button></div>)}</div>}
        <div className="tm-pdf-jobs-actions"><span>Workers will see: “Always use Gemini for image transcription”.</span><button type="submit" className="tm-admin-btn" disabled={!files.length || uploading}>{uploading ? 'Preparing jobs…' : 'Add to Available Jobs'}</button></div>
      </form>
    </section>
    <section className="tm-admin-panel tm-pdf-jobs-list">
      <div className="tm-admin-panel-head"><div><h2 className="tm-admin-panel-title">Uploaded image jobs</h2><p className="tm-admin-panel-note">Review status and worker submissions in the Human Work queue.</p></div><button type="button" className="tm-admin-btn" onClick={loadJobs} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button></div>
      <div className="tm-admin-table-scroll"><table className="tm-admin-table"><thead><tr><th>Image / source</th><th>Status</th><th>Worker</th><th>Worker pay</th><th>Added</th></tr></thead><tbody>{jobs.map((job) => <tr key={job.id}><td><strong>{job.name}</strong><div className="tm-admin-name">{job.source_filename}{job.page_count > 1 ? ` · Page ${job.page_number} of ${job.page_count}` : ''}</div></td><td>{statusLabel(job.status)}</td><td>{job.worker_name || job.worker_email || 'Not claimed'}</td><td>{job.worker_amount_kes ? `KES ${job.worker_amount_kes}` : job.status === 'approved' || job.status === 'assigned' || job.status === 'in_progress' ? 'KES 100 on submission' : 'KES 100'}</td><td>{moneylessDate(job.created_at)}</td></tr>)}</tbody></table>{!loading && !jobs.length && <div className="tm-admin-empty">No PDF image jobs have been uploaded yet.</div>}</div>
    </section>
  </div>;
}
