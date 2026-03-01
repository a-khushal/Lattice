# Lattice

RAG assistant for GitHub repositories.

## Requirements

- Node.js 20+
- Docker (for ChromaDB)
- `OPENAI_API_KEY`

## Quick Start

```bash
cp .env.example .env.local
docker run -p 8000:8000 chromadb/chroma
npm install
npm run dev
```

Open `http://localhost:3000`.

## Env Vars

- `OPENAI_API_KEY` (required)
- `OPENAI_EMBEDDING_MODEL` (default: `text-embedding-3-small`)
- `OPENAI_COMPLETION_MODEL` (default: `gpt-4o-mini`)
- `CHROMA_URL` (default: `http://localhost:8000`)
- `GITHUB_WEBHOOK_SECRET` (required for webhook endpoint)

## API

- `POST /api/ingest`
  - body: `{ "repoUrl": "https://github.com/org/repo" }` or `{ "repoId": "..." }`
- `POST /api/query`
  - body: `{ "question": "...", "repoId": "..." }`
  - returns grounded answer, sources, retrieval metrics, and suggested contribution entry points
- `GET /api/metrics?repoId=...`
  - returns aggregate observability metrics including relevance and retrieval-accuracy proxy
- `POST /api/evaluate`
  - body: `{ "repoId": "...", "cases": [{ "question": "..." }] }`
  - returns evaluation report including exact match, context relevance, retrieval accuracy, and groundedness
- `POST /api/webhooks/github`
  - expects `X-Hub-Signature-256` using `GITHUB_WEBHOOK_SECRET`

## GitHub Webhook Helper

```bash
GITHUB_WEBHOOK_SECRET=... ./scripts/register-github-webhook.sh owner/repo https://your-domain.com/api/webhooks/github
```
