function createDocumentRepository() {
  const documents = new Map();

  return {
    async save(document) {
      documents.set(document.id, document);
    },

    listByOwner(owner) {
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

    findByIdAndOwner(id, owner) {
      const document = documents.get(id);
      return document?.owner === owner ? document : null;
    },
  };
}

module.exports = { createDocumentRepository };