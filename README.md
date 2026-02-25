# Lattice

Lattice is an AI repository onboarding assistant. It ingests a GitHub repository,
chunks and embeds source code, stores vectors in ChromaDB, and answers questions
grounded in retrieved repository context.

## Implemented Features

- LangChain-based chunking (`RecursiveCharacterTextSplitter`)
- AST-aware segmentation for TypeScript/JavaScript before chunking
- Hybrid retrieval (vector + BM25) with rank fusion
- Strictly grounded answer generation and abstention fallback
- Re-ingestion by `repoId` and GitHub webhook re-indexing
- Observability metrics (latency, relevance, token usage, estimated cost)
- Evaluation API for exact match, context relevance, and groundedness

## Stack

- Next.js App Router (frontend + API routes)
- shadcn/ui component system
- OpenAI API (`text-embedding-3-small`, `gpt-4o-mini` by default)
- ChromaDB (`repo_chunks` collection)
- `simple-git` for repository cloning

## Environment

Copy `.env.example` to `.env.local` and fill in values:

```bash
cp .env.example .env.local
```

Required:

- `OPENAI_API_KEY`

Optional defaults:

- `OPENAI_EMBEDDING_MODEL=text-embedding-3-small`
- `OPENAI_COMPLETION_MODEL=gpt-4o-mini`
- `CHROMA_URL=http://localhost:8000`
- `GITHUB_WEBHOOK_SECRET=replace_with_webhook_secret`

## Run Locally

1) Start ChromaDB (Docker example):

```bash
docker run -p 8000:8000 chromadb/chroma
```

2) Install and run:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## API

### `POST /api/ingest`

Ingest by URL:

```json
{
  "repoUrl": "https://github.com/vercel/next.js"
}
```

Re-ingest by existing `repoId`:

```json
{
  "repoId": "f4d3a5f1d6b2c9ab"
}
```

Response:

```json
{
  "mode": "repoUrl",
  "repoId": "f4d3a5f1d6b2c9ab",
  "repoUrl": "https://github.com/vercel/next.js",
  "parsedFiles": 120,
  "chunkCount": 380
}
```

### `POST /api/query`

```json
{
  "question": "Where is routing handled?",
  "repoId": "f4d3a5f1d6b2c9ab"
}
```

Response includes grounded answer + source line ranges.

### `GET /api/metrics`

Optional query:

- `repoId=<repo-id>`

Returns dashboard aggregates for query/ingestion observability.

### `POST /api/evaluate`

```json
{
  "repoId": "f4d3a5f1d6b2c9ab",
  "cases": [
    {
      "question": "Where is routing handled?",
      "expectedSourceFiles": ["app/router.ts"]
    }
  ]
}
```

Returns evaluation report with:

- `exactMatchAccuracy`
- `contextRelevance`
- `groundedness`
- per-case outputs and sources

### `POST /api/webhooks/github`

Supported events:

- `ping`
- `push` (reindexes only when the pushed ref matches default branch)

Signature verification:

- Header: `X-Hub-Signature-256`
- Secret: `GITHUB_WEBHOOK_SECRET`

Webhook flow:

- Computes deterministic `repoId` from GitHub repo URL
- If repo is already registered, re-ingests by `repoId`
- If not registered, ingests by `repoUrl` and stores registry metadata

CLI helper to register webhook on a repo:

```bash
GITHUB_WEBHOOK_SECRET=... ./scripts/register-github-webhook.sh owner/repo https://your-domain.com/api/webhooks/github
```
