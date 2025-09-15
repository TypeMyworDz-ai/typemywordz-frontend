import React, { useState, useRef, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { updateTranscription, deleteTranscription } from '../userService';

const TranscriptionDetail = () => {
  const { id } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const audioRef = useRef(null);
  const editorRef = useRef(null); // Ref for the contentEditable div
  
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
      if (editorRef.current) {
        editorRef.current.innerHTML = transcription.text || '';
      }
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

  const handleEditorInput = () => {
    if (editorRef.current) {
      setEditableText(editorRef.current.innerHTML);
    }
  };

  const handleSave = async () => {
    if (!currentUser?.uid || !transcription) return;
    
    setSaving(true);
    try {
      await updateTranscription(currentUser.uid, transcription.id, { text: editableText });
      setTranscription({ ...transcription, text: editableText });
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
    if (editorRef.current) {
      editorRef.current.innerHTML = transcription?.text || '';
    }
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
    const textToCopy = editorRef.current ? editorRef.current.textContent : editableText;
    navigator.clipboard.writeText(textToCopy);
    alert('Transcription copied to clipboard!');
  };

  const handleDownload = (format) => {
    const textToDownload = editorRef.current ? editorRef.current.textContent : editableText;
    const blob = new Blob([textToDownload], { 
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

  const textEditorContainerStyle = { 
    background: 'white',
    borderRadius: '12px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    padding: '24px'
  };

  // Function to handle text case transformation
  const transformCase = (type) => {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const selectedText = range.toString();
      
      if (selectedText) {
        let transformedText;
        switch (type) {
          case 'upper':
            transformedText = selectedText.toUpperCase();
            break;
          case 'lower':
            transformedText = selectedText.toLowerCase();
            break;
          default:
            return;
        }
        
        range.deleteContents();
        range.insertNode(document.createTextNode(transformedText));
        handleEditorInput(); // Update state after modification
      }
    }
  };
  if (!transcription) {
    return (
      <div style={containerStyle}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '50vh'
        }}>
          <div style={{
            textAlign: 'center',
            padding: '32px',
            background: 'white',
            borderRadius: '12px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
          }}>
            <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#1f2937', marginBottom: '16px' }}>
              Transcription Not Found
            </h2>
            <button 
              onClick={() => navigate('/dashboard')}
              style={{
                background: '#7c3aed',
                color: 'white',
                padding: '12px 24px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '16px'
              }}
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  const createdDate = convertToDate(transcription.createdAt);

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              display: 'flex',
              alignItems: 'center',
              color: '#7c3aed',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '16px'
            }}
          >
            <svg style={{ width: '20px', height: '20px', marginRight: '8px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Dashboard
          </button>
          <button
            onClick={handleDelete}
            style={{
              background: '#ef4444',
              color: 'white',
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            Delete
          </button>
        </div>
        <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#1f2937', marginBottom: '8px' }}>
          {transcription.fileName || 'Untitled'}
        </h1>
        <p style={{ color: '#6b7280' }}>
          Transcribed on {formatDate(createdDate)}
        </p>
      </div>

      {/* Main Content */}
      <div style={mainContentStyle}>
        {/* Audio Player */}
        <div style={audioPlayerStyle}>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#1f2937', marginBottom: '16px' }}>
            Audio Player
          </h2>
          
          <audio
            ref={audioRef}
            src={transcription.audioUrl}
            preload="metadata"
            crossOrigin="anonymous"
          />
          
          {audioError ? (
            <div style={{ textAlign: 'center', padding: '24px' }}>
              <div style={{
                width: '64px',
                height: '64px',
                margin: '0 auto 12px',
                background: '#fee2e2',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <svg style={{ width: '32px', height: '32px', color: '#ef4444' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p style={{ fontSize: '14px', color: '#ef4444', fontWeight: '500' }}>Audio file not found</p>
              <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>Check if the file exists</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Progress Bar */}
              <div>
                <div 
                  onClick={handleSeek}
                  style={{
                    background: '#e5e7eb',
                    borderRadius: '9999px',
                    height: '8px',
                    cursor: 'pointer',
                    position: 'relative',
                    marginBottom: '8px'
                  }}
                >
                  <div 
                    style={{
                      background: '#7c3aed',
                      height: '8px',
                      borderRadius: '9999px',
                      width: `${audioDuration > 0 ? (audioCurrentTime / audioDuration) * 100 : 0}%`,
                      transition: 'width 0.2s'
                    }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#6b7280' }}>
                  <span>{formatTime(audioCurrentTime)}</span>
                  <span>{formatTime(audioDuration)}</span>
                </div>
              </div>

              {/* Play Controls */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                <button
                  onClick={() => skipTime(-10)}
                  disabled={audioError}
                  style={{
                    padding: '8px',
                    background: '#f3f4f6',
                    borderRadius: '50%',
                    border: 'none',
                    cursor: 'pointer',
                    opacity: audioError ? 0.5 : 1
                  }}
                  title="Rewind 10s"
                >
                  <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.334 4z" />
                  </svg>
                </button>
                
                <button
                  onClick={togglePlayPause}
                  disabled={isLoading || audioError}
                  style={{
                    padding: '12px',
                    background: '#7c3aed',
                    color: 'white',
                    borderRadius: '50%',
                    border: 'none',
                    cursor: 'pointer',
                    opacity: (isLoading || audioError) ? 0.5 : 1
                  }}
                >
                  {isLoading ? (
                    <div style={{
                      width: '20px',
                      height: '20px',
                      border: '2px solid white',
                      borderTop: '2px solid transparent',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite'
                    }} />
                  ) : isPlaying ? (
                    <svg style={{ width: '20px', height: '20px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6" />
                    </svg>
                  ) : (
                    <svg style={{ width: '20px', height: '20px' }} fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  )}
                </button>
                
                <button
                  onClick={() => skipTime(10)}
                  disabled={audioError}
                  style={{
                    padding: '8px',
                    background: '#f3f4f6',
                    borderRadius: '50%',
                    border: 'none',
                    cursor: 'pointer',
                    opacity: audioError ? 0.5 : 1
                  }}
                  title="Forward 10s"
                >
                  <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.933 12.8a1 1 0 000-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4z" />
                  </svg>
                </button>
              </div>

              {/* Speed Control */}
              <div>
                <label style={{ fontSize: '12px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '8px' }}>
                  Speed
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                  {[0.75, 1, 1.25, 1.5, 1.75, 2].map((speed) => (
                    <button
                      key={speed}
                      onClick={() => changePlaybackRate(speed)}
                      disabled={audioError}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        border: 'none',
                        fontSize: '12px',
                        cursor: 'pointer',
                        background: playbackRate === speed ? '#7c3aed' : '#f3f4f6',
                        color: playbackRate === speed ? 'white' : '#374151',
                        opacity: audioError ? 0.5 : 1
                      }}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Volume Control */}
              <div>
                <label style={{ fontSize: '12px', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '8px' }}>
                  Volume
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg style={{ width: '12px', height: '12px', color: '#9ca3af' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M9 12a1 1 0 01-.707-.293L6.586 10H4a1 1 0 01-1-1V8a1 1 0 011-1h2.586l1.707-1.707A1 1 0 019 6v6z" />
                  </svg>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={volume}
                    onChange={(e) => changeVolume(parseFloat(e.target.value))}
                    disabled={audioError}
                    style={{
                      flex: 1,
                      height: '4px',
                      background: '#e5e7eb',
                      borderRadius: '2px',
                      outline: 'none',
                      opacity: audioError ? 0.5 : 1,
                      cursor: 'pointer'
                    }}
                  />
                  <span style={{ fontSize: '12px', color: '#6b7280', width: '32px' }}>
                    {Math.round(volume * 100)}%
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
        {/* Text Editor */}
        <div style={textEditorContainerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#1f2937' }}>
              Transcription
            </h2>
            <div style={{ display: 'flex', gap: '12px' }}>
              {isEditing ? (
                <>
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    style={{
                      background: '#10b981',
                      color: 'white',
                      padding: '8px 16px',
                      borderRadius: '6px',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '500',
                      opacity: isSaving ? 0.7 : 1
                    }}
                  >
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    style={{
                      background: '#6b7280',
                      color: 'white',
                      padding: '8px 16px',
                      borderRadius: '6px',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '500'
                    }}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  style={{
                    background: '#3b82f6',
                    color: 'white',
                    padding: '10px 20px',
                    borderRadius: '8px',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '14px',
                    fontWeight: '500'
                  }}
                >
                  <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <span>Edit</span>
                </button>
              )}
            </div>
          </div>

          {/* Formatting Toolbar - Only show when editing */}
          {isEditing && (
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
              padding: '12px',
              backgroundColor: '#f8f9fa',
              borderRadius: '8px',
              marginBottom: '16px',
              border: '1px solid #e9ecef'
            }}>
              {/* Text Formatting */}
              <button
                onClick={() => document.execCommand('bold')}
                style={{
                  padding: '6px 10px',
                  border: '1px solid #d1d5db',
                  backgroundColor: 'white',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold'
                }}
                title="Bold"
              >
                B
              </button>
              
              <button
                onClick={() => document.execCommand('italic')}
                style={{
                  padding: '6px 10px',
                  border: '1px solid #d1d5db',
                  backgroundColor: 'white',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontStyle: 'italic'
                }}
                title="Italic"
              >
                I
              </button>
              
              <button
                onClick={() => document.execCommand('underline')}
                style={{
                  padding: '6px 10px',
                  border: '1px solid #d1d5db',
                  backgroundColor: 'white',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  textDecoration: 'underline'
                }}
                title="Underline"
              >
                U
              </button>

              <div style={{ width: '1px', backgroundColor: '#d1d5db', margin: '4px 8px' }}></div>

              {/* Font Size */}
              <select
                onChange={(e) => document.execCommand('fontSize', false, e.target.value)}
                style={{
                  padding: '4px 8px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '12px',
                  backgroundColor: 'white',
                  cursor: 'pointer'
                }}
              >
                <option value="">Size</option>
                <option value="1">Small</option>
                <option value="3">Normal</option>
                <option value="5">Large</option>
                <option value="7">Extra Large</option>
              </select>

              {/* Text Color */}
              <input
                type="color"
                onChange={(e) => document.execCommand('foreColor', false, e.target.value)}
                title="Text Color"
                style={{
                  width: '32px',
                  height: '32px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              />

              <div style={{ width: '1px', backgroundColor: '#d1d5db', margin: '4px 8px' }}></div>

              {/* Lists */}
              <button
                onClick={() => document.execCommand('insertUnorderedList')}
                style={{
                  padding: '6px 10px',
                  border: '1px solid #d1d5db',
                  backgroundColor: 'white',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
                title="Bullet List"
              >
                • List
              </button>
              
              <button
                onClick={() => document.execCommand('insertOrderedList')}
                style={{
                  padding: '6px 10px',
                  border: '1px solid #d1d5db',
                  backgroundColor: 'white',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
                title="Numbered List"
              >
                1. List
              </button>

              <div style={{ width: '1px', backgroundColor: '#d1d5db', margin: '4px 8px' }}></div>

              {/* Text Case */}
              <button
                onClick={() => transformCase('upper')}
                style={{
                  padding: '6px 8px',
                  border: '1px solid #d1d5db',
                  backgroundColor: 'white',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '10px',
                  fontWeight: 'bold'
                }}
                title="UPPERCASE"
              >
                AA
              </button>
              
              <button
                onClick={() => transformCase('lower')}
                style={{
                  padding: '6px 8px',
                  border: '1px solid #d1d5db',
                  backgroundColor: 'white',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '10px'
                }}
                title="lowercase"
              >
                aa
              </button>
            </div>
          )}

          {/* Text Editor Area */}
          {isEditing ? (
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning={true}
              onInput={handleEditorInput}
              dir="ltr" // Added dir attribute
              style={{
                width: '100%',
                minHeight: '400px',
                padding: '20px',
                border: '2px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '16px',
                lineHeight: '1.6',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                outline: 'none',
                backgroundColor: 'white',
                overflowY: 'auto'
              }}
              dangerouslySetInnerHTML={{ __html: editableText }}
            />
          ) : (
            <div 
              dir="ltr" // Added dir attribute
              style={{
                background: '#f9fafb',
                borderRadius: '8px',
                padding: '20px',
                minHeight: '400px',
                border: '2px solid #e5e7eb',
                boxSizing: 'border-box',
                overflowY: 'auto'
              }}>
              {editableText ? (
                <div 
                  style={{
                    color: '#1f2937',
                    fontSize: '16px',
                    lineHeight: '1.6',
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                    margin: 0
                  }}
                  dangerouslySetInnerHTML={{ __html: editableText }}
                />
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
                      Click "Edit" to add and format content
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {editableText && (
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              fontSize: '14px', 
              color: '#6b7280',
              marginTop: '12px',
              marginBottom: '24px'
            }}>
              <span>{(editorRef.current?.textContent || editableText).replace(/<[^>]*>/g, '').length} characters</span>
              <span>{isEditing ? 'Select text and use toolbar to format' : 'Click Edit to modify'}</span>
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

      {/* Global CSS override for contenteditable elements */}
      <style>{`
        [contenteditable="true"] {
          direction: ltr !important;
          text-align: left !important; /* Ensure text alignment is also left */
        }
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