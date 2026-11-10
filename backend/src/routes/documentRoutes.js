const express = require('express');

function createDocumentRoutes(controller, upload, uploadRateLimit) {
  const router = express.Router();

  router.post(
    '/upload',
    controller.authenticate,
    uploadRateLimit,
    upload.single('file'),
    controller.upload,
  );
  router.get('/documents', controller.list);
  router.get('/documents/:id/download', controller.download);

  return router;
}

module.exports = { createDocumentRoutes };