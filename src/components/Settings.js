import React, { useState, useEffect } from 'react';
import { useAsk } from './AskContext';

// The client's own settings. Right now this is where the assistant model is
// chosen, which used to sit awkwardly beside the chat. The list is fetched
// from the server so that what a client can pick always matches what the
// server will actually accept.

const RAILWAY_BACKEND_URL =
  process.env.REACT_APP_RAILWAY_BACKEND_URL ||
  'https://backendforrailway-production-7128.up.railway.app';

const Settings = ({ userPlan = 'free', userEmail = '', canUseAI = false, onUpgrade }) => {
  const { model, setModel } = useAsk();
  const [models, setModels] = useState([]);
  const [lockedModels, setLockedModels] = useState([]);
  const [state, setState] = useState('loading');
  const [saved, setSaved] = useState(false);
  const [serverDefault, setServerDefault] = useState('');

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const url =
          `${RAILWAY_BACKEND_URL}/ai/models` +
          `?user_plan=${encodeURIComponent(userPlan || 'free')}` +
          `&user_email=${encodeURIComponent(userEmail || '')}`;
        const res = await fetch(url);
        const data = await res.json();
        if (!alive) return;
        const rows = Array.isArray(data.models) ? data.models : [];
        setModels(rows);
        // Models the plan is holding back. We show these greyed out rather than
        // hiding them, so a client can see what a better plan would give them.
        const held = Array.isArray(data.locked) ? data.locked : [];
        setLockedModels(held);
        // There is something worth showing if the client can pick a model OR
        // if a plan would give them one.
        setState(rows.length || held.length ? 'ready' : 'locked');
        if (data.default) setServerDefault(data.default);
        // If nothing is chosen yet, show the server's default as chosen.
        if (!model && data.default) setModel(data.default);
      } catch (e) {
        if (alive) setState('error');
      }
    };
    load();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUseAI, userPlan, userEmail]);

  const choose = (id) => {
    setModel(id);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  const standard = models.filter((m) => m.tier === 'standard');
  const premium = models.filter((m) => m.tier === 'premium');

  const Group = ({ title, note, rows }) =>
    rows.length === 0 ? null : (
      <div className="tm-set-group">
        <div className="tm-set-grouphead">
          <span className="tm-set-grouptitle">{title}</span>
          {note && <span className="tm-set-groupnote">{note}</span>}
        </div>
        <div className="tm-set-models">
          {rows.map((m) => (
            <label key={m.id} className={'tm-set-model' + (model === m.id ? ' tm-set-model-on' : '')}>
              <input
                type="radio"
                name="askModel"
                value={m.id}
                checked={model === m.id}
                onChange={() => choose(m.id)}
              />
              <span className="tm-set-modelbody">
                <span className="tm-set-modelname">
                  {m.label}
                  {model === m.id && <span className="tm-set-badge tm-set-badge-on">Your default</span>}
                  {model !== m.id && m.id === serverDefault && (
                    <span className="tm-set-badge">Recommended</span>
                  )}
                  {m.transcript_only && (
                    <span className="tm-set-badge tm-set-badge-quiet">Transcripts only</span>
                  )}
                </span>
                <span className="tm-set-modelblurb">{m.blurb}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
    );

  // A model the client cannot pick yet. Deliberately not a radio and not a
  // label: there is nothing to choose here, so it must not behave like a
  // control. The only thing that is clickable is the link to the plans.
  const LockedGroup = ({ rows }) =>
    rows.length === 0 ? null : (
      <div className="tm-set-group">
        <div className="tm-set-grouphead">
          <span className="tm-set-grouptitle">Advanced models</span>
          <span className="tm-set-groupnote">Included with the Monthly and Yearly plans</span>
        </div>
        <div className="tm-set-models">
          {rows.map((m) => (
            <div key={m.id} className="tm-set-model tm-set-model-locked" aria-disabled="true">
              <span className="tm-set-lock" aria-hidden="true">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="10" width="16" height="10" rx="2" />
                  <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                </svg>
              </span>
              <span className="tm-set-modelbody">
                <span className="tm-set-modelname">
                  {m.label}
                  <span className="tm-set-badge tm-set-badge-quiet">Not on your plan</span>
                  {m.transcript_only && (
                    <span className="tm-set-badge tm-set-badge-quiet">Transcripts only</span>
                  )}
                </span>
                <span className="tm-set-modelblurb">{m.blurb}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    );

  return (
    <div className="tm-set">
      <h2 className="tm-set-title">Settings</h2>

      <section className="tm-set-section">
        <h3 className="tm-set-h">Assistant model</h3>
        <p className="tm-set-sub">
          Pick the model Ask TypeMyworDz uses when you ask it something. Whatever you choose here
          becomes your default everywhere the assistant appears, on this page and beside your
          transcripts. If you are not sure, leave it as it is.
        </p>

        {state === 'loading' && <div className="tm-set-note">Loading the models on your plan</div>}

        {state === 'error' && (
          <div className="tm-set-note">
            Could not load the list just now. Your assistant still works on its usual model.
          </div>
        )}

        {state === 'locked' && (
          <div className="tm-set-locked">
            <p>Choosing a model is part of Ask TypeMyworDz, which comes with any paid plan.</p>
            {onUpgrade && (
              <button type="button" className="tm-btn-go" onClick={onUpgrade}>
                See plans
              </button>
            )}
          </div>
        )}

        {state === 'ready' && (
          <>
            {standard.length === 0 && lockedModels.length > 0 && (
              <p className="tm-set-upsell">
                Ask TypeMyworDz comes with any paid plan. Here is what you would be
                able to choose from.
              </p>
            )}
            <Group title="Included with your plan" rows={standard} />
            <Group
              title="Advanced models"
              note="Included with the Monthly and Yearly plans"
              rows={premium}
            />
            <LockedGroup rows={lockedModels} />
            {premium.length === 0 && lockedModels.length > 0 && (
              <p className="tm-set-upsell">
                The Monthly and Yearly plans unlock the models above, which handle long or
                complicated work better.{' '}
                {onUpgrade && (
                  <button type="button" className="tm-set-link" onClick={onUpgrade}>
                    See plans
                  </button>
                )}
              </p>
            )}
            <div className={'tm-set-saved' + (saved ? ' tm-set-saved-on' : '')} aria-live="polite">
              {saved ? 'Saved' : ''}
            </div>
          </>
        )}
      </section>
    </div>
  );
};

export default Settings;
