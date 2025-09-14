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

      audio.addEventListener('timeupdate', updateTime);
      audio.addEventListener('loadedmetadata', updateDuration);
      audio.addEventListener('play', handlePlay);
      audio.addEventListener('pause', handlePause);
      audio.addEventListener('ended', handlePause);

      return () => {
        audio.removeEventListener('timeupdate', updateTime);
        audio.removeEventListener('loadedmetadata', updateDuration);
        audio.removeEventListener('play', handlePlay);
        audio.removeEventListener('pause', handlePause);
        audio.removeEventListener('ended', handlePause);
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
        audio.play();
      }
    }
  };

  const handleSeek = (e) => {
    const audio = audioRef.current;
    if (audio) {
      const rect = e.currentTarget.getBoundingClientRect();
      const percent = (e.clientX - rect.left) / rect.width;
      audio.currentTime = percent * audioDuration;
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
            className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
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
            Transcribed on {transcription.createdAt?.toDate().toLocaleString()}
          </p>
        </div>

        {/* Audio Player */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Audio Playback</h2>
          
          {/* Hidden audio element */}
          <audio
            ref={audioRef}
            src={transcription.audioUrl || (transcription.file ? URL.createObjectURL(transcription.file) : '')}
            preload="metadata"
          />
          
          {/* Custom Audio Controls */}
          <div className="space-y-4">
            <div className="flex items-center space-x-4">
              <button
                onClick={togglePlayPause}
                className="bg-purple-600 text-white p-3 rounded-full hover:bg-purple-700 transition-colors"
              >
                {isPlaying ? (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h8m2 4H7a2 2 0 01-2-2V8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2z" />
                  </svg>
                )}
              </button>
              
              <div className="flex-1">
                <div 
                  className="bg-gray-200 rounded-full h-2 cursor-pointer"
                  onClick={handleSeek}
                >
                  <div 
                    className="bg-purple-600 h-2 rounded-full transition-all duration-200"
                    style={{ width: `${(audioCurrentTime / audioDuration) * 100 || 0}%` }}
                  />
                </div>
              </div>
              
              <div className="text-sm text-gray-600 min-w-0">
                {formatTime(audioCurrentTime)} / {formatTime(audioDuration)}
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
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                  >
                    {isSaving ? 'Saving...' : 'Save'}
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
              className="w-full h-96 p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
              placeholder="Your transcription text..."
            />
          ) : (
            <div className="bg-gray-50 rounded-lg p-4 h-96 overflow-y-auto">
              <p className="text-gray-800 whitespace-pre-wrap">
                {editableText || 'No transcription text available.'}
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3 mt-6">
            <button
              onClick={handleCopy}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
            >
              Copy Text
            </button>
            <button
              onClick={() => handleDownload('txt')}
              className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
            >
              Download .txt
            </button>
            <button
              onClick={() => handleDownload('word')}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:blue-700 transition-colors"
            >
              Download .doc
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TranscriptionDetail;