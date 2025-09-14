import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { fetchUserTranscriptions, deleteTranscription, updateTranscription } from '../userService';

// Helper function for formatting duration
const formatDuration = (durationSeconds) => {
  if (typeof durationSeconds !== 'number' || isNaN(durationSeconds)) {
    return 'N/A';
  }
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = Math.round(durationSeconds % 60);
  return `${minutes}m ${seconds}s`;
};

// Helper function to download files
const downloadFile = (text, fileName, type) => {
  const mimeType = type === 'word' ? 'application/msword' : 'text/plain';
  const extension = type === 'word' ? 'doc' : 'txt';
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileName.split('.')[0] || 'transcription'}.${extension}`;
  a.click();
  URL.revokeObjectURL(url);
};

const Dashboard = () => {
  const { currentUser } = useAuth();
  const [transcriptions, setTranscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTranscription, setSelectedTranscription] = useState(null);
  const [editableTranscriptionText, setEditableTranscriptionText] = useState('');
  const audioPlayerRef = useRef(null); 
  const [copiedMessageVisible, setCopiedMessageVisible] = useState(false); 

  const loadTranscriptions = useCallback(async () => {
    if (currentUser?.uid) {
      setLoading(true);
      setError('');
      try {
        const fetchedTranscriptions = await fetchUserTranscriptions(currentUser.uid);
        fetchedTranscriptions.sort((a, b) => b.createdAt.toDate().getTime() - a.createdAt.toDate().getTime());
        setTranscriptions(fetchedTranscriptions);
      } catch (err) {
        console.error("Error fetching transcriptions:", err);
        setError("Failed to load transcriptions. Please try again.");
      } finally {
        setLoading(false);
      }
    }
  }, [currentUser?.uid]);

  useEffect(() => {
    loadTranscriptions();
  }, [loadTranscriptions]);

  const handleDelete = useCallback(async (transcriptionId) => {
    if (window.confirm("Are you sure you want to delete this transcription?")) {
      try {
        await deleteTranscription(currentUser.uid, transcriptionId);
        loadTranscriptions(); 
        if (selectedTranscription && selectedTranscription.id === transcriptionId) {
          setSelectedTranscription(null); 
        }
      } catch (err) {
        console.error("Error deleting transcription:", err);
        setError("Failed to delete transcription. Please try again.");
      }
    }
  }, [currentUser?.uid, loadTranscriptions, selectedTranscription]);

  const handleCopy = useCallback((text) => {
    navigator.clipboard.writeText(text);
    setCopiedMessageVisible(true); 
    setTimeout(() => setCopiedMessageVisible(false), 2000); 
  }, []);

  const handleDownload = useCallback((text, fileName, type) => {
    downloadFile(text, fileName, type);
  }, []);

  const handleViewDetails = useCallback((transcription) => {
    setSelectedTranscription(transcription);
    setEditableTranscriptionText(transcription.transcriptionText || ''); // Correctly use transcriptionText
  }, []);

  const handleCloseDetails = useCallback(() => {
    setSelectedTranscription(null);
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause(); 
      audioPlayerRef.current.currentTime = 0;
    }
    setCopiedMessageVisible(false); 
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (selectedTranscription && currentUser?.uid) {
      try {
        await updateTranscription(currentUser.uid, selectedTranscription.id, { transcriptionText: editableTranscriptionText }); // Correct field name
        alert('Transcription updated successfully!'); 
        loadTranscriptions(); 
        handleCloseDetails(); 
      } catch (err) {
        console.error("Error saving transcription edits:", err);
        setError("Failed to save edits. Please try again.");
      }
    }
  }, [selectedTranscription, currentUser?.uid, editableTranscriptionText, loadTranscriptions, handleCloseDetails]);

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <p className="text-xl font-semibold text-gray-700">Please log in to view your dashboard.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <p className="text-xl font-semibold text-purple-600 animate-pulse">Loading your transcriptions...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-red-100">
        <p className="text-xl font-semibold text-red-700">Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 p-4 sm:p-8">
      <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-2xl p-6 sm:p-8 lg:p-10">
        <h2 className="text-4xl font-extrabold text-center text-purple-700 mb-10 tracking-tight">
          📊 Your Transcription History
        </h2>

        {transcriptions.length === 0 ? (
          <div className="text-center py-20 bg-gray-50 rounded-lg shadow-inner">
            <p className="text-2xl text-gray-500 font-medium mb-4">No past transcriptions found.</p>
            <p className="text-lg text-gray-400">Start transcribing to see your history here!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {transcriptions.map((transcription) => (
              <div key={transcription.id} className="relative bg-white border border-purple-200 p-6 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 flex flex-col justify-between">
                <div>
                  <h3 className="text-2xl font-bold text-purple-800 mb-2 truncate" title={transcription.fileName}>
                    {transcription.fileName}
                  </h3>
                  <p className="text-sm text-gray-600 mb-1">
                    <span className="font-semibold">Duration:</span> {formatDuration(transcription.duration)}
                  </p>
                  <p className="text-sm text-gray-600 mb-4">
                    <span className="font-semibold">Transcribed:</span> {transcription.createdAt?.toDate().toLocaleString()}
                  </p>
                  <p className="text-gray-700 text-sm line-clamp-3 mb-4">
                    {transcription.transcriptionText || 'No transcription text available.'}
                  </p>
                </div>
                <div className="flex justify-between items-center mt-4">
                  <button
                    onClick={() => handleViewDetails(transcription)}
                    className="bg-purple-600 text-white px-5 py-2 rounded-full text-base font-semibold hover:bg-purple-700 transition-colors shadow-md"
                  >
                    View Details
                  </button>
                  <button
                    onClick={() => handleDelete(transcription.id)}
                    className="bg-red-500 text-white px-5 py-2 rounded-full text-base font-semibold hover:bg-red-600 transition-colors shadow-md"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Transcription Details Modal */}
      {selectedTranscription && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white p-8 rounded-xl shadow-2xl max-w-3xl w-full transform transition-all duration-300 scale-100 flex flex-col max-h-[90vh]">
            <h3 className="text-3xl font-bold mb-4 text-purple-700 break-words">
              {selectedTranscription.fileName}
            </h3>
            <p className="text-base text-gray-600 mb-4">
              Transcribed: {selectedTranscription.createdAt?.toDate().toLocaleString()}
            </p>
            
            {/* Audio Player for Playback - In a real app, you'd fetch the audio URL */}
            {/* For now, we assume selectedTranscription.file (a Blob/File object) might be available from the client-side state */}
            {/* Since this is a history, you'd typically have stored the audio file URL in Firestore */}
            {/* As a placeholder, we'll hide it for now if no direct file object is present */}
            {selectedTranscription.audioUrl ? (
              <div className="mb-4">
                <audio ref={audioPlayerRef} controls className="w-full" src={selectedTranscription.audioUrl}></audio>
              </div>
            ) : (
              <p className="text-sm text-gray-500 mb-4">Audio playback not available for this transcription (original audio not stored).</p>
            )}


            {/* Editable Transcription */}
            <div className="flex-grow bg-gray-100 p-4 rounded-md mb-6 overflow-y-auto border border-gray-300">
              <textarea
                className="w-full h-full p-2 bg-transparent border-none resize-none focus:outline-none text-gray-800 leading-relaxed"
                value={editableTranscriptionText}
                onChange={(e) => setEditableTranscriptionText(e.target.value)}
              ></textarea>
            </div>
            <div className="flex flex-wrap justify-end gap-3 mt-auto">
              <button
                onClick={handleSaveEdit}
                className="bg-green-500 text-white px-5 py-2 rounded-full hover:bg-green-600 transition-colors shadow-md text-sm"
              >
                Save Edits
              </button>
              <button
                onClick={() => handleCopy(editableTranscriptionText)} 
                className="bg-blue-500 text-white px-5 py-2 rounded-full hover:bg-blue-600 transition-colors shadow-md text-sm"
              >
                Copy
              </button>
              <button
                onClick={() => handleDownload(editableTranscriptionText, selectedTranscription.fileName, 'word')}
                className="bg-indigo-500 text-white px-5 py-2 rounded-full hover:bg-indigo-600 transition-colors shadow-md text-sm"
              >
                Download .doc
              </button>
              <button
                onClick={() => handleDownload(editableTranscriptionText, selectedTranscription.fileName, 'txt')}
                className="bg-gray-500 text-white px-5 py-2 rounded-full hover:bg-gray-600 transition-colors shadow-md text-sm"
              >
                Download .txt
              </button>
              <button
                onClick={handleCloseDetails}
                className="bg-purple-600 text-white px-5 py-2 rounded-full hover:bg-purple-700 transition-colors shadow-md text-sm"
              >
                Close
              </button>
            </div>
          </div>
          {copiedMessageVisible && (
            <div className="copied-message-animation">
              Copied to clipboard!
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Dashboard;