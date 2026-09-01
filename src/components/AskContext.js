import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  listAskChats,
  getAskChat,
  saveAskChat,
  deleteAskChat,
  renameAskChat,
} from '../userService';

// One place holds the state for Ask TypeMyworDz, because two parts of the
// screen need it at once: the chat list, which lives in the left sidebar
// directly under the Ask TypeMyworDz button, and the conversation itself.
// Keeping it here is what lets the app show a single panel instead of two.

const AskContext = createContext(null);

export const MODEL_PREF_KEY = 'tmwd.askModel';

const readPref = () => {
  try {
    return window.localStorage.getItem(MODEL_PREF_KEY) || '';
  } catch (e) {
    return '';
  }
};

export const AskProvider = ({ uid, children }) => {
  const [chats, setChats] = useState([]);
  const [chatId, setChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [model, setModelState] = useState(readPref);

  const refresh = useCallback(async () => {
    if (!uid) {
      setChats([]);
      setLoadingList(false);
      return;
    }
    setLoadingList(true);
    const rows = await listAskChats(uid);
    setChats(rows);
    setLoadingList(false);
  }, [uid]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setModel = useCallback((id) => {
    setModelState(id);
    try {
      window.localStorage.setItem(MODEL_PREF_KEY, id);
    } catch (e) {
      /* storage switched off still works, it just forgets the choice */
    }
  }, []);

  const startNew = useCallback(() => {
    setChatId(null);
    setMessages([]);
  }, []);

  const openChat = useCallback(async (id) => {
    const chat = await getAskChat(id);
    if (!chat) return;
    setChatId(chat.id);
    setMessages(chat.messages || []);
  }, []);

  // Save after every completed exchange, so nothing is lost if the tab closes.
  const handleMessages = useCallback(
    async (next) => {
      setMessages(next);
      const settled = next.length && next[next.length - 1].role === 'assistant';
      if (!settled || !uid) return;
      const savedId = await saveAskChat(uid, chatId, next);
      if (savedId && savedId !== chatId) setChatId(savedId);
      refresh();
    },
    [uid, chatId, refresh]
  );

  const rename = useCallback(
    async (id, title) => {
      const clean = String(title || '').trim().slice(0, 90);
      if (!clean) return false;
      // Show the new name straight away rather than waiting for the round trip.
      setChats((prev) => prev.map((c) => (c.id === id ? { ...c, title: clean } : c)));
      const done = await renameAskChat(id, clean);
      if (!done) refresh();
      return done;
    },
    [refresh]
  );

  const remove = useCallback(
    async (id) => {
      await deleteAskChat(id);
      if (id === chatId) {
        setChatId(null);
        setMessages([]);
      }
      refresh();
    },
    [chatId, refresh]
  );

  const value = useMemo(
    () => ({
      chats,
      chatId,
      messages,
      loadingList,
      model,
      setModel,
      startNew,
      openChat,
      handleMessages,
      rename,
      remove,
      refresh,
    }),
    [chats, chatId, messages, loadingList, model, setModel, startNew, openChat, handleMessages, rename, remove, refresh]
  );

  return <AskContext.Provider value={value}>{children}</AskContext.Provider>;
};

export const useAsk = () => {
  const ctx = useContext(AskContext);
  if (!ctx) {
    // Rendered outside the provider. Return a harmless stub so a stray usage
    // cannot take the whole page down.
    return {
      chats: [],
      chatId: null,
      messages: [],
      loadingList: false,
      model: '',
      setModel: () => {},
      startNew: () => {},
      openChat: () => {},
      handleMessages: () => {},
      rename: () => {},
      remove: () => {},
      refresh: () => {},
    };
  }
  return ctx;
};

export default AskContext;
