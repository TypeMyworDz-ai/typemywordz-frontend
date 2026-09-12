import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';

const formatDate = (value) => {
  if (!value) return '';
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export default function DirectMessages({ showMessage, compact = false }) {
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
    const response = await fetch(`${BACKEND_URL}${path}`, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
    });
    const payload = await response.json().catch(() => ({}));
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

  const loadMessages = useCallback(async () => {
    if (!selectedUid) { setMessages([]); return; }
    try {
      const payload = await request(`/api/user-chats/${encodeURIComponent(selectedUid)}/messages`);
      setMessages(payload.messages || []);
    } catch (error) {
      showMessage?.(error.message, 'error');
    }
  }, [request, selectedUid, showMessage]);

  useEffect(() => { loadContacts(); }, [loadContacts]);
  useEffect(() => { loadMessages(); }, [loadMessages]);

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
        {contacts.length > 0 && <label className="tm-direct-contact"><span>Conversation with</span><select value={selectedUid} onChange={(event) => setSelectedUid(event.target.value)}>{contacts.map((contact) => <option key={contact.uid} value={contact.uid}>{contact.name || contact.email} · {contact.role || 'team'}</option>)}</select></label>}
      </div>
      {loading ? <div className="tm-direct-empty">Loading messages…</div> : !contacts.length ? <div className="tm-direct-empty">No messaging contact is available yet.</div> : <>
        <div className="tm-direct-list">{messages.length ? messages.map((item) => <article className={`tm-direct-message${item.sender_uid === currentUser?.uid ? ' tm-direct-message-own' : ''}`} key={item.id}><div><strong>{item.sender_uid === currentUser?.uid ? 'You' : 'TypeMyworDz team'}</strong><time>{formatDate(item.createdAt)}</time></div>{item.message && <p>{item.message}</p>}{item.attachment && <span className="tm-direct-attachment">Attached: {item.attachment.name}</span>}</article>) : <div className="tm-direct-empty">Start a conversation with the TypeMyworDz team.</div>}</div>
        <form className="tm-direct-form" onSubmit={send}><textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a message" rows={2} /><div><label className="tm-direct-file">{file ? file.name : 'Attach a file'}<input type="file" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label><button type="submit" disabled={busy || (!draft.trim() && !file)}>{busy ? 'Sending…' : 'Send message'}</button></div></form>
      </>}
    </section>
  );
}
