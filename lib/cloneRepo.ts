import { mkdir, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import simpleGit from "simple-git";
import { normalizeRepoUrl } from "@/lib/repoId";

function validateRepoUrl(repoUrl: string): string {
  return normalizeRepoUrl(repoUrl);
}

export async function cloneRepo(repoUrl: string): Promise<string> {
  const safeRepoUrl = validateRepoUrl(repoUrl);
  const baseDir = join(tmpdir(), "lattice-clones");
  const targetDir = join(baseDir, randomUUID());

  await mkdir(baseDir, { recursive: true });

  const git = simpleGit();
  await git.clone(safeRepoUrl, targetDir, ["--depth", "1"]);

  return targetDir;
}

export async function cleanupClonedRepo(repoPath: string): Promise<void> {
  await rm(repoPath, { recursive: true, force: true });
}
