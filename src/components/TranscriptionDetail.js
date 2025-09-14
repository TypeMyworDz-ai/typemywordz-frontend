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

  // Helper function to safely convert date
  const convertToDate = (dateValue) => {
    if (!dateValue) return new Date();
    if (dateValue.toDate && typeof dateValue.toDate === 'function') {
      return dateValue.toDate();
    }
    return new Date(dateValue);
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
      const updateDuration = () => setAudioDuration(audio.duration);
      const handlePlay = () => setIsPlaying(true);
      const handlePause = () => setIsPlaying(false);
      const handleLoadStart = () => setIsLoading(true);
      const handleCanPlay = () => setIsLoading(false);
      const handleError = () => {
        setIsLoading(false);
        console.error('Audio loading error');
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
    a.download = `${transcription.fileName.split('.')[0]}.${format === 'word' ? 'doc' : 'txt'}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const togglePlayPause = () => {
    const audio = audioRef.current;
    if (audio) {
      if (isPlaying) {
        audio.pause();
      } else {
        audio.play().catch(console.error);
      }
    }
  };

  const handleSeek = (e) => {
    const audio = audioRef.current;
    if (audio && audioDuration) {
      const rect = e.currentTarget.getBoundingClientRect();
      const percent = (e.clientX - rect.left) / rect.width;
      audio.currentTime = percent * audioDuration;
    }
  };

  const skipTime = (seconds) => {
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = Math.max(0, Math.min(audio.currentTime + seconds, audioDuration));
    }
  };

  const changePlaybackRate = (rate) => {
    const audio = audioRef.current;
    if (audio) {
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
    if (isNaN(seconds)) return '0:00';
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
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
          <h1 className="text-3xl font-bold text-gray-800 mb-2">{transcription.fileName}</h1>
          <p className="text-gray-600">
            Transcribed on {convertToDate(transcription.createdAt).toLocaleDateString()} at {convertToDate(transcription.createdAt).toLocaleTimeString()}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Audio Player */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-6">Audio Player</h2>
            
            {/* Hidden audio element */}
            <audio
              ref={audioRef}
              src={transcription.audioUrl || (transcription.file ? URL.createObjectURL(transcription.file) : '')}
              preload="metadata"
            />
            
            {/* Main Controls */}
            <div className="space-y-6">
              {/* Progress Bar */}
              <div className="space-y-2">
                <div 
                  className="bg-gray-200 rounded-full h-3 cursor-pointer relative overflow-hidden"
                  onClick={handleSeek}
                >
                  <div 
                    className="bg-purple-600 h-3 rounded-full transition-all duration-200 relative"
                    style={{ width: `${(audioCurrentTime / audioDuration) * 100 || 0}%` }}
                  >
                    <div className="absolute right-0 top-0 w-4 h-4 bg-white border-2 border-purple-600 rounded-full transform translate-x-1/2 -translate-y-0.5"></div>
                  </div>
                </div>
                <div className="flex justify-between text-sm text-gray-600">
                  <span>{formatTime(audioCurrentTime)}</span>
                  <span>{formatTime(audioDuration)}</span>
                </div>
              </div>

              {/* Play Controls */}
              <div className="flex items-center justify-center space-x-4">
                <button
                  onClick={() => skipTime(-10)}
                  className="bg-gray-100 hover:bg-gray-200 p-3 rounded-full transition-colors"
                  title="Rewind 10s"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.334 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z" />
                  </svg>
                </button>
                
                <button
                  onClick={togglePlayPause}
                  disabled={isLoading}
                  className="bg-purple-600 text-white p-4 rounded-full hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : isPlaying ? (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  )}
                </button>
                
                <button
                  onClick={() => skipTime(10)}
                  className="bg-gray-100 hover:bg-gray-200 p-3 rounded-full transition-colors"
                  title="Forward 10s"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.933 12.8a1 1 0 000-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4zM19.933 12.8a1 1 0 000-1.6l-5.333-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.333-4z" />
                  </svg>
                </button>
              </div>

              {/* Speed Control */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-gray-700">Playback Speed</label>
                <div className="flex flex-wrap gap-2">
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
                    <button
                      key={speed}
                      onClick={() => changePlaybackRate(speed)}
                      className={`px-3 py-1 rounded-lg text-sm transition-colors ${
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

              {/* Volume Control */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-gray-700">Volume</label>
                <div className="flex items-center space-x-3">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M9 12a1 1 0 01-.707-.293L6.586 10H4a1 1 0 01-1-1V8a1 1 0 011-1h2.586l1.707-1.707A1 1 0 019 6v6z" />
                  </svg>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={volume}
                    onChange={(e) => changeVolume(parseFloat(e.target.value))}
                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                  />
                  <span className="text-sm text-gray-600 w-8">{Math.round(volume * 100)}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Text Editor */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-800">Transcription</h2>
              <div className="flex space-x-2">
                {isEditing ? (
                  <>
                    <button
                      onClick={handleSave}
                      disabled={isSaving}
                      className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center space-x-2"
                    >
                      {isSaving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                      <span>{isSaving ? 'Saving...' : 'Save'}</span>
                    </button>
                    <button
                      onClick={() => {
                        setIsEditing(false);
                        setEditableText(transcription.text || '');
                      }}
                      className="bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Edit
                  </button>
                )}
              </div>
            </div>

            {isEditing ? (
              <textarea
                value={editableText}
                onChange={(e) => setEditableText(e.target.value)}
                className="w-full h-96 p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none font-mono text-sm leading-relaxed"
                placeholder="Your transcription text..."
              />
            ) : (
              <div className="bg-gray-50 rounded-lg p-4 h-96 overflow-y-auto">
                <p className="text-gray-800 whitespace-pre-wrap font-mono text-sm leading-relaxed">
                  {editableText || 'No transcription text available.'}
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-3 mt-6">
              <button
                onClick={handleCopy}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span>Copy Text</span>
              </button>
              <button
                onClick={() => handleDownload('txt')}
                className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Download .txt</span>
              </button>
              <button
                onClick={() => handleDownload('word')}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Download .doc</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TranscriptionDetail;