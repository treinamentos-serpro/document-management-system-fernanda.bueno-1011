const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../src/app');

async function startTestServer(options = {}) {
  const storageDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'dms-test-'));
  const app = createApp({ storageDirectory, ...options });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      await fs.rm(storageDirectory, { recursive: true, force: true });
    },
  };
}

function createUploadForm(contents = 'conteúdo do documento', filename = 'relatorio.txt') {
  const form = new FormData();
  form.append('file', new Blob([contents], { type: 'text/plain' }), filename);
  return form;
}

test('o app backend é exportado', () => {
  const app = createApp();
  assert.strictEqual(typeof app, 'function');
});

test('faz upload, lista por usuário e baixa o documento', async () => {
  const server = await startTestServer();
  try {
    const uploadResponse = await fetch(`${server.baseUrl}/upload`, {
      method: 'POST',
      headers: { 'x-user-id': 'alice' },
      body: createUploadForm(),
    });
    assert.equal(uploadResponse.status, 201);
    const document = await uploadResponse.json();
    assert.deepEqual(Object.keys(document).sort(), [
      'id', 'originalName', 'owner', 'size', 'uploadedAt',
    ]);
    assert.equal(document.owner, 'alice');
    assert.equal(document.originalName, 'relatorio.txt');
    assert.equal(document.size, Buffer.byteLength('conteúdo do documento'));

    const ownDocuments = await fetch(`${server.baseUrl}/documents`, {
      headers: { 'x-user-id': 'alice' },
    });
    assert.deepEqual(await ownDocuments.json(), [document]);

    const otherDocuments = await fetch(`${server.baseUrl}/documents`, {
      headers: { 'x-user-id': 'bob' },
    });
    assert.deepEqual(await otherDocuments.json(), []);

    const forbiddenDownload = await fetch(`${server.baseUrl}/documents/${document.id}/download`, {
      headers: { 'x-user-id': 'bob' },
    });
    assert.equal(forbiddenDownload.status, 404);

    const download = await fetch(`${server.baseUrl}/documents/${document.id}/download`, {
      headers: { 'x-user-id': 'alice' },
    });
    assert.equal(download.status, 200);
    assert.equal(await download.text(), 'conteúdo do documento');
    assert.equal(download.headers.get('x-content-type-options'), 'nosniff');
  } finally {
    await server.close();
  }
});

test('rejeita upload sem arquivo e respeita o limite de tamanho', async () => {
  const server = await startTestServer({ maxFileSizeBytes: 4 });
  try {
    const missingFile = await fetch(`${server.baseUrl}/upload`, { method: 'POST' });
    assert.equal(missingFile.status, 400);

    const oversizedFile = await fetch(`${server.baseUrl}/upload`, {
      method: 'POST',
      body: createUploadForm('conteúdo maior que o limite'),
    });
    assert.equal(oversizedFile.status, 413);
    assert.equal((await oversizedFile.json()).error.code, 'FILE_TOO_LARGE');
  } finally {
    await server.close();
  }
});
