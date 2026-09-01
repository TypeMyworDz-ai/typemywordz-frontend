import React, { useState, useRef, useEffect } from 'react';
import { useAsk } from './AskContext';

// The list of past conversations. It sits in the left sidebar, directly under
// the Ask TypeMyworDz button, so there is one panel on screen rather than two.

const whenLabel = (d) => {
  if (!d) return '';
  const then = d instanceof Date ? d : new Date(d);
  if (isNaN(then.getTime())) return '';
  const mins = Math.round((new Date() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return then.toLocaleDateString();
};

const AskChatList = ({ open, onOpenChat }) => {
  const { chats, chatId, loadingList, startNew, openChat, rename, remove } = useAsk();
  const [menuFor, setMenuFor] = useState(null);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState('');
  const [confirming, setConfirming] = useState(null);
  const [search, setSearch] = useState('');
  const wrapRef = useRef(null);
  const editRef = useRef(null);

  // Close the little menu when the client clicks anywhere else, or presses
  // Escape. Without this it feels sticky and cheap.
  useEffect(() => {
    if (!menuFor && !confirming) return undefined;
    const away = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setMenuFor(null);
        setConfirming(null);
      }
    };
    const esc = (e) => {
      if (e.key === 'Escape') {
        setMenuFor(null);
        setConfirming(null);
      }
    };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [menuFor, confirming]);

  useEffect(() => {
    if (editing && editRef.current) {
      editRef.current.focus();
      editRef.current.select();
    }
  }, [editing]);

  if (!open) return null;

  const beginRename = (c) => {
    setMenuFor(null);
    setConfirming(null);
    setEditing(c.id);
    setDraft(c.title || '');
  };

  const commitRename = async (id) => {
    const value = draft.trim();
    setEditing(null);
    if (value) await rename(id, value);
  };

  // Match on the title, ignoring case and stray spaces. Simple is right here:
  // clients look for a word they remember typing, not a fuzzy match.
  const needle = search.trim().toLowerCase();
  const shown = needle
    ? chats.filter((c) => String(c.title || '').toLowerCase().includes(needle))
    : chats;

  const pick = async (id) => {
    await openChat(id);
    if (onOpenChat) onOpenChat();
  };

  return (
    <div className="tm-asklist" ref={wrapRef}>
      <button type="button" className="tm-asklist-new" onClick={startNew}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        New chat
      </button>

      {chats.length > 5 && (
        <div className="tm-asklist-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="M16 16l4 4" />
          </svg>
          <input
            type="search"
            value={search}
            placeholder="Search your chats"
            aria-label="Search your chats"
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {loadingList ? (
        <div className="tm-asklist-note">Loading your chats</div>
      ) : chats.length === 0 ? (
        <div className="tm-asklist-note">Your chats will be saved here.</div>
      ) : shown.length === 0 ? (
        <div className="tm-asklist-note">No chat matches that.</div>
      ) : (
        <ul className="tm-asklist-items">
          {shown.map((c) => (
            <li
              key={c.id}
              className={
                'tm-asklist-item' +
                (c.id === chatId ? ' tm-asklist-on' : '') +
                (menuFor === c.id ? ' tm-asklist-menuopen' : '')
              }
            >
              {editing === c.id ? (
                <input
                  ref={editRef}
                  className="tm-asklist-rename"
                  value={draft}
                  maxLength={90}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => commitRename(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitRename(c.id);
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setEditing(null);
                    }
                  }}
                  aria-label="Chat name"
                />
              ) : (
                <>
                  <button type="button" className="tm-asklist-open" onClick={() => pick(c.id)} title={c.title}>
                    <span className="tm-asklist-title">{c.title}</span>
                    <span className="tm-asklist-when">{whenLabel(c.updatedAt)}</span>
                  </button>

                  <button
                    type="button"
                    className="tm-asklist-dots"
                    aria-label={`More options for ${c.title}`}
                    aria-haspopup="menu"
                    aria-expanded={menuFor === c.id}
                    onClick={() => {
                      setConfirming(null);
                      setMenuFor(menuFor === c.id ? null : c.id);
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <circle cx="12" cy="5" r="1.7" />
                      <circle cx="12" cy="12" r="1.7" />
                      <circle cx="12" cy="19" r="1.7" />
                    </svg>
                  </button>

                  {menuFor === c.id && (
                    <div className="tm-asklist-menu" role="menu">
                      {confirming === c.id ? (
                        <>
                          <div className="tm-asklist-ask">Delete this chat?</div>
                          <button
                            type="button"
                            className="tm-asklist-mi tm-asklist-mi-danger"
                            role="menuitem"
                            onClick={() => {
                              setMenuFor(null);
                              setConfirming(null);
                              remove(c.id);
                            }}
                          >
                            Yes, delete it
                          </button>
                          <button
                            type="button"
                            className="tm-asklist-mi"
                            role="menuitem"
                            onClick={() => setConfirming(null)}
                          >
                            Keep it
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="tm-asklist-mi"
                            role="menuitem"
                            onClick={() => beginRename(c)}
                          >
                            Rename
                          </button>
                          <button
                            type="button"
                            className="tm-asklist-mi tm-asklist-mi-danger"
                            role="menuitem"
                            onClick={() => setConfirming(c.id)}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default AskChatList;
