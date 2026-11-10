const crypto = require('node:crypto');

function createOwnerResolver({ secret, resolveAuthenticatedOwner } = {}) {
  return (request) => {
    let owner;

    if (resolveAuthenticatedOwner) {
      owner = resolveAuthenticatedOwner(request);
    } else if (secret) {
      owner = request.get('x-user-id')?.trim();
      const timestamp = Number(request.get('x-user-timestamp'));
      const signature = request.get('x-user-signature') || '';
      const payload = `${timestamp}\n${owner || ''}`;
      const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest();
      const suppliedSignature = /^[a-f\d]{64}$/i.test(signature)
        ? Buffer.from(signature, 'hex')
        : Buffer.alloc(0);

      if (
        !owner
        || !Number.isInteger(timestamp)
        || Math.abs(Date.now() / 1000 - timestamp) > 60
        || suppliedSignature.length !== expectedSignature.length
        || !crypto.timingSafeEqual(suppliedSignature, expectedSignature)
      ) {
        const error = new Error('A identidade da requisição não foi validada.');
        error.statusCode = 401;
        error.code = 'UNAUTHORIZED';
        throw error;
      }
    } else {
      owner = request.get('x-user-id')?.trim() || 'default-user';
    }

    if (typeof owner !== 'string' || !owner.trim()) {
      const error = new Error('A identidade da requisição não foi validada.');
      error.statusCode = 401;
      error.code = 'UNAUTHORIZED';
      throw error;
    }
    owner = owner.trim();
    if (owner.length > 100) {
      const error = new Error('O identificador do usuário deve ter até 100 caracteres.');
      error.statusCode = 400;
      error.code = 'INVALID_OWNER';
      throw error;
    }
    return owner;
  };
}

function createDocumentController(documentService, resolveOwner = createOwnerResolver()) {
  return {
    authenticate: (request, response, next) => {
      try {
        request.documentOwner = resolveOwner(request);
        next();
      } catch (error) {
        next(error);
      }
    },

    upload: async (request, response, next) => {
      try {
        if (!request.file) {
          return response.status(400).json({
            error: { code: 'FILE_REQUIRED', message: 'Envie um arquivo no campo "file".' },
          });
        }

        const document = await documentService.createDocument(request.file, request.documentOwner);
        response.status(201).json(document);
      } catch (error) {
        if (request.file) {
          await documentService.removeUploadedFile(request.file.path).catch(() => {});
        }
        next(error);
      }
    },

    list: async (request, response, next) => {
      try {
        response.json(await documentService.listDocuments(resolveOwner(request)));
      } catch (error) {
        next(error);
      }
    },

    download: async (request, response, next) => {
      try {
        const document = await documentService.getDocumentForDownload(
          request.params.id,
          resolveOwner(request),
        );
        response.download(document.filePath, document.originalName, (error) => {
          if (error && !response.headersSent) {
            next(error);
          }
        });
      } catch (error) {
        next(error);
      }
    },
  };
}

module.exports = { createDocumentController, createOwnerResolver };