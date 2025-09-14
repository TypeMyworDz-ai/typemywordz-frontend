import React, { useState, useRef, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { updateTranscription, deleteTranscription } from '../userService';
import RichTextEditor from './RichTextEditor';

const TranscriptionDetail = () => {
  const { id } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const audioRef = useRef(null);
  
  const [transcription, setTranscription] = useState(state?.transcription || null);
  const [editableText, setEditableText] = useState(transcription?.text || '');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setSaving] = useState(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [audioError, setAudioError] = useState(false);

  // Helper function to safely convert date
  const convertToDate = (dateValue) => {
    if (!dateValue) return null;
    try {
      if (dateValue.toDate && typeof dateValue.toDate === 'function') {
        return dateValue.toDate();
      }
      if (dateValue.seconds) {
        return new Date(dateValue.seconds * 1000);
      }
      return new Date(dateValue);
    } catch (error) {
      console.error('Date conversion error:', error);
      return null;
    }
  };

  const formatDate = (date) => {
    if (!date) return 'Unknown date';
    try {
      return date.toLocaleDateString() + ' at ' + date.toLocaleTimeString();
    } catch (error) {
      return 'Unknown date';
    }
  };

  useEffect(() => {
    if (transcription) {
      setEditableText(transcription.text || '');
    }
  }, [transcription]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      const updateTime = () => setAudioCurrentTime(audio.currentTime);
      const updateDuration = () => {
        if (!isNaN(audio.duration)) {
          setAudioDuration(audio.duration);
        }
      };
      const handlePlay = () => setIsPlaying(true);
      const handlePause = () => setIsPlaying(false);
      const handleLoadStart = () => setIsLoading(true);
      const handleCanPlay = () => {
        setIsLoading(false);
        setAudioError(false);
      };
      const handleError = (e) => {
        setIsLoading(false);
        setAudioError(true);
        console.error('Audio loading error:', e);
      };

      audio.addEventListener('timeupdate', updateTime);
      audio.addEventListener('loadedmetadata', updateDuration);
      audio.addEventListener('play', handlePlay);
      audio.addEventListener('pause', handlePause);
      audio.addEventListener('ended', handlePause);
      audio.addEventListener('loadstart', handleLoadStart);
      audio.addEventListener('canplay', handleCanPlay);
      audio.addEventListener('error', handleError);

      return () => {
        audio.removeEventListener('timeupdate', updateTime);
        audio.removeEventListener('loadedmetadata', updateDuration);
        audio.removeEventListener('play', handlePlay);
        audio.removeEventListener('pause', handlePause);
        audio.removeEventListener('ended', handlePause);
        audio.removeEventListener('loadstart', handleLoadStart);
        audio.removeEventListener('canplay', handleCanPlay);
        audio.removeEventListener('error', handleError);
      };
    }
  }, []);

  const handleSave = async (newText) => {
    if (!currentUser?.uid || !transcription) return;
    
    setSaving(true);
    try {
      await updateTranscription(currentUser.uid, transcription.id, { text: newText });
      setTranscription({ ...transcription, text: newText });
      setEditableText(newText);
      setIsEditing(false);
      alert('Transcription saved successfully!');
    } catch (error) {
      console.error('Error saving transcription:', error);
      alert('Failed to save transcription. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditableText(transcription?.text || '');
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this transcription?')) return;
    
    try {
      await deleteTranscription(currentUser.uid, transcription.id);
      navigate('/dashboard');
    } catch (error) {
      console.error('Error deleting transcription:', error);
      alert('Failed to delete transcription. Please try again.');
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(editableText);
    alert('Transcription copied to clipboard!');
  };

  const handleDownload = (format) => {
    const blob = new Blob([editableText], { 
      type: format === 'word' ? 'application/msword' : 'text/plain' 
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${transcription.fileName?.split('.')[0] || 'transcription'}.${format === 'word' ? 'doc' : 'txt'}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const togglePlayPause = () => {
    const audio = audioRef.current;
    if (audio && !audioError) {
      if (isPlaying) {
        audio.pause();
      } else {
        audio.play().catch(console.error);
      }
    }
  };

  const handleSeek = (e) => {
    const audio = audioRef.current;
    if (audio && audioDuration && !audioError) {
      const rect = e.currentTarget.getBoundingClientRect();
      const percent = (e.clientX - rect.left) / rect.width;
      audio.currentTime = percent * audioDuration;
    }
  };

  const skipTime = (seconds) => {
    const audio = audioRef.current;
    if (audio && !audioError) {
      audio.currentTime = Math.max(0, Math.min(audio.currentTime + seconds, audioDuration));
    }
  };

  const changePlaybackRate = (rate) => {
    const audio = audioRef.current;
    if (audio && !audioError) {
      audio.playbackRate = rate;
      setPlaybackRate(rate);
    }
  };

  const changeVolume = (newVolume) => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = newVolume;
      setVolume(newVolume);
    }
  };

  const formatTime = (seconds) => {
    if (isNaN(seconds) || seconds === 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Inline styles to override any CSS conflicts
  const containerStyle = {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #f3e8ff 0%, #dbeafe 100%)',
    padding: '20px',
    fontFamily: 'system-ui, -apple-system, sans-serif'
  };

  const headerStyle = {
    background: 'white',
    borderRadius: '12px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    padding: '24px',
    marginBottom: '24px',
    maxWidth: '1200px',
    margin: '0 auto 24px auto'
  };

  const mainContentStyle = {
    maxWidth: '1200px',
    margin: '0 auto',
    display: 'grid',
    gridTemplateColumns: '350px 1fr',
    gap: '24px',
    alignItems: 'start'
  };

  const audioPlayerStyle = {
    background: 'white',
    borderRadius: '12px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    padding: '20px',
    position: 'sticky',
    top: '20px'
  };

  const textEditorStyle = {
    background: 'white',
    borderRadius: '12px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    padding: '24px'
  };
          {/* Display Area */}
          <div style={{
            background: '#f9fafb',
            borderRadius: '8px',
            padding: '20px',
            minHeight: '400px',
            border: '2px solid #e5e7eb',
            boxSizing: 'border-box',
            overflowY: 'auto'
          }}>
            {editableText ? (
              <p style={{
                color: '#1f2937',
                whiteSpace: 'pre-wrap',
                fontSize: '16px',
                lineHeight: '1.6',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                margin: 0
              }}>
                {editableText}
              </p>
            ) : (
              <div style={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '300px'
              }}>
                <div style={{ textAlign: 'center' }}>
                  <svg style={{ 
                    width: '64px', 
                    height: '64px', 
                    margin: '0 auto 16px', 
                    color: '#d1d5db' 
                  }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p style={{ color: '#6b7280', fontSize: '18px', marginBottom: '8px' }}>
                    No transcription text available
                  </p>
                  <p style={{ color: '#9ca3af', fontSize: '14px' }}>
                    Click "Edit with Rich Text Editor" to add content
                  </p>
                </div>
              </div>
            )}
          </div>

          {editableText && (
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              fontSize: '14px', 
              color: '#6b7280',
              marginTop: '12px',
              marginBottom: '24px'
            }}>
              <span>{editableText.length} characters</span>
              <span>Click edit to modify with rich text features</span>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ 
            marginTop: '32px', 
            paddingTop: '24px', 
            borderTop: '1px solid #e5e7eb'
          }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
              <button
                onClick={handleCopy}
                style={{
                  background: '#10b981',
                  color: 'white',
                  padding: '12px 24px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontWeight: '500'
                }}
              >
                <svg style={{ width: '20px', height: '20px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span>Copy to Clipboard</span>
              </button>
              
              <button
                onClick={() => handleDownload('txt')}
                style={{
                  background: '#6b7280',
                  color: 'white',
                  padding: '12px 24px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontWeight: '500'
                }}
              >
                <svg style={{ width: '20px', height: '20px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Download as TXT</span>
              </button>
              
              <button
                onClick={() => handleDownload('word')}
                style={{
                  background: '#3b82f6',
                  color: 'white',
                  padding: '12px 24px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontWeight: '500'
                }}
              >
                <svg style={{ width: '20px', height: '20px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Download as DOC</span>
              </button>
            </div>
          </div>
        </div>
      </div>
      {/* Add CSS animation for spin */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        @media (max-width: 1024px) {
          .main-content-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
};

export default TranscriptionDetail;