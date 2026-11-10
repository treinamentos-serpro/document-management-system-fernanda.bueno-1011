function getOwner(request) {
  const owner = request.get('x-user-id')?.trim() || 'default-user';
  if (owner.length > 100) {
    const error = new Error('O identificador do usuário deve ter até 100 caracteres.');
    error.statusCode = 400;
    error.code = 'INVALID_OWNER';
    throw error;
  }
  return owner;
}

function createDocumentController(documentService) {
  return {
    upload: async (request, response, next) => {
      try {
        if (!request.file) {
          return response.status(400).json({
            error: { code: 'FILE_REQUIRED', message: 'Envie um arquivo no campo "file".' },
          });
        }

        const document = await documentService.createDocument(request.file, getOwner(request));
        response.status(201).json(document);
      } catch (error) {
        if (request.file) {
          await documentService.removeUploadedFile(request.file.path).catch(() => {});
        }
        next(error);
      }
    },

    list: (request, response, next) => {
      try {
        response.json(documentService.listDocuments(getOwner(request)));
      } catch (error) {
        next(error);
      }
    },

    download: async (request, response, next) => {
      try {
        const document = await documentService.getDocumentForDownload(
          request.params.id,
          getOwner(request),
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

module.exports = { createDocumentController };