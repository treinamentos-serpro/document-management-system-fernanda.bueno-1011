# Especificação - Document Management System

## 1. Objetivo

Disponibilizar uma aplicação web para enviar, listar e baixar documentos armazenados no filesystem local, associando os metadados de cada documento a um usuário.

## 2. Escopo

### Dentro do escopo

- Upload de um documento por requisição.
- Listagem dos documentos associados ao usuário da requisição.
- Download de um documento pelo identificador.
- Armazenamento dos arquivos em `backend/storage` com `multer` e `diskStorage`.
- Armazenamento local e durável dos metadados em `backend/storage/.documents.json`.
- Interface React para upload, listagem e download.

### Fora do escopo

- Armazenamento externo ou em nuvem.
- Versionamento de documentos.
- Autenticação e autorização completas.
- Remoção ou edição de documentos.

## 3. Requisitos funcionais

| ID | Requisito |
| --- | --- |
| RF-01 | O usuário pode enviar um arquivo usando `multipart/form-data` no campo `file`. |
| RF-02 | O backend deve gravar o arquivo em `backend/storage`, usando `multer` com `diskStorage`. |
| RF-03 | O backend deve gerar identificadores e nomes internos únicos, sem usar o nome enviado pelo usuário como caminho. |
| RF-04 | O sistema deve registrar os metadados do documento e associá-lo ao usuário da requisição. |
| RF-05 | O usuário pode listar somente os documentos associados ao identificador informado na requisição. |
| RF-06 | O usuário pode baixar um documento pelo identificador, desde que pertença ao identificador de usuário da requisição. |
| RF-07 | O sistema deve informar erros de entrada, arquivo ausente, arquivo acima do limite ou documento/arquivo não encontrado usando respostas HTTP e JSON consistentes. |
| RF-08 | A interface deve apresentar estados de carregamento, vazio, sucesso e erro para upload, listagem e download. |

## 4. Requisitos não funcionais

| ID | Requisito |
| --- | --- |
| RNF-01 | Os arquivos são armazenados apenas no filesystem local em `backend/storage`; não usar serviços externos. |
| RNF-02 | Os metadados são gravados atomicamente em arquivo JSON local e sobrevivem ao reinício do backend. |
| RNF-03 | Porta, limites de upload e cotas são configuráveis por variáveis de ambiente. |
| RNF-04 | O limite padrão de upload é 10 MiB. |
| RNF-05 | Arquivos recebem nome interno UUID; o nome original é preservado apenas como metadado e nome de download. |
| RNF-06 | O backend usa Node.js, Express e CommonJS; o frontend usa React, Vite e módulos ES. |
| RNF-07 | Os testes do backend usam o runner nativo `node:test`. |
| RNF-08 | As dependências usadas devem ser as já presentes no projeto. |

## 5. Modelo de dados

### Metadados públicos do documento

| Campo | Tipo | Descrição |
| --- | --- | --- |
| `id` | string | UUID do documento. |
| `originalName` | string | Nome original fornecido no upload, reduzido ao nome-base. |
| `size` | number | Tamanho do arquivo em bytes. |
| `uploadedAt` | string | Data e hora do upload em ISO 8601 UTC. |
| `owner` | string | Identificador resolvido pela integração de identidade do backend. |

### Campos internos, não expostos pela API

| Campo | Tipo | Descrição |
| --- | --- | --- |
| `storedFileName` | string | UUID do nome interno; o caminho é derivado do diretório local configurado. |
| `mimeType` | string | Tipo de mídia informado no multipart, reservado ao uso interno. |

Os registros são carregados em memória e persistidos em `.documents.json` por substituição atômica. O diretório deve ser privado ao processo do DMS. Os campos internos não devem ser incluídos nas respostas JSON.

## 6. Contratos de API

Durante o desenvolvimento, o frontend chama os endpoints pelo prefixo `/api`; o proxy Vite remove esse prefixo antes de encaminhar a requisição ao backend. O backend expõe as rotas sem o prefixo `/api`.

### `GET /config`

- Sucesso: `200 OK`, JSON com `maxFileSizeBytes`, para alinhar a interface ao limite ativo.

### `POST /upload`

