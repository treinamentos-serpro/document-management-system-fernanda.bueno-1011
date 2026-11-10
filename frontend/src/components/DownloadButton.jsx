import { useState } from 'react';
import { downloadDocument } from '../services/documents.js';

export default function DownloadButton({ document, onError }) {
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      await downloadDocument(document);
    } catch (error) {
      onError(error);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <button className="download-button" type="button" onClick={handleDownload} disabled={downloading}>
      {downloading ? 'Baixando...' : 'Baixar'}
    </button>
  );
}