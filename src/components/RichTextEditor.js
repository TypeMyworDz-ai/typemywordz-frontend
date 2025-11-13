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
  const editorContainerRef = useRef(null); // NEW: Ref for the main editor container

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
  // Removed localAudioUrl state as it was unused
  const [sourceAudioUrl, setSourceAudioUrl] = useState(null);
  
  // Load content from localStorage on mount
  useEffect(() => {
    const savedContent = localStorage.getItem('richTextEditorContent');
    if (savedContent) {
      setEditorContent(savedContent);
    }
    // NEW: Scroll to top when component mounts
    if (editorContainerRef.current) {
      editorContainerRef.current.scrollTo(0, 0);
    }
  }, []);

  // Save content to localStorage on change
  const handleEditorChange = useCallback((content) => {
    setEditorContent(content);
    localStorage.setItem('richTextEditorContent', content);
  }, []);

  // Insert timestamp at current audio position - FIXED VERSION
  const insertTimestamp = useCallback(() => {
    if (quillRef.current && audioCurrentTime !== undefined) {
      const quill = quillRef.current.getEditor();
      const range = quill.getSelection(true);
      const timestamp = formatTime(audioCurrentTime);
      
      if (range) {
        // Insert timestamp with specific formatting
        quill.insertText(range.index, `[${timestamp}] `, {
          'color': '#007bff',
          'bold': true
        });
        
        // Move cursor to after the timestamp and reset formatting
        const newPosition = range.index + timestamp.length + 3;
        quill.setSelection(newPosition);
        
        // Reset formatting for subsequent text
        quill.format('color', false);
        quill.format('bold', false);
        
        // Ensure the next character typed will be in default format
        setTimeout(() => {
          if (quill.getSelection()) {
            quill.format('color', '#000000'); // Set to default black
            quill.format('bold', false);
          }
        }, 10);
      }
    }
  }, [audioCurrentTime]);
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
        ['clean']
      ]
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
  // Export functions - FIXED Word Export
  const exportAsWord = useCallback(() => {
    if (!currentUser) {
      alert('Please log in to export as Word.');
      return;
    }
    
    // Convert HTML to plain text first, then format for Word
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = editorContent;
    
    // Create proper HTML for Word with styling
    const wordContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Transcription</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            line-height: 1.6; 
            margin: 40px; 
            color: #000000;
        }
        .timestamp { 
            color: #007bff; 
            font-weight: bold; 
        }
        p { 
            margin-bottom: 12px; 
            color: #000000;
        }
    </style>
</head>
<body>
    ${editorContent.replace(/\[(\d+:\d+)\]/g, '<span class="timestamp">[$1]</span>')}
</body>
</html>`;
    
    const blob = new Blob([wordContent], { 
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'transcription.doc';
    a.click();
    URL.revokeObjectURL(url);
  }, [editorContent, currentUser]);

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
      setSourceAudioUrl(url); // Directly set sourceAudioUrl
      return () => URL.revokeObjectURL(url);
    } else {
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
  // Keyboard Shortcuts Effect - UPDATED: Ctrl+T changed to Ctrl+M
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (quillRef.current && quillRef.current.getEditor().hasFocus()) {
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
            case 'KeyM': // CHANGED FROM KeyT TO KeyM
              event.preventDefault();
              if (audioRef.current && !isNaN(audioRef.current.currentTime)) {
                insertTimestamp();
              } else {
                alert('Please load an audio file first to use timestamps.');
              }
              break;
            default:
              break;
          }
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
      // setLocalAudioUrl(null); // This line is now redundant
      setSourceAudioUrl(null);
      setAudioError(true);
      console.warn('Invalid file type selected for audio.');
    }
  }, []);

  const triggerFileInput = useCallback(() => {
    fileInputRef.current.click();
  }, []);
  return (
    <div 
      ref={editorContainerRef} // NEW: Attach the ref here
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #e0f2f7 0%, #bbdefb 100%)',
        padding: '20px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        overflowY: 'auto' // Ensure this div can scroll
      }}
    >
      <h1 style={{ textAlign: 'center', fontSize: '32px', fontWeight: 'bold', color: '#1f2937', marginBottom: '24px' }}>
        Transcription Editor
      </h1>

      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        display: 'grid',
        gridTemplateColumns: '350px 1fr',
        gap: '24px',
        alignItems: 'start'
      }}>
        {/* New sticky container for Audio Player and Keyboard Shortcuts */}
        <div style={{ position: 'sticky', top: '20px', display: 'flex', flexDirection: 'column', gap: '16px', gridColumn: '1 / 2' }}>
          {/* Audio Player */}
          <div style={{
            background: 'white',
            borderRadius: '12px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
            padding: '20px',
            // Removed position: 'sticky' and top: '20px' from here
          }}>
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
          {/* Keyboard Shortcuts moved here */}
          <div style={{ 
            fontSize: '12px', 
            color: '#6b7280', 
            textAlign: 'center',
            padding: '10px 0' // Add some padding for visual separation
          }}>
            <strong style={{ color: 'red' }}>Keyboard Shortcuts:</strong> Ctrl+Space (Play/Pause) | Ctrl+← (Rewind 5s) | Ctrl+→ (Forward 5s) | Ctrl+M (Insert Timestamp)
          </div>
        </div>
        {/* Text Editor with Quill */}
        <div style={{
          background: 'white',
          borderRadius: '12px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          padding: '24px',
          gridColumn: '2 / 3' // Ensure editor stays in the second column
        }}>
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
                title="Insert Timestamp (Ctrl+M)" // UPDATED: Changed from Ctrl+T to Ctrl+M
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
                disabled={!currentUser}
                style={{
                  background: !currentUser ? '#9ca3af' : '#2563eb',
                  color: 'white',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: !currentUser ? 'not-allowed' : 'pointer',
                  fontSize: '12px'
                }}
                title={!currentUser ? 'Login to enable Word export' : 'Export to MS Word'}
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

          {!currentUser && (
            <p style={{ 
                textAlign: 'center', 
                fontSize: '14px', 
                color: '#ef4444', 
                marginTop: '10px',
                padding: '10px',
                backgroundColor: '#fee2e2',
                borderRadius: '8px'
            }}>
                Some features (like Word export) require you to be logged in.
                <button 
                    onClick={() => navigate('/')}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: '#3b82f6',
                        textDecoration: 'underline',
                        cursor: 'pointer',
                        fontSize: '14px',
                        marginLeft: '5px'
                    }}
                >
                    Login here
                </button>
            </p>
          )}
        </div>
      </div>
      {/* Global CSS for spin animation and Quill fixes - ENHANCED VERSION */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .ql-editor {
          min-height: 400px !important;
          font-size: 16px !important;
          line-height: 1.6 !important;
          font-family: system-ui, -apple-system, sans-serif !important;
          text-align: left !important;
          direction: ltr !important;
          unicode-bidi: plaintext !important;
          white-space: pre-wrap !important;
          word-wrap: break-word !important;
          cursor: text !important;
          padding: 12px 15px !important;
          color: #000000 !important;
        }
        .ql-editor * {
          color: inherit;
        }
        .ql-editor .timestamp {
          color: #007bff !important;
          font-weight: bold !important;
        }
        .ql-toolbar {
          border-top: 1px solid #ccc !important;
          border-left: 1px solid #ccc !important;
          border-right: 1px solid #ccc !important;
        }
        .ql-container {
          border-bottom: 1px solid #ccc !important;
          border-left: 1px solid #ccc !important;
          border-right: 1px solid #ccc !important;
          font-family: system-ui, -apple-system, sans-serif !important;
        }
        .ql-editor.ql-blank::before {
          content: attr(data-placeholder) !important;
          color: #9ca3af !important;
          font-style: italic !important;
          left: 15px !important;
          right: 15px !important;
        }
        .ql-tooltip {
          z-index: 1000 !important;
        }
        .ql-editor p {
          margin-bottom: 0 !important;
          color: #000000 !important;
        }
        /* Reset any color formatting that might leak */
        .ql-editor span:not(.timestamp) {
          color: inherit !important;
        }
        /* Ensure cursor maintains proper formatting */
        .ql-cursor {
          color: #000000 !important;
        }
      `}</style>
    </div>
  );
};

export default RichTextEditor;
