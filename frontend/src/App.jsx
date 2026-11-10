import { useEffect, useState } from 'react';
import { listDocuments } from './services/documents.js';
import UploadComponent from './components/UploadComponent.jsx';
import DocumentList from './components/DocumentList.jsx';
import './index.css';

export default function App() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');

    listDocuments()
      .then((items) => {
        if (active) setDocuments(items);
      })
      .catch((error) => {
        if (active) setLoadError(error.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [refreshKey]);

  function reloadDocuments() {
    setRefreshKey((key) => key + 1);
  }

  function handleUploaded(document) {
    setNotice({ type: 'success', message: `${document.originalName} enviado com sucesso.` });
    reloadDocuments();
  }

  function handleActionError(error) {
    setNotice({ type: 'error', message: error.message });
  }

  return (
    <main className="workspace">
      <header className="topbar">
        <a className="wordmark" href="/" aria-label="DMS, início">
          <span className="wordmark-symbol" aria-hidden="true">D</span>
          <span>DMS<span className="wordmark-period">.</span></span>
        </a>
        <div className="topbar-meta">
          <span className="storage-indicator" aria-hidden="true" />
          <span>Armazenamento local</span>
        </div>
      </header>

      <section className="intro" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">DOCUMENTOS</p>
          <h1 id="page-title">Seu arquivo, em ordem.</h1>
          <p className="intro-copy">Envie e encontre seus documentos em um só lugar.</p>
        </div>
        <div className="document-count" aria-live="polite">
          <strong>{documents.length.toString().padStart(2, '0')}</strong>
          <span>{documents.length === 1 ? 'documento' : 'documentos'}</span>
        </div>
      </section>

      <section className="upload-section" aria-labelledby="upload-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">ADICIONAR</p>
            <h2 id="upload-title">Enviar documento</h2>
          </div>
          <span className="section-index">01</span>
        </div>
        <UploadComponent onUploaded={handleUploaded} />
      </section>

      {notice && (
        <p className={`notice notice-${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>
          {notice.message}
          <button type="button" className="notice-dismiss" onClick={() => setNotice(null)} aria-label="Fechar aviso">
            Fechar
          </button>
        </p>
      )}

      <section className="documents-section" aria-labelledby="documents-title">
        <div className="section-heading documents-heading">
          <div>
            <p className="eyebrow">BIBLIOTECA</p>
            <h2 id="documents-title">Documentos enviados</h2>
          </div>
          <button
            className="text-button"
            type="button"
            onClick={reloadDocuments}
            disabled={loading}
          >
            Atualizar lista
          </button>
        </div>
        {loadError ? (
          <div className="list-message list-error" role="alert">
            <span>{loadError}</span>
            <button type="button" className="text-button" onClick={reloadDocuments}>
              Tentar novamente
            </button>
          </div>
        ) : (
          <DocumentList documents={documents} loading={loading} onError={handleActionError} />
        )}
      </section>

      <footer className="page-footer">
        <span>DMS</span>
        <span>Seus arquivos permanecem neste dispositivo.</span>
      </footer>
    </main>
  );
}