- Entrada: `multipart/form-data`, um arquivo no campo `file`.
- No desenvolvimento, `X-User-Id` continua opcional e usa `default-user` como fallback.
- Em produção, configure `DMS_USER_ID_SECRET` ou injete `resolveOwner` no host. Com HMAC, um proxy autenticado envia `X-User-Id`, `X-User-Timestamp` (Unix em segundos) e `X-User-Signature`, calculada como HMAC-SHA256 de `timestamp\nuserId`; o timestamp deve estar dentro de 60 segundos. O proxy deve substituir os valores enviados pelo cliente, e o backend não deve ficar acessível sem passar por esse proxy.
- O cliente não pode escolher `id`, `owner` nem o nome interno do arquivo.
- Sucesso: `201 Created`, corpo JSON com os metadados públicos do documento.
- Erros: `400` para arquivo ausente ou multipart inválido; `401` para identidade inválida; `409` para cota de documentos excedida; `413` para arquivo ou cota de bytes excedida; `429` para excesso de uploads.

### `GET /documents`

- A identidade segue a mesma regra do upload.
- Sucesso: `200 OK`, array JSON de documentos pertencentes ao usuário. Sem documentos, retorna `[]`.

### `GET /documents/:id/download`

- A identidade segue a mesma regra do upload.
- Sucesso: `200 OK`, conteúdo binário como anexo com o nome original.
- Erro: `404 Not Found` se o documento não existir, não pertencer ao usuário ou o arquivo não estiver no disco.

### Formato dos erros JSON

```json
{
  "error": {
    "code": "FILE_TOO_LARGE",
    "message": "File too large"
  }
}
```

Mensagens de erro devem ser legíveis; detalhes internos do servidor não devem ser enviados ao cliente.

## 7. Decisões arquiteturais

- O backend segue o fluxo `routes -> controllers -> services -> repositories`.
- As rotas conectam os endpoints ao controller e aplicam o middleware de upload.
- Controllers fazem a tradução HTTP, leem o identificador do usuário e tratam respostas.
- Services aplicam as regras de criação e consulta de documentos.
- Repositories isolam o acesso ao índice JSON local; gravações usam arquivo temporário e substituição atômica.
- O ponto de composição do backend configura `multer.diskStorage` com destino fixo em `backend/storage` e nome de arquivo UUID.
- A falha ao registrar metadados após o upload deve remover o arquivo recém-gravado.
- No desenvolvimento, `X-User-Id` permanece um identificador funcional não autenticado. Em produção, o backend falha ao iniciar sem segredo HMAC ou um resolver de identidade confiável.
- O proxy Vite encaminha `/api/*` para o backend local na porta configurada no proxy.
- O diretório de arquivos tem permissão `0700`; o índice de metadados é gravado com permissão `0600`.
- Padrões: `MAX_FILE_SIZE_BYTES=10485760`, `MAX_DOCUMENTS_PER_USER=100`, `MAX_STORAGE_BYTES_PER_USER=1073741824` e `MAX_UPLOADS_PER_MINUTE=20` por IP e processo. O limitador em memória não substitui proteção distribuída em implantações com múltiplas instâncias.
- O repositório JSON pressupõe um único processo gravando no mesmo diretório; múltiplas instâncias exigem persistência com coordenação transacional.
- O backend valida nomes internos UUID ao carregar metadados e deriva o caminho do diretório de armazenamento; não usa caminho informado pelo cliente.

## 8. Plano de execução

1. Criar este documento com escopo, requisitos, modelo de dados, contratos e critérios de aceite.
2. Implementar repositório, service, controller, rotas e composição do backend; cobrir upload, listagem, download e erros com testes `node:test`.
3. Implementar serviço frontend e componentes de upload, listagem e download, consumindo os endpoints pelo proxy `/api`.
4. Validar a integração executando a suíte backend e o build de produção do frontend.

## 9. Critérios de aceite

- Upload grava o arquivo localmente, retorna metadados públicos e não expõe o caminho interno.
- Listagem e download respeitam o identificador de usuário fornecido.
- Arquivo ausente, upload acima do limite e documento inexistente retornam erros HTTP coerentes.
- A interface permite selecionar e enviar um arquivo, atualizar a lista e baixar documentos.
- `npm test` no backend e `npm run build` no frontend são concluídos sem erros.