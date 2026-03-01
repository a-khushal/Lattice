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
- `LATTICE_API_KEY` (optional; if set, all public API routes require `x-api-key`)
- `ENABLE_RATE_LIMIT` (default: `true`)
- `RATE_LIMIT_WINDOW_MS` (default: `60000`)
- `RATE_LIMIT_MAX_INGEST` (default: `8`)
- `RATE_LIMIT_MAX_QUERY` (default: `40`)
- `RATE_LIMIT_MAX_EVALUATE` (default: `12`)
- `RATE_LIMIT_MAX_METRICS` (default: `60`)
- `QUERY_CACHE_TTL_MS` (default: `300000`)
- `QUERY_CACHE_MAX_ENTRIES` (default: `500`)

## API

- `POST /api/ingest`
  - body: `{ "repoUrl": "https://github.com/org/repo" }` or `{ "repoId": "..." }`
  - supports async jobs with `{ "repoUrl": "...", "async": true }` (returns 202 and `jobId`)
- `GET /api/ingest?jobId=...`
  - returns async ingestion job status (`queued`, `running`, `succeeded`, `failed`)
- `POST /api/query`
  - body: `{ "question": "...", "repoId": "..." }`
  - returns grounded answer, sources, retrieval metrics, and suggested contribution entry points
  - includes short-lived response cache for repeated repo/question pairs
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

## Quality Checks

```bash
npm run lint
npm run test
npm run build
```

## Benchmark Runner

Run evaluation cases against a running local server:

```bash
npm run benchmark:eval -- <repoId> eval/cases.smoke.json
```

Optional third argument lets you override the base URL:

```bash
npm run benchmark:eval -- <repoId> eval/cases.smoke.json http://localhost:3000
```
