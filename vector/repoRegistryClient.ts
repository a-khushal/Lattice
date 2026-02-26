import { ChromaClient, type Collection } from "chromadb";

const COLLECTION_NAME = "repo_registry";

let client: ChromaClient | null = null;
let collectionPromise: Promise<Collection> | null = null;

function getClient(): ChromaClient {
  if (!client) {
    client = new ChromaClient({
      path: process.env.CHROMA_URL ?? "http://localhost:8000",
    });
  }

  return client;
}

export async function getRepoRegistryCollection(): Promise<Collection> {
  if (!collectionPromise) {
    collectionPromise = getClient().getOrCreateCollection({
      name: COLLECTION_NAME,
      embeddingFunction: null,
      metadata: {
        description: "Lattice repo registry",
      },
    });
  }

  return collectionPromise;
}
