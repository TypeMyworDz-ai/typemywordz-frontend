import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { updateTranscription, deleteTranscription, fetchUserTranscriptions } from '../userService';
import TranscriptEditor from './TranscriptEditor';
import ConfirmDialog from './ConfirmDialog';
import AskPanel from './AskPanel';
import { isPaidAIUser } from '../aiAccess';

// ---------------------------------------------------------------------------
// One saved transcript, opened from My files.
//
// This page used to carry its own audio player, its own copy menu and its own
// export code, all slightly different from the versions on the transcribe
// screen. All of that now lives in TranscriptEditor, so there is exactly one
// way a transcript behaves anywhere in the app. What is left here is what
// genuinely belongs to the page: finding the transcript, saving a correction,
// deleting it, and getting back to the list.
// ---------------------------------------------------------------------------

const toDate = (value) => {
  if (!value) return null;
  try {
    if (typeof value.toDate === 'function') return value.toDate();
    if (value instanceof Date) return value;
    if (typeof value === 'object' && typeof value.seconds === 'number') {
      return new Date(value.seconds * 1000);
    }
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  } catch (error) {
    return null;
  }
};

const formatDate = (value) => {
  const date = toDate(value);
  if (!date) return null;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

const TranscriptionDetail = () => {
  const { id } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const { currentUser, userProfile } = useAuth();

  const [transcription, setTranscription] = useState(state?.transcription || null);
  const [loading, setLoading] = useState(!state?.transcription);
  const [notFound, setNotFound] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Arriving straight at the address, or after a refresh, there is no
  // navigation state to read. Look the transcript up instead of showing a
  // dead end.
  useEffect(() => {
    if (transcription || !currentUser?.uid || !id) {
      if (!transcription && !currentUser?.uid) setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const all = await fetchUserTranscriptions(currentUser.uid);
        const found = (all || []).find((t) => t.id === id);
        if (cancelled) return;
        if (found) { setTranscription(found); } else { setNotFound(true); }
      } catch (error) {
        console.error('Could not load the transcript:', error);
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [transcription, currentUser?.uid, id]);

  const handleSave = useCallback(async (html) => {
    if (!currentUser?.uid || !transcription?.id) return;
    await updateTranscription(currentUser.uid, transcription.id, { transcriptionText: html });
  }, [currentUser?.uid, transcription?.id]);

  const handleDelete = useCallback(() => {
    setConfirmingDelete(true);
  }, []);

  const confirmDelete = useCallback(async () => {
    setDeleting(true);
    try {
      await deleteTranscription(currentUser.uid, transcription.id);
      navigate('/dashboard');
    } catch (error) {
      console.error('Error deleting transcription:', error);
      setConfirmingDelete(false);
      setDeleteError('We could not delete it just now. Please try again.');
    } finally {
      setDeleting(false);
    }
  }, [currentUser?.uid, transcription, navigate]);

  if (loading) {
    return (
      <div className="tm-detail">
        <p className="tm-detail-msg">Opening your transcript…</p>
      </div>
    );
  }

  if (!transcription || notFound) {
    return (
      <div className="tm-detail">
        <div className="tm-detail-msg">
          <h2>We could not find that transcript</h2>
          <p>It may have expired, or been deleted.</p>
          <button type="button" className="tm-newbtn" onClick={() => navigate('/dashboard')}>
            Back to my files
          </button>
        </div>
      </div>
    );
  }

  const text = transcription.transcriptionText || transcription.text || '';
  const created = formatDate(transcription.createdAt);
  const expires = formatDate(transcription.expiresAt);

  return (
    <div className="tm-detail">
      <TranscriptEditor
        fileName={transcription.fileName || 'Transcript'}
        rawText={text}
        segments={Array.isArray(transcription.segments) ? transcription.segments : null}
        durationSeconds={Number(transcription.duration) || 0}
        audioUrl={transcription.audioUrl || null}
        createdAt={created}
        onSave={handleSave}
        showBack
        onBack={() => navigate('/dashboard')}
      />

      <AskPanel
        transcript={text}
        userPlan={userProfile?.plan || 'free'}
        userEmail={currentUser?.email || ''}
        userId={currentUser?.uid || ''}
        canUse={isPaidAIUser(userProfile, currentUser?.email)}
        onUpgrade={() => navigate('/pricing')}
      />

      <div className="tm-detail-foot">
        {expires && <span>Available until {expires}</span>}
        <button type="button" className="tm-detail-del" onClick={handleDelete}>
          Delete this transcript
        </button>
      </div>

      {deleteError && <p className="tm-detail-msg" role="alert">{deleteError}</p>}

      <ConfirmDialog
        open={confirmingDelete}
        title="Delete this transcript?"
        body="The transcript and its wording will be removed from your files. This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Keep it"
        tone="danger"
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
};

export default TranscriptionDetail;
