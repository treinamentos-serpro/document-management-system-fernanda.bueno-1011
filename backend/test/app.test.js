const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { createApp } = require('../src/app');

async function startTestServer(options = {}) {
  const storageDirectory = options.storageDirectory
    || await fs.mkdtemp(path.join(os.tmpdir(), 'dms-test-'));
  const cleanupStorage = options.cleanupStorage !== false;
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
      if (cleanupStorage) {
        await fs.rm(storageDirectory, { recursive: true, force: true });
      }
    },
    storageDirectory,
  };
}

function createUploadForm(contents = 'conteúdo do documento', filename = 'relatorio.txt') {
  const form = new FormData();
  form.append('file', new Blob([contents], { type: 'text/plain' }), filename);
  return form;
}

function createSignedHeaders(owner, secret) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = crypto.createHmac('sha256', secret)
    .update(`${timestamp}\n${owner}`)
    .digest('hex');
  return {
    'x-user-id': owner,
    'x-user-timestamp': timestamp,
    'x-user-signature': signature,
  };
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
    assert.equal((await fs.stat(server.storageDirectory)).mode & 0o777, 0o700);

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
    const configResponse = await fetch(`${server.baseUrl}/config`);
    assert.deepEqual(await configResponse.json(), { maxFileSizeBytes: 4 });

    const missingFile = await fetch(`${server.baseUrl}/upload`, { method: 'POST' });
    assert.equal(missingFile.status, 400);

    const wrongFieldName = new FormData();
    wrongFieldName.append('arquivo', new Blob(['abc'], { type: 'text/plain' }), 'a.txt');
    const wrongField = await fetch(`${server.baseUrl}/upload`, {
      method: 'POST',
      body: wrongFieldName,
    });
    assert.equal(wrongField.status, 400);
    assert.equal((await wrongField.json()).error.code, 'UNEXPECTED_FILE_FIELD');

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

test('preserva documentos após reiniciar o backend', async () => {
  const firstServer = await startTestServer({ cleanupStorage: false });
  let restartedServer;
  try {
    const upload = await fetch(`${firstServer.baseUrl}/upload`, {
      method: 'POST',
      headers: { 'x-user-id': 'alice' },
      body: createUploadForm('persistente'),
    });
    const document = await upload.json();
    assert.equal(upload.status, 201);
    assert.equal(
      (await fs.stat(path.join(firstServer.storageDirectory, '.documents.json'))).mode & 0o777,
      0o600,
    );
    await firstServer.close();

    restartedServer = await startTestServer({ storageDirectory: firstServer.storageDirectory });
    const list = await fetch(`${restartedServer.baseUrl}/documents`, {
      headers: { 'x-user-id': 'alice' },
    });
    assert.deepEqual(await list.json(), [document]);

    const download = await fetch(
      `${restartedServer.baseUrl}/documents/${document.id}/download`,
      { headers: { 'x-user-id': 'alice' } },
    );
    assert.equal(await download.text(), 'persistente');
  } finally {
    if (restartedServer) {
      await restartedServer.close();
    } else {
      await firstServer.close().catch(() => {});
      await fs.rm(firstServer.storageDirectory, { recursive: true, force: true });
    }
  }
});

test('aplica cota por usuário e remove o arquivo recusado', async () => {
  const server = await startTestServer({ maxDocumentsPerOwner: 1 });
  try {
    const firstUpload = await fetch(`${server.baseUrl}/upload`, {
      method: 'POST',
      headers: { 'x-user-id': 'alice' },
      body: createUploadForm('primeiro'),
    });
    assert.equal(firstUpload.status, 201);

    const secondUpload = await fetch(`${server.baseUrl}/upload`, {
      method: 'POST',
      headers: { 'x-user-id': 'alice' },
      body: createUploadForm('segundo'),
    });
    assert.equal(secondUpload.status, 409);
    assert.equal((await secondUpload.json()).error.code, 'DOCUMENT_QUOTA_EXCEEDED');

    const storedFiles = (await fs.readdir(server.storageDirectory))
      .filter((name) => /^[\da-f-]{36}$/i.test(name));
    assert.equal(storedFiles.length, 1);
  } finally {
    await server.close();
  }
});

test('rejeita uploads acima da cota de bytes e remove o arquivo', async () => {
  const server = await startTestServer({ maxStorageBytesPerOwner: 2 });
  try {
    const response = await fetch(`${server.baseUrl}/upload`, {
      method: 'POST',
      headers: { 'x-user-id': 'alice' },
      body: createUploadForm('abc'),
    });
    assert.equal(response.status, 413);
    assert.equal((await response.json()).error.code, 'STORAGE_QUOTA_EXCEEDED');
    assert.deepEqual(await fs.readdir(server.storageDirectory), []);
  } finally {
    await server.close();
  }
});

test('limita a frequência de uploads por endereço', async () => {
  const server = await startTestServer({ maxUploadsPerMinute: 1 });
  try {
    const firstUpload = await fetch(`${server.baseUrl}/upload`, {
      method: 'POST',
      body: createUploadForm('primeiro'),
    });
    assert.equal(firstUpload.status, 201);

    const secondUpload = await fetch(`${server.baseUrl}/upload`, {
      method: 'POST',
      body: createUploadForm('segundo'),
    });
    assert.equal(secondUpload.status, 429);
    assert.ok(Number(secondUpload.headers.get('retry-after')) > 0);
  } finally {
    await server.close();
  }
});

test('exige uma identidade assinada quando a aplicação opera em produção', async () => {
  const secret = 'segredo-de-teste';
  assert.throws(() => createApp({ nodeEnv: 'production' }), /DMS_USER_ID_SECRET/);
  const server = await startTestServer({ userIdSecret: secret, nodeEnv: 'production' });
  try {
    const unsignedUpload = await fetch(`${server.baseUrl}/upload`, {
      method: 'POST',
      body: createUploadForm(),
    });
    assert.equal(unsignedUpload.status, 401);

    const invalidSignatureUpload = await fetch(`${server.baseUrl}/upload`, {
      method: 'POST',
      headers: createSignedHeaders('alice', 'segredo-incorreto'),
      body: createUploadForm(),
    });
    assert.equal(invalidSignatureUpload.status, 401);

    const signedUpload = await fetch(`${server.baseUrl}/upload`, {
      method: 'POST',
      headers: createSignedHeaders('alice', secret),
      body: createUploadForm(),
    });
    assert.equal(signedUpload.status, 201);
    assert.equal((await signedUpload.json()).owner, 'alice');
  } finally {
    await server.close();
  }
});
