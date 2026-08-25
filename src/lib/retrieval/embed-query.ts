import { pipeline } from "@huggingface/transformers";

const DIMS = 384;

type FeatureExtractor = (
  text: string,
  options: { pooling: "mean"; normalize: boolean },
) => Promise<{ tolist: () => number[][] }>;

const extractors = new Map<string, FeatureExtractor>();

function toVector(output: unknown, modelId: string): number[] {
  const tensor = output as {
    data?: ArrayLike<number>;
    tolist?: () => unknown;
  };
  if (typeof tensor.tolist === "function") {
    const listed = tensor.tolist();
    if (Array.isArray(listed)) {
      const flat = Array.isArray(listed[0])
        ? (listed as number[][]).flat()
        : (listed as number[]);
      if (flat.length === DIMS) return flat;
    }
  }
  if (tensor.data && tensor.data.length === DIMS) {
    return Array.from(tensor.data);
  }
  throw new Error(`unexpected embedding shape from ${modelId}`);
}

async function extractorFor(modelId: string): Promise<FeatureExtractor> {
  const cached = extractors.get(modelId);
  if (cached) return cached;
  const extractor = (await pipeline("feature-extraction", modelId, {
    dtype: "fp32",
  })) as unknown as FeatureExtractor;
  extractors.set(modelId, extractor);
  return extractor;
}

/** Query encoder. `modelId` comes from the committed index, not a guess. */
export async function encodeQuery(
  modelId: string,
  text: string,
): Promise<number[]> {
  const extractor = await extractorFor(modelId);
  const output = await extractor(text, { pooling: "mean", normalize: true });
  return toVector(output, modelId);
}
