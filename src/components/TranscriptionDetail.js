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
  if (!transcription) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50">
        <div className="text-center p-8 bg-white rounded-xl shadow-lg">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Transcription Not Found</h2>
          <button 
            onClick={() => navigate('/dashboard')}
            className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const createdDate = convertToDate(transcription.createdAt);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center text-purple-600 hover:text-purple-800 transition-colors"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Dashboard
            </button>
            <button
              onClick={handleDelete}
              className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition-colors"
            >
              Delete
            </button>
          </div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">{transcription.fileName || 'Untitled'}</h1>
          <p className="text-gray-600">
            Transcribed on {formatDate(createdDate)}
          </p>
        </div>

        {/* Main Content - Side by Side Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Audio Player - Compact */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-lg p-6 sticky top-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4">Audio Player</h2>
              
              {/* Hidden audio element */}
              <audio
                ref={audioRef}
                src={transcription.audioUrl}
                preload="metadata"
                crossOrigin="anonymous"
              />
              
              {audioError ? (
                <div className="text-center py-6">
                  <div className="w-16 h-16 mx-auto mb-3 bg-red-100 rounded-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-sm text-red-600 font-medium">Audio file not found</p>
                  <p className="text-xs text-gray-500 mt-1">Check if the file exists</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Progress Bar */}
                  <div className="space-y-2">
                    <div 
                      className="bg-gray-200 rounded-full h-2 cursor-pointer relative"
                      onClick={handleSeek}
                    >
                      <div 
                        className="bg-purple-600 h-2 rounded-full transition-all duration-200"
                        style={{ width: `${audioDuration > 0 ? (audioCurrentTime / audioDuration) * 100 : 0}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-gray-600">
                      <span>{formatTime(audioCurrentTime)}</span>
                      <span>{formatTime(audioDuration)}</span>
                    </div>
                  </div>

                  {/* Play Controls - Compact */}
                  <div className="flex items-center justify-center space-x-3">
                    <button
                      onClick={() => skipTime(-10)}
                      disabled={audioError}
                      className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors disabled:opacity-50"
                      title="Rewind 10s"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.334 4z" />
                      </svg>
                    </button>
                    
                    <button
                      onClick={togglePlayPause}
                      disabled={isLoading || audioError}
                      className="p-3 bg-purple-600 text-white rounded-full hover:bg-purple-700 transition-colors disabled:opacity-50"
                    >
                      {isLoading ? (
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      ) : isPlaying ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z"/>
                        </svg>
                      )}
                    </button>
                    
                    <button
                      onClick={() => skipTime(10)}
                      disabled={audioError}
                      className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors disabled:opacity-50"
                      title="Forward 10s"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.933 12.8a1 1 0 000-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4z" />
                      </svg>
                    </button>
                  </div>

                  {/* Speed Control - Compact */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-700">Speed</label>
                    <div className="grid grid-cols-3 gap-1">
                      {[0.75, 1, 1.25, 1.5, 1.75, 2].map((speed) => (
                        <button
                          key={speed}
                          onClick={() => changePlaybackRate(speed)}
                          disabled={audioError}
                          className={`px-2 py-1 rounded text-xs transition-colors disabled:opacity-50 ${
                            playbackRate === speed
                              ? 'bg-purple-600 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {speed}x
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Volume Control - Compact */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-700">Volume</label>
                    <div className="flex items-center space-x-2">
                      <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                        className="flex-1 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
                      />
                      <span className="text-xs text-gray-600 w-8">{Math.round(volume * 100)}%</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          {/* Text Editor - Large and Prominent */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-800">Transcription</h2>
                <div className="flex space-x-3">
                  {isEditing ? (
                    <>
                      <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center space-x-2"
                      >
                        {isSaving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                        <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
                      </button>
                      <button
                        onClick={() => {
                          setIsEditing(false);
                          setEditableText(transcription.text || '');
                        }}
                        className="bg-gray-500 text-white px-6 py-2 rounded-lg hover:bg-gray-600 transition-colors"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      <span>Edit Transcription</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Large Text Editor Area */}
              {isEditing ? (
                <div className="space-y-4">
                  <textarea
                    value={editableText}
                    onChange={(e) => setEditableText(e.target.value)}
                    className="w-full h-[600px] p-6 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 resize-none text-gray-800 text-base leading-relaxed"
                    placeholder="Start typing your transcription here..."
                    style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
                  />
                  <div className="flex items-center justify-between text-sm text-gray-500">
                    <span>{editableText.length} characters</span>
                    <span>Use Ctrl+S to save quickly</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-gray-50 rounded-lg p-6 h-[600px] overflow-y-auto border-2 border-gray-200">
                    {editableText ? (
                      <p className="text-gray-800 whitespace-pre-wrap text-base leading-relaxed" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                        {editableText}
                      </p>
                    ) : (
                      <div className="h-full flex items-center justify-center">
                        <div className="text-center">
                          <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <p className="text-gray-500 text-lg mb-2">No transcription text available</p>
                          <p className="text-gray-400 text-sm">Click "Edit Transcription" to add content</p>
                        </div>
                      </div>
                    )}
                  </div>
                  {editableText && (
                    <div className="flex items-center justify-between text-sm text-gray-500">
                      <span>{editableText.length} characters</span>
                      <span>Click Edit to modify this transcription</span>
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons - Nicely Spaced */}
              <div className="mt-8 pt-6 border-t border-gray-200">
                <div className="flex flex-wrap gap-4">
                  <button
                    onClick={handleCopy}
                    className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2 font-medium"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <span>Copy to Clipboard</span>
                  </button>
                  
                  <button
                    onClick={() => handleDownload('txt')}
                    className="bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 transition-colors flex items-center space-x-2 font-medium"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span>Download as TXT</span>
                  </button>
                  
                  <button
                    onClick={() => handleDownload('word')}
                    className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2 font-medium"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span>Download as DOC</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TranscriptionDetail;