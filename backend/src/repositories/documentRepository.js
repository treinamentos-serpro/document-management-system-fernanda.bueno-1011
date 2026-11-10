const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

function createDocumentRepository({
  metadataFilePath,
  maxDocumentsPerOwner = 100,
  maxStorageBytesPerOwner = 1024 * 1024 * 1024,
}) {
  const documents = new Map();
  let loaded = false;
  let writeQueue = Promise.resolve();

  async function loadDocuments() {
    if (loaded) return;
    try {
      const contents = await fs.readFile(metadataFilePath, 'utf8');
      const records = JSON.parse(contents);
      if (!Array.isArray(records)) throw new Error('Formato inválido no índice de documentos.');

      for (const document of records) {
        if (
          typeof document.id !== 'string'
          || typeof document.owner !== 'string'
          || typeof document.originalName !== 'string'
          || !Number.isSafeInteger(document.size)
          || document.size < 0
          || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(document.storedFileName)
        ) {
          throw new Error('Registro inválido no índice de documentos.');
        }
        documents.set(document.id, document);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    loaded = true;
  }

  async function persistDocuments() {
    const temporaryPath = `${metadataFilePath}.${crypto.randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporaryPath, JSON.stringify(Array.from(documents.values())), {
        encoding: 'utf8',
        mode: 0o600,
      });
      await fs.rename(temporaryPath, metadataFilePath);
    } catch (error) {
      await fs.unlink(temporaryPath).catch(() => {});
      throw error;
    }
  }

  async function waitForWrites() {
    await writeQueue;
    await loadDocuments();
  }

  return {
    save(document) {
      const operation = writeQueue.then(async () => {
        await loadDocuments();
        const ownerDocuments = Array.from(documents.values())
          .filter((existing) => existing.owner === document.owner);
        const existingDocument = documents.get(document.id);
        const documentCount = ownerDocuments.length - (existingDocument ? 1 : 0);
        const storageBytes = ownerDocuments.reduce((total, existing) => total + existing.size, 0)
          - (existingDocument?.size || 0);

        if (documentCount >= maxDocumentsPerOwner) {
          const error = new Error('O usuário atingiu o limite de documentos.');
          error.statusCode = 409;
          error.code = 'DOCUMENT_QUOTA_EXCEEDED';
          throw error;
        }
        if (storageBytes + document.size > maxStorageBytesPerOwner) {
          const error = new Error('O usuário atingiu o limite de armazenamento.');
          error.statusCode = 413;
          error.code = 'STORAGE_QUOTA_EXCEEDED';
          throw error;
        }

        documents.set(document.id, document);
        try {
          await persistDocuments();
        } catch (error) {
          documents.delete(document.id);
          throw error;
        }
      });
      writeQueue = operation.catch(() => {});
      return operation;
    },

    async listByOwner(owner) {
      await waitForWrites();
      return Array.from(documents.values())
        .filter((document) => document.owner === owner)
        .map(({ id, originalName, size, uploadedAt, owner: documentOwner }) => ({
          id,
          originalName,
          size,
          uploadedAt,
          owner: documentOwner,
        }));
    },

    async findByIdAndOwner(id, owner) {
      await waitForWrites();
      const document = documents.get(id);
      return document?.owner === owner ? document : null;
    },
  };
}

module.exports = { createDocumentRepository };