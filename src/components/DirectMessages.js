import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';

const formatDate = (value) => {
  if (!value) return '';
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const roleLabel = (role) => {
  const normalized = String(role || '').trim().toLowerCase();
  if (['admin', 'support', 'team'].includes(normalized)) return 'team';
  if (normalized === 'trainee') return 'trainee';
  if (normalized === 'worker' || normalized === 'transcriber') return 'worker';
  return 'client';
};

const threadKey = (thread) => `${thread.kind}:${thread.kind === 'job' ? thread.job?.id : thread.user?.uid}`;

export default function DirectMessages({ showMessage, compact = false, onMessagesRead }) {
  const { currentUser } = useAuth();
  const [threads, setThreads] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [messages, setMessages] = useState([]);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(false);

  const request = useCallback(async (path, options = {}) => {
    const token = await currentUser.getIdToken();
    let response;
    try {
      response = await fetch(`${BACKEND_URL}${path}`, {
        ...options,
        headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
      });
    } catch {
      throw new Error('Messages could not reach the server. Please try again.');
    }
    const text = await response.text();
    let payload = {};
    try { payload = text ? JSON.parse(text) : {}; } catch { /* friendly fallback below */ }
    if (!response.ok) throw new Error(payload.detail || 'Messaging is unavailable right now.');
    return payload;
  }, [currentUser]);

  const loadInbox = useCallback(async (silent = false) => {
    try {
      const payload = await request('/api/messaging/inbox');
      const next = payload.threads || [];
      setThreads(next);
      setSelectedId((current) => current || next[0]?.id || '');
    } catch (error) {
      if (!silent) showMessage?.(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [request, showMessage]);

  const loadContacts = useCallback(async () => {
    try {
      const payload = await request('/api/messaging/contacts');
      setContacts(payload.contacts || []);
    } catch (error) {
      showMessage?.(error.message, 'error');
    }
  }, [request, showMessage]);

  const selectedThread = threads.find((thread) => thread.id === selectedId);
  const visibleThreads = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return threads;
    return threads.filter((thread) => [
      thread.title,
      thread.role,
      thread.job?.title,
      thread.latest?.preview,
      thread.latest?.senderName,
    ].filter(Boolean).join(' ').toLowerCase().includes(query));
  }, [search, threads]);

  const loadMessages = useCallback(async (silent = false) => {
    if (!selectedThread) {
      setMessages([]);
      return;
    }
    const path = selectedThread.kind === 'job'
      ? `/human-transcription/jobs/${encodeURIComponent(selectedThread.job.id)}/messages`
      : `/api/user-chats/${encodeURIComponent(selectedThread.user.uid)}/messages`;
    try {
      const payload = await request(path);
      setMessages(payload.messages || []);
      onMessagesRead?.();
      setThreads((current) => current.map((thread) => thread.id === selectedThread.id ? { ...thread, unreadCount: 0 } : thread));
    } catch (error) {
      if (!silent) showMessage?.(error.message, 'error');
    }
  }, [onMessagesRead, request, selectedThread, showMessage]);

  useEffect(() => { loadInbox(); loadContacts(); }, [loadContacts, loadInbox]);
  useEffect(() => {
    loadMessages();
    const interval = window.setInterval(() => { loadInbox(true); loadMessages(true); }, 5000);
    return () => window.clearInterval(interval);
  }, [loadInbox, loadMessages]);

  const startConversation = (event) => {
    const uid = event.target.value;
    if (!uid) return;
    const contact = contacts.find((item) => item.uid === uid);
    if (!contact) return;
    setStarting(false);
    setSelectedId(`user:${uid}`);
    setThreads((current) => current.some((thread) => thread.id === `user:${uid}`) ? current : [{
      id: `user:${uid}`, kind: 'user', user: contact, title: contact.name || contact.email, role: contact.role || 'client', job: null, latest: null, latestAt: '', unreadCount: 0,
    }, ...current]);
    setMessages([]);
  };

  const handleComposerKeyDown = (event) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    if (!busy && (draft.trim() || file)) event.currentTarget.form?.requestSubmit();
  };

  const send = async (event) => {
    event.preventDefault();
    if (!selectedThread || (!draft.trim() && !file)) return;
    setBusy(true);
    const path = selectedThread.kind === 'job'
      ? `/human-transcription/jobs/${encodeURIComponent(selectedThread.job.id)}/messages`
      : `/api/user-chats/${encodeURIComponent(selectedThread.user.uid)}/messages`;
    try {
      const form = new FormData();
      form.append('message', draft.trim());
      if (file) form.append('attachment', file);
      const payload = await request(path, { method: 'POST', body: form });
      if (payload.message) setMessages((current) => current.concat(payload.message));
      setDraft('');
      setFile(null);
      event.target.reset();
      await loadInbox(true);
    } catch (error) {
      showMessage?.(error.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const downloadAttachment = async (item) => {
    if (!selectedThread?.kind || !item.attachment) return;
    const path = selectedThread.kind === 'job'
      ? `/human-transcription/jobs/${encodeURIComponent(selectedThread.job.id)}/messages/${encodeURIComponent(item.id)}/attachment`
      : `/api/user-chats/${encodeURIComponent(selectedThread.user.uid)}/messages/${encodeURIComponent(item.id)}/attachment`;
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(`${BACKEND_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error('That attachment could not be downloaded.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = item.attachment.name || 'attachment';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      showMessage?.(error.message, 'error');
    }
  };

  const selectedTitle = selectedThread?.title || selectedThread?.user?.name || selectedThread?.user?.email || 'Select a conversation';
  const selectedRole = roleLabel(selectedThread?.role || selectedThread?.user?.role);

  return (
    <section className={`tm-inbox${compact ? ' tm-inbox-compact' : ''}`} aria-labelledby="direct-messages-title">
      <header className="tm-inbox-head">
        <div><p className="tm-human-eyebrow">Communication</p><h2 id="direct-messages-title">Messages</h2><p>Every person and job has its own conversation, so updates do not get lost.</p></div>
        <button type="button" className="tm-inbox-new" onClick={() => setStarting((value) => !value)}>New conversation</button>
      </header>
      {starting && <div className="tm-inbox-start"><label htmlFor="new-message-contact">Start with</label><select id="new-message-contact" defaultValue="" onChange={startConversation}><option value="">Choose a contact</option>{contacts.map((contact) => <option key={contact.uid} value={contact.uid}>{contact.name || contact.email} · {roleLabel(contact.role)}</option>)}</select></div>}
      <div className="tm-inbox-layout">
        <aside className="tm-inbox-sidebar" aria-label="Conversation list">
          <label className="tm-inbox-search"><span className="sr-only">Search conversations</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search conversations" /></label>
          {loading ? <div className="tm-inbox-empty">Loading conversations…</div> : !visibleThreads.length ? <div className="tm-inbox-empty">No messages yet.</div> : visibleThreads.map((thread) => {
            const active = thread.id === selectedId;
            return <button type="button" key={threadKey(thread)} className={`tm-inbox-thread${active ? ' is-active' : ''}`} onClick={() => setSelectedId(thread.id)}><div className="tm-inbox-thread-top"><strong>{thread.title}</strong>{thread.unreadCount > 0 && <span className="tm-inbox-count">{thread.unreadCount > 99 ? '99+' : thread.unreadCount}</span>}</div><span className="tm-inbox-thread-meta">{thread.job ? thread.job.title : roleLabel(thread.role)}</span><span className="tm-inbox-thread-preview">{thread.latest?.preview || 'Start a conversation'}</span><time>{formatDate(thread.latestAt)}</time></button>;
          })}
        </aside>
        <div className="tm-inbox-conversation">
          {!selectedThread ? <div className="tm-inbox-empty tm-inbox-empty-large">Choose a conversation to read the latest updates.</div> : <>
            <div className="tm-inbox-conversation-head"><div><p className="tm-human-eyebrow">{selectedThread.job ? selectedThread.job.title : 'Direct conversation'}</p><h3>{selectedTitle}</h3><span className="tm-inbox-role">{selectedRole}</span></div>{selectedThread.job && <span className="tm-inbox-job-status">{selectedThread.job.status.replaceAll('_', ' ')}</span>}</div>
            <div className="tm-inbox-messages">{messages.length ? messages.map((item) => { const own = item.sender_uid === currentUser?.uid; const sender = own ? 'You' : (item.sender_role === 'admin' ? 'TypeMyworDz admin' : item.sender_email || selectedTitle); return <article className={`tm-inbox-message${own ? ' is-own' : ''}`} key={item.id}><div><strong>{sender}</strong><span>{item.sender_role ? roleLabel(item.sender_role) : ''}</span><time>{formatDate(item.createdAt)}</time></div>{item.message && <p>{item.message}</p>}{item.attachment && <button type="button" className="tm-inbox-attachment" onClick={() => downloadAttachment(item)}>Download {item.attachment.name}</button>}</article>; }) : <div className="tm-inbox-empty">No messages in this conversation yet.</div>}</div>
            <form className="tm-inbox-form" onSubmit={send}><textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleComposerKeyDown} placeholder="Write a message" rows={3} aria-label="Message" /><div className="tm-inbox-form-actions"><label className="tm-inbox-file">{file ? file.name : 'Attach a file'}<input type="file" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label><span>Enter to send · Shift+Enter for a new line</span><button type="submit" disabled={busy || (!draft.trim() && !file)}>{busy ? 'Sending…' : 'Send message'}</button></div></form>
          </>}
        </div>
      </div>
    </section>
  );
}
