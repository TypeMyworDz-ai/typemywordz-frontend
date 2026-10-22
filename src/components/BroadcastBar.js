import React, { useCallback, useEffect, useState } from 'react';

const BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';

// Used only if the server cannot be reached, so workers never lose the Monday notice.
const WORKER_FALLBACK = [{
  id: 'monday-shifts',
  title: 'Monday shifts',
  text: 'Mondays are our slow shift days, so please do not expect much work on a Monday. This does not mean you can skip your shift: log in and clock in on time as usual, because attendance and tardiness are still tracked every day.',
}];

// Messages written by the Super admin under Admin > Broadcasts.
export default function BroadcastBar({ currentUser, audience }) {
  const [items, setItems] = useState(audience === 'worker' ? WORKER_FALLBACK : []);

  const load = useCallback(async () => {
    if (!currentUser) return;
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(`${BACKEND_URL}/human-transcription/broadcast`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      if (!response.ok) throw new Error('unavailable');
      const payload = await response.json();
      setItems(Array.isArray(payload.items) ? payload.items : []);
    } catch (error) {
      setItems((current) => (current.length || audience !== 'worker' ? current : WORKER_FALLBACK));
    }
  }, [currentUser, audience]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 5 * 60 * 1000);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [load]);

  if (!items.length) return null;
  return (
    <div className="tm-broadcast-stack" aria-label="Announcements">
      {items.map((item) => (
        <div key={item.id || item.title} className="tm-subadmin-shift-reminder tm-broadcast-item" role="note">
          {item.title && <strong>{item.title}</strong>}
          <span>
            {item.text}
            {item.link_url && <> <a href={item.link_url} target="_blank" rel="noopener noreferrer">{item.link_label || 'Open link'}</a></>}
          </span>
        </div>
      ))}
    </div>
  );
}
