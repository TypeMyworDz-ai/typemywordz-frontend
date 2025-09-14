import React, { useState, useRef, useEffect } from 'react';

const RichTextEditor = ({ 
  initialText = '', 
  onSave, 
  onCancel, 
  isSaving = false 
}) => {
  const [editorContent, setEditorContent] = useState(initialText);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const editorRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = initialText;
      updateStats();
    }
  }, [initialText]);

  // Toolbar button component
  const ToolbarButton = ({ onClick, title, children, isActive = false, disabled = false }) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{
        padding: '8px 12px',
        border: '1px solid #d1d5db',
        backgroundColor: isActive ? '#3b82f6' : disabled ? '#f3f4f6' : 'white',
        color: isActive ? 'white' : disabled ? '#9ca3af' : '#374151',
        borderRadius: '4px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: '14px',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        minWidth: '36px',
        justifyContent: 'center',
        transition: 'all 0.2s'
      }}
      onMouseEnter={(e) => {
        if (!isActive && !disabled) {
          e.target.style.backgroundColor = '#f3f4f6';
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive && !disabled) {
          e.target.style.backgroundColor = 'white';
        }
      }}
    >
      {children}
    </button>
  );

  // Execute formatting commands
  const execCommand = (command, value = null) => {
    document.execCommand(command, false, value);
    editorRef.current.focus();
    updateContent();
  };

  // Update content state and stats
  const updateContent = () => {
    if (editorRef.current) {
      setEditorContent(editorRef.current.innerHTML);
      updateStats();
    }
  };

  // Update word and character count
  const updateStats = () => {
    if (editorRef.current) {
      const text = editorRef.current.textContent || '';
      setCharCount(text.length);
      setWordCount(text.trim().split(/\s+/).filter(word => word.length > 0).length);
    }
  };

  // Text formatting functions
  const formatText = (command) => {
    execCommand(command);
  };

  // Font size change
  const changeFontSize = (size) => {
    execCommand('fontSize', size);
  };

  // Font family change
  const changeFontFamily = (font) => {
    execCommand('fontName', font);
  };

  // Text color change
  const changeTextColor = (color) => {
    execCommand('foreColor', color);
  };

  // Background color change
  const changeBackgroundColor = (color) => {
    execCommand('backColor', color);
  };

  // Insert link
  const insertLink = () => {
    const selectedText = window.getSelection().toString();
    const url = prompt('Enter URL:', 'https://');
    if (url && url !== 'https://') {
      if (selectedText) {
        execCommand('createLink', url);
      } else {
        const linkText = prompt('Enter link text:', url);
        if (linkText) {
          execCommand('insertHTML', `<a href="${url}" target="_blank">${linkText}</a>`);
        }
      }
    }
  };

  // Remove link
  const removeLink = () => {
    execCommand('unlink');
  };

  // Insert image
  const insertImage = () => {
    fileInputRef.current.click();
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        execCommand('insertHTML', `<img src="${e.target.result}" style="max-width: 100%; height: auto;" alt="Uploaded image" />`);
      };
      reader.readAsDataURL(file);
    } else {
      alert('Please select a valid image file.');
    }
    e.target.value = ''; // Reset file input
  };

  // Text alignment
  const alignText = (alignment) => {
    execCommand(`justify${alignment}`);
  };

  // Insert list
  const insertList = (type) => {
    execCommand(type === 'ordered' ? 'insertOrderedList' : 'insertUnorderedList');
  };

  // Text case transformation
  const transformCase = (type) => {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const selectedText = range.toString();
      
      if (selectedText) {
        let transformedText;
        switch (type) {
          case 'upper':
            transformedText = selectedText.toUpperCase();
            break;
          case 'lower':
            transformedText = selectedText.toLowerCase();
            break;
          case 'title':
            transformedText = selectedText.replace(/\w\S*/g, (txt) => 
              txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
            );
            break;
          default:
            return;
        }
        
        range.deleteContents();
        range.insertNode(document.createTextNode(transformedText));
        updateContent();
        
        // Restore selection
        const newRange = document.createRange();
        newRange.selectNodeContents(range.commonAncestorContainer);
        selection.removeAllRanges();
        selection.addRange(newRange);
      }
    }
  };

  // Clear formatting
  const clearFormatting = () => {
    execCommand('removeFormat');
  };

  // Undo/Redo
  const undo = () => execCommand('undo');
  const redo = () => execCommand('redo');

  // Find and replace
  const findAndReplace = () => {
    const findText = prompt('Find text:');
    if (findText) {
      const replaceText = prompt('Replace with:');
      if (replaceText !== null) {
        const content = editorRef.current.innerHTML;
        const regex = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        const newContent = content.replace(regex, replaceText);
        editorRef.current.innerHTML = newContent;
        updateContent();
      }
    }
  };

  // Insert horizontal line
  const insertHorizontalLine = () => {
    execCommand('insertHorizontalRule');
  };

  // Insert table
  const insertTable = () => {
    const rows = prompt('Number of rows:', '3');
    const cols = prompt('Number of columns:', '3');
    
    if (rows && cols && !isNaN(rows) && !isNaN(cols)) {
      let tableHTML = '<table border="1" style="border-collapse: collapse; width: 100%;">';
      for (let i = 0; i < parseInt(rows); i++) {
        tableHTML += '<tr>';
        for (let j = 0; j < parseInt(cols); j++) {
          tableHTML += '<td style="padding: 8px; border: 1px solid #ccc;">&nbsp;</td>';
        }
        tableHTML += '</tr>';
      }
      tableHTML += '</table><p>&nbsp;</p>';
      execCommand('insertHTML', tableHTML);
    }
  };

  // Save function
  const handleSave = () => {
    const plainText = editorRef.current.textContent || '';
    onSave(plainText);
  };

  // Toggle fullscreen
  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e) => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case 'b':
          e.preventDefault();
          formatText('bold');
          break;
        case 'i':
          e.preventDefault();
          formatText('italic');
          break;
        case 'u':
          e.preventDefault();
          formatText('underline');
          break;
        case 's':
          e.preventDefault();
          handleSave();
          break;
        case 'z':
          e.preventDefault();
          if (e.shiftKey) {
            redo();
          } else {
            undo();
          }
          break;
        default:
          break;
      }
    }
  };
  return (
    <div style={{
      position: isFullscreen ? 'fixed' : 'relative',
      top: isFullscreen ? 0 : 'auto',
      left: isFullscreen ? 0 : 'auto',
      right: isFullscreen ? 0 : 'auto',
      bottom: isFullscreen ? 0 : 'auto',
      zIndex: isFullscreen ? 9999 : 'auto',
      backgroundColor: 'white',
      border: isFullscreen ? 'none' : '2px solid #d1d5db',
      borderRadius: isFullscreen ? 0 : '8px',
      boxShadow: isFullscreen ? 'none' : '0 4px 6px rgba(0, 0, 0, 0.1)',
      maxHeight: isFullscreen ? '100vh' : 'none',
      overflow: isFullscreen ? 'auto' : 'visible',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        borderBottom: '1px solid #e5e7eb',
        backgroundColor: '#f9fafb'
      }}>
        <h3 style={{ margin: 0, color: '#374151', fontSize: '18px', fontWeight: '600' }}>
          Rich Text Editor
        </h3>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: '#6b7280' }}>
            {wordCount} words, {charCount} characters
          </span>
          <ToolbarButton onClick={toggleFullscreen} title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}>
            {isFullscreen ? '⊟' : '⊞'}
          </ToolbarButton>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '6px',
        padding: '12px 16px',
        borderBottom: '1px solid #e5e7eb',
        backgroundColor: '#f9fafb',
        minHeight: '60px'
      }}>
        {/* Undo/Redo */}
        <div style={{ display: 'flex', gap: '2px', marginRight: '8px' }}>
          <ToolbarButton onClick={undo} title="Undo (Ctrl+Z)">↶</ToolbarButton>
          <ToolbarButton onClick={redo} title="Redo (Ctrl+Shift+Z)">↷</ToolbarButton>
        </div>

        <div style={{ width: '1px', backgroundColor: '#d1d5db', margin: '4px 8px' }}></div>

        {/* Font Family */}
        <select
          onChange={(e) => changeFontFamily(e.target.value)}
          style={{
            padding: '6px 8px',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            fontSize: '14px',
            backgroundColor: 'white',
            cursor: 'pointer'
          }}
        >
          <option value="">Font Family</option>
          <option value="Arial">Arial</option>
          <option value="Times New Roman">Times New Roman</option>
          <option value="Helvetica">Helvetica</option>
          <option value="Georgia">Georgia</option>
          <option value="Verdana">Verdana</option>
          <option value="Courier New">Courier New</option>
          <option value="Trebuchet MS">Trebuchet MS</option>
        </select>

        {/* Font Size */}
        <select
          onChange={(e) => changeFontSize(e.target.value)}
          style={{
            padding: '6px 8px',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            fontSize: '14px',
            backgroundColor: 'white',
            cursor: 'pointer'
          }}
        >
          <option value="">Size</option>
          <option value="1">8pt</option>
          <option value="2">10pt</option>
          <option value="3">12pt</option>
          <option value="4">14pt</option>
          <option value="5">18pt</option>
          <option value="6">24pt</option>
          <option value="7">36pt</option>
        </select>

        <div style={{ width: '1px', backgroundColor: '#d1d5db', margin: '4px 8px' }}></div>

        {/* Text Formatting */}
        <div style={{ display: 'flex', gap: '2px' }}>
          <ToolbarButton onClick={() => formatText('bold')} title="Bold (Ctrl+B)">
            <strong>B</strong>
          </ToolbarButton>
          <ToolbarButton onClick={() => formatText('italic')} title="Italic (Ctrl+I)">
            <em>I</em>
          </ToolbarButton>
          <ToolbarButton onClick={() => formatText('underline')} title="Underline (Ctrl+U)">
            <u>U</u>
          </ToolbarButton>
          <ToolbarButton onClick={() => formatText('strikeThrough')} title="Strikethrough">
            <s>S</s>
          </ToolbarButton>
        </div>

        <div style={{ width: '1px', backgroundColor: '#d1d5db', margin: '4px 8px' }}></div>

        {/* Text Case */}
        <div style={{ display: 'flex', gap: '2px' }}>
          <ToolbarButton onClick={() => transformCase('upper')} title="UPPERCASE">
            <span style={{ fontSize: '12px', fontWeight: 'bold' }}>AA</span>
          </ToolbarButton>
          <ToolbarButton onClick={() => transformCase('lower')} title="lowercase">
            <span style={{ fontSize: '12px' }}>aa</span>
          </ToolbarButton>
          <ToolbarButton onClick={() => transformCase('title')} title="Title Case">
            <span style={{ fontSize: '12px' }}>Aa</span>
          </ToolbarButton>
        </div>

        <div style={{ width: '1px', backgroundColor: '#d1d5db', margin: '4px 8px' }}></div>

        {/* Text Colors */}
        <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <label style={{ fontSize: '10px', color: '#6b7280' }}>Text</label>
            <input
              type="color"
              onChange={(e) => changeTextColor(e.target.value)}
              title="Text Color"
              style={{ 
                width: '32px', 
                height: '24px', 
                border: '1px solid #d1d5db', 
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <label style={{ fontSize: '10px', color: '#6b7280' }}>BG</label>
            <input
              type="color"
              onChange={(e) => changeBackgroundColor(e.target.value)}
              title="Background Color"
              style={{ 
                width: '32px', 
                height: '24px', 
                border: '1px solid #d1d5db', 
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            />
          </div>
        </div>

        <div style={{ width: '1px', backgroundColor: '#d1d5db', margin: '4px 8px' }}></div>

        {/* Text Alignment */}
        <div style={{ display: 'flex', gap: '2px' }}>
          <ToolbarButton onClick={() => alignText('Left')} title="Align Left">⬅</ToolbarButton>
          <ToolbarButton onClick={() => alignText('Center')} title="Align Center">⬌</ToolbarButton>
          <ToolbarButton onClick={() => alignText('Right')} title="Align Right">➡</ToolbarButton>
          <ToolbarButton onClick={() => alignText('Full')} title="Justify">⬍</ToolbarButton>
        </div>

        <div style={{ width: '1px', backgroundColor: '#d1d5db', margin: '4px 8px' }}></div>

        {/* Lists */}
        <div style={{ display: 'flex', gap: '2px' }}>
          <ToolbarButton onClick={() => insertList('unordered')} title="Bullet List">• ≡</ToolbarButton>
          <ToolbarButton onClick={() => insertList('ordered')} title="Numbered List">1. ≡</ToolbarButton>
        </div>

        <div style={{ width: '1px', backgroundColor: '#d1d5db', margin: '4px 8px' }}></div>

        {/* Insert Options */}
        <div style={{ display: 'flex', gap: '2px' }}>
          <ToolbarButton onClick={insertLink} title="Insert Link">🔗</ToolbarButton>
          <ToolbarButton onClick={removeLink} title="Remove Link">🚫🔗</ToolbarButton>
          <ToolbarButton onClick={insertImage} title="Insert Image">🖼️</ToolbarButton>
          <ToolbarButton onClick={insertTable} title="Insert Table">⊞</ToolbarButton>
          <ToolbarButton onClick={insertHorizontalLine} title="Insert Horizontal Line">━</ToolbarButton>
        </div>

        <div style={{ width: '1px', backgroundColor: '#d1d5db', margin: '4px 8px' }}></div>

        {/* Utility Functions */}
        <div style={{ display: 'flex', gap: '2px' }}>
          <ToolbarButton onClick={clearFormatting} title="Clear Formatting">🧹</ToolbarButton>
          <ToolbarButton onClick={findAndReplace} title="Find & Replace">🔍</ToolbarButton>
        </div>
      </div>

      {/* Editor Area */}
      <div
        ref={editorRef}
        contentEditable
        onInput={updateContent}
        onKeyDown={handleKeyDown}
        style={{
          flex: 1,
          minHeight: isFullscreen ? 'calc(100vh - 200px)' : '400px',
          maxHeight: isFullscreen ? 'calc(100vh - 200px)' : '600px',
          overflow: 'auto',
          padding: '20px',
          fontSize: '16px',
          lineHeight: '1.6',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          border: 'none',
          outline: 'none',
          backgroundColor: 'white'
        }}
        placeholder="Start typing your transcription here..."
      />

      {/* Hidden file input for image upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        style={{ display: 'none' }}
      />

      {/* Footer with action buttons */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px',
        borderTop: '1px solid #e5e7eb',
        backgroundColor: '#f9fafb'
      }}>
        <div style={{ fontSize: '12px', color: '#6b7280' }}>
          💡 Tip: Use Ctrl+B for bold, Ctrl+I for italic, Ctrl+S to save
        </div>
        
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '10px 20px',
              backgroundColor: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            style={{
              padding: '10px 20px',
              backgroundColor: isSaving ? '#9ca3af' : '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            {isSaving && (
              <div style={{
                width: '16px',
                height: '16px',
                border: '2px solid white',
                borderTop: '2px solid transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }} />
            )}
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* CSS for animations */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default RichTextEditor;