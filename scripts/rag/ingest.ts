import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config({ path: path.join(process.cwd(), ".env") });
import fs from "node:fs";
import crypto from "node:crypto";
import { chunkText } from "../../lib/rag/chunk";
import { embedTexts } from "../../lib/rag/embed";
import { upsertRagChunks } from "../../lib/rag/db";

const DOCS_DIR = path.join(process.cwd(), "rag", "docs");

function readAllDocs() {
  if (!fs.existsSync(DOCS_DIR)) return [];

  const out: { name: string; content: string }[] = [];

  const walk = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(full);
        continue;
      }
      if (!e.isFile()) continue;
      if (!/\.(md|txt)$/i.test(e.name)) continue;
      const rel = path.relative(DOCS_DIR, full).replace(/\\/g, "/");
      out.push({ name: rel, content: fs.readFileSync(full, "utf8") });
    }
  };

  walk(DOCS_DIR);
  return out;
}

function chunkId(source: string, chunkIndex: number, content: string) {
  const h = crypto.createHash("sha1");
  h.update(source);
  h.update("\n");
  h.update(String(chunkIndex));
  h.update("\n");
  h.update(content);
  return h.digest("hex");
}

async function main() {
  if (!process.env.OPENROUTER_API_KEY && !process.env.OPENAI_API_KEY) {
    console.error("Missing OPENROUTER_API_KEY (or OPENAI_API_KEY) in environment.");
    process.exit(1);
  }

  const docs = readAllDocs();
  if (docs.length === 0) {
    console.error(`No .md/.txt docs found in ${DOCS_DIR}`);
    process.exit(1);
  }

  const rows: { id: string; source: string; chunkIndex: number; content: string }[] = [];
  for (const doc of docs) {
    const chunks = chunkText(doc.content);
    for (let i = 0; i < chunks.length; i++) {
      const content = chunks[i];
      rows.push({
        id: chunkId(doc.name, i, content),
        source: doc.name,
        chunkIndex: i,
        content,
      });
    }
  }

  const batchSize = 64;
  const upserts: {
    id: string;
    source: string;
    chunkIndex: number;
    content: string;
    embedding: number[];
  }[] = [];

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const embeddings = await embedTexts(batch.map((b) => b.content));
    for (let j = 0; j < batch.length; j++) {
      upserts.push({ ...batch[j], embedding: embeddings[j] });
    }
    console.log(`Embedded ${Math.min(i + batchSize, rows.length)}/${rows.length} chunks...`);
  }

  upsertRagChunks(upserts);
  console.log(`Done. Stored ${upserts.length} chunks into rag/rag.sqlite`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

