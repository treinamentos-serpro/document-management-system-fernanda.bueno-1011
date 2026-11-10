const express = require('express');
const multer = require('multer');
const path = require('node:path');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const { createDocumentRepository } = require('./repositories/documentRepository');
const { createDocumentService } = require('./services/documentService');
const {
  createDocumentController,
  createOwnerResolver,
} = require('./controllers/documentController');
const { createDocumentRoutes } = require('./routes/documentRoutes');
 
const DEFAULT_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_DOCUMENTS_PER_OWNER = 100;
const DEFAULT_MAX_STORAGE_BYTES_PER_OWNER = 1024 * 1024 * 1024;
const DEFAULT_MAX_UPLOADS_PER_MINUTE = 20;

function positiveInteger(value, fallback, name) {
  if (value === undefined || value === '') return fallback;
  const parsedValue = Number(value);
  if (!Number.isSafeInteger(parsedValue) || parsedValue < 1) {
    throw new Error(`${name} deve ser um inteiro positivo.`);
  }
  return parsedValue;
}

function createStorageInitializer(storageDirectory) {
  let initialization;
  return () => {
    if (!initialization) {
      initialization = fs.mkdir(storageDirectory, { recursive: true, mode: 0o700 })
        .then(() => fs.chmod(storageDirectory, 0o700));
    }
    return initialization;
  };
}

function createUploadMiddleware(storageDirectory, ensureStorageDirectory, maxFileSizeBytes) {
  const storage = multer.diskStorage({
    destination: (request, file, callback) => {
      ensureStorageDirectory()
        .then(() => callback(null, storageDirectory))
        .catch(callback);
    },
    filename: (request, file, callback) => {
      callback(null, crypto.randomUUID());
    },
  });

  return multer({
    storage,
    limits: { fileSize: maxFileSizeBytes, files: 1, fields: 0, parts: 2 },
  });
}

function createUploadRateLimit(maxUploadsPerMinute) {
  const requestsByIp = new Map();
  const windowMs = 60 * 1000;
  let lastCleanupAt = 0;

  return (request, response, next) => {
    const now = Date.now();
    if (now - lastCleanupAt >= windowMs) {
      for (const [ip, window] of requestsByIp) {
        if (now - window.startedAt >= windowMs) requestsByIp.delete(ip);
      }
      lastCleanupAt = now;
    }

    const key = request.ip;
    const window = requestsByIp.get(key);
    if (!window || now - window.startedAt >= windowMs) {
      requestsByIp.set(key, { startedAt: now, count: 1 });
      return next();
    }
    if (window.count >= maxUploadsPerMinute) {
      response.set('Retry-After', String(Math.ceil((window.startedAt + windowMs - now) / 1000)));
      return response.status(429).json({
        error: { code: 'UPLOAD_RATE_LIMITED', message: 'Limite de uploads por minuto atingido.' },
      });
    }
    window.count += 1;
    next();
  };
}

function createApp(options = {}) {
  const app = express();
  const storageDirectory = options.storageDirectory || path.resolve(__dirname, '../storage');
  const userIdSecret = options.userIdSecret ?? process.env.DMS_USER_ID_SECRET;
  const resolveOwner = options.resolveOwner || createOwnerResolver({ secret: userIdSecret });
  const isProduction = (options.nodeEnv ?? process.env.NODE_ENV) === 'production';
  const maxFileSizeBytes = positiveInteger(
    options.maxFileSizeBytes ?? process.env.MAX_FILE_SIZE_BYTES,
    DEFAULT_MAX_FILE_SIZE_BYTES,
    'MAX_FILE_SIZE_BYTES',
  );
  const maxDocumentsPerOwner = positiveInteger(
    options.maxDocumentsPerOwner ?? process.env.MAX_DOCUMENTS_PER_USER,
    DEFAULT_MAX_DOCUMENTS_PER_OWNER,
    'MAX_DOCUMENTS_PER_USER',
  );
  const maxStorageBytesPerOwner = positiveInteger(
    options.maxStorageBytesPerOwner ?? process.env.MAX_STORAGE_BYTES_PER_USER,
    DEFAULT_MAX_STORAGE_BYTES_PER_OWNER,
    'MAX_STORAGE_BYTES_PER_USER',
  );
  const maxUploadsPerMinute = positiveInteger(
    options.maxUploadsPerMinute ?? process.env.MAX_UPLOADS_PER_MINUTE,
    DEFAULT_MAX_UPLOADS_PER_MINUTE,
    'MAX_UPLOADS_PER_MINUTE',
  );

  if (isProduction && !userIdSecret && !options.resolveOwner) {
    throw new Error('Configure DMS_USER_ID_SECRET ou forneça resolveOwner em produção.');
  }

  const documentRepository = createDocumentRepository({
    metadataFilePath: path.join(storageDirectory, '.documents.json'),
    maxDocumentsPerOwner,
    maxStorageBytesPerOwner,
  });
  const documentService = createDocumentService(documentRepository, storageDirectory);
  const documentController = createDocumentController(documentService, resolveOwner);
  const ensureStorageDirectory = createStorageInitializer(storageDirectory);
  const upload = createUploadMiddleware(storageDirectory, ensureStorageDirectory, maxFileSizeBytes);
  const uploadRateLimit = createUploadRateLimit(maxUploadsPerMinute);

  app.disable('x-powered-by');
  app.use((request, response, next) => {
    response.set('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.use((request, response, next) => {
    ensureStorageDirectory().then(() => next(), next);
  });
  app.get('/health', (request, response) => {
    response.json({ status: 'ok' });
  });
  app.get('/config', (request, response) => {
    response.json({ maxFileSizeBytes });
  });
  app.use(createDocumentRoutes(documentController, upload, uploadRateLimit));
  app.use((request, response) => {
    response.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Recurso não encontrado.' },
    });
  });
  app.use((error, request, response, next) => {
    if (response.headersSent) {
      return next(error);
    }

    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return response.status(413).json({
        error: { code: 'FILE_TOO_LARGE', message: error.message },
      });
    }

    if (error instanceof multer.MulterError) {
      const multerErrorCodes = {
        LIMIT_FIELD_COUNT: 'UNEXPECTED_MULTIPART_FIELD',
        LIMIT_PART_COUNT: 'INVALID_MULTIPART',
        LIMIT_FILE_COUNT: 'TOO_MANY_FILES',
        LIMIT_UNEXPECTED_FILE: 'UNEXPECTED_FILE_FIELD',
      };
      return response.status(400).json({
        error: {
          code: multerErrorCodes[error.code] || 'INVALID_MULTIPART',
          message: 'O formulário deve conter somente um arquivo no campo "file".',
        },
      });
    }

    const statusCode = error.statusCode || 500;
    const code = statusCode === 500 ? 'INTERNAL_ERROR' : error.code || 'INTERNAL_ERROR';
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
