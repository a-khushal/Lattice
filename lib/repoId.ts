import { createHash } from "node:crypto";

export function normalizeRepoUrl(repoUrl: string): string {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(repoUrl.trim());
  } catch {
    throw new Error("Invalid repository URL");
  }

  if (!parsedUrl.protocol.startsWith("http")) {
    throw new Error("Repository URL must use http or https");
  }

  const normalizedPath = parsedUrl.pathname
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "");

  const host = parsedUrl.host.toLowerCase();
  return `https://${host}${normalizedPath}`;
}

export function buildRepoId(repoUrl: string): string {
  const normalized = normalizeRepoUrl(repoUrl);
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}
