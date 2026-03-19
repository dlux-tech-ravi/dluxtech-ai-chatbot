import path from "node:path";
import Database from "better-sqlite3";

export type RagChunkRow = {
  id: string;
  source: string;
  chunkIndex: number;
  content: string;
  embeddingJson: string;
};

export type RagChunkUpsert = {
  id: string;
  source: string;
  chunkIndex: number;
  content: string;
  embedding: number[];
};

const DB_PATH = path.join(process.cwd(), "rag", "rag.sqlite");

let _db: Database.Database | null = null;

export function getRagDb() {
  if (_db) return _db;

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS rag_chunks (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      embedding_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_rag_chunks_source ON rag_chunks(source);
  `);

  _db = db;
  return db;
}

export function upsertRagChunks(chunks: RagChunkUpsert[]) {
  const db = getRagDb();
  const stmt = db.prepare(`
    INSERT INTO rag_chunks (id, source, chunk_index, content, embedding_json)
    VALUES (@id, @source, @chunkIndex, @content, @embeddingJson)
    ON CONFLICT(id) DO UPDATE SET
      source = excluded.source,
      chunk_index = excluded.chunk_index,
      content = excluded.content,
      embedding_json = excluded.embedding_json
  `);

  const tx = db.transaction((rows: RagChunkUpsert[]) => {
    for (const r of rows) {
      stmt.run({
        id: r.id,
        source: r.source,
        chunkIndex: r.chunkIndex,
        content: r.content,
        embeddingJson: JSON.stringify(r.embedding),
      });
    }
  });

  tx(chunks);
}

export function getAllChunks(): RagChunkRow[] {
  const db = getRagDb();
  return db
    .prepare(
      `SELECT id, source, chunk_index as chunkIndex, content, embedding_json as embeddingJson FROM rag_chunks`
    )
    .all() as RagChunkRow[];
}

function dot(a: number[], b: number[]) {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

function norm(a: number[]) {
  return Math.sqrt(dot(a, a));
}

function cosineSimilarity(a: number[], b: number[]) {
  const denom = norm(a) * norm(b);
  if (!denom) return 0;
  return dot(a, b) / denom;
}

export function queryTopKByEmbedding(queryEmbedding: number[], topK = 5) {
  const rows = getAllChunks();
  const scored = rows
    .map((r) => {
      const emb = JSON.parse(r.embeddingJson) as number[];
      const score = cosineSimilarity(queryEmbedding, emb);
      return { ...r, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored;
}

