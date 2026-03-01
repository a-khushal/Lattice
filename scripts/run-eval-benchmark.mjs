#!/usr/bin/env node

import { readFile } from "node:fs/promises";

function usage() {
  console.log(
    "Usage: npm run benchmark:eval -- <repoId> [casesFile] [baseUrl]",
  );
}

const [repoIdArg, casesFileArg, baseUrlArg] = process.argv.slice(2);
if (!repoIdArg) {
  usage();
  process.exit(1);
}

const repoId = repoIdArg.trim();
const casesFile = casesFileArg?.trim() || "eval/cases.smoke.json";
const baseUrl = (baseUrlArg?.trim() || process.env.LATTICE_BASE_URL || "http://localhost:3000").replace(
  /\/+$/,
  "",
);

const raw = await readFile(casesFile, "utf8");
const cases = JSON.parse(raw);

if (!Array.isArray(cases) || cases.length === 0) {
  throw new Error(`No evaluation cases found in '${casesFile}'`);
}

const startedAt = Date.now();
const response = await fetch(`${baseUrl}/api/evaluate`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    ...(process.env.LATTICE_API_KEY
      ? { "x-api-key": process.env.LATTICE_API_KEY }
      : {}),
  },
  body: JSON.stringify({ repoId, cases }),
});

const payload = await response.json();

if (!response.ok) {
  const message = payload?.error || `HTTP ${response.status}`;
  throw new Error(`Benchmark request failed: ${message}`);
}

const elapsedMs = Date.now() - startedAt;

console.log(`Repo ID: ${payload.repoId}`);
console.log(`Cases: ${payload.totalCases}`);
console.log(`Exact match: ${(payload.exactMatchAccuracy * 100).toFixed(1)}%`);
console.log(`Context relevance: ${(payload.contextRelevance * 100).toFixed(1)}%`);
console.log(`Retrieval accuracy: ${(payload.retrievalAccuracy * 100).toFixed(1)}%`);
console.log(`Groundedness: ${(payload.groundedness * 100).toFixed(1)}%`);
console.log(`Avg context count: ${payload.averageContextCount.toFixed(2)}`);
console.log(`Elapsed: ${elapsedMs}ms`);
