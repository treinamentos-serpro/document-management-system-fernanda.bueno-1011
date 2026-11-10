const express = require('express');
const multer = require('multer');
const path = require('node:path');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const { createDocumentRepository } = require('./repositories/documentRepository');
const { createDocumentService } = require('./services/documentService');
const { createDocumentController } = require('./controllers/documentController');
const { createDocumentRoutes } = require('./routes/documentRoutes');

const DEFAULT_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

function createUploadMiddleware(storageDirectory, maxFileSizeBytes) {
  const storage = multer.diskStorage({
    destination: (request, file, callback) => {
      fs.mkdir(storageDirectory, { recursive: true })
        .then(() => callback(null, storageDirectory))
        .catch(callback);
    },
    filename: (request, file, callback) => {
      callback(null, crypto.randomUUID());
    },
  });

  return multer({
    storage,
    limits: { fileSize: maxFileSizeBytes },
  });
}

function createApp(options = {}) {
  const app = express();
  const storageDirectory = options.storageDirectory || path.resolve(__dirname, '../storage');
  const maxFileSizeBytes = options.maxFileSizeBytes
    || Number(process.env.MAX_FILE_SIZE_BYTES)
    || DEFAULT_MAX_FILE_SIZE_BYTES;
  const documentRepository = createDocumentRepository();
  const documentService = createDocumentService(documentRepository);
  const documentController = createDocumentController(documentService);
  const upload = createUploadMiddleware(storageDirectory, maxFileSizeBytes);

  app.disable('x-powered-by');
  app.use((request, response, next) => {
    response.set('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.get('/health', (request, response) => {
    response.json({ status: 'ok' });
  });
  app.use(createDocumentRoutes(documentController, upload));
  app.use((request, response) => {
    response.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Recurso não encontrado.' },
    });
  });
  app.use((error, request, response, next) => {
    if (response.headersSent) {
      return next(error);
    }

    const isFileTooLarge = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE';
    const statusCode = isFileTooLarge ? 413 : (error.statusCode || 500);
    const code = isFileTooLarge ? 'FILE_TOO_LARGE' : (error.code || 'INTERNAL_ERROR');
    const message = statusCode === 500 ? 'Erro interno do servidor.' : error.message;

    response.status(statusCode).json({ error: { code, message } });
  });

  return app;
}

const app = createApp();

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`DMS backend ouvindo na porta ${PORT}`);
  });
}

module.exports = app;
module.exports.createApp = createApp;
