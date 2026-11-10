import { useRef, useState } from 'react';
import { uploadDocument } from '../services/documents.js';

export default function UploadComponent({ onUploaded }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!file || uploading) return;

    setUploading(true);
    setError('');
    try {
      const document = await uploadDocument(file);
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      onUploaded(document);
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <form className="upload-form" onSubmit={handleSubmit}>
      <div className="file-picker">
        <input
          ref={inputRef}
          id="document-file"
          name="file"
          type="file"
          onChange={(event) => {
            setFile(event.target.files?.[0] || null);
            setError('');
          }}
          aria-describedby={error ? 'upload-error' : 'upload-hint'}
        />
        <label className="file-picker-label" htmlFor="document-file">
          <span className="file-picker-mark" aria-hidden="true">+</span>
          <span className="file-picker-text">
            <strong>{file ? file.name : 'Escolher um arquivo'}</strong>
            <span id="upload-hint">{file ? `${formatSize(file.size)} selecionado` : 'Qualquer formato · até 10 MiB'}</span>
          </span>
        </label>
      </div>
      <button className="primary-button" type="submit" disabled={!file || uploading}>
        {uploading ? 'Enviando...' : 'Enviar documento'}
      </button>
      {error && <p className="upload-error" id="upload-error" role="alert">{error}</p>}
    </form>
  );
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}