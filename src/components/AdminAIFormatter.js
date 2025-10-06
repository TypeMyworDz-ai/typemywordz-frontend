// src/components/AdminAIFormatter.js

import React, { useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext'; // Import useAuth to get userProfile

// FIX: Ensure this URL matches your backend's base URL
const RAILWAY_BACKEND_URL = process.env.REACT_APP_RAILWAY_BACKEND_URL || 'https://backendforrailway-production-7128.up.railway.app'; // Corrected URL

// Define the default formatting instructions as a constant outside the component
const DEFAULT_FORMATTING_INSTRUCTIONS = `STUDY THOSE GENERAL GUIDELINES AND USE THEM TO FORMAT THE TEXT I WILL GIVE YOU (Follow rule number 9. as it is):

1. When a word is explicitly spelled out (Or military-phonetical spelling, e.g., "David, Lincoln, Edward, Ida, et cetera) replace the wrongly spelled word throughout the text with the correct spelled out word/words. Also, remove the spelled out part. Explicitly spelled words might look like "W-O-R-D, or W,O,R,D, w,o,r,d." in the text.

2. Do not change the wording. Do not add the article 'The' if it's not dictated. MAINTAIN INTEGRITY OF THE TEXT. Only remove the spellings.

3. Punctuate correctly making sure there are commas before conjunctions that separate independent clauses. Do not remove fullstops or add conjuctions if they are not dictated. 

4. Time should be in format a.m. or p.m. (Not PM or AM or P.M. or A.M). If military time is dictated, write it like this; 0600 hours. 	

5. If a date is dictated like 12 slash 3 slash 2024, it should be typed as 12/3/2024 (Do not paraphrase the month from figures to words. If a date is dictated like "November 27th, 2024" it should be written as "November 27, 2024", "Social Worker John called Emily on June 2", "Social Worker John called Emily on June the 2nd" . Also, if a date is standalone or preceeds a month or a year, do not remove the ordinal parts, e.g., "Caseworker went there on the 17th", "The kid was taken on 28th July" If dates are dictated like this "2 5 2024", put slashes "2/5/2024. Do spell out Months if dictated in figures e.g., 11/8 should not become November 8. DO NOT PARAPHRASE THE DATES.

6. Put the text into one PARAGRAPH. Only start a NEW PARAGRAPH if dictated/written in the original text. Put a one line between paragraphs.

7. Add punctuations where necessary. Do not start sentences with conjunctions, e.g., 'But', And, etc.

8. DO NOT PARAPHRASE/CHANGE WORDING OF THE TEXT. THE FORMATTED TEXT SHOULD RETAIN IT'S ORIGINALITY. DO NOT ADD FUNNY PARAGRAPHS/DATES/TIME AT THE BEGINNING. ONLY INFER HEADINGS DIRECT FROM THE ORIGINAL TEXT. Do not add any text that is not dictated; this includes not adding conjunctions or articles 'the' or 'a' that are not dictated.

9. For dollar amounts, put them in figures and add cents even if they are not dictated, like this: $5.00, $12.00, et cetera. NEVER USE USD, use the symbol $ for dollar amounts.

10. Check the proper names of places and make sure they are spelled and capitalized correctly according to context. 

11. Capitalize words that are proper nouns accordingly. 

12. Correct spelled words throughout the text and remove the spellings.

13. If the word 'number' comes before a figure e.g., "Badge number 4035" and "I was number 10 in the competition", format like this, "Badge No. 4035", "I was No. 10 in the competition". Also, for ID, always format it as I.D.

14. We format quantifying numbers as words for numbers 10 and below, e.g., "two different things" but for anything signifying measurements we use figures, e.g., "2 hours" "2 meters": More examples; For numbers used for measurements, e.g., years, days, time, distances, et cetera, use figures not words, e.g., it should be 1 day, not one day, 2 hours not two hours, 5 years, not five years. We also type Number 4, Apartment 2, Apartment B, Page 5, et cetera. Note: Any number that is a quantifying number, e.g., two children, ten oranges, 11 apples, should be written like this: 1-10 in words, e.g., ten students. Numbers 11 and over should be typed in figures, e.g., 12 students.

15. Only put dots on abbreviations if they are dictated/spelled out in the original text.

16. % should be written in words, e.g., 60 percent, 1 percent.

17. Do not add dots in abbreviations unless instructed to do so. If the dots are in the original text, remove them, e.g., "S.W should be written as "SW".

18. CAPITALIZE HEADINGS AND DON'T PUT COLONS UNLESS DICTATED/INDICATED IN THE ORIGINAL TEXT. HEADINGS SHOULD BE ON THEIR OWN LINE/PARAGRAPH.

19. The final formatted text should only contain the text; do not include any other type of text e.g., watermarks, explanation of formatting, links that are not part of the text, or the first part of: "The following is formatted text... et cetera". JUST PURELY FORMATTED TEXT. Thank you.

20. Always change 'Miss' to 'Ms.', e.g., if the original text has Miss. Austin, change to Ms. Austin.

21. Do not capitalize 'social worker' or 'caseworker' if it doesn't come before a name of a person, e.g., 'Social Worker Jason', 'Caseworker Jason'. If they areis standalone, follow the normal capitalization depending on the position of the sentence.

22. Do not change the SENTENCE STRUCTURE; Do not add words, rearrange, substitute or paraphrase words/phrases. Only correct speech errors and follow dictation instructions ONLY.

23. Always use straight quotes (' "). NEVER USE CURLY QUOTES (')."

24. Always remember, we use slashes in DATES unless instructed otherwise.

25. At the end of the text, put a section like this: 

Client spellings: Word, word2, Word3, XX (abbreviation; only if the abbreviation is spelled out explicitly e.g., C-A-S-A, or C,A,S,A), Word4 (These are explicitly spelled out words in the text); My spellings: John, Wanita, Drue (This should include names of people ONLY that were not spelled explicitly by the client; I searched: Wawanesa Insurance Company. (For the 'searched' part, these are words/phrases/proper nouns that you have done an internet search on that were not provided or spelled out by the client. Also, make sure they are not straightforward words/phrases but hard-to-get stuff that has distinct spellings. Doesn't have to be on Google, it can be any kind of internet search that warrants a word to be changed). This section should be in a paragraph form and not in list form). 

Always remember that only names of people come under "My spellings:" section. In the "I searched:" section, only include words/phrases that you have done a online search to confirm the correct verbiage/capitalization of a word/phrase.

So it should look like this:

Client spellings: Word, word2, Word3, XX (abbreviation), Word4; My spellings: Name, Name, Name; I searched: Wawanesa Insurance Company.

26. Always search ONLINE to confirm proper nouns. E.g., if the original text has "Cisco" but you can use context to tell that the dictation is talking about Sysco the food company, you will have to change the "Cisco" to "Sysco". Similarly, do an internet search to confirm that words or phrases are correctly spelled out and capitalized the way they should.

27. Do not include YOUR summaries/notes/analysis or any kind of metainformation in the final formatted text.
`;

// Helper function to determine if a user has access to AI features - REMOVED RESTRICTIONS
const isPaidAIUser = (userProfile) => {
  // REMOVED LIMITS: Now available for all users
  return true;
};
const AdminAIFormatter = ({ showMessage }) => {
  const { userProfile, profileLoading } = useAuth(); // Get userProfile from AuthContext
  const [transcriptInput, setTranscriptInput] = useState('');
  const [formattingInstructions, setFormattingInstructions] = useState(DEFAULT_FORMATTING_INSTRUCTIONS);
  const [formattedOutput, setFormattedOutput] = useState('');
  const [aiLoading, setAILoading] = useState(false);
  // UPDATED State: To select between AI providers (claude or gemini)
  const [selectedAIProvider, setSelectedAIProvider] = useState('claude'); // 'claude' or 'gemini'
  
  // NEW: States for copy functionality and continue functionality
  const [copiedMessageVisible, setCopiedMessageVisible] = useState(false);
  const [showContinueBox, setShowContinueBox] = useState(false);
  const [continuePrompt, setContinuePrompt] = useState('');

  // NEW: Function to handle copying AI response
  const handleCopyAIResponse = useCallback(() => {
    navigator.clipboard.writeText(formattedOutput);
    setCopiedMessageVisible(true);
    setTimeout(() => setCopiedMessageVisible(false), 2000);
    showMessage('✅ AI response copied to clipboard!');
  }, [formattedOutput, showMessage]);

  // NEW: Function to handle continue AI response
  const handleContinueResponse = useCallback(async () => {
    if (!continuePrompt.trim()) {
      showMessage('Please enter instructions for continuing the response.');
      return;
    }

    setAILoading(true);
    
    try {
      const formData = new FormData();
      formData.append('transcript', transcriptInput + '\n\nPrevious AI Response:\n' + formattedOutput);
      formData.append('formatting_instructions', continuePrompt);
      formData.append('max_tokens', '8000'); // REMOVED LIMITS - increased to 8000
      formData.append('user_plan', userProfile?.plan || 'free');

      let endpoint = '';
      let defaultModel = '';

      if (selectedAIProvider === 'claude') {
        endpoint = `${RAILWAY_BACKEND_URL}/ai/admin-format`;
        defaultModel = 'claude-3-5-haiku-20241022'; 
      } else if (selectedAIProvider === 'gemini') {
        endpoint = `${RAILWAY_BACKEND_URL}/ai/admin-format-gemini`;
        defaultModel = 'models/gemini-pro-latest';
      } else {
        showMessage('Invalid AI provider selected.');
        setAILoading(false);
        return;
      }
      
      formData.append('model', defaultModel);

      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `Backend error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      setFormattedOutput(formattedOutput + '\n\n' + data.formatted_transcript);
      setContinuePrompt('');
      setShowContinueBox(false);
      showMessage('✅ Response continued successfully!');

    } catch (error) {
      console.error('Continue AI Response Error:', error);
      showMessage('❌ Failed to continue response: ' + error.message);
    } finally {
      setAILoading(false);
    }
  }, [continuePrompt, transcriptInput, formattedOutput, userProfile, selectedAIProvider, showMessage, RAILWAY_BACKEND_URL]);

  const handleAdminFormat = useCallback(async () => {
    if (profileLoading || !userProfile) {
        showMessage('Loading user profile... Please wait.');
        return;
    }
    // REMOVED: User plan restrictions - now available for all users
    
    if (!transcriptInput) {
      showMessage('Please paste a transcript to format.');
      return;
    }
    if (!formattingInstructions) {
      showMessage('Please provide formatting instructions for the AI. ');
      return;
    }

    setAILoading(true);
    setFormattedOutput(''); // Clear previous output

    try {
      const formData = new FormData();
      formData.append('transcript', transcriptInput);
      formData.append('formatting_instructions', formattingInstructions);
      formData.append('max_tokens', '8000'); // REMOVED LIMITS - increased to 8000
      formData.append('user_plan', userProfile?.plan || 'free');

      let endpoint = '';
      let defaultModel = '';

      if (selectedAIProvider === 'claude') {
        endpoint = `${RAILWAY_BACKEND_URL}/ai/admin-format`;
        defaultModel = 'claude-3-5-haiku-20241022'; 
      } else if (selectedAIProvider === 'gemini') {
        endpoint = `${RAILWAY_BACKEND_URL}/ai/admin-format-gemini`;
        defaultModel = 'models/gemini-pro-latest';
      } else {
        showMessage('Invalid AI provider selected.');
        setAILoading(false);
        return;
      }
      formData.append('model', defaultModel);

      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `Backend error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      setFormattedOutput(data.formatted_transcript);
      setShowContinueBox(true); // NEW: Show continue option after AI responds
      showMessage('✅ Transcript formatted by AI successfully!');

    } catch (error) {
      console.error('Admin AI Formatter Error:', error);
      showMessage('❌ Admin AI Formatter failed: ' + error.message);
    } finally {
      setAILoading(false);
    }
  }, [transcriptInput, formattingInstructions, userProfile, profileLoading, showMessage, RAILWAY_BACKEND_URL, selectedAIProvider]);

  // REMOVED: User restrictions - now all users can use this feature
  const isButtonDisabled = profileLoading || !userProfile || !transcriptInput || !formattingInstructions || aiLoading;
  return (
    <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto', backgroundColor: '#f8f9fa', borderRadius: '15px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', marginTop: '20px' }}>
      <h2 style={{ color: '#dc3545', textAlign: 'center', marginBottom: '30px' }}>👑 Admin AI Formatter</h2>
      {/* REMOVED: Conditional message for non-paid users - now available for all */}
      <p style={{ textAlign: 'center', color: '#666', marginBottom: '30px' }}>
        Provide a raw transcript and detailed instructions for the AI to format and polish it.
        This feature is now available for all users.
      </p>

      {/* NEW: AI Provider Selection */}
      <div style={{ marginBottom: '30px', textAlign: 'center' }}>
        <label style={{ display: 'block', color: '#6c5ce7', fontWeight: 'bold', marginBottom: '10px' }}>
          Select AI Provider:
        </label>
        <div style={{ display: 'inline-flex', gap: '20px' }}>
          <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <input
              type="radio"
              name="aiProvider"
              value="claude"
              checked={selectedAIProvider === 'claude'}
              onChange={(e) => setSelectedAIProvider(e.target.value)}
              style={{ marginRight: '8px' }}
            />
            Anthropic Claude
          </label>
          <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <input
              type="radio"
              name="aiProvider"
              value="gemini"
              checked={selectedAIProvider === 'gemini'}
              onChange={(e) => setSelectedAIProvider(e.target.value)}
              style={{ marginRight: '8px' }}
            />
            Google Gemini
          </label>
        </div>
      </div>

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
            border: '1px solid #ddd',
            fontSize: '1rem',
            resize: 'vertical',
            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)'
          }}
        ></textarea>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', marginBottom: '30px', flexWrap: 'wrap' }}>
        <button
          onClick={handleAdminFormat}
          disabled={isButtonDisabled}
          style={{
            padding: '12px 25px',
            backgroundColor: isButtonDisabled ? '#a0a0a0' : '#dc3545',
            color: 'white',
            border: 'none',
            borderRadius: '25px',
            cursor: isButtonDisabled ? 'not-allowed' : 'pointer',
            fontSize: '1rem',
            fontWeight: 'bold',
            boxShadow: isButtonDisabled ? 'none' : '0 4px 15px rgba(220, 53, 69, 0.4)',
            transition: 'all 0.3s ease'
          }}
        >
          {aiLoading ? 'Formatting...' : `👑 Format with ${selectedAIProvider === 'claude' ? 'Claude' : 'Gemini'}`}
        </button>
        <button
          onClick={() => { setTranscriptInput(''); setFormattingInstructions(DEFAULT_FORMATTING_INSTRUCTIONS); setFormattedOutput(''); setShowContinueBox(false); }}
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
          
          {/* NEW: Copy button for AI Response */}
          <div style={{ textAlign: 'center', marginTop: '15px' }}>
            <button
              onClick={handleCopyAIResponse}
              style={{
                padding: '10px 20px',
                backgroundColor: '#27ae60',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 'bold',
                marginRight: '10px',
                transition: 'background-color 0.3s ease'
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#218838'}
              onMouseLeave={(e) => e.target.style.backgroundColor = '#27ae60'}
            >
              📋 Copy AI Response
            </button>
          </div>
          
          {/* NEW: Continue text area when AI doesn't finish responding */}
          {showContinueBox && (
            <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '10px', border: '1px solid #dee2e6' }}>
              <h4 style={{ color: '#dc3545', marginBottom: '10px' }}>Continue Response:</h4>
              <textarea
                value={continuePrompt}
                onChange={(e) => setContinuePrompt(e.target.value)}
                placeholder="Tell the AI how to continue or finish its response..."
                rows="3"
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '5px',
                  border: '1px solid #ddd',
                  fontSize: '0.9rem',
                  marginBottom: '10px'
                }}
              />
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                <button
                  onClick={handleContinueResponse}
                  disabled={!continuePrompt.trim() || aiLoading}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: (!continuePrompt.trim() || aiLoading) ? '#a0a0a0' : '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: '5px',
                    cursor: (!continuePrompt.trim() || aiLoading) ? 'not-allowed' : 'pointer',
                    fontSize: '0.9rem'
                  }}
                >
                  {aiLoading ? 'Continuing...' : '➡️ Continue Response'}
                </button>
                <button
                  onClick={() => { setShowContinueBox(false); setContinuePrompt(''); }}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#6c757d',
                    color: 'white',
                    border: 'none',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    fontSize: '0.9rem'
                  }}
                >
                  ❌ Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* NEW: Copied notification */}
      {copiedMessageVisible && (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: '#4CAF50',
          color: 'white',
          padding: '10px 20px',
          borderRadius: '5px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
          zIndex: 1000
        }}>
          📋 Copied to clipboard!
        </div>
      )}
    </div>
  );
};

export default AdminAIFormatter;
