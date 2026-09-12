import React, { useCallback, useEffect, useState } from 'react';
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
  if (normalized === 'worker') return 'worker';
  return 'client';
};

const isTeamRole = (role) => roleLabel(role) === 'team';

export default function DirectMessages({ showMessage, compact = false, onMessagesRead }) {
  const { currentUser } = useAuth();
  const [contacts, setContacts] = useState([]);
  const [selectedUid, setSelectedUid] = useState('');
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

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
    const responseText = await response.text();
    let payload = {};
    try { payload = responseText ? JSON.parse(responseText) : {}; } catch { /* keep the friendly fallback below */ }
    if (!response.ok) throw new Error(payload.detail || 'Messaging is unavailable right now.');
    return payload;
  }, [currentUser]);

  const loadContacts = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const payload = await request('/api/messaging/contacts');
      const next = payload.contacts || [];
      setContacts(next);
      setSelectedUid((current) => current || next[0]?.uid || '');
    } catch (error) {
      showMessage?.(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [currentUser, request, showMessage]);

  const loadMessages = useCallback(async (silent = false) => {
    if (!selectedUid) { setMessages([]); return; }
    try {
      const payload = await request(`/api/user-chats/${encodeURIComponent(selectedUid)}/messages`);
      setMessages(payload.messages || []);
      onMessagesRead?.();
    } catch (error) {
      if (!silent) showMessage?.(error.message, 'error');
    }
  }, [onMessagesRead, request, selectedUid, showMessage]);

  useEffect(() => { loadContacts(); }, [loadContacts]);
  useEffect(() => {
    loadMessages();
    const interval = window.setInterval(() => loadMessages(true), 5000);
    return () => window.clearInterval(interval);
  }, [loadMessages]);

  const selectedContact = contacts.find((contact) => contact.uid === selectedUid);
  const incomingLabel = isTeamRole(selectedContact?.role)
    ? 'TypeMyworDz team'
    : (selectedContact?.name || selectedContact?.email || 'Contact');

  const handleComposerKeyDown = (event) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    if (!busy && (draft.trim() || file)) event.currentTarget.form?.requestSubmit();
  };

  const send = async (event) => {
    event.preventDefault();
    if (!selectedUid || (!draft.trim() && !file)) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append('message', draft.trim());
      if (file) form.append('attachment', file);
      const payload = await request(`/api/user-chats/${encodeURIComponent(selectedUid)}/messages`, { method: 'POST', body: form });
      if (payload.message) setMessages((current) => current.concat(payload.message));
      setDraft('');
      setFile(null);
      event.target.reset();
    } catch (error) {
      showMessage?.(error.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`tm-direct-messages${compact ? ' tm-direct-messages-compact' : ''}`} aria-labelledby="direct-messages-title">
      <div className="tm-direct-head">
        <div><p className="tm-human-eyebrow">Communication</p><h2 id="direct-messages-title">Messages</h2><p>Keep questions, updates and files with the TypeMyworDz team in one place.</p></div>
        {contacts.length > 0 && <label className="tm-direct-contact"><span>Conversation with</span><select value={selectedUid} onChange={(event) => setSelectedUid(event.target.value)}>{contacts.map((contact) => <option key={contact.uid} value={contact.uid}>{contact.name || contact.email} · {roleLabel(contact.role)}</option>)}</select></label>}
      </div>
      {loading ? <div className="tm-direct-empty">Loading messages…</div> : !contacts.length ? <div className="tm-direct-empty">No messaging contact is available yet.</div> : <>
        <div className="tm-direct-list">{messages.length ? messages.map((item) => <article className={`tm-direct-message${item.sender_uid === currentUser?.uid ? ' tm-direct-message-own' : ''}`} key={item.id}><div><strong>{item.sender_uid === currentUser?.uid ? 'You' : incomingLabel}</strong><time>{formatDate(item.createdAt)}</time></div>{item.message && <p>{item.message}</p>}{item.attachment && <span className="tm-direct-attachment">Attached: {item.attachment.name}</span>}</article>) : <div className="tm-direct-empty">Start a conversation with {incomingLabel}.</div>}</div>
        <form className="tm-direct-form" onSubmit={send}><textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleComposerKeyDown} placeholder="Write a message" rows={2} aria-label="Message" /><div className="tm-direct-form-actions"><span className="tm-direct-hint">Enter to send · Shift+Enter for a new line</span><label className="tm-direct-file">{file ? file.name : 'Attach a file'}<input type="file" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label><button type="submit" disabled={busy || (!draft.trim() && !file)}>{busy ? 'Sending…' : 'Send message'}</button></div></form>
      </>}
    </section>
  );
}
