import React, { useState, useRef } from 'react';
import './App.css';

function App() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState('');
  const [transcription, setTranscription] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef(null);
  const intervalRef = useRef(null);

  React.useEffect(() => {
  document.title = 'TypeMyworDz - You Talk, We Type';
  
  // Keep server awake by pinging every 10 minutes
  const keepAlive = setInterval(async () => {
    try {
      await fetch('https://typemywordz-speech-to-text.onrender.com/', { method: 'GET' });
      console.log('Server ping successful');
    } catch (error) {
      console.log('Server ping failed:', error);
    }
  }, 10 * 60 * 1000); // 10 minutes in milliseconds

  // Cleanup interval on component unmount
  return () => clearInterval(keepAlive);
}, []);

  const handleFileSelect = (event) => {
    setSelectedFile(event.target.files[0]);
    setRecordedBlob(null);
    setJobId(null);
    setStatus('');
    setTranscription('');
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      const chunks = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/wav' });
        setRecordedBlob(blob);
        setSelectedFile(null);
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      intervalRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
    } catch (error) {
      alert('Error accessing microphone: ' + error.message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(intervalRef.current);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const clearRecording = () => {
    setRecordedBlob(null);
    setRecordingTime(0);
    setJobId(null);
    setStatus('');
    setTranscription('');
  };

  const handleUpload = async () => {
    let fileToUpload, fileName;
    if (recordedBlob) {
      fileToUpload = recordedBlob;
      fileName = `recording_${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.wav`;
    } else if (selectedFile) {
      fileToUpload = selectedFile;
      fileName = selectedFile.name;
    } else {
      alert('Please select a file or record audio first');
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', fileToUpload, fileName);
      const response = await fetch(`https://typemywordz-speech-to-text.onrender.com`, {
        method: 'POST',
        body: formData,
      });
      const result = await response.json();
      if (response.ok) {
        setJobId(result.job_id);
        setStatus(result.status);
        checkJobStatus(result.job_id);
      } else {
        alert('Upload failed: ' + result.detail);
      }
    } catch (error) {
      alert('Upload failed: ' + error.message);
    }
    setIsUploading(false);
  };

  const checkJobStatus = async (jobId) => {
    try {
      const response = await fetch(`https://typemywordz-speech-to-text.onrender.com.com/status/${jobId}`);
      const result = await response.json();
      setStatus(result.status);
      if (result.status === 'completed') {
        setTranscription(result.transcription);
      } else if (result.status === 'failed') {
        alert('Transcription failed: ' + result.error);
      } else if (result.status === 'processing') {
        setTimeout(() => checkJobStatus(jobId), 2000);
      }
    } catch (error) {
      console.error('Status check failed:', error);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(transcription);
    alert('Transcription copied to clipboard!');
  };

  const downloadTXT = () => {
    const blob = new Blob([transcription], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TypeMyworDz_${selectedFile?.name || 'recording'}_${new Date().toISOString().slice(0,10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadJSON = () => {
    const data = {
      service: "TypeMyworDz",
      filename: selectedFile?.name || 'recording',
      transcription: transcription,
      timestamp: new Date().toISOString(),
      jobId: jobId,
      status: status
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TypeMyworDz_${selectedFile?.name || 'recording'}_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadHTML = () => {
    const htmlContent = '<!DOCTYPE html><html><head><title>TypeMyworDz</title></head><body><h1>TypeMyworDz</h1><h2>You Talk, We Type</h2><p>' + transcription.replace(/\n/g, '</p><p>') + '</p></body></html>';
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TypeMyworDz_${selectedFile?.name || 'recording'}_${new Date().toISOString().slice(0,10)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="App">
      <header className="App-header" style={{ 
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: '40px 20px',
        color: 'white',
        textAlign: 'center'
      }}>
        <h1 style={{ fontSize: '3em', margin: '0 0 10px 0', fontWeight: 'bold', textShadow: '2px 2px 4px rgba(0,0,0,0.3)' }}>TypeMyworDz</h1>
        <p style={{ fontSize: '1.4em', margin: '0 0 15px 0', fontWeight: '300', opacity: '0.95' }}>You Talk, We Type</p>
        <p style={{ fontSize: '1.1em', margin: '0', opacity: '0.8', fontWeight: '300' }}>Speech to Text AI • Simple, Accurate, Powerful</p>
      </header>
      
      <main style={{ padding: '40px 20px', maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ marginBottom: '40px', textAlign: 'center', backgroundColor: 'white', padding: '30px', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
          <h2 style={{ color: '#667eea', marginBottom: '30px' }}>🎤 Record Audio or 📁 Upload File</h2>
          
          <div style={{ marginBottom: '30px', padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '10px' }}>
            <h3 style={{ color: '#667eea', marginBottom: '20px' }}>🎤 Record Audio</h3>
            
            {!isRecording && !recordedBlob && (
              <button onClick={startRecording} style={{ padding: '15px 30px', fontSize: '18px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '50px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 4px 15px rgba(220, 53, 69, 0.4)' }}>
                🔴 Start Recording
              </button>
            )}
            
            {isRecording && (
              <div>
                <div style={{ fontSize: '24px', color: '#dc3545', marginBottom: '15px', fontWeight: 'bold' }}>
                  🔴 Recording... {formatTime(recordingTime)}
                </div>
                <button onClick={stopRecording} style={{ padding: '15px 30px', fontSize: '18px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                  ⏹️ Stop Recording
                </button>
              </div>
            )}
            
            {recordedBlob && (
              <div>
                <div style={{ color: '#28a745', fontSize: '18px', fontWeight: 'bold', marginBottom: '15px' }}>
                  ✅ Recording Complete! Duration: {formatTime(recordingTime)}
                </div>
                <button onClick={clearRecording} style={{ padding: '10px 20px', fontSize: '16px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                  🗑️ Clear Recording
                </button>
              </div>
            )}
          </div>

          <div style={{ marginBottom: '30px' }}>
            <h3 style={{ color: '#667eea', marginBottom: '20px' }}>📁 Or Upload Audio/Video File</h3>
            <input type="file" accept="audio/*,video/*" onChange={handleFileSelect} disabled={recordedBlob} style={{ marginBottom: '20px', padding: '12px', fontSize: '16px', border: '2px dashed #667eea', borderRadius: '8px', backgroundColor: recordedBlob ? '#e9ecef' : '#f8f9fa', opacity: recordedBlob ? 0.6 : 1 }} />
            {selectedFile && !recordedBlob && (
              <p style={{ color: '#28a745', fontWeight: 'bold', margin: '15px 0' }}>✅ Selected: {selectedFile.name}</p>
            )}
          </div>

          <button onClick={handleUpload} disabled={(!selectedFile && !recordedBlob) || isUploading} style={{ padding: '15px 30px', fontSize: '18px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)', opacity: (!selectedFile && !recordedBlob) || isUploading ? 0.6 : 1 }}>
            {isUploading ? '🔄 Processing...' : '🎤 Start Transcription'}
          </button>
        </div>

        {status && (
          <div style={{ marginBottom: '30px', textAlign: 'center', backgroundColor: status === 'completed' ? '#d4edda' : '#fff3cd', padding: '20px', borderRadius: '8px', border: `2px solid ${status === 'completed' ? '#28a745' : '#ffc107'}` }}>
            <h3 style={{ color: status === 'completed' ? '#155724' : '#856404', margin: 0 }}>
              {status === 'completed' ? '✅ Status: Completed!' : '⏳ Status: Processing...'}
            </h3>
          </div>
        )}

        {transcription && (
          <div style={{ border: '1px solid #ddd', padding: '30px', borderRadius: '10px', backgroundColor: 'white', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
            <h3 style={{ color: '#667eea', marginBottom: '20px' }}>📝 Transcription Result:</h3>
            <div style={{ marginBottom: '20px', textAlign: 'center' }}>
              <button onClick={copyToClipboard} style={{ marginRight: '10px', marginBottom: '10px', padding: '10px 20px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>📋 Copy to Clipboard</button>
              <button onClick={downloadTXT} style={{ marginRight: '10px', marginBottom: '10px', padding: '10px 20px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>📄 Download TXT</button>
              <button onClick={downloadJSON} style={{ marginRight: '10px', marginBottom: '10px', padding: '10px 20px', backgroundColor: '#6f42c1', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>📊 Download JSON</button>
              <button onClick={downloadHTML} style={{ marginBottom: '10px', padding: '10px 20px', backgroundColor: '#fd7e14', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>🌐 Download HTML</button>
            </div>
            <div style={{ backgroundColor: '#f8f9fa', padding: '20px', borderRadius: '8px', whiteSpace: 'pre-wrap', textAlign: 'left', fontSize: '16px', lineHeight: '1.6', border: '1px solid #e9ecef' }}>
              {transcription}
            </div>
          </div>
        )}
      </main>
      
      <footer style={{ textAlign: 'center', padding: '30px 20px', color: '#666', borderTop: '1px solid #eee', marginTop: '40px' }}>
        <strong style={{ color: '#667eea' }}>TypeMyworDz</strong> - You Talk, We Type<br/>
        <small>Speech to Text AI • Simple, Accurate, Powerful</small>
      </footer>
    </div>
  );
}

export default App;