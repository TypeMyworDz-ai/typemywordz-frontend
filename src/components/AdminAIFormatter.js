import React, { useState, useCallback } from 'react';

// Ensure this URL matches your backend's base URL
const RAILWAY_BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://web-production-5eab.up.railway.app';

// SHORTENED formatting instructions to avoid the 2000 character limit
const DEFAULT_FORMATTING_INSTRUCTIONS = `Format the transcript for readability with proper grammar, punctuation, and capitalization. 

Key rules:
1. Replace spelled-out words (e.g., "W-O-R-D") with correct spelling
2. Don't change wording or add articles not dictated
3. Use proper punctuation and comma placement
4. Format times as a.m./p.m. or military time (0600 hours)
5. Keep dates as dictated (12/3/2024 format)
6. Put text in paragraphs only when dictated
7. Dollar amounts as $5.00 (with cents)
8. Numbers 1-10 as words, 11+ as figures for quantities
9. Measurements always as figures (2 hours, 5 years)
10. Capitalize proper nouns and headings
11. Use straight quotes (' ") not curly quotes
12. Format "number" as "No." (Badge No. 4035)
13. Use "Ms." instead of "Miss"

End with: Client spellings: [spelled words]; My spellings: [names only]; I searched: [researched terms].`;

const AdminAIFormatter = ({ showMessage }) => {
  const [transcriptInput, setTranscriptInput] = useState('');
  const [formattingInstructions, setFormattingInstructions] = useState(DEFAULT_FORMATTING_INSTRUCTIONS);
  const [formattedOutput, setFormattedOutput] = useState('');
  const [aiLoading, setAILoading] = useState(false);

  const handleAdminFormat = useCallback(async () => {
    if (!transcriptInput) {
      showMessage('Please paste a transcript to format.');
      return;
    }
    if (!formattingInstructions) {
      showMessage('Please provide formatting instructions for the AI.');
      return;
    }

    // Check instruction length
    if (formattingInstructions.length > 2000) {
      showMessage('❌ Formatting instructions are too long. Please shorten them to under 2000 characters.');
      return;
    }

    setAILoading(true);
    setFormattedOutput(''); // Clear previous output

    try {
      const response = await fetch(`${RAILWAY_BACKEND_URL}/ai/admin-format`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transcript: transcriptInput,
          formatting_instructions: formattingInstructions,
          model: 'claude-3-haiku-20240307', // FIXED: Use the working model from your test
          max_tokens: 4000
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to get AI formatted response from backend.');
      }

      const data = await response.json();
      setFormattedOutput(data.formatted_transcript);
      showMessage('✅ Transcript formatted by AI successfully!');

    } catch (error) {
      console.error('Admin AI Formatter Error:', error);
      showMessage('❌ Admin AI Formatter failed: ' + error.message);
    } finally {
      setAILoading(false);
    }
  }, [transcriptInput, formattingInstructions, showMessage]); // FIXED: Removed RAILWAY_BACKEND_URL

  return (
    <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto', backgroundColor: '#f8f9fa', borderRadius: '15px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', marginTop: '20px' }}>
      <h2 style={{ color: '#dc3545', textAlign: 'center', marginBottom: '30px' }}>👑 Admin AI Formatter</h2>
      <p style={{ textAlign: 'center', color: '#666', marginBottom: '30px' }}>
        Provide a raw transcript and detailed instructions for the AI to format and polish it.
        This feature is for administrative use only.
      </p>

      <div style={{ marginBottom: '20px' }}>
        <label htmlFor="adminTranscriptInput" style={{ display: 'block', color: '#6c5ce7', fontWeight: 'bold', marginBottom: '10px' }}>
          Raw Transcript to Format:
        </label>
        <textarea
          id="adminTranscriptInput"
          value={transcriptInput}
          onChange={(e) => setTranscriptInput(e.target.value)}
          placeholder="Paste the raw transcription here for AI formatting..."
          rows="15"
          style={{
            width: '100%',
            padding: '15px',
            borderRadius: '10px',
            border: '1px solid #ddd',
            fontSize: '1rem',
            resize: 'vertical',
            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)'
          }}
        ></textarea>
      </div>

      <div style={{ marginBottom: '30px' }}>
        <label htmlFor="formattingInstructions" style={{ display: 'block', color: '#6c5ce7', fontWeight: 'bold', marginBottom: '10px' }}>
          Detailed Formatting Instructions for AI:
          <span style={{ color: '#dc3545', fontSize: '0.9rem' }}> ({formattingInstructions.length}/2000 characters)</span>
        </label>
        <textarea
          id="formattingInstructions"
          value={formattingInstructions}
          onChange={(e) => setFormattingInstructions(e.target.value)}
          placeholder="e.g., 'Correct grammar, formal tone, add subheadings for topics, bold action items.'"
          rows="8"
          style={{
            width: '100%',
            padding: '15px',
            borderRadius: '10px',
            border: formattingInstructions.length > 2000 ? '2px solid #dc3545' : '1px solid #ddd',
            fontSize: '1rem',
            resize: 'vertical',
            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)'
          }}
        ></textarea>
        {formattingInstructions.length > 2000 && (
          <p style={{ color: '#dc3545', fontSize: '0.9rem', marginTop: '5px' }}>
            ⚠️ Instructions are too long. Please shorten to under 2000 characters.
          </p>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', marginBottom: '30px', flexWrap: 'wrap' }}>
        <button
          onClick={handleAdminFormat}
          disabled={!transcriptInput || !formattingInstructions || aiLoading || formattingInstructions.length > 2000}
          style={{
            padding: '12px 25px',
            backgroundColor: (!transcriptInput || !formattingInstructions || aiLoading || formattingInstructions.length > 2000) ? '#6c757d' : '#dc3545',
            color: 'white',
            border: 'none',
            borderRadius: '25px',
            cursor: (!transcriptInput || !formattingInstructions || aiLoading || formattingInstructions.length > 2000) ? 'not-allowed' : 'pointer',
            fontSize: '1rem',
            fontWeight: 'bold',
            boxShadow: '0 4px 15px rgba(220, 53, 69, 0.4)',
            transition: 'all 0.3s ease'
          }}
        >
          {aiLoading ? 'Formatting...' : '👑 Format Transcript with AI'}
        </button>
        <button
          onClick={() => { setTranscriptInput(''); setFormattingInstructions(DEFAULT_FORMATTING_INSTRUCTIONS); setFormattedOutput(''); }}
          style={{
            padding: '12px 25px',
            backgroundColor: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '25px',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: 'bold',
            boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
            transition: 'all 0.3s ease'
          }}
        >
          Clear All
        </button>
      </div>

      {aiLoading && (
        <div style={{ textAlign: 'center', color: '#dc3545', marginBottom: '20px' }}>
          <div className="progress-bar-indeterminate" style={{
              backgroundColor: '#dc3545',
              height: '20px',
              width: '100%',
              borderRadius: '10px',
              marginBottom: '10px'
          }}></div>
          Applying AI formatting...
        </div>
      )}

      {formattedOutput && (
        <div style={{ marginTop: '30px' }}>
          <h3 style={{ color: '#dc3545', textAlign: 'center', marginBottom: '20px' }}>Formatted Transcript:</h3>
          <div style={{
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '10px',
            border: '1px solid #dee2e6',
            textAlign: 'left',
            lineHeight: '1.6',
            whiteSpace: 'pre-wrap',
            boxShadow: '0 5px 15px rgba(0,0,0,0.1)'
          }}>
            {formattedOutput}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminAIFormatter;
