# Especificação - Document Management System

## 1. Objetivo

Disponibilizar uma aplicação web para enviar, listar e baixar documentos armazenados no filesystem local, associando os metadados de cada documento a um usuário.

## 2. Escopo

### Dentro do escopo

- Upload de um documento por requisição.
- Listagem dos documentos associados ao usuário da requisição.
- Download de um documento pelo identificador.
- Armazenamento dos arquivos em `backend/storage` com `multer` e `diskStorage`.
- Armazenamento dos metadados em memória.
- Interface React para upload, listagem e download.

### Fora do escopo

- Armazenamento externo ou em nuvem.
- Versionamento de documentos.
- Persistência durável dos metadados após reinício do backend.
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
| RNF-02 | Os metadados são mantidos em memória e podem ser perdidos ao reiniciar o backend. |
| RNF-03 | A porta do backend e o limite máximo de upload são configuráveis por variáveis de ambiente (`PORT` e `MAX_FILE_SIZE_BYTES`). |
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
| `owner` | string | Identificador do usuário obtido do cabeçalho `X-User-Id`. |

### Campos internos, não expostos pela API

| Campo | Tipo | Descrição |
| --- | --- | --- |
| `filePath` | string | Caminho absoluto do arquivo salvo localmente. |
| `mimeType` | string | Tipo de mídia informado no multipart, reservado ao uso interno. |

Os registros são mantidos em um `Map` em memória. Os campos internos não devem ser incluídos nas respostas JSON.

## 6. Contratos de API

Durante o desenvolvimento, o frontend chama os endpoints pelo prefixo `/api`; o proxy Vite remove esse prefixo antes de encaminhar a requisição ao backend. O backend expõe as rotas sem o prefixo `/api`.

### `POST /upload`

- Entrada: `multipart/form-data`, um arquivo no campo `file`.
- Cabeçalho opcional: `X-User-Id`, com até 100 caracteres. Na ausência, usar `default-user`.
- O cliente não pode escolher `id`, `owner` nem o nome interno do arquivo.
- Sucesso: `201 Created`, corpo JSON com os metadados públicos do documento.
- Erros: `400` para arquivo ausente ou identificador inválido; `413` para arquivo acima do limite.

### `GET /documents`

- Cabeçalho opcional: `X-User-Id`, com o mesmo fallback do upload.
- Sucesso: `200 OK`, array JSON de documentos pertencentes ao usuário. Sem documentos, retorna `[]`.

### `GET /documents/:id/download`

- Cabeçalho opcional: `X-User-Id`, com o mesmo fallback.
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
- Repositories mantêm os metadados em memória e isolam o acesso à persistência.
- O ponto de composição do backend configura `multer.diskStorage` com destino fixo em `backend/storage` e nome de arquivo UUID.
- A falha ao registrar metadados após o upload deve remover o arquivo recém-gravado.
- `X-User-Id` é apenas um identificador de isolamento funcional, não uma credencial. Sem autenticação, um cliente pode escolher esse valor; o sistema não deve ser considerado seguro para múltiplos usuários não confiáveis.
- O proxy Vite encaminha `/api/*` para o backend local na porta configurada no proxy.

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