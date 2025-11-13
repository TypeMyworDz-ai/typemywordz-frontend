import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { fetchUserTranscriptions, deleteTranscription, updateTranscription } from '../userService';
import { useNavigate } from 'react-router-dom';

const Dashboard = ({ setCurrentView }) => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [transcriptions, setTranscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const loadTranscriptions = useCallback(async () => {
    if (currentUser?.uid) {
      setLoading(true);
      setError('');
      try {
        const fetchedTranscriptions = await fetchUserTranscriptions(currentUser.uid);
        console.log('DEBUG: Fetched Transcriptions:', fetchedTranscriptions); // NEW LOG
        // Ensure createdAt is a valid Date object for sorting
        fetchedTranscriptions.forEach(t => {
            if (t.createdAt && typeof t.createdAt.toDate === 'function') {
                t.createdAt = t.createdAt.toDate();
            } else if (t.createdAt instanceof Date === false) {
                // Fallback for non-Firestore Timestamp dates
                t.createdAt = new Date(t.createdAt);
            }
        });
        fetchedTranscriptions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()); // Sort by actual Date object
        setTranscriptions(fetchedTranscriptions);
        console.log('DEBUG: Transcriptions after loading and initial sort:', fetchedTranscriptions); // NEW LOG
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

  const handleDelete = useCallback(async (transcriptionId, e) => {
    e.stopPropagation();
    if (window.confirm("Are you sure you want to delete this transcription?")) {
      try {
        await deleteTranscription(currentUser.uid, transcriptionId);
        loadTranscriptions();
      } catch (err) {
        console.error("Error deleting transcription:", err);
        setError("Failed to delete transcription. Please try again.");
      }
    }
  }, [currentUser?.uid, loadTranscriptions]);

  const handleEdit = useCallback((transcription, e) => {
    e.stopPropagation();
    setEditingId(transcription.id);
    // FIX: Prioritize 'transcriptionText', fallback to 'text'
    setEditingText(transcription.transcriptionText || transcription.text || '');
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingId || !currentUser?.uid) return;
    
    setIsSaving(true);
    try {
      // FIX: Update 'transcriptionText' field
      await updateTranscription(currentUser.uid, editingId, { transcriptionText: editingText });
      
      // Update local state
      setTranscriptions(prev => 
        prev.map(t => 
          t.id === editingId 
            ? { ...t, transcriptionText: editingText } // FIX: Update transcriptionText
            : t
        )
      );
      
      setEditingId(null);
      setEditingText('');
    } catch (err) {
      console.error("Error updating transcription:", err);
      setError("Failed to save transcription. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }, [editingId, currentUser?.uid, editingText]);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditingText('');
  }, []);

  const handleTranscriptionClick = (transcription) => {
    // Only navigate if not editing
    if (editingId !== transcription.id) {
      navigate(`/transcription/${transcription.id}`, { state: { transcription } });
    }
  };

  // Handle the "Transcribe New Audio" button click - for standalone dashboard only
  const handleTranscribeNewAudio = useCallback(() => {
    if (setCurrentView) {
      // If we have setCurrentView, we're in the main app - use it
      setCurrentView('transcribe');
    } else {
      // If no setCurrentView, we're on standalone dashboard - navigate to home
      navigate('/');
    }
  }, [setCurrentView, navigate]);

  // UPDATED: filteredTranscriptions with robust checks and DEBUG LOGS
  const filteredTranscriptions = transcriptions.filter(transcription => {
    console.log('DEBUG FILTER: Processing transcription:', transcription); // NEW LOG
    const lowerSearchTerm = searchTerm.toLowerCase();
    const fileName = transcription.fileName ? transcription.fileName.toLowerCase() : '';
    // FIX: Prioritize 'transcriptionText' for search, fallback to 'text'
    const textContent = transcription.transcriptionText || transcription.text || '';
    const text = textContent.toLowerCase();

    const matches = fileName.includes(lowerSearchTerm) || text.includes(lowerSearchTerm);
    console.log(`DEBUG FILTER: FileName: ${fileName}, Text: ${text}, SearchTerm: ${lowerSearchTerm}, Matches: ${matches}`); // NEW LOG
    return matches;
  });
  console.log('DEBUG: After filtering, filteredTranscriptions.length:', filteredTranscriptions.length); // NEW LOG

  // UPDATED: sortedTranscriptions with DEBUG LOGS
  const sortedTranscriptions = [...filteredTranscriptions].sort((a, b) => {
    console.log('DEBUG SORT: Comparing:', a.fileName, 'and', b.fileName); // NEW LOG
    switch (sortBy) {
      case 'newest':
        // Ensure createdAt is a valid date object before comparison
        const dateA_newest = a.createdAt instanceof Date ? a.createdAt : new Date(0);
        const dateB_newest = b.createdAt instanceof Date ? b.createdAt : new Date(0);
        return dateB_newest.getTime() - dateA_newest.getTime();
      case 'oldest':
        // Ensure createdAt is a valid date object before comparison
        const dateA_oldest = a.createdAt instanceof Date ? a.createdAt : new Date(0);
        const dateB_oldest = b.createdAt instanceof Date ? b.createdAt : new Date(0);
        return dateA_oldest.getTime() - dateB_oldest.getTime();
      case 'name':
        // Add null/undefined checks for fileName before localeCompare
        const fileNameA = a.fileName || '';
        const fileNameB = b.fileName || '';
        return fileNameA.localeCompare(fileNameB);
      case 'duration':
        return (b.duration || 0) - (a.duration || 0);
      default:
        // Default sort by newest, with null/undefined checks
        const defaultDateA = a.createdAt instanceof Date ? a.createdAt : new Date(0);
        const defaultDateB = b.createdAt instanceof Date ? b.createdAt : new Date(0);
        return defaultDateB.getTime() - defaultDateA.getTime();
    }
  });
  console.log('DEBUG: After sorting, sortedTranscriptions.length:', sortedTranscriptions.length); // NEW LOG

  const formatDuration = (seconds) => {
    if (!seconds) return 'N/A';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  if (!currentUser) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb' }}>
        <div style={{ textAlign: 'center', padding: '2rem', backgroundColor: 'white', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#1f2937', marginBottom: '1rem' }}>Access Required</h2>
          <p style={{ color: '#6b7280' }}>Please log in to view your dashboard.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb' }}>
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <div style={{ 
            width: '2rem', 
            height: '2rem', 
            border: '2px solid #e5e7eb', 
            borderTop: '2px solid #3b82f6', 
            borderRadius: '50%', 
            animation: 'spin 1s linear infinite',
            margin: '0 auto 1rem auto'
          }}></div>
          <p style={{ color: '#6b7280' }}>Loading transcriptions...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb' }}>
        <div style={{ textAlign: 'center', padding: '2rem', backgroundColor: 'white', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '4px solid #ef4444' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#dc2626', marginBottom: '1rem' }}>Error</h2>
          <p style={{ color: '#6b7280', marginBottom: '1rem' }}>{error}</p>
          <button 
            onClick={loadTranscriptions}
            style={{ backgroundColor: '#3b82f6', color: 'white', padding: '0.5rem 1rem', borderRadius: '0.25rem', border: 'none', cursor: 'pointer' }}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Check if we're on standalone dashboard route (no setCurrentView prop)
  const isStandaloneDashboard = !setCurrentView;
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', position: 'relative' }}>
      {/* FLOATING TRANSCRIBE BUTTON - ONLY for standalone dashboard */}
      {isStandaloneDashboard && (
        <button
          onClick={handleTranscribeNewAudio}
          style={{
            position: 'fixed',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            backgroundColor: '#7c3aed',
            color: 'white',
            padding: '12px 24px',
            borderRadius: '50px',
            border: 'none',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 4px 20px rgba(124, 58, 237, 0.4)',
            transition: 'all 0.3s ease',
            backdropFilter: 'blur(10px)',
            animation: 'float 3s ease-in-out infinite'
          }}
          onMouseEnter={(e) => {
            e.target.style.backgroundColor = '#6d28d9';
            e.target.style.transform = 'translateX(-50%) translateY(-2px)';
            e.target.style.boxShadow = '0 6px 25px rgba(124, 58, 237, 0.6)';
          }}
          onMouseLeave={(e) => {
            e.target.style.backgroundColor = '#7c3aed';
            e.target.style.transform = 'translateX(-50%)';
            e.target.style.boxShadow = '0 4px 20px rgba(124, 58, 237, 0.4)';
          }}
        >
          <svg 
            style={{ width: '20px', height: '20px' }} 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" 
            />
          </svg>
          🎤 New Transcription
        </button>
      )}

      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: isStandaloneDashboard ? '5rem 1rem 2rem' : '2rem 1rem' }}>
        {/* Header */}
        <div style={{ marginBottom: '2rem' }}>
          <div>
            <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', color: '#111827', marginBottom: '0.5rem' }}>Your Transcriptions</h1>
            <p style={{ color: '#6b7280' }}>Manage and edit your audio transcriptions</p>
          </div>
        </div>

        {/* NEW: Transcription Editor Button */}
        <div style={{ 
          backgroundColor: 'white', 
          borderRadius: '0.5rem', 
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)', 
          padding: '1.5rem', 
          marginBottom: '2rem',
          textAlign: 'center',
          border: '2px solid #7c3aed'
        }}>
          <h3 style={{ 
            fontSize: '1.125rem', 
            fontWeight: '600', 
            color: '#7c3aed', 
            marginBottom: '0.5rem' 
          }}>
            ✏️ Advanced Text Editor
          </h3>
          <p style={{ 
            color: '#6b7280', 
            marginBottom: '1rem', 
            fontSize: '0.875rem' 
          }}>
            Use our advanced transcription editor with audio playback, rich text formatting, and professional editing tools.
          </p>
          <button
            onClick={() => navigate('/transcription-editor')}
            style={{
              backgroundColor: '#7c3aed',
              color: 'white',
              padding: '12px 24px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              margin: '0 auto',
              boxShadow: '0 4px 12px rgba(124, 58, 237, 0.3)',
              transition: 'all 0.3s ease',
            }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = '#6d28d9';
              e.target.style.transform = 'translateY(-2px)';
              e.target.style.boxShadow = '0 6px 20px rgba(124, 58, 237, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = '#7c3aed';
              e.target.style.transform = 'translateY(0)';
              e.target.style.boxShadow = '0 4px 12px rgba(124, 58, 237, 0.3)';
            }}
          >
            <svg 
              style={{ width: '20px', height: '20px' }} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" 
              />
            </svg>
            Open Transcription Editor
          </button>
        </div>
        {/* Search and Filter */}
        <div style={{ backgroundColor: 'white', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '1.5rem', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: '1', position: 'relative', minWidth: '200px' }}>
              <input
                type="text"
                placeholder="Search transcriptions..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ 
                  width: '100%', 
                  paddingLeft: '2.5rem', 
                  paddingRight: '1rem', 
                  paddingTop: '0.5rem', 
                  paddingBottom: '0.5rem', 
                  border: '1px solid #d1d5db', 
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem'
                }}
              />
              <div style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                <svg style={{ width: '1rem', height: '1rem', color: '#9ca3af' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>Sort by:</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                style={{ 
                  padding: '0.5rem 0.75rem', 
                  border: '1px solid #d1d5db', 
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem'
                }}
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="name">File Name</option>
                <option value="duration">Duration</option>
              </select>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ padding: '0.5rem', backgroundColor: '#dbeafe', borderRadius: '0.5rem', marginRight: '1rem' }}>
                <svg style={{ width: '1.25rem', height: '1.25rem', color: '#2563eb' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              </div>
              <div>
                <p style={{ fontSize: '0.875rem', fontWeight: '500', color: '#6b7280', margin: 0 }}>Total</p>
                <p style={{ fontSize: '1.5rem', fontWeight: '600', color: '#111827', margin: 0 }}>{transcriptions.length}</p>
              </div>
            </div>
          </div>
          <div style={{ backgroundColor: 'white', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ padding: '0.5rem', backgroundColor: '#dcfce7', borderRadius: '0.5rem', marginRight: '1rem' }}>
                <svg style={{ width: '1.25rem', height: '1.25rem', color: '#16a34a' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <div>
                <p style={{ fontSize: '0.875rem', fontWeight: '500', color: '#6b7280', margin: 0 }}>Minutes</p>
                <p style={{ fontSize: '1.5rem', fontWeight: '600', color: '#111827', margin: 0 }}>{Math.round(transcriptions.reduce((sum, t) => sum + (t.duration || 0), 0) / 60)}</p>
              </div>
            </div>
          </div>
          <div style={{ backgroundColor: 'white', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ padding: '0.5rem', backgroundColor: '#f3e8ff', borderRadius: '0.5rem', marginRight: '1rem' }}>
                <svg style={{ width: '1.25rem', height: '1.25rem', color: '#9333ea' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              </div>
              <div>
                <p style={{ fontSize: '0.875rem', fontWeight: '500', color: '#6b7280', margin: 0 }}>This Week</p>
                <p style={{ fontSize: '1.5rem', fontWeight: '600', color: '#111827', margin: 0 }}>{transcriptions.filter(t => t.createdAt && (t.createdAt.getTime() > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).getTime())).length}</p>
              </div>
            </div>
          </div>
        </div>
        {/* Conditional rendering for Transcriptions List */}
        {sortedTranscriptions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: '500', color: '#111827', marginBottom: '0.5rem' }}>No Transcriptions Yet</h3>
            <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>Start by uploading your first audio file to get transcribed.</p>
            <button 
              onClick={handleTranscribeNewAudio}
              style={{ 
                backgroundColor: '#3b82f6', 
                color: 'white', 
                padding: '0.75rem 1.5rem', 
                borderRadius: '0.5rem', 
                border: 'none', 
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500'
              }}
            >
              Start Transcribing
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem' }}>
            {sortedTranscriptions.map((transcription) => (
              <div
                key={transcription.id}
                onClick={() => handleTranscriptionClick(transcription)}
                style={{ 
                  backgroundColor: 'white', 
                  borderRadius: '0.5rem', 
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)', 
                  border: '1px solid #e5e7eb',
                  cursor: editingId === transcription.id ? 'default' : 'pointer',
                  transition: 'all 0.2s',
                  opacity: editingId && editingId !== transcription.id ? 0.5 : 1
                }}
                onMouseEnter={(e) => {
                  if (editingId !== transcription.id) {
                    e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (editingId !== transcription.id) {
                    e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }
                }}
              >
                <div style={{ padding: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                    <div style={{ flex: 1 }}>
                      <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#111827', marginBottom: '0.5rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {transcription.fileName || 'Untitled Transcription'} {/* Fallback for fileName */}
                      </h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', fontSize: '0.875rem', color: '#6b7280' }}>
                          <svg style={{ width: '1rem', height: '1rem', marginRight: '0.5rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          {formatDuration(transcription.duration)}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', fontSize: '0.875rem', color: '#6b7280' }}>
                          <svg style={{ width: '1rem', height: '1rem', marginRight: '0.5rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          {transcription.createdAt instanceof Date ? transcription.createdAt.toLocaleDateString() : 'N/A'} {/* Robust date display */}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={(e) => handleEdit(transcription, e)}
                        style={{ 
                          color: '#3b82f6', 
                          padding: '0.5rem',
                          border: 'none',
                          background: 'none',
                          cursor: 'pointer',
                          borderRadius: '0.25rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.25rem'
                        }}
                        onMouseEnter={(e) => {
                          e.target.style.backgroundColor = '#eff6ff';
                          e.target.style.color = '#1d4ed8';
                        }}
                        onMouseLeave={(e) => {
                          e.target.style.backgroundColor = 'transparent';
                          e.target.style.color = '#3b82f6';
                        }}
                        title="Edit transcription"
                      >
                        <svg style={{ width: '1rem', height: '1rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      <button
                        onClick={(e) => handleDelete(transcription.id, e)}
                        style={{ 
                          color: '#9ca3af', 
                          padding: '0.5rem',
                          border: 'none',
                          background: 'none',
                          cursor: 'pointer',
                          borderRadius: '0.25rem'
                        }}
                        onMouseEnter={(e) => {
                          e.target.style.backgroundColor = '#fef2f2';
                          e.target.style.color = '#ef4444';
                        }}
                        onMouseLeave={(e) => {
                          e.target.style.backgroundColor = 'transparent';
                          e.target.style.color = '#9ca3af';
                        }}
                        title="Delete transcription"
                      >
                        <svg style={{ width: '1.25rem', height: '1.25rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </div>

                  {editingId === transcription.id ? (
                    <div style={{ marginBottom: '1rem' }}>
                      <textarea
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        style={{
                          width: '100%',
                          minHeight: '100px',
                          padding: '0.75rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.5rem',
                          fontSize: '0.875rem',
                          resize: 'vertical'
                        }}
                      ></textarea>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                        <button
                          onClick={handleCancelEdit}
                          style={{
                            backgroundColor: '#ef4444',
                            color: 'white',
                            padding: '0.5rem 1rem',
                            borderRadius: '0.25rem',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            fontWeight: '500'
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveEdit}
                          disabled={isSaving}
                          style={{
                            backgroundColor: '#22c55e',
                            color: 'white',
                            padding: '0.5rem 1rem',
                            borderRadius: '0.25rem',
                            border: 'none',
                            cursor: isSaving ? 'not-allowed' : 'pointer',
                            fontSize: '0.75rem',
                            fontWeight: '500',
                            opacity: isSaving ? 0.7 : 1
                          }}
                        >
                          {isSaving ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ backgroundColor: '#f9fafb', borderRadius: '0.5rem', padding: '0.75rem', marginBottom: '1rem' }}>
                      <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                        {/* FIX: Prioritize 'transcriptionText' for display */}
                        {(transcription.transcriptionText || transcription.text) ? 
                          (transcription.transcriptionText || transcription.text).substring(0, 150) + 
                          ((transcription.transcriptionText || transcription.text).length > 150 ? '...' : '') :
                          'No transcription text available'
                        }
                      </p>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', fontSize: '0.75rem', color: '#6b7280' }}>
                      Click to edit
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#3b82f6', fontWeight: '500' }}>
                      Open →
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {/* CSS for animations */}
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          @keyframes float {
            0%, 100% { transform: translateX(-50%) translateY(0px); }
            50% { transform: translateX(-50%) translateY(-3px); }
          }
        `}</style>
      </div>
    </div>
  );
};

export default Dashboard;
