const express = require('express');

function createDocumentRoutes(controller, upload) {
  const router = express.Router();

  router.post('/upload', upload.single('file'), controller.upload);
  router.get('/documents', controller.list);
  router.get('/documents/:id/download', controller.download);

  return router;
}

module.exports = { createDocumentRoutes };