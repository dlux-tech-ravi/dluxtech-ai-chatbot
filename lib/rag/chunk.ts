export function chunkText(text: string, opts?: { chunkSize?: number; overlap?: number }) {
  const chunkSize = opts?.chunkSize ?? 1200;
  const overlap = opts?.overlap ?? 200;
  const cleaned = text.replace(/\r\n/g, "\n").trim();
  if (!cleaned) return [];

  const chunks: string[] = [];
  let i = 0;
  while (i < cleaned.length) {
    const end = Math.min(i + chunkSize, cleaned.length);
    const chunk = cleaned.slice(i, end).trim();
    if (chunk) chunks.push(chunk);
    if (end === cleaned.length) break;
    i = Math.max(0, end - overlap);
  }
  return chunks;
}

