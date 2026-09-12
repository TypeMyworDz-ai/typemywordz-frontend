import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { fetchUserTranscriptions, deleteTranscription, updateTranscription } from '../userService';
import { useNavigate } from 'react-router-dom';
import ConfirmDialog from './ConfirmDialog';
import { htmlToText } from '../lib/transcript';
import './Dashboard.css';

const BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';

const HUMAN_STATUS = {
  pending_admin: { label: 'Waiting for admin', tone: 'waiting', note: 'Your request is in the admin queue.' },
  approved: { label: 'Approved', tone: 'approved', note: 'Ready to be assigned to a proofreader.' },
  assigned: { label: 'Assigned', tone: 'assigned', note: 'A proofreader has been assigned.' },
  in_progress: { label: 'In progress', tone: 'progress', note: 'Your proofreader is working on it.' },
  submitted: { label: 'Under review', tone: 'review', note: 'The completed work is with the admin.' },
  client_review: { label: 'Your approval needed', tone: 'action', note: 'Review the finished transcript before release.' },
  client_approved: { label: 'Awaiting release', tone: 'action', note: 'The admin will release it after the final credit check.' },
  released: { label: 'Released', tone: 'released', note: 'Ready to open and download.' },
  cancelled: { label: 'Cancelled', tone: 'cancelled', note: 'This request is closed.' },
};

