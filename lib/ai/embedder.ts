import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { embed, embedMany, type EmbeddingModel } from "ai";

import { config } from "@/lib/config";

const EMBED_BATCH_SIZE = 10;
const PLACEHOLDER_DIMENSION = 1024;

function createEmbeddingProvider(): EmbeddingModel {
  const openai = createOpenAICompatible({
    name: "openai",
    baseURL: config.openaiEmbedding.baseURL,
    apiKey: config.openaiEmbedding.apiKey,
  });
  return openai.embeddingModel(config.openaiEmbedding.model);
}

export const embeddingModel = createEmbeddingProvider();

let remoteFailed = false;
let warned = false;

function remoteConfigured(): boolean {
  return config.openaiEmbedding.apiKey.trim() !== "";
}

export function embeddingAvailable(): boolean {
  return remoteConfigured() && !remoteFailed;
}

export function embeddingFallbackActive(): boolean {
  return !embeddingAvailable();
}

function warnFallback(reason: string): void {
  if (warned) {
    return;
  }
  warned = true;
  console.warn(
    `[embedding] ${reason}; dense similarity search is disabled and ` +
      "retrieval degrades to BM25.",
  );
}

if (embeddingFallbackActive()) {
  warnFallback("no embedding API key configured");
}

// The Milvus collection schema always carries a dense vector field, so rows
// still need a non-zero placeholder. It is never queried while embeddings are
// unavailable (retrieval goes through BM25 only).
function placeholderVector(): number[] {
  const value = 1 / Math.sqrt(PLACEHOLDER_DIMENSION);
  return new Array<number>(PLACEHOLDER_DIMENSION).fill(value);
}

function markRemoteFailure(error: unknown): void {
  remoteFailed = true;
  const message = error instanceof Error ? error.message : String(error);
  warnFallback(`embedding provider failed (${message})`);
}

export async function embedText(text: string): Promise<number[]> {
  if (embeddingFallbackActive()) {
    return placeholderVector();
  }
  try {
    const { embedding } = await embed({ model: embeddingModel, value: text });
    return embedding;
  } catch (error) {
    markRemoteFailure(error);
    return placeholderVector();
  }
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (embeddingFallbackActive()) {
    return texts.map(() => placeholderVector());
  }
  const results: number[][] = [];
  try {
    for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
      const { embeddings } = await embedMany({
        model: embeddingModel,
        values: texts.slice(i, i + EMBED_BATCH_SIZE),
      });
      results.push(...embeddings);
    }
    return results;
  } catch (error) {
    markRemoteFailure(error);
    return texts.map(() => placeholderVector());
  }
}
