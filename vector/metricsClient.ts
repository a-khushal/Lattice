import { ChromaClient, type Collection } from "chromadb";

const COLLECTION_NAME = "lattice_metrics";

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

export async function getMetricsCollection(): Promise<Collection> {
  if (!collectionPromise) {
    collectionPromise = getClient().getOrCreateCollection({
      name: COLLECTION_NAME,
      metadata: {
        description: "Lattice observability events",
      },
    });
  }

  return collectionPromise;
}
