import DownloadButton from './DownloadButton.jsx';
import { formatDate, formatSize } from '../utils/formatters.js';

export default function DocumentList({ documents, loading, onError }) {
  if (loading) {
    return <p className="list-message" role="status">Carregando documentos...</p>;
  }

  if (documents.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-mark" aria-hidden="true">—</span>
        <p>Nenhum documento enviado.</p>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className="document-table">
        <thead>
          <tr>
            <th scope="col">Nome</th>
            <th scope="col">Enviado em</th>
            <th scope="col">Tamanho</th>
            <th scope="col"><span className="visually-hidden">Ação</span></th>
          </tr>
        </thead>
        <tbody>
          {documents.map((document) => (
            <tr key={document.id}>
              <td className="document-name" title={document.originalName}>{document.originalName}</td>
              <td>{formatDate(document.uploadedAt)}</td>
              <td>{formatSize(document.size)}</td>
              <td className="action-cell"><DownloadButton document={document} onError={onError} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}