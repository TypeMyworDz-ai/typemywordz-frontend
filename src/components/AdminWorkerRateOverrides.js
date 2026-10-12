import React, { useCallback, useEffect, useMemo, useState } from 'react';

const endpoint = '/human-transcription/admin/worker-rates';

export default function AdminWorkerRateOverrides({ request, showMessage, standardRate = 30 }) {
  const [workers, setWorkers] = useState([]);
  const [selectedUid, setSelectedUid] = useState('');
  const [rate, setRate] = useState('');
  const [policy, setPolicy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const selectedWorker = useMemo(() => workers.find((worker) => worker.uid === selectedUid) || null, [workers, selectedUid]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await request(endpoint);
      setWorkers(data.workers || []);
      setPolicy(data);
    } catch (error) {
      showMessage?.(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [request, showMessage]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (selectedUid && workers.length && !workers.some((worker) => worker.uid === selectedUid)) {
      setSelectedUid('');
      setRate('');
      return;
    }
    if (selectedWorker) setRate(selectedWorker.rate_kes_per_minute == null ? '' : String(selectedWorker.rate_kes_per_minute));
  }, [selectedUid, selectedWorker, workers]);

  const selectWorker = (uid) => {
    setSelectedUid(uid);
    const worker = workers.find((item) => item.uid === uid);
    setRate(worker?.rate_kes_per_minute == null ? '' : String(worker.rate_kes_per_minute));
  };

  const saveRate = async (event) => {
    event.preventDefault();
    if (!selectedWorker) return;
    const value = Number(rate);
    const minimum = Number(policy?.minimum_rate_kes_per_minute || 1);
    const maximum = Number(policy?.maximum_rate_kes_per_minute || 500);
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
      showMessage?.(`Enter a whole-number rate from KES ${minimum} to KES ${maximum} per audio minute.`, 'error');
      return;
    }
    if (value === Number(selectedWorker.rate_kes_per_minute)) return;
    if (!window.confirm(`Set ${selectedWorker.name} to KES ${value} per completed audio minute? This applies to audio work submitted after saving. Earnings already recorded will not change.`)) return;

    setSaving(true);
    try {
      const result = await request(`${endpoint}/${encodeURIComponent(selectedWorker.uid)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ transcriber_rate_kes_per_minute: String(value) }),
      });
      setWorkers((previous) => previous.map((worker) => worker.uid === selectedWorker.uid ? { ...worker, rate_kes_per_minute: result.rate_kes_per_minute } : worker));
      setRate(String(result.rate_kes_per_minute));
      showMessage?.(`${selectedWorker.name}'s audio transcription rate is now KES ${result.rate_kes_per_minute} per minute.`, 'success');
    } catch (error) {
      showMessage?.(error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const resetRate = async () => {
    if (!selectedWorker || selectedWorker.rate_kes_per_minute == null) return;
    if (!window.confirm(`Return ${selectedWorker.name} to the standard rate saved in each new job quote?`)) return;
    setSaving(true);
    try {
      const result = await request(`${endpoint}/${encodeURIComponent(selectedWorker.uid)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ transcriber_rate_kes_per_minute: '' }),
      });
      setWorkers((previous) => previous.map((worker) => worker.uid === selectedWorker.uid ? { ...worker, rate_kes_per_minute: null } : worker));
      setRate('');
      showMessage?.(`${selectedWorker.name} now uses the standard rate of KES ${result.standard_rate_kes_per_minute} per audio minute.`, 'success');
    } catch (error) {
      showMessage?.(error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="tm-human-chat-card" aria-labelledby="tm-individual-worker-rate-heading">
      <div className="tm-human-chat-head">
        <div><strong id="tm-individual-worker-rate-heading">Individual worker rates</strong><span>Set one worker’s audio-minute rate. Everyone without an override keeps the standard rate in their job quote.</span></div>
        <span className="tm-human-live-dot">KES</span>
      </div>
      {loading ? <div className="tm-human-empty">Loading approved workers…</div> : !workers.length ? <div className="tm-human-empty">No approved workers are available to customize.</div> : (
        <form className="tm-admin-rate-form" onSubmit={saveRate}>
          <div className="tm-admin-rate-main">
            <label htmlFor="tm-individual-worker-select">Worker</label>
            <select
              id="tm-individual-worker-select"
              aria-label="Select worker for individual rate"
              value={selectedUid}
              disabled={saving}
              onChange={(event) => selectWorker(event.target.value)}
              style={{ maxWidth: 460, minHeight: 40, padding: '8px 10px', border: '1px solid #d9dbe1', borderRadius: 7, background: '#fff', color: '#272b31' }}
            >
              <option value="">Choose a worker</option>
              {workers.map((worker) => <option key={worker.uid} value={worker.uid}>{worker.name}{worker.email ? ` · ${worker.email}` : ''}</option>)}
            </select>
          </div>
          {selectedWorker && <>
            <div className="tm-admin-rate-reference">
              <div><span>Current audio transcription rate</span><strong>KES {selectedWorker.rate_kes_per_minute ?? standardRate} / min</strong></div>
              <div><span>Rate type</span><strong>{selectedWorker.rate_kes_per_minute == null ? 'Standard job rate' : 'Individual override'}</strong></div>
            </div>
            <div className="tm-admin-rate-main">
              <label htmlFor="tm-individual-worker-rate">Custom rate for {selectedWorker.name}</label>
              <div className="tm-admin-rate-input-row">
                <span>KES</span>
                <input
                  id="tm-individual-worker-rate"
                  aria-label="Custom rate per audio minute"
                  type="number"
                  min={policy?.minimum_rate_kes_per_minute || 1}
                  max={policy?.maximum_rate_kes_per_minute || 500}
                  step="1"
                  placeholder={String(standardRate)}
                  value={rate}
                  disabled={saving}
                  onChange={(event) => setRate(event.target.value)}
                />
                <span>per audio minute</span>
              </div>
              <small>Applies when this worker submits audio transcription work after the rate is saved. PDF/image page pay and proofreading rates are unchanged; recorded earnings are not recalculated.</small>
            </div>
            <div className="tm-admin-rate-actions">
              <button type="submit" disabled={saving || !rate || !selectedWorker}>{saving ? 'Saving…' : 'Save individual rate'}</button>
              <button type="button" onClick={resetRate} disabled={saving || selectedWorker.rate_kes_per_minute == null}>{saving ? 'Saving…' : 'Use standard rate'}</button>
              <button type="button" onClick={load} disabled={saving || loading}>Reload workers</button>
            </div>
          </>}
        </form>
      )}
    </section>
  );
}
