export type Chunk = {
  chunk_id: string;
  doc_id: string;
  title: string;
  section: string;
  text: string;
};

export type EmbeddedChunk = Chunk & {
  embedding: number[];
};

export type RankedChunk = EmbeddedChunk & {
  score: number;
};

export type EmbeddingIndex = {
  model: string;
  dims: number;
  chunks: EmbeddedChunk[];
};
