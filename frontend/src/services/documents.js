const USER_ID = window.localStorage.getItem('dms-user-id') || 'default-user';

async function getError(response) {
  try {
    const body = await response.json();
    return new Error(body.error?.message || 'Não foi possível concluir a operação.');
  } catch {
    return new Error('Não foi possível concluir a operação.');
  }
}

export async function listDocuments() {
  const response = await fetch('/api/documents', {
    headers: { 'X-User-Id': USER_ID },
  });
  if (!response.ok) throw await getError(response);
  return response.json();
}

export async function uploadDocument(file) {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'X-User-Id': USER_ID },
    body: formData,
  });
  if (!response.ok) throw await getError(response);
  return response.json();
}

export async function downloadDocument(document) {
  const response = await fetch(`/api/documents/${encodeURIComponent(document.id)}/download`, {
    headers: { 'X-User-Id': USER_ID },
  });
  if (!response.ok) throw await getError(response);

  const objectUrl = URL.createObjectURL(await response.blob());
  const link = window.document.createElement('a');
  link.href = objectUrl;
  link.download = document.originalName;
  window.document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}