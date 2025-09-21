import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext'; // Assuming useAuth is needed for login check

const RichTextEditor = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const editorRef = useRef(null); // Ref for the contenteditable div
  const audioRef = useRef(null);
  const fileInputRef = useRef(null); // Ref for hidden file input

  const [editorContent, setEditorContent] = useState('');
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [localAudioFile, setLocalAudioFile] = useState(null);
  const [localAudioUrl, setLocalAudioUrl] = useState(null);
  const [sourceAudioUrl, setSourceAudioUrl] = useState(null); // No initial transcription audio

  // Redirect if not logged in
  useEffect(() => {
    if (!currentUser) {
      navigate('/'); // Redirect to home/login if not authenticated
    }
  }, [currentUser, navigate]);

  // Load content from localStorage on mount
  useEffect(() => {
    const savedContent = localStorage.getItem('richTextEditorContent');
    if (savedContent) {
      setEditorContent(savedContent);
      if (editorRef.current) {
        editorRef.current.innerHTML = savedContent;
      }
    }
  }, []);

  // Save content to localStorage on change
  const handleEditorChange = useCallback(() => {
    if (editorRef.current) {
      const currentContent = editorRef.current.innerHTML;
      setEditorContent(currentContent);
      localStorage.setItem('richTextEditorContent', currentContent);
    }
  }, []);
  // Audio player logic (similar to TranscriptionDetail.js)
  useEffect(() => {
    if (localAudioFile) {
      const url = URL.createObjectURL(localAudioFile);
      setLocalAudioUrl(url);
      setSourceAudioUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setLocalAudioUrl(null);
      setSourceAudioUrl(null); // No default audio if local not selected
    }
  }, [localAudioFile]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = volume;

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
  }, [sourceAudioUrl, volume]);

  const togglePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (audio && !audioError) {
      if (isPlaying) {
        audio.pause();
      } else {
        audio.play().catch(console.error);
      }
    }
  }, [isPlaying, audioError]);

  const handleSeek = (e) => {
    const audio = audioRef.current;
    if (audio && audioDuration && !audioError) {
      const rect = e.currentTarget.getBoundingClientRect();
      const percent = (e.clientX - rect.left) / rect.width;
      audio.currentTime = percent * audioDuration;
    }
  };

  const skipTime = useCallback((seconds) => {
    const audio = audioRef.current;
    if (audio && !audioError && !isNaN(audioDuration)) {
      audio.currentTime = Math.max(0, Math.min(audio.currentTime + seconds, audioDuration));
    }
  }, [audioError, audioDuration]);

  const changePlaybackRate = useCallback((rate) => {
    const audio = audioRef.current;
    if (audio && !audioError) {
      audio.playbackRate = rate;
      setPlaybackRate(rate);
    }
  }, [audioError]);

  const changeVolume = useCallback((newVolume) => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = newVolume;
      setVolume(newVolume);
    }
  }, []);

  const formatTime = (seconds) => {
    if (isNaN(seconds) || seconds === 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  // Keyboard Shortcuts Effect (Global)
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.ctrlKey || event.metaKey) {
        switch (event.code) {
          case 'Space':
            event.preventDefault();
            togglePlayPause();
            break;
          case 'ArrowLeft':
            event.preventDefault();
            skipTime(-5);
            break;
          case 'ArrowRight':
            event.preventDefault();
            skipTime(5);
            break;
          default:
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlayPause, skipTime]);

  // Handler for local audio file selection
  const handleLocalAudioFileSelect = useCallback((event) => {
    const file = event.target.files[0];
    if (file && file.type.startsWith('audio/')) {
      setLocalAudioFile(file);
      setAudioError(false);
      setIsPlaying(false);
      setAudioCurrentTime(0);
      setAudioDuration(0);
      console.log('DEBUG: Local audio file selected:', file.name);
    } else {
      setLocalAudioFile(null);
      setLocalAudioUrl(null);
      setSourceAudioUrl(null);
      setAudioError(true);
      console.warn('WARNING: Invalid file type selected for local audio.');
    }
  }, []);

  const triggerFileInput = useCallback(() => {
    fileInputRef.current.click();
  }, []);

  // Rich Text Editor Commands
  const applyFormat = useCallback((command, value = null) => {
    document.execCommand(command, false, value);
    editorRef.current.focus(); // Keep focus on editor after applying format
    handleEditorChange(); // Trigger change to save to local storage
  }, [handleEditorChange]);

  const toUpperCase = useCallback(() => {
    const selection = window.getSelection();
    if (!selection.isCollapsed) {
      const range = selection.getRangeAt(0);
      const selectedText = range.toString();
      range.deleteContents();
      range.insertNode(document.createTextNode(selectedText.toUpperCase()));
      editorRef.current.focus();
      handleEditorChange();
    }
  }, [handleEditorChange]);

  const toLowerCase = useCallback(() => {
    const selection = window.getSelection();
    if (!selection.isCollapsed) {
      const range = selection.getRangeAt(0);
      const selectedText = range.toString();
      range.deleteContents();
      range.insertNode(document.createTextNode(selectedText.toLowerCase()));
      editorRef.current.focus();
      handleEditorChange();
    }
  }, [handleEditorChange]);

  // Inline styles
  const containerStyle = {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #e0f2f7 0%, #bbdefb 100%)', // Lighter background
    padding: '20px',
    fontFamily: 'system-ui, -apple-system, sans-serif'
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
  const toolbarStyle = {
    marginBottom: '16px',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    backgroundColor: '#f3f4f6',
    padding: '8px',
    borderRadius: '8px',
    border: '1px solid #e5e7eb'
  };
  const toolbarButtonStyle = {
    background: '#ffffff',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    padding: '6px 10px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    color: '#374151',
    display: 'flex',
    alignItems: 'center',
    gap: '4px'
  };
  if (!currentUser) {
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
              Access Denied
            </h2>
            <p style={{ color: '#6b7280', marginBottom: '16px' }}>Please log in to use the Transcription Editor.</p>
            <button 
              onClick={() => navigate('/')}
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
              Go to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <h1 style={{ textAlign: 'center', fontSize: '32px', fontWeight: 'bold', color: '#1f2937', marginBottom: '24px' }}>
        Transcription Editor
      </h1>

      <div style={mainContentStyle}>
        {/* Audio Player */}
        <div style={audioPlayerStyle}>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#1f2937', marginBottom: '16px' }}>
            Audio Player
          </h2>
          
          <audio
            ref={audioRef}
            src={sourceAudioUrl}
            preload="metadata"
            crossOrigin="anonymous"
          />
          
          <input
            type="file"
            accept="audio/*"
            ref={fileInputRef}
            onChange={handleLocalAudioFileSelect}
            style={{ display: 'none' }}
          />

          {audioError || !sourceAudioUrl ? (
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
                <svg style={{ width: '32px', height: '32px', color: '#ef4444' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <p style={{ fontSize: '14px', color: '#ef4444', fontWeight: '500' }}>
                {localAudioFile ? 'Error loading local audio' : 'No audio loaded'}
              </p>
              <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                {localAudioFile ? 'Check file format' : 'Upload an audio file to start'}
              </p>
              <button 
                onClick={triggerFileInput}
                style={{
                  background: '#3b82f6',
                  color: 'white',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  marginTop: '16px'
                }}
              >
                Upload Local Audio
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {localAudioFile && (
                <p style={{ fontSize: '12px', color: '#10b981', fontWeight: '500', textAlign: 'center', marginBottom: '-8px' }}>
                  Playing from: {localAudioFile.name}
                </p>
              )}
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
                  <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.334 4z" /></svg>
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
                    <svg style={{ width: '20px', height: '20px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6" /></svg>
                  ) : (
                    <svg style={{ width: '20px', height: '20px' }} fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
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
                  <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.933 12.8a1 1 0 000-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4z" /></svg>
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
                  <svg style={{ width: '12px', height: '12px', color: '#9ca3af' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M9 12a1 1 0 01-.707-.293L6.586 10H4a1 1 0 01-1-1V8a1 1 0 011-1h2.586l1.707-1.707A1 1 0 019 6v6z" /></svg>
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
              <button 
                onClick={triggerFileInput}
                style={{
                  background: '#3b82f6',
                  color: 'white',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  marginTop: '8px'
                }}
              >
                Upload Local Audio
              </button>
            </div>
          )}
        </div>
        {/* Text Editor */}
        <div style={textEditorContainerStyle}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#1f2937', marginBottom: '16px' }}>
            Editor
          </h2>
          {/* Toolbar */}
          <div style={toolbarStyle}>
            <button style={toolbarButtonStyle} onClick={() => applyFormat('bold')}>
              <svg style={{ width: '16px', height: '16px' }} fill="currentColor" viewBox="0 0 24 24"><path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.4c2.25 0 4-1.72 4-3.97 0-1.07-.42-2.04-1.19-2.72l.43-.37zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5H10V6.5zm4 11H10v-3h4c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z"/></svg>
              Bold
            </button>
            <button style={toolbarButtonStyle} onClick={() => applyFormat('italic')}>
              <svg style={{ width: '16px', height: '16px' }} fill="currentColor" viewBox="0 0 24 24"><path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z"/></svg>
              Italic
            </button>
            <button style={toolbarButtonStyle} onClick={() => applyFormat('underline')}>
              <svg style={{ width: '16px', height: '16px' }} fill="currentColor" viewBox="0 0 24 24"><path d="M12 17c3.31 0 6-2.69 6-6V3h-2v8c0 2.21-1.79 4-4 4s-4-1.79-4-4V3H6v8c0 3.31 2.69 6 6 6zm-6 4v-2h12v2H6z"/></svg>
              Underline
            </button>
            <button style={toolbarButtonStyle} onClick={toUpperCase}>
              <svg style={{ width: '16px', height: '16px' }} fill="currentColor" viewBox="0 0 24 24"><path d="M9 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4zM7.83 14H16.17L12 5.17z"/></svg>
              Uppercase
            </button>
            <button style={toolbarButtonStyle} onClick={toLowerCase}>
              <svg style={{ width: '16px', height: '16px' }} fill="currentColor" viewBox="0 0 24 24"><path d="M7.83 14H16.17L12 5.17zM6 17v3h8v-3h-2.21l3.42-8H18V4h-8v3h2.21l-3.42 8H6v3z"/></svg>
              Lowercase
            </button>
          </div>
          {/* Content Editable Area - FIRST FIX APPLIED */}
          <div
            ref={editorRef}
            contentEditable="true"
            onInput={handleEditorChange}
            onFocus={(e) => {
              // Ensure cursor goes to the end when focusing
              const range = document.createRange();
              const selection = window.getSelection();
              range.selectNodeContents(e.target);
              range.collapse(false); // false means collapse to end
              selection.removeAllRanges();
              selection.addRange(range);
            }}
            onKeyDown={(e) => {
              // Handle specific key behaviors
              if (e.key === 'Enter') {
                // Ensure new lines work properly
                e.preventDefault();
                document.execCommand('insertHTML', false, '<br><br>');
              }
            }}
            dangerouslySetInnerHTML={{ __html: editorContent }}
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
              backgroundColor: '#f9fafb',
              overflowY: 'auto',
              textAlign: 'left', // Ensure left alignment
              direction: 'ltr', // Left-to-right text direction
              unicodeBidi: 'plaintext', // Handle mixed text directions properly
              whiteSpace: 'pre-wrap', // Preserve whitespace and line breaks
              wordWrap: 'break-word', // Handle long words
              cursor: 'text' // Show text cursor
            }}
            placeholder="Start typing or paste your transcription here..."
            suppressContentEditableWarning={true}
          />
        </div>
      </div>
      {/* Global CSS for spin animation */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default RichTextEditor;