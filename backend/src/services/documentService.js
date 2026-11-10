const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

function createDocumentService(documentRepository) {
  return {
    async createDocument(file, owner) {
      const document = {
        id: crypto.randomUUID(),
        originalName: path.basename(file.originalname.replace(/\\/g, '/')),
        size: file.size,
        uploadedAt: new Date().toISOString(),
        owner,
      };
      await documentRepository.save({
        ...document,
        filePath: file.path,
        mimeType: file.mimetype,
      });
      return document;
    },

    listDocuments(owner) {
      return documentRepository.listByOwner(owner);
    },

    async getDocumentForDownload(id, owner) {
      const document = documentRepository.findByIdAndOwner(id, owner);
      if (!document) {
        const error = new Error('Documento não encontrado.');
        error.statusCode = 404;
        error.code = 'DOCUMENT_NOT_FOUND';
        throw error;
      }

      try {
        await fs.access(document.filePath);
      } catch {
        const error = new Error('Arquivo do documento não encontrado no armazenamento local.');
        error.statusCode = 404;
        error.code = 'FILE_NOT_FOUND';
        throw error;
      }
      return document;
    },

    async removeUploadedFile(filePath) {
      await fs.unlink(filePath);
    },
  };
}

module.exports = { createDocumentService };