const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

function createDocumentService(documentRepository, storageDirectory) {
  const resolvedStorageDirectory = path.resolve(storageDirectory);

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
        storedFileName: path.basename(file.path),
        mimeType: file.mimetype,
      });
      return document;
    },

    listDocuments(owner) {
      return documentRepository.listByOwner(owner);
    },

    async getDocumentForDownload(id, owner) {
      const document = await documentRepository.findByIdAndOwner(id, owner);
      if (!document) {
        const error = new Error('Documento não encontrado.');
        error.statusCode = 404;
        error.code = 'DOCUMENT_NOT_FOUND';
        throw error;
      }

      const filePath = path.resolve(resolvedStorageDirectory, document.storedFileName);
      const relativePath = path.relative(resolvedStorageDirectory, filePath);
      if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        const error = new Error('Documento não encontrado.');
        error.statusCode = 404;
        error.code = 'DOCUMENT_NOT_FOUND';
        throw error;
      }

      try {
        await fs.access(filePath);
      } catch {
        const error = new Error('Arquivo do documento não encontrado no armazenamento local.');
        error.statusCode = 404;
        error.code = 'FILE_NOT_FOUND';
        throw error;
      }
      return { ...document, filePath };
    },

    async removeUploadedFile(filePath) {
      await fs.unlink(filePath);
    },
  };
}

module.exports = { createDocumentService };