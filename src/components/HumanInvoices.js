import React, { useCallback, useEffect, useState } from 'react';

const BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app';
export const GT_WORK_EMAILS = ['kenmelonia@gmail.com', 'jaymoesta2@gmail.com'];

const cell = { padding: '9px 12px', borderBottom: '1px solid #eef0ee', textAlign: 'left' };
const num = { ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const input = { padding: '7px 9px', borderRadius: 8, border: '1px solid #cfd6d1', font: 'inherit', boxSizing: 'border-box' };
const money = (value, digits = 2) => `KES ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
const kesWhole = (value) => `KES ${Number(value || 0).toLocaleString()}`;

// Download a file from an authenticated endpoint (PDF or Word).
async function downloadFile(getToken, path, fallbackName) {
  const idToken = await getToken();
  const response = await fetch(`${BACKEND_URL}${path}`, { headers: { Authorization: `Bearer ${idToken}` } });
  if (!response.ok) {
    let detail = 'The invoice could not be created.';
    try { detail = (await response.json()).detail || detail; } catch { /* keep default */ }
    throw new Error(detail);
  }
  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition') || '';
  const match = /filename="?([^";]+)"?/.exec(disposition);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = match ? match[1] : fallbackName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function DownloadButtons({ getToken, basePath, query, showMessage, disabled }) {
  const [busy, setBusy] = useState('');
  const go = async (format) => {
    setBusy(format);
    try {
      await downloadFile(getToken, `${basePath}?${query}${query ? '&' : ''}format=${format}`, `invoice.${format}`);
    } catch (error) {
      showMessage?.(error.message, 'error');
    } finally {
      setBusy('');
    }
  };
  return (
    <span style={{ display: 'inline-flex', gap: 8 }}>
      <button type="button" className="tm-admin-refresh" disabled={disabled || !!busy} onClick={() => go('pdf')}>{busy === 'pdf' ? 'Preparing…' : 'Download PDF'}</button>
      <button type="button" className="tm-admin-refresh" disabled={disabled || !!busy} onClick={() => go('docx')}>{busy === 'docx' ? 'Preparing…' : 'Download Word'}</button>
    </span>
  );
}

function DateRange({ start, end, setStart, setEnd }) {
  return (
    <>
      <label style={{ display: 'grid', gap: 3, fontSize: 12 }}>From<input type="date" style={input} value={start} onChange={(e) => setStart(e.target.value)} /></label>
      <label style={{ display: 'grid', gap: 3, fontSize: 12 }}>To<input type="date" style={input} value={end} onChange={(e) => setEnd(e.target.value)} /></label>
      {(start || end) && <button type="button" className="tm-admin-refresh" onClick={() => { setStart(''); setEnd(''); }}>All dates</button>}
    </>
  );
}

const queryOf = (params) => Object.entries(params).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

// ---------------------------------------------------------------- Words invoice
// Used by a sub-admin (own entries, editable) and by the super admin (any sub-admin).
export function WordsInvoice({ request, getToken, showMessage, adminView = false, subadmins = [] }) {
  const [email, setEmail] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({ job_id: '', total_words: '' });
  const [options, setOptions] = useState(subadmins);
  useEffect(() => {
    if (!adminView || subadmins.length) return;
    request('/api/admin/subadmin-options').then((payload) => setOptions(payload.subadmins || [])).catch(() => {});
  }, [adminView, subadmins, request]);
  const basePath = adminView ? '/api/admin/subadmin-words-invoice' : '/human-transcription/subadmin/words-invoice';
  const query = queryOf({ ...(adminView ? { email } : {}), start_date: start, end_date: end });
  const ready = !adminView || !!email;

  const load = useCallback(async (silent) => {
    if (!ready) { setData(null); return; }
    if (!silent) setLoading(true);
    try {
      setData(await request(`${basePath}?${query}`));
    } catch (error) {
      if (!silent) showMessage?.(error.message, 'error');
    } finally { setLoading(false); }
  }, [ready, request, basePath, query, showMessage]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const quick = () => load(true);
    const timer = window.setInterval(() => { if (!document.hidden && !editing) load(true); }, 15000);
    window.addEventListener('tm-subadmin-earnings-changed', quick);
    return () => { window.clearInterval(timer); window.removeEventListener('tm-subadmin-earnings-changed', quick); };
  }, [load, editing]);

  const saveEdit = async (row) => {
    try {
      await request(`/human-transcription/subadmin/words-log/${encodeURIComponent(row.entry_id)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: draft.job_id.trim(), total_words: Number(String(draft.total_words).replace(/,/g, '')) }),
      });
      setEditing(null);
      window.dispatchEvent(new Event('tm-subadmin-earnings-changed'));
      showMessage?.('Entry updated.', 'success');
      load(true);
    } catch (error) { showMessage?.(error.message, 'error'); }
  };
  const removeRow = async (row) => {
    if (!window.confirm(`Remove the entry for ${row.job_id} (${row.total_words.toLocaleString()} words)? Its pay is taken off your total.`)) return;
    try {
      await request(`/human-transcription/subadmin/words-log/${encodeURIComponent(row.entry_id)}`, { method: 'DELETE' });
      window.dispatchEvent(new Event('tm-subadmin-earnings-changed'));
      load(true);
    } catch (error) { showMessage?.(error.message, 'error'); }
  };

  return (
    <div className="tm-human-chat-card tm-subadmin-section">
      <div className="tm-human-chat-head"><div><strong>{adminView ? 'Words Table invoices' : 'All my Words Table entries'}</strong><span>{adminView ? 'Choose a sub-admin to see their entries as an invoice. Pick a single day or a range, or leave the dates empty for everything.' : 'Your full invoice. Change or remove a wrong entry while its pay is still accruing.'}</span></div></div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', margin: '10px 0' }}>
        {adminView && (
          <label style={{ display: 'grid', gap: 3, fontSize: 12 }}>Sub-admin
            <select style={input} value={email} onChange={(e) => setEmail(e.target.value)}>
              <option value="">Choose a sub-admin</option>
              {options.map((item) => <option key={item.email} value={item.email}>{item.name ? `${item.name} (${item.email})` : item.email}</option>)}
            </select>
          </label>
        )}
        <DateRange start={start} end={end} setStart={setStart} setEnd={setEnd} />
        <button type="button" className="tm-admin-refresh" onClick={() => load()} disabled={!ready || loading}>{loading ? 'Loading…' : 'Refresh'}</button>
        <DownloadButtons getToken={getToken} basePath={basePath} query={query} showMessage={showMessage} disabled={!ready || !data} />
      </div>
      {!ready ? <p className="tm-human-empty">Choose a sub-admin to load the invoice.</p> : (
        <div className="tm-subadmin-table-wrap">
          <table className="tm-admin-payout-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={cell}>MONTH/DATE</th><th style={cell}>JOB ID</th><th style={{ ...cell, textAlign: 'right' }}>WORDS</th><th style={{ ...cell, textAlign: 'right' }}>TOTAL</th>{!adminView && <th style={cell}></th>}</tr></thead>
            <tbody>
              {(data?.rows || []).map((row) => (
                <tr key={row.entry_id}>
                  <td style={cell}>{row.date_label}</td>
                  {editing === row.entry_id ? (<>
                    <td style={cell}><input style={{ ...input, width: '100%' }} aria-label="Job ID" value={draft.job_id} maxLength={80} onChange={(e) => setDraft({ ...draft, job_id: e.target.value })} /></td>
                    <td style={num}><input style={{ ...input, width: 110, textAlign: 'right' }} aria-label="Words" inputMode="numeric" value={draft.total_words} onChange={(e) => setDraft({ ...draft, total_words: e.target.value.replace(/[^\d,]/g, '') })} /></td>
                    <td style={num}>{money(Number(String(draft.total_words).replace(/,/g, '')) * Number(data?.rate_kes_per_word || 0))}</td>
                    <td style={cell}><button type="button" onClick={() => saveEdit(row)}>Save</button> <button type="button" onClick={() => setEditing(null)}>Cancel</button></td>
                  </>) : (<>
                    <td style={cell}>{row.job_id}</td>
                    <td style={num}>{row.total_words.toLocaleString()}</td>
                    <td style={num}>{money(row.total_kes)}</td>
                    {!adminView && <td style={cell}><button type="button" onClick={() => { setEditing(row.entry_id); setDraft({ job_id: row.job_id, total_words: String(row.total_words) }); }}>Edit</button> <button type="button" onClick={() => removeRow(row)}>Remove</button></td>}
                  </>)}
                </tr>
              ))}
              {data && !data.rows.length && <tr><td style={cell} colSpan={adminView ? 4 : 5}>No entries for this selection.</td></tr>}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700, background: '#f3faf4', color: '#1f6a37' }}>
                <td style={cell} colSpan={2}>Accruing total</td>
                <td style={num}>{Number(data?.total_words || 0).toLocaleString()}</td>
                <td style={num}>{money(data?.total_kes)}</td>
                {!adminView && <td style={cell}></td>}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------ GT Work (worker)
export function WorkerGtWorkPanel({ request, showMessage }) {
  const [data, setData] = useState(null);
  const [jobId, setJobId] = useState('');
  const [length, setLength] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({ job_id: '', audio_length: '' });
  const load = useCallback(async () => {
    try { setData(await request('/human-transcription/worker/gt-work')); } catch (error) { showMessage?.(error.message, 'error'); }
  }, [request, showMessage]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => { if (!document.hidden && !editing) load(); }, 15000);
    return () => window.clearInterval(timer);
  }, [load, editing]);
  const send = async (path, method, body) => {
    const result = await request(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    setData(result);
    window.dispatchEvent(new Event('tm-worker-earnings-changed'));
  };
  const add = async (event) => {
    event.preventDefault();
    if (saving || !jobId.trim() || !length.trim()) return;
    setSaving(true);
    try {
      await send('/human-transcription/worker/gt-work', 'POST', { job_id: jobId.trim(), audio_length: length.trim() });
      setJobId(''); setLength('');
    } catch (error) { showMessage?.(error.message, 'error'); } finally { setSaving(false); }
  };
  const saveEdit = async (entry) => {
    try { await send(`/human-transcription/worker/gt-work/${encodeURIComponent(entry.entry_id)}`, 'PUT', draft); setEditing(null); } catch (error) { showMessage?.(error.message, 'error'); }
  };
  const remove = async (entry) => {
    if (!window.confirm(`Remove the entry for ${entry.job_id}?`)) return;
    try { await send(`/human-transcription/worker/gt-work/${encodeURIComponent(entry.entry_id)}`, 'DELETE'); } catch (error) { showMessage?.(error.message, 'error'); }
  };
  const entries = data?.entries || [];
  return (
    <div className="tm-human-chat-card tm-worker-payment-panel">
      <div className="tm-human-chat-head"><div><strong>GT Work · {data?.month || 'This month'}</strong><span>Add a row each time you finish a job. Type the audio length as minutes and seconds (6:30) or just minutes (12).</span></div></div>
      <div className="tm-subadmin-table-wrap">
        <table className="tm-admin-payout-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={cell}>MONTH/DATE</th><th style={cell}>JOB ID</th><th style={{ ...cell, textAlign: 'right' }}>AUDIO LENGTH</th><th style={{ ...cell, textAlign: 'right' }}>TOTAL</th><th style={cell}></th></tr></thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.entry_id}>
                <td style={cell}>{entry.date_label}</td>
                {editing === entry.entry_id ? (<>
                  <td style={cell}><input style={{ ...input, width: '100%' }} aria-label="Job ID" value={draft.job_id} maxLength={80} onChange={(e) => setDraft({ ...draft, job_id: e.target.value })} /></td>
                  <td style={num}><input style={{ ...input, width: 100, textAlign: 'right' }} aria-label="Audio length" value={draft.audio_length} onChange={(e) => setDraft({ ...draft, audio_length: e.target.value.replace(/[^\d:.,]/g, '') })} /></td>
                  <td style={num}>–</td>
                  <td style={cell}><button type="button" onClick={() => saveEdit(entry)}>Save</button> <button type="button" onClick={() => setEditing(null)}>Cancel</button></td>
                </>) : (<>
                  <td style={cell}>{entry.job_id}</td>
                  <td style={num}>{entry.audio_length}</td>
                  <td style={num}>{kesWhole(entry.total_kes)}</td>
                  <td style={cell}>{entry.locked ? <small>Invoiced</small> : <><button type="button" onClick={() => { setEditing(entry.entry_id); setDraft({ job_id: entry.job_id, audio_length: entry.audio_length }); }}>Edit</button> <button type="button" onClick={() => remove(entry)}>Remove</button></>}</td>
                </>)}
              </tr>
            ))}
            {!entries.length && data && <tr><td style={cell} colSpan={5}>No entries yet. Add your first job below.</td></tr>}
            <tr style={{ background: '#f6f8f6' }}>
              <td style={cell}>{data?.today ? new Date(`${data.today}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : ''}</td>
              <td style={cell}><input aria-label="Job ID" value={jobId} onChange={(e) => setJobId(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(e); }} placeholder="Job ID" maxLength={80} style={{ ...input, width: '100%' }} /></td>
              <td style={num}><input aria-label="Audio length" value={length} onChange={(e) => setLength(e.target.value.replace(/[^\d:.,]/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter') add(e); }} placeholder="e.g. 6:30" style={{ ...input, width: 100, textAlign: 'right' }} /></td>
              <td style={num}>–</td>
              <td style={cell}><button type="button" onClick={add} disabled={saving || !jobId.trim() || !length.trim()}>{saving ? 'Adding…' : 'Add entry'}</button></td>
            </tr>
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, background: '#f3faf4', color: '#1f6a37' }}>
              <td style={cell} colSpan={3}>Accumulated total</td>
              <td style={num}>{kesWhole(data?.total_kes)}</td>
              <td style={cell}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ GT Work (admin)
export function AdminGtInvoicePanel({ request, getToken, showMessage }) {
  const [email, setEmail] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const query = queryOf({ email, start_date: start, end_date: end });
  const load = useCallback(async () => {
    if (!email) { setData(null); return; }
    setLoading(true);
    try { setData(await request(`/api/admin/gt-work-invoice?${query}`)); } catch (error) { showMessage?.(error.message, 'error'); } finally { setLoading(false); }
  }, [email, query, request, showMessage]);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="tm-human-chat-card tm-subadmin-section">
      <div className="tm-human-chat-head"><div><strong>GT Work invoices</strong><span>Choose a worker to see their GT Work entries as an invoice. Pick a single day or a range, or leave the dates empty for everything.</span></div></div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', margin: '10px 0' }}>
        <label style={{ display: 'grid', gap: 3, fontSize: 12 }}>Worker
          <select style={input} value={email} onChange={(e) => setEmail(e.target.value)}>
            <option value="">Choose a worker</option>
            {GT_WORK_EMAILS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <DateRange start={start} end={end} setStart={setStart} setEnd={setEnd} />
        <button type="button" className="tm-admin-refresh" onClick={load} disabled={!email || loading}>{loading ? 'Loading…' : 'Refresh'}</button>
        <DownloadButtons getToken={getToken} basePath="/api/admin/gt-work-invoice" query={query} showMessage={showMessage} disabled={!email || !data} />
      </div>
      {!email ? <p className="tm-human-empty">Choose a worker to load the invoice.</p> : (
        <div className="tm-subadmin-table-wrap">
          <table className="tm-admin-payout-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={cell}>MONTH/DATE</th><th style={cell}>JOB ID</th><th style={{ ...cell, textAlign: 'right' }}>AUDIO LENGTH</th><th style={{ ...cell, textAlign: 'right' }}>TOTAL</th></tr></thead>
            <tbody>
              {(data?.rows || []).map((row) => <tr key={row.entry_id}><td style={cell}>{row.date_label}</td><td style={cell}>{row.job_id}</td><td style={num}>{row.audio_length}</td><td style={num}>{kesWhole(row.total_kes)}</td></tr>)}
              {data && !data.rows.length && <tr><td style={cell} colSpan={4}>No entries for this selection.</td></tr>}
            </tbody>
            <tfoot><tr style={{ fontWeight: 700, background: '#f3faf4', color: '#1f6a37' }}><td style={cell} colSpan={2}>Accruing total</td><td style={num}>{data?.total_length || '0:00'}</td><td style={num}>{kesWhole(data?.total_kes)}</td></tr></tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
