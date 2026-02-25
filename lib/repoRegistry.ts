import { normalizeRepoUrl } from "@/lib/repoId";
import { getRepoRegistryCollection } from "@/vector/repoRegistryClient";

export interface RepoRegistration {
  repoId: string;
  repoUrl: string;
  defaultBranch: string;
  lastIngestedAt: string;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export async function upsertRepoRegistration(input: {
  repoId: string;
  repoUrl: string;
  defaultBranch?: string;
}): Promise<void> {
  const collection = await getRepoRegistryCollection();
  const now = new Date().toISOString();
  const normalizedUrl = normalizeRepoUrl(input.repoUrl);

  await collection.upsert({
    ids: [input.repoId],
    embeddings: [[0]],
    documents: [normalizedUrl],
    metadatas: [
      {
        repoId: input.repoId,
        repoUrl: normalizedUrl,
        defaultBranch: input.defaultBranch ?? "main",
        lastIngestedAt: now,
      },
    ],
  });
}

export async function getRepoRegistrationById(
  repoId: string,
): Promise<RepoRegistration | null> {
  const collection = await getRepoRegistryCollection();
  const result = await collection.get({
    ids: [repoId],
    include: ["metadatas", "documents"],
  });

  const id = result.ids[0];
  if (!id) {
    return null;
  }

  const metadata = result.metadatas?.[0] ?? {};
  const documentRepoUrl = asString(result.documents?.[0]);
  const metadataRepoUrl = asString(metadata.repoUrl);

  return {
    repoId: id,
    repoUrl: documentRepoUrl || metadataRepoUrl,
    defaultBranch: asString(metadata.defaultBranch, "main"),
    lastIngestedAt: asString(metadata.lastIngestedAt),
  };
}
