import { readdir, readFile } from "node:fs/promises";
import { extname, basename, dirname, join, relative } from "node:path";
import {
  ALLOWED_EXTENSIONS,
  IGNORED_DIRECTORIES,
  IGNORED_EXTENSIONS,
  IGNORED_FILES,
  IGNORED_SUFFIXES,
  extensionToLanguage,
} from "@/lib/constants";
import type { ParsedFile } from "@/lib/types";

function normalizePath(input: string): string {
  return input.replaceAll("\\", "/");
}

function shouldIgnoreFile(fileName: string, extension: string): boolean {
  if (IGNORED_FILES.has(fileName)) {
    return true;
  }

  if (IGNORED_EXTENSIONS.has(extension)) {
    return true;
  }

  for (const suffix of IGNORED_SUFFIXES) {
    if (fileName.endsWith(suffix)) {
      return true;
    }
  }

  return false;
}

async function walk(repoPath: string, currentPath: string): Promise<string[]> {
  const entries = await readdir(currentPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = join(currentPath, entry.name);

    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name)) {
        files.push(...(await walk(repoPath, entryPath)));
      }

      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const extension = extname(entry.name).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      continue;
    }

    if (shouldIgnoreFile(entry.name, extension)) {
      continue;
    }

    files.push(entryPath);
  }

  return files;
}

export async function parseFiles(repoPath: string): Promise<ParsedFile[]> {
  const filePaths = await walk(repoPath, repoPath);
  const parsedFiles: ParsedFile[] = [];

  for (const absolutePath of filePaths) {
    try {
      const content = await readFile(absolutePath, "utf8");
      if (!content.trim()) {
        continue;
      }

      const fileName = basename(absolutePath);
      const extension = extname(fileName).toLowerCase();
      const filePath = normalizePath(relative(repoPath, absolutePath));
      const folder = normalizePath(dirname(filePath));

      parsedFiles.push({
        absolutePath,
        filePath,
        fileName,
        folder: folder === "." ? "/" : folder,
        language: extensionToLanguage(extension),
        content,
      });
    } catch {
      continue;
    }
  }

  return parsedFiles;
}