const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (value) => {
  const date = toDate(value);
  if (!date) return 'Date unavailable';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

const formatDuration = (seconds) => {
  const total = Number(seconds);
  if (!Number.isFinite(total) || total <= 0) return 'Length unavailable';
  const minutes = Math.floor(total / 60);
  const remaining = Math.floor(total % 60).toString().padStart(2, '0');
  return `${minutes}:${remaining}`;
};

const humanFileName = (job) => job.audio?.name || job.fileName || 'Proofreading request';

const normalizeAiItem = (transcription) => ({
  ...transcription,
  kind: 'ai',
  title: transcription.fileName || 'Untitled transcript',
  date: transcription.createdAt,
  durationSeconds: transcription.duration,
  searchable: `${transcription.fileName || ''} ${htmlToText(transcription.transcriptionText || transcription.text || '')}`.toLowerCase(),
});

const normalizeHumanItem = (job) => ({
  ...job,
  kind: 'human',
  title: humanFileName(job),
  date: job.createdAt,
  durationSeconds: Number(job.seconds || 0),
  searchable: `${humanFileName(job)} ${job.status || ''} ${job.instructions || ''}`.toLowerCase(),
});

const Dashboard = ({ setCurrentView, onOpenHumanJob, standalone = false }) => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [transcriptions, setTranscriptions] = useState([]);
  const [humanJobs, setHumanJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const loadFiles = useCallback(async () => {
    if (!currentUser?.uid) return;
    setLoading(true);
    setError('');
    try {
      const [fetchedTranscriptions, humanResponse] = await Promise.all([
        fetchUserTranscriptions(currentUser.uid),
        (async () => {
          try {
            const token = await currentUser.getIdToken();
            const response = await fetch(`${BACKEND_URL}/human-transcription/jobs?scope=mine`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (!response.ok) return [];
            const payload = await response.json();
            return payload.jobs || [];
          } catch (humanError) {
            console.warn('Human work could not be loaded:', humanError);
            return [];
          }
        })(),
      ]);
      setTranscriptions((fetchedTranscriptions || []).map((item) => ({
        ...item,
        createdAt: toDate(item.createdAt),
      })));
      setHumanJobs(humanResponse);
    } catch (loadError) {
      console.error('Error fetching files:', loadError);
      setError('We could not load your files. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const aiItems = useMemo(() => transcriptions.map(normalizeAiItem), [transcriptions]);
  const humanItems = useMemo(() => humanJobs.map(normalizeHumanItem), [humanJobs]);
  const allItems = useMemo(() => [...aiItems, ...humanItems], [aiItems, humanItems]);

  const filteredItems = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    const matchesFilter = (item) => activeFilter === 'all' || item.kind === activeFilter;
    return allItems.filter((item) => matchesFilter(item) && (!query || item.searchable.includes(query))).sort((a, b) => {
      if (sortBy === 'name') return a.title.localeCompare(b.title);
      if (sortBy === 'duration') return (b.durationSeconds || 0) - (a.durationSeconds || 0);
      if (sortBy === 'oldest') return (toDate(a.date)?.getTime() || 0) - (toDate(b.date)?.getTime() || 0);
      return (toDate(b.date)?.getTime() || 0) - (toDate(a.date)?.getTime() || 0);
    });
  }, [activeFilter, allItems, searchTerm, sortBy]);

  const totalMinutes = useMemo(() => allItems.reduce((sum, item) => sum + ((item.durationSeconds || 0) / 60), 0), [allItems]);
  const quotedCredits = useMemo(() => humanJobs.reduce((sum, job) => sum + Number(job.quote_credits || 0), 0), [humanJobs]);
  const releasedCredits = useMemo(() => humanJobs.reduce((sum, job) => sum + Number(job.credits_charged || 0), 0), [humanJobs]);

  const openNewTranscription = useCallback(() => {
    if (setCurrentView && !standalone) setCurrentView('transcribe');
    else navigate('/');
  }, [navigate, setCurrentView, standalone]);

  const openHumanWork = useCallback((jobId = '') => {
    if (onOpenHumanJob && !standalone) { onOpenHumanJob(jobId); return; }
    if (setCurrentView && !standalone) setCurrentView('human_transcripts');
    else navigate('/');
  }, [navigate, onOpenHumanJob, setCurrentView, standalone]);

  const handleEdit = useCallback((transcription, event) => {
    event.stopPropagation();
    setEditingId(transcription.id);
    setEditingText(transcription.transcriptionText || transcription.text || '');
  }, []);

  const handleDelete = useCallback((transcriptionId, event) => {
    event.stopPropagation();
    setPendingDelete(transcriptionId);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete || !currentUser?.uid) return;
    setDeleting(true);
    try {
      await deleteTranscription(currentUser.uid, pendingDelete);
      setPendingDelete(null);
      await loadFiles();
    } catch (deleteError) {
      console.error('Error deleting transcription:', deleteError);
      setError('The transcript could not be deleted. Please try again.');
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  }, [currentUser?.uid, loadFiles, pendingDelete]);

  const saveEdit = useCallback(async () => {
    if (!editingId || !currentUser?.uid) return;
    setIsSaving(true);
    try {
      await updateTranscription(currentUser.uid, editingId, { transcriptionText: editingText });
      setTranscriptions((previous) => previous.map((item) => (
        item.id === editingId ? { ...item, transcriptionText: editingText } : item
      )));
      setEditingId(null);
      setEditingText('');
    } catch (saveError) {
      console.error('Error updating transcription:', saveError);
      setError('The transcript could not be saved. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [currentUser?.uid, editingId, editingText]);

  if (!currentUser) {
    return <div className="tm-files-state"><h2>Sign in to open your Dashboard</h2><p>Your saved transcripts and proofreading requests will appear here.</p></div>;
  }

  if (loading) {
    return <div className="tm-files-state"><div className="tm-files-spinner" /><p>Loading your work</p></div>;
  }

  if (error) {
    return <div className="tm-files-state tm-files-state-error"><h2>Dashboard is having trouble loading</h2><p>{error}</p><button type="button" className="tm-files-primary" onClick={loadFiles}>Try again</button></div>;
  }

  return (
    <div className="tm-files-page">
      <div className="tm-files-container">
        <header className="tm-files-header">
          <div>
            <p className="tm-files-eyebrow">Your work library</p>
            <h1>Dashboard</h1>
            <p className="tm-files-intro">AI transcripts and proofreading work, together in one place.</p>
          </div>
          <button type="button" className="tm-files-primary" onClick={openNewTranscription}>
            <span aria-hidden="true">+</span> New transcription
          </button>
        </header>

        <section className="tm-dashboard-guidelines" aria-label="Human-work guidelines">
          <div><p className="tm-files-eyebrow">Human-work reference</p><h2>TypeMyworDz work guidelines</h2><p>Review the standards used for proofreading requests, client instructions, names, speaker turns, timestamps and final quality checks.</p></div>
          <a href="/training-guidelines.html" target="_blank" rel="noreferrer">Open guidelines</a>
        </section>

        <section className="tm-files-overview" aria-label="File overview">
          <div className="tm-files-overview-lead">
            <span className="tm-files-overview-mark" aria-hidden="true">↗</span>
            <div><strong>{allItems.length} {allItems.length === 1 ? 'piece' : 'pieces'} of work</strong><span>Nothing is lost when you leave the editor.</span></div>
          </div>
          <div className="tm-files-overview-stat"><strong>{Math.round(totalMinutes)}</strong><span>minutes</span></div>
          <div className="tm-files-overview-stat"><strong>{humanJobs.length}</strong><span>proofreading {humanJobs.length === 1 ? 'request' : 'requests'}</span></div>
          {humanJobs.length > 0 && <div className="tm-files-overview-stat"><strong>{releasedCredits || quotedCredits}</strong><span>{releasedCredits ? 'credits used' : 'credits quoted'}</span></div>}
        </section>

        <section className="tm-files-controls" aria-label="Find files">
          <div className="tm-files-tabs" role="tablist" aria-label="File type">
            {[['all', 'All work', allItems.length], ['ai', 'AI transcripts', aiItems.length], ['human', 'Proofreading', humanItems.length]].map(([value, label, count]) => (
              <button key={value} type="button" role="tab" aria-selected={activeFilter === value} className={activeFilter === value ? 'active' : ''} onClick={() => setActiveFilter(value)}>
                {label}<span>{count}</span>
              </button>
            ))}
          </div>
          <div className="tm-files-tools">
            <label className="tm-files-search"><span className="sr-only">Search files</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 21-4.5-4.5m2-5.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z" /></svg><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search by file name or words" /></label>
            <label className="tm-files-sort"><span>Sort</span><select value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">File name</option><option value="duration">Longest first</option></select></label>
          </div>
        </section>

        <div className="tm-files-list-head"><div><p className="tm-files-eyebrow">Recent work</p><h2>{activeFilter === 'all' ? 'Everything you have made' : activeFilter === 'ai' ? 'AI transcripts' : 'Proofreading work'}</h2></div><span>{filteredItems.length} shown</span></div>

        {filteredItems.length === 0 ? (
          <section className="tm-files-empty">
            <div className="tm-files-empty-icon" aria-hidden="true">⌁</div>
            <h3>{searchTerm ? 'No matching files' : activeFilter === 'human' ? 'No proofreading work yet' : 'Your library is ready'}</h3>
            <p>{searchTerm ? 'Try a different file name or phrase.' : activeFilter === 'human' ? 'When you request proofreading, its quote and progress will appear here.' : 'Start with a recording or upload a file and it will stay here for you.'}</p>
            {!searchTerm && <button type="button" className="tm-files-secondary" onClick={activeFilter === 'human' ? openHumanWork : openNewTranscription}>{activeFilter === 'human' ? 'Open proofreading' : 'Start transcribing'}</button>}
          </section>
        ) : (
          <section className="tm-files-list" aria-label="Saved work">
            {filteredItems.map((item) => {
              const humanStatus = item.kind === 'human' ? (HUMAN_STATUS[item.status] || { label: item.status || 'Human work', tone: 'waiting', note: 'This request is in your library.' }) : null;
              const isEditing = item.kind === 'ai' && editingId === item.id;
              return (
                <article key={`${item.kind}-${item.id}`} className={`tm-file-row tm-file-row-${item.kind} ${humanStatus ? `tm-file-status-${humanStatus.tone}` : ''}`} onClick={() => item.kind === 'human' ? openHumanWork(item.id) : navigate(`/transcription/${item.id}`, { state: { transcription: item } })}>
                  <div className="tm-file-type-mark" aria-hidden="true">{item.kind === 'human' ? 'P' : 'T'}</div>
                  <div className="tm-file-main">
                    <div className="tm-file-title-line"><h3>{item.title}</h3><span className={`tm-file-category tm-file-category-${item.kind}`}>{item.kind === 'human' ? 'Proofreading' : 'AI transcript'}</span>{humanStatus && <span className={`tm-file-status tm-file-status-chip-${humanStatus.tone}`}>{humanStatus.label}</span>}</div>
                    {isEditing ? (
                      <div className="tm-file-editor" onClick={(event) => event.stopPropagation()}><textarea value={editingText} onChange={(event) => setEditingText(event.target.value)} /><div><button type="button" className="tm-files-quiet" onClick={() => { setEditingId(null); setEditingText(''); }}>Cancel</button><button type="button" className="tm-files-secondary" disabled={isSaving} onClick={saveEdit}>{isSaving ? 'Saving' : 'Save changes'}</button></div></div>
                    ) : <p className="tm-file-preview">{item.kind === 'human' ? humanStatus.note : (() => { const plain = htmlToText(item.transcriptionText || item.text || '').trim(); return plain ? (plain.length > 190 ? `${plain.slice(0, 190)}…` : plain) : 'This transcript is empty.'; })()}</p>}
                    <div className="tm-file-meta"><span>{formatDate(item.date)}</span><span>{formatDuration(item.durationSeconds)}</span>{item.kind === 'human' && <span>{item.quote_credits || 0} credits quoted{item.credits_charged ? ` · ${item.credits_charged} used` : ''}</span>}</div>
                  </div>
                  <div className="tm-file-actions" onClick={(event) => event.stopPropagation()}>{item.kind === 'ai' && <><button type="button" aria-label={`Edit ${item.title}`} title="Edit transcript" onClick={(event) => handleEdit(item, event)}>Edit</button><button type="button" className="danger" aria-label={`Delete ${item.title}`} title="Delete transcript" onClick={(event) => handleDelete(item.id, event)}>Delete</button></>}{item.kind === 'human' && <span className="tm-file-open">Open work <span aria-hidden="true">→</span></span>}</div>
                </article>
              );
            })}
          </section>
        )}

        <p className="tm-files-footnote">Audio is not kept with saved transcripts. If you reopen a transcript for proofreading, choose the original audio from your device.</p>
      </div>
      <ConfirmDialog open={!!pendingDelete} title="Delete this transcript?" body="The transcript and its wording will be removed from your files. This cannot be undone." confirmLabel="Delete" cancelLabel="Keep it" tone="danger" busy={deleting} onConfirm={confirmDelete} onCancel={() => setPendingDelete(null)} />
    </div>
  );
};

export default Dashboard;
