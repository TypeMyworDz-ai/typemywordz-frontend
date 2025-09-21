import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

const RichTextEditor = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const audioRef = useRef(null);
  const fileInputRef = useRef(null);
  const quillRef = useRef(null);

  // State declarations
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
  const [sourceAudioUrl, setSourceAudioUrl] = useState(null);

  // Redirect if not logged in
  useEffect(() => {
    if (!currentUser) {
      navigate('/');
    }
  }, [currentUser, navigate]);

  // Load content from localStorage on mount
  useEffect(() => {
    const savedContent = localStorage.getItem('richTextEditorContent');
    if (savedContent) {
      setEditorContent(savedContent);
    }
  }, []);
  // Save content to localStorage on change
  const handleEditorChange = useCallback((content) => {
    setEditorContent(content);
    localStorage.setItem('richTextEditorContent', content);
  }, []);

  // Quill modules configuration with custom toolbar
  const modules = {
    toolbar: {
      container: [
        [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ 'color': [] }, { 'background': [] }],
        [{ 'font': [] }],
        [{ 'align': [] }],
        ['blockquote', 'code-block'],
        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
        [{ 'indent': '-1'}, { 'indent': '+1' }],
        ['link', 'image'],
        ['clean'],
        ['timestamp'] // Custom button for timestamps
      ],
      handlers: {
        'timestamp': function() {
          insertTimestamp();
        }
      }
    },
    clipboard: {
      matchVisual: false,
    }
  };

  const formats = [
    'header', 'font', 'size',
    'bold', 'italic', 'underline', 'strike', 'blockquote',
    'list', 'bullet', 'indent',
    'link', 'image', 'color', 'background', 'align', 'code-block'
  ];

  // Insert timestamp at current audio position
  const insertTimestamp = useCallback(() => {
    if (quillRef.current && audioCurrentTime !== undefined) {
      const quill = quillRef.current.getEditor();
      const range = quill.getSelection(true);
      const timestamp = formatTime(audioCurrentTime);
      
      if (range) {
        quill.insertText(range.index, `[${timestamp}] `, {
          'color': '#007bff',
          'bold': true
        });
        quill.setSelection(range.index + timestamp.length + 3);
      }
    }
  }, [audioCurrentTime]);

  // Export functions
  const exportAsWord = useCallback(() => {
    const blob = new Blob([editorContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'transcription.doc';
    a.click();
    URL.revokeObjectURL(url);
  }, [editorContent]);

  const exportAsTXT = useCallback(() => {
    // Convert HTML to plain text
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = editorContent;
    const plainText = tempDiv.textContent || tempDiv.innerText || '';
    
    const blob = new Blob([plainText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'transcription.txt';
    a.click();
    URL.revokeObjectURL(url);
  }, [editorContent]);
  // Audio player setup
  useEffect(() => {
    if (localAudioFile) {
      const url = URL.createObjectURL(localAudioFile);
      setLocalAudioUrl(url);
      setSourceAudioUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setLocalAudioUrl(null);
      setSourceAudioUrl(null);
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

  // Audio control functions
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
  // Keyboard Shortcuts Effect
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
          case 'KeyT':
            event.preventDefault();
            insertTimestamp();
            break;
          default:
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlayPause, skipTime, insertTimestamp]);

  // File handling
  const handleLocalAudioFileSelect = useCallback((event) => {
    const file = event.target.files[0];
    if (file && file.type.startsWith('audio/')) {
      setLocalAudioFile(file);
      setAudioError(false);
      setIsPlaying(false);
      setAudioCurrentTime(0);
      setAudioDuration(0);
      console.log('Audio file selected:', file.name);
    } else {
      setLocalAudioFile(null);
      setLocalAudioUrl(null);
      setSourceAudioUrl(null);
      setAudioError(true);
      console.warn('Invalid file type selected for audio.');
    }
  }, []);

  const triggerFileInput = useCallback(() => {
    fileInputRef.current.click();
  }, []);

  // Inline styles
  const containerStyle = {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #e0f2f7 0%, #bbdefb 100%)',
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
  // Guard clause for non-authenticated users
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
                <svg style={{ width: '32px', height: '32px', color: '#ef4444' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
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
                  ⏪
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
                  {isLoading ? '⏳' : isPlaying ? '⏸️' : '▶️'}
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
                  ⏩
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
                  <span>🔊</span>
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
                Change Audio File
              </button>
            </div>
          )}
        </div>

        {/* Text Editor with Quill */}
        <div style={textEditorContainerStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#1f2937', margin: 0 }}>
              Editor
            </h2>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={insertTimestamp}
                style={{
                  background: '#10b981',
                  color: 'white',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '500'
                }}
                title="Insert Timestamp (Ctrl+T)"
              >
                ⏱️ Timestamp
              </button>
              <button
                onClick={exportAsTXT}
                style={{
                  background: '#6b7280',
                  color: 'white',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                📝 Export TXT
              </button>
              <button
                onClick={exportAsWord}
                style={{
                  background: '#2563eb',
                  color: 'white',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                📄 Export Word
              </button>
            </div>
          </div>

          {/* Quill Editor */}
          <ReactQuill
            ref={quillRef}
            theme="snow"
            value={editorContent}
            onChange={handleEditorChange}
            modules={modules}
            formats={formats}
            placeholder="Start typing your transcription here..."
            style={{
              height: '400px',
              marginBottom: '50px'
            }}
          />

          <div style={{ marginTop: '20px', fontSize: '12px', color: '#6b7280', textAlign: 'center' }}>
            <strong>Keyboard Shortcuts:</strong> Ctrl+Space (Play/Pause) | Ctrl+← (Rewind 5s) | Ctrl+→ (Forward 5s) | Ctrl+T (Insert Timestamp)
          </div>
        </div>
      </div>

      {/* Custom CSS for Quill */}
      <style>{`
        .ql-editor {
          font-size: 16px;
          line-height: 1.6;
          font-family: system-ui, -apple-system, sans-serif;
        }
        .ql-toolbar {
          border-top: 1px solid #ccc;
          border-left: 1px solid #ccc;
          border-right: 1px solid #ccc;
        }
        .ql-container {
          border-bottom: 1px solid #ccc;
          border-left: 1px solid #ccc;
          border-right: 1px solid #ccc;
        }
        .ql-editor.ql-blank::before {
          color: #9ca3af;
          font-style: italic;
        }
      `}</style>
    </div>
  );
};

export default RichTextEditor;