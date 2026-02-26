const directoryIgnores = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "target",
  "coverage",
  ".next",
] as const;

const fileExtensionIgnores = [
  ".png",
  ".jpg",
  ".svg",
  ".mp4",
  ".zip",
  ".exe",
] as const;

const fileSuffixIgnores = [".lock"] as const;

const exactFileIgnores = [".env"] as const;

const allowedFileTypes = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".go",
  ".rs",
  ".md",
  ".json",
  ".yaml",
  ".yml",
  ".sol",
  ".cpp",
  ".c",
  ".java",
  ".kt",
] as const;

export const IGNORED_DIRECTORIES = new Set<string>(directoryIgnores);
export const IGNORED_EXTENSIONS = new Set<string>(fileExtensionIgnores);
export const IGNORED_SUFFIXES = new Set<string>(fileSuffixIgnores);
export const IGNORED_FILES = new Set<string>(exactFileIgnores);
export const ALLOWED_EXTENSIONS = new Set<string>(allowedFileTypes);

const languageByExtension = new Map<string, string>([
  [".ts", "typescript"],
  [".tsx", "typescript"],
  [".js", "javascript"],
  [".jsx", "javascript"],
  [".py", "python"],
  [".go", "go"],
  [".rs", "rust"],
  [".md", "markdown"],
  [".json", "json"],
  [".yaml", "yaml"],
  [".yml", "yaml"],
  [".sol", "solidity"],
  [".cpp", "cpp"],
  [".c", "c"],
  [".java", "java"],
  [".kt", "kotlin"],
]);

export function extensionToLanguage(extension: string): string {
  return languageByExtension.get(extension) ?? "plaintext";
}

export const CHUNK_TARGET_TOKENS = 800;
export const CHUNK_OVERLAP_TOKENS = 160;
export const CHUNK_TARGET_CHARACTERS = CHUNK_TARGET_TOKENS * 4;
export const CHUNK_OVERLAP_CHARACTERS = CHUNK_OVERLAP_TOKENS * 4;

export const AST_AWARE_LANGUAGES = new Set<string>(["javascript", "typescript"]);

export const RETRIEVAL_MIN_RESULTS = 5;
export const RETRIEVAL_MAX_RESULTS = 10;
export const RETRIEVAL_QUERY_CANDIDATES = 32;
export const CONTEXT_MAX_TOKENS = 8000;

export const HYBRID_VECTOR_WEIGHT = 0.65;
export const HYBRID_BM25_WEIGHT = 0.35;
export const HYBRID_RRF_K = 60;
export const BM25_K1 = 1.2;
export const BM25_B = 0.75;

export const EMBEDDING_COST_PER_1K_TOKENS = 0.00002;
export const COMPLETION_INPUT_COST_PER_1K_TOKENS = 0.00015;
export const COMPLETION_OUTPUT_COST_PER_1K_TOKENS = 0.0006;
