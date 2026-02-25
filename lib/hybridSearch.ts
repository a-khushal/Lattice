import {
  BM25_B,
  BM25_K1,
  HYBRID_BM25_WEIGHT,
  HYBRID_RRF_K,
  HYBRID_VECTOR_WEIGHT,
} from "@/lib/constants";

interface LexicalDocument {
  id: string;
  content: string;
}

interface LexicalScore {
  id: string;
  score: number;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_]+/g)
    .filter((token) => token.length > 1);
}

export function computeBm25Scores(
  query: string,
  documents: LexicalDocument[],
): LexicalScore[] {
  const queryTokens = tokenize(query);
  if (documents.length === 0 || queryTokens.length === 0) {
    return [];
  }

  const uniqueQueryTokens = Array.from(new Set(queryTokens));
  const tokenizedDocs = documents.map((document) => tokenize(document.content));
  const averageLength =
    tokenizedDocs.reduce((sum, tokens) => sum + tokens.length, 0) /
    Math.max(1, tokenizedDocs.length);

  const documentFrequency = new Map<string, number>();
  for (const tokens of tokenizedDocs) {
    const uniqueTokens = new Set(tokens);

    for (const token of uniqueTokens) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }

  const documentCount = documents.length;

  const scored = tokenizedDocs
    .map((tokens, index) => {
      const frequencies = new Map<string, number>();
      for (const token of tokens) {
        frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
      }

      let score = 0;
      for (const token of uniqueQueryTokens) {
        const tf = frequencies.get(token) ?? 0;
        if (tf === 0) {
          continue;
        }

        const df = documentFrequency.get(token) ?? 0;
        const idf = Math.log((documentCount - df + 0.5) / (df + 0.5) + 1);
        const denominator =
          tf + BM25_K1 * (1 - BM25_B + BM25_B * (tokens.length / averageLength));

        score += idf * ((tf * (BM25_K1 + 1)) / denominator);
      }

      return {
        id: documents[index].id,
        score,
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored;
}

export function reciprocalRankFusion(
  vectorRankedIds: string[],
  lexicalRankedIds: string[],
): Map<string, number> {
  const scores = new Map<string, number>();

  const applyRank = (ids: string[], weight: number) => {
    ids.forEach((id, rankIndex) => {
      const rank = rankIndex + 1;
      const increment = weight / (HYBRID_RRF_K + rank);
      scores.set(id, (scores.get(id) ?? 0) + increment);
    });
  };

  applyRank(vectorRankedIds, HYBRID_VECTOR_WEIGHT);
  applyRank(lexicalRankedIds, HYBRID_BM25_WEIGHT);

  return scores;
}
