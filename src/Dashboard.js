import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { fetchUserTranscriptions, deleteTranscription } from '../userService';

const Dashboard = () => {
  const { currentUser, userProfile, refreshUserProfile } = useAuth();
  const [transcriptions, setTranscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTranscription, setSelectedTranscription] = useState(null);

  const loadTranscriptions = useCallback(async () => {
    if (currentUser?.uid) {
      setLoading(true);
      setError('');
      try {
        const fetchedTranscriptions = await fetchUserTranscriptions(currentUser.uid);
        // Sort by createdAt descending to show newest first
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
        loadTranscriptions(); // Refresh the list after deletion
      } catch (err) {
        console.error("Error deleting transcription:", err);
        setError("Failed to delete transcription. Please try again.");
      }
    }
  }, [currentUser?.uid, loadTranscriptions]);

  const handleCopy = useCallback((text) => {
    navigator.clipboard.writeText(text);
    alert('Transcription copied to clipboard!');
  }, []);

  const handleDownload = useCallback((text, fileName, type) => {
    const blob = new Blob([text], { type: type === 'word' ? 'application/msword' : 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName.split('.')[0] || 'transcription'}.${type === 'word' ? 'doc' : 'txt'}`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleViewDetails = useCallback((transcription) => {
    setSelectedTranscription(transcription);
  }, []);

  const handleCloseDetails = useCallback(() => {
    setSelectedTranscription(null);
  }, []);

  if (!currentUser) {
    return <div className="text-center p-8 text-gray-600">Please log in to view your dashboard.</div>;
  }

  if (loading) {
    return <div className="text-center p-8 text-gray-600">Loading transcriptions...</div>;
  }

  if (error) {
    return <div className="text-center p-8 text-red-600">Error: {error}</div>;
  }

  return (
    <div className="container mx-auto p-4">
      <h2 className="text-3xl font-bold text-center text-purple-700 mb-8">Your Transcription History</h2>

      {transcriptions.length === 0 ? (
        <p className="text-center text-gray-600">You have no past transcriptions. Start transcribing!</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {transcriptions.map((transcription) => (
            <div key={transcription.id} className="bg-white p-6 rounded-lg shadow-md hover:shadow-lg transition-shadow duration-200">
              <h3 className="text-xl font-semibold text-gray-800 mb-2 truncate">{transcription.fileName}</h3>
              <p className="text-sm text-gray-600 mb-1">
                Duration: {transcription.duration ? `${Math.round(transcription.duration / 60)} min` : 'N/A'}
              </p>
              <p className="text-sm text-gray-600 mb-4">
                Transcribed: {transcription.createdAt?.toDate().toLocaleString()}
              </p>
              <div className="flex justify-between items-center">
                <button
                  onClick={() => handleViewDetails(transcription)}
                  className="bg-blue-500 text-white px-4 py-2 rounded-full text-sm hover:bg-blue-600"
                >
                  View Transcript
                </button>
                <button
                  onClick={() => handleDelete(transcription.id)}
                  className="bg-red-500 text-white px-4 py-2 rounded-full text-sm hover:bg-red-600"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedTranscription && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white p-8 rounded-xl shadow-2xl max-w-2xl w-full transform transition-all duration-300 scale-100">
            <h3 className="text-2xl font-bold mb-4 text-purple-600">{selectedTranscription.fileName}</h3>
            <p className="text-sm text-gray-600 mb-4">
              Transcribed: {selectedTranscription.createdAt?.toDate().toLocaleString()}
            </p>
            <div className="bg-gray-100 p-4 rounded-md mb-6 max-h-96 overflow-y-auto">
              <p className="text-gray-800 whitespace-pre-wrap">{selectedTranscription.text}</p>
            </div>
            <div className="flex justify-end gap-4">
              <button
                onClick={() => handleCopy(selectedTranscription.text)}
                className="bg-green-500 text-white px-4 py-2 rounded-full hover:bg-green-600"
              >
                Copy
              </button>
              <button
                onClick={() => handleDownload(selectedTranscription.text, selectedTranscription.fileName, 'word')}
                className="bg-blue-500 text-white px-4 py-2 rounded-full hover:bg-blue-600"
              >
                Download .doc
              </button>
              <button
                onClick={() => handleDownload(selectedTranscription.text, selectedTranscription.fileName, 'txt')}
                className="bg-gray-500 text-white px-4 py-2 rounded-full hover:bg-gray-600"
              >
                Download .txt
              </button>
              <button
                onClick={handleCloseDetails}
                className="bg-purple-600 text-white px-4 py-2 rounded-full hover:bg-purple-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;