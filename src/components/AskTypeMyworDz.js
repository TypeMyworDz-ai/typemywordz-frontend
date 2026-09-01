import React, { useState, useEffect, useCallback } from 'react';
import AskChat from './AskChat';
import { listAskChats, getAskChat, saveAskChat, deleteAskChat } from '../userService';

// The standalone Ask TypeMyworDz page: a list of past conversations down the
// left, the conversation itself on the right, and a New chat button.

const PREF_KEY = 'tmwd.askProvider';

const whenLabel = (d) => {
  if (!d) return '';
  const now = new Date();
  const then = d instanceof Date ? d : new Date(d);
  const mins = Math.round((now - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return then.toLocaleDateString();
};

const AskTypeMyworDz = ({ uid, userPlan, userEmail, canUse, onUpgrade, allowModelChoice = false }) => {
  const [chats, setChats] = useState([]);
  const [chatId, setChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [provider, setProvider] = useState(() => {
    try {
      return window.localStorage.getItem(PREF_KEY) || 'claude';
    } catch (e) {
      return 'claude';
    }
  });

  const refreshList = useCallback(async () => {
    if (!uid) return;
    setLoadingList(true);
    const rows = await listAskChats(uid);
    setChats(rows);
    setLoadingList(false);
  }, [uid]);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  const chooseProvider = (value) => {
    setProvider(value);
    try {
      window.localStorage.setItem(PREF_KEY, value);
    } catch (e) {
      /* a browser with storage switched off still works, it just forgets */
    }
  };

  const startNew = () => {
    setChatId(null);
    setMessages([]);
  };

  const openChat = async (id) => {
    const chat = await getAskChat(id);
    if (!chat) return;
    setChatId(chat.id);
    setMessages(chat.messages || []);
  };

  // Save after every exchange, so nothing is lost if the tab is closed.
  const handleMessages = useCallback(
    async (next) => {
      setMessages(next);
      const settled = next.length && next[next.length - 1].role === 'assistant';
      if (!settled || !uid) return;
      const savedId = await saveAskChat(uid, chatId, next);
      if (savedId && savedId !== chatId) setChatId(savedId);
      refreshList();
    },
    [uid, chatId, refreshList]
  );

  const doDelete = async (id) => {
    await deleteAskChat(id);
    setConfirmDelete(null);
    if (id === chatId) startNew();
    refreshList();
  };

  if (!canUse) {
    return (
      <div className="tm-askpage-locked">
        <h2 className="tm-askpage-title">Ask TypeMyworDz</h2>
        <p>
          Ask TypeMyworDz answers questions about your transcripts and anything else you need. It is
          included with every paid plan.
        </p>
        <button type="button" className="tm-btn-go" onClick={onUpgrade}>
          See plans
        </button>
      </div>
    );
  }

  return (
    <div className="tm-askpage">
      <aside className="tm-askpage-side">
        <button type="button" className="tm-ask-new" onClick={startNew}>
          New chat
        </button>

        <div className="tm-ask-histlabel">Your chats</div>

        {loadingList ? (
          <div className="tm-ask-histnote">Loading</div>
        ) : chats.length === 0 ? (
          <div className="tm-ask-histnote">Nothing yet. Your chats will be saved here.</div>
        ) : (
          <ul className="tm-ask-hist">
            {chats.map((c) => (
              <li key={c.id} className={'tm-ask-histitem' + (c.id === chatId ? ' tm-ask-histon' : '')}>
                <button type="button" className="tm-ask-histopen" onClick={() => openChat(c.id)}>
                  <span className="tm-ask-histtitle">{c.title}</span>
                  <span className="tm-ask-histwhen">{whenLabel(c.updatedAt)}</span>
                </button>
                {confirmDelete === c.id ? (
                  <span className="tm-ask-confirm">
                    <button type="button" className="tm-ask-confirm-yes" onClick={() => doDelete(c.id)}>
                      Delete
                    </button>
                    <button type="button" className="tm-ask-confirm-no" onClick={() => setConfirmDelete(null)}>
                      Keep
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="tm-ask-histdel"
                    onClick={() => setConfirmDelete(c.id)}
                    aria-label={`Delete ${c.title}`}
                  >
                    Delete
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {allowModelChoice && (
          <div className="tm-ask-pref">
            <div className="tm-ask-preflabel">Model</div>
            <label className="tm-ask-prefopt">
              <input
                type="radio"
                name="askProvider"
                value="claude"
                checked={provider === 'claude'}
                onChange={(e) => chooseProvider(e.target.value)}
              />
              Claude
            </label>
            <label className="tm-ask-prefopt">
              <input
                type="radio"
                name="askProvider"
                value="gemini"
                checked={provider === 'gemini'}
                onChange={(e) => chooseProvider(e.target.value)}
              />
              Gemini
            </label>
          </div>
        )}
      </aside>

      <div className="tm-askpage-main">
        <AskChat
          messages={messages}
          onMessagesChange={handleMessages}
          provider={provider}
          userPlan={userPlan}
          userEmail={userEmail}
          emptyTitle="Ask TypeMyworDz"
          emptyHint="Ask a question, paste something in, or attach an image, PDF or Word document. Your chats are saved on the left."
        />
      </div>
    </div>
  );
};

export default AskTypeMyworDz;
