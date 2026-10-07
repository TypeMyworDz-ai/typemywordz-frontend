import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import UploadResultBanner, { announceJobsChanged } from './UploadResultBanner';

const BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';
const PDF_ADMIN_EMAILS = new Set(['info@typemywordz.ai', 'typemywordz@gmail.com']);
const DEFAULT_ADMIN_NOTE = 'Client provided spellings and other instructions: None';
const MAX_LONG_EDGE = 2000;
const JPEG_QUALITY = 0.82;
const COMPRESS_OVER_BYTES = 350 * 1024;

const moneylessDate = (value) => { if (!value) return ''; const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); };
const sizeLabel = (bytes) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`);

/** Shrinks one screenshot or photo in the browser. Anything that cannot be decoded is sent unchanged. */
export async function compressImageFile(file) {
  if (!file || !file.type?.startsWith('image/') || file.type === 'image/gif') return file;
  if (file.size <= COMPRESS_OVER_BYTES && file.type === 'image/jpeg') return file;
  try {
    let bitmap;
    const decodeTimeout = new Promise((_, reject) => window.setTimeout(() => reject(new Error('decode timeout')), 15000));
    if (typeof createImageBitmap === 'function') bitmap = await Promise.race([createImageBitmap(file), decodeTimeout]);
    else {
      bitmap = await Promise.race([decodeTimeout, new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
        image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
        image.src = url;
      })]);
    }
    const width = bitmap.width || bitmap.naturalWidth;
    const height = bitmap.height || bitmap.naturalHeight;
    if (!width || !height) return file;
    const scale = Math.min(1, MAX_LONG_EDGE / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    if (bitmap.close) bitmap.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    if (!blob || blob.size >= file.size) return file;
    const baseName = (file.name || 'image').replace(/\.[^.]+$/, '') || 'image';
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
  } catch { return file; }
}

export default function PdfJobsAdminPanel({ showMessage, onOpenQueue, category = 'pdf' }) {
  const { currentUser } = useAuth();
  const isText = category === 'text_messages';
  const sectionTitle = isText ? 'Text Messages' : 'PDF Jobs';
  const [files, setFiles] = useState([]);
  const [extras, setExtras] = useState([]);
  const [extraKey, setExtraKey] = useState(0);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [note, setNote] = useState(DEFAULT_ADMIN_NOTE);
  const [stage, setStage] = useState('');
  const [result, setResult] = useState(null);
  const [batches, setBatches] = useState([]);
  const [downloading, setDownloading] = useState('');
  const normalizedEmail = (currentUser?.email || '').trim().toLowerCase();
  const uploading = Boolean(stage);

  const loadBatches = useCallback(async () => {
    if (!currentUser || !PDF_ADMIN_EMAILS.has((currentUser.email || '').trim().toLowerCase())) return;
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(`${BACKEND_URL}/human-transcription/admin/pdf-jobs/recent-batches?category=${isText ? 'text_messages' : 'pdf'}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) setBatches(payload.batches || []);
    } catch { /* downloads simply stay hidden until the next upload */ }
  }, [currentUser, isText]);

  useEffect(() => { loadBatches(); }, [loadBatches]);

  const stageFiles = async (incoming, label) => {
    const list = Array.from(incoming || []);
    if (!list.length) return;
    const images = list.filter((file) => file.type?.startsWith('image/'));
    if (images.length) setStage(`Compressing ${images.length} image${images.length === 1 ? '' : 's'}…`);
    const prepared = [];
    for (let index = 0; index < list.length; index += 1) {
      const file = list[index];
      if (file.type?.startsWith('image/')) {
        setStage(`Compressing image ${prepared.filter((item) => item.type?.startsWith('image/')).length + 1} of ${images.length}…`);
        prepared.push(await compressImageFile(file));
      } else prepared.push(file);
    }
    setFiles((current) => current.concat(prepared));
    setStage('');
    if (label) showMessage?.(`${prepared.length} ${label} ready (compressed). Select Create image jobs when ready.`, 'success');
  };

  const stagePastedImages = (event) => {
    const imageItems = Array.from(event.clipboardData?.items || []).filter((item) => item.type?.startsWith('image/'));
    const pasted = imageItems.map((item, index) => {
      const blob = item.getAsFile();
      if (!blob) return null;
      const extension = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace(/[^a-z0-9]/gi, '') || 'png';
      return new File([blob], `pasted-image-${Date.now()}-${index + 1}.${extension}`, { type: blob.type || 'image/png', lastModified: Date.now() });
    }).filter(Boolean);
    if (!pasted.length) return;
    event.preventDefault();
    stageFiles(pasted, `pasted image${pasted.length === 1 ? '' : 's'}`);
  };

  const uploadFiles = async (event) => {
    event.preventDefault();
    if (!files.length || uploading) return;
    setResult(null);
    setStage(`Uploading ${files.length} file${files.length === 1 ? '' : 's'}…`);
    try {
      const token = await currentUser.getIdToken();
      const form = new FormData();
      files.forEach((file) => form.append('files', file, file.name));
      extras.forEach((file) => form.append('attachments', file, file.name));
      if (note.trim()) form.append('instructions', note.trim());
      form.append('category', category);
      const response = await fetch(`${BACKEND_URL}/human-transcription/admin/pdf-jobs`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || 'The selected files could not be added. Your images are still staged; try again.');
      setFiles([]);
      setFileInputKey((value) => value + 1);
      setExtras([]); setExtraKey((value) => value + 1); setNote(DEFAULT_ADMIN_NOTE);
      const createdCount = payload.created_count || 0;
      setResult({ kind: 'success', title: `${createdCount} job${createdCount === 1 ? '' : 's'} created`, detail: 'They are live under Needs action in the Job Queue, ready for workers or an AI agent.', at: Date.now() });
      announceJobsChanged();
      await loadBatches();
    } catch (error) { setResult({ kind: 'error', title: 'your images are still staged', detail: error.message || 'The upload failed. Your images are still staged; try again.', at: Date.now() }); }
    finally { setStage(''); }
  };

  const downloadBatch = async (batch) => {
    if (downloading) return;
    setDownloading(batch.batch_id);
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(`${BACKEND_URL}/human-transcription/admin/pdf-jobs/batches/${encodeURIComponent(batch.batch_id)}/download`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || 'The uploaded images could not be combined into a PDF.');
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `${String(batch.download_name || batch.name || 'image-upload').replace(/\.[^.]+$/, '') || 'image-upload'}.pdf`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { showMessage?.(error.message || 'The PDF could not be downloaded.', 'error'); }
    finally { setDownloading(''); }
  };

  if (!PDF_ADMIN_EMAILS.has(normalizedEmail)) return <section className="tm-admin-panel"><h2 className="tm-admin-panel-title">{sectionTitle}</h2><p className="tm-admin-panel-note">This section is available to the admin team.</p></section>;

  return <div className="tm-pdf-jobs-panel">
    <section className="tm-admin-panel tm-pdf-jobs-upload">
      <div className="tm-admin-panel-head"><div><p className="tm-admin-kicker">{isText ? 'Text message screenshots' : 'Image transcription'}</p><h2 className="tm-admin-panel-title">{sectionTitle}</h2><p className="tm-admin-panel-note">{isText ? 'Upload or paste screenshots of text conversations. Every screenshot becomes one job. ' : 'Upload or paste images or PDFs. Every image or PDF page becomes one job. '}Images are compressed in your browser first so the upload is quick. New jobs appear under Needs action in the Job Queue, where you assign workers or AI agents, proofread, track progress and rate workers. Worker pay is {isText ? 'KES 50' : 'KES 100'} per image.</p></div><button type="button" className="tm-admin-btn tm-pdf-jobs-btn-secondary" onClick={onOpenQueue}>Go to Job Queue</button></div>
      <UploadResultBanner working={stage.startsWith('Uploading') ? stage : ''} result={result} onDismiss={() => setResult(null)} onOpenQueue={onOpenQueue} />
      <form onSubmit={uploadFiles}>
        <label className="tm-pdf-jobs-dropzone"><strong>{isText ? 'Select screenshots or a PDF of screenshots' : 'Select images or PDFs'}</strong><span>JPG, PNG, WebP, TIFF, PDF or Word (.docx) · Images are shrunk automatically · 100 pages per PDF.</span><input key={fileInputKey} type="file" accept=".pdf,.docx,.doc,image/*" multiple onChange={(event) => { stageFiles(event.target.files); setFileInputKey((value) => value + 1); }} /></label>
        <div className="tm-pdf-jobs-paste" tabIndex={0} role="region" aria-label="Paste screenshots here" onPaste={stagePastedImages}><strong>Or paste screenshots</strong><span>Click this box, then press Ctrl+V. Pasted images are compressed right away; nothing is uploaded until you select Create image jobs.</span></div>
        {stage && <p className="tm-pdf-jobs-stage" role="status">{stage}</p>}
        {files.length > 0 && <div className="tm-pdf-jobs-selected"><div><strong>{files.length} file{files.length === 1 ? '' : 's'} ready · {sizeLabel(files.reduce((sum, file) => sum + file.size, 0))} in total</strong><button type="button" className="tm-admin-link-button" disabled={uploading} onClick={() => setFiles([])}>Clear all</button></div>{files.map((file, index) => <div className="tm-pdf-jobs-file" key={`${file.name}-${index}`}><span>{file.name}</span><small>{sizeLabel(file.size)}</small><button type="button" aria-label={`Remove ${file.name}`} disabled={uploading} onClick={() => setFiles((previous) => previous.filter((_, fileIndex) => fileIndex !== index))}>Remove</button></div>)}</div>}
        <label className="tm-pdf-jobs-dropzone" style={{ marginTop: 12 }}><strong>Attach more files (optional)</strong><span>Documents with extra instructions: PDF, Word, text, image or audio, up to 25 MB each. The AI agent reads them and the assigned worker can download them.</span><input key={extraKey} type="file" accept=".pdf,.docx,.doc,.txt,.jpg,.jpeg,.png,.webp,audio/*,.mp3,.wav,.m4a" multiple onChange={(event) => setExtras(Array.from(event.target.files || []).slice(0, 6))} /></label>
        {extras.length > 0 && <div className="tm-pdf-jobs-selected">{extras.map((file, index) => <div className="tm-pdf-jobs-file" key={`${file.name}-${index}`}><span>{file.name}</span><small>{sizeLabel(file.size)}</small></div>)}</div>}
        <label style={{ display: 'grid', gap: 6, marginTop: 12 }}><strong>Admin notes and special instructions</strong><textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder={isText ? 'For example: label the speakers Sarah and Mike; the left side is Sarah' : 'Anything the client wants followed when transcribing these images'} /></label>
        <div className="tm-pdf-jobs-actions"><span>Workers and the AI agent see your instructions above.</span><button type="submit" className="tm-admin-btn tm-pdf-jobs-btn-primary" disabled={!files.length || uploading}>{uploading ? (stage || 'Working…') : 'Create image jobs'}</button></div>
      </form>
    </section>
    {batches.length > 0 && <section className="tm-admin-panel tm-pdf-jobs-list">
      <div className="tm-admin-panel-head"><div><h2 className="tm-admin-panel-title">Combined PDFs</h2><p className="tm-admin-panel-note">Every upload is combined into one PDF in upload order. Download it here; all other actions are in the Job Queue.</p></div></div>
      <div className="tm-pdf-jobs-selected tm-pdf-jobs-batches">{batches.map((batch) => <div className="tm-pdf-jobs-file tm-pdf-jobs-batch-row" key={batch.batch_id}><span>{batch.name}</span><small>{batch.image_count} image{batch.image_count === 1 ? '' : 's'} · {batch.job_count} job{batch.job_count === 1 ? '' : 's'}{batch.created_at ? ` · ${moneylessDate(batch.created_at)}` : ''}</small><button type="button" className="tm-admin-btn tm-pdf-jobs-btn-secondary" disabled={!!downloading} onClick={() => downloadBatch(batch)}>{downloading === batch.batch_id ? 'Preparing PDF…' : 'Download as one PDF'}</button></div>)}</div>
    </section>}
  </div>;
}
