import React, { useCallback, useEffect, useState } from 'react';

const BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';
const HYBRID = ['priscillamuthoni010@gmail.com', 'info@typemywordz.ai'];

const cell = { padding: '8px 10px', borderBottom: '1px solid #e4e9e5', verticalAlign: 'top' };
const input = { padding: '6px 8px', borderRadius: 6, border: '1px solid #cfd6d1', font: 'inherit' };

// Super admin only. Shift times for workers and sub-admins; pay accrues only inside them.
export default function AdminShiftSchedulePanel({ currentUser, showMessage }) {
  const [data, setData] = useState(null);
  const [worker, setWorker] = useState({ start: '16:00', end: '05:00' });
  const [subs, setSubs] = useState({});
  const [enforce, setEnforce] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const call = useCallback(async (method, body) => {
    const token = await currentUser.getIdToken();
    const response = await fetch(`${BACKEND_URL}/api/admin/shift-schedule`, {
      method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || 'The request failed.');
    return payload;
  }, [currentUser]);

  const apply = useCallback((payload) => {
    setData(payload);
    setWorker({ start: payload.worker.start, end: payload.worker.end });
    setEnforce(Boolean(payload.enforce_worker_pay));
    const next = {};
    payload.subadmins.forEach((item) => { next[item.email] = { windows: (item.windows || []).map((w) => ({ ...w })), until: item.until || '' }; });
    setSubs(next);
  }, []);

  useEffect(() => { call('GET').then(apply).catch((e) => setError(e.message)); }, [call, apply]);

  const setWindow = (email, index, key, value) => setSubs((current) => {
    const windows = current[email].windows.map((w, i) => (i === index ? { ...w, [key]: value } : w));
    return { ...current, [email]: { ...current[email], windows } };
  });
  const addWindow = (email) => setSubs((current) => ({ ...current, [email]: { ...current[email], windows: [...current[email].windows, { start: '15:00', end: '20:00' }].slice(0, 4) } }));
  const removeWindow = (email, index) => setSubs((current) => ({ ...current, [email]: { ...current[email], windows: current[email].windows.filter((_, i) => i !== index) } }));
  const setUntil = (email, value) => setSubs((current) => ({ ...current, [email]: { ...current[email], until: value } }));

  const save = async () => {
    setBusy(true);
    try {
      apply(await call('PUT', { worker, subadmins: subs, enforce_worker_pay: enforce }));
      showMessage?.('Shift schedule saved. It applies within a minute.', 'success');
    } catch (e) { showMessage?.(e.message, 'error'); } finally { setBusy(false); }
  };

  if (error) return <p role="alert">{error}</p>;
  if (!data) return <p role="status">Loading shift schedule...</p>;

  return (
    <div style={{ display: 'grid', gap: 18, maxWidth: 900 }}>
      <p style={{ color: '#5b665e', margin: 0 }}>
        Set when workers and sub-admins can earn. Times are Kenya time (24-hour). A shift that ends earlier than it starts runs past midnight and belongs to the day it started on. Work submitted outside these times earns nothing.
      </p>

      <section>
        <h3 style={{ margin: '0 0 8px' }}>Worker shift (Monday to Friday)</h3>
        <label>From <input type="time" value={worker.start} onChange={(e) => setWorker({ ...worker, start: e.target.value })} style={input} /></label>{' '}
        <label>to <input type="time" value={worker.end} onChange={(e) => setWorker({ ...worker, end: e.target.value })} style={input} /></label>
        <div style={{ marginTop: 8 }}>
          <label><input type="checkbox" checked={enforce} onChange={(e) => setEnforce(e.target.checked)} /> Only pay workers for work submitted inside this shift</label>
        </div>
        <small style={{ color: '#6b756e' }}>Priscilla and info@typemywordz.ai are also paid as workers only outside their own sub-admin shift, so one piece of work never pays twice.</small>
      </section>

      <section>
        <h3 style={{ margin: '0 0 8px' }}>Sub-admin paid shifts</h3>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead><tr><th style={{ ...cell, textAlign: 'left' }}>Sub-admin</th><th style={{ ...cell, textAlign: 'left' }}>Shifts</th><th style={{ ...cell, textAlign: 'left' }}>Use until (optional)</th></tr></thead>
          <tbody>
            {data.subadmins.map((item) => {
              const entry = subs[item.email] || { windows: [], until: '' };
              const defaults = item.defaults.map((w) => `${w.start}-${w.end}`).join(', ') || 'none';
              return (
                <tr key={item.email}>
                  <td style={cell}>{item.email}{HYBRID.includes(item.email) ? <small style={{ display: 'block', color: '#6b756e' }}>Also a worker</small> : null}</td>
                  <td style={cell}>
                    {entry.windows.length === 0 && <em style={{ color: '#6b756e' }}>No paid shifts</em>}
                    {entry.windows.map((w, i) => (
                      <div key={i} style={{ marginBottom: 6 }}>
                        <input type="time" value={w.start} onChange={(e) => setWindow(item.email, i, 'start', e.target.value)} style={input} /> to{' '}
                        <input type="time" value={w.end} onChange={(e) => setWindow(item.email, i, 'end', e.target.value)} style={input} />{' '}
                        <button type="button" onClick={() => removeWindow(item.email, i)} aria-label="Remove this shift">Remove</button>
                      </div>
                    ))}
                    <button type="button" onClick={() => addWindow(item.email)} disabled={entry.windows.length >= 4}>Add a shift</button>
                    <small style={{ display: 'block', color: '#6b756e' }}>Normal: {defaults}</small>
                  </td>
                  <td style={cell}>
                    <input type="date" value={entry.until} onChange={(e) => setUntil(item.email, e.target.value)} style={input} />
                    <small style={{ display: 'block', color: '#6b756e' }}>After this date the normal shifts return.</small>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <div><button type="button" className="tm-admin-refresh" disabled={busy} onClick={save}>{busy ? 'Saving...' : 'Save schedule'}</button></div>
    </div>
  );
}
