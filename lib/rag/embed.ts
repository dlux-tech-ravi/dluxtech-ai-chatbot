import OpenAI from "openai";

function getClient() {
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing credentials. Set OPENROUTER_API_KEY (recommended) or OPENAI_API_KEY."
    );
  }

  const usingOpenRouter = Boolean(process.env.OPENROUTER_API_KEY);
  return new OpenAI({
    apiKey,
    ...(usingOpenRouter ? { baseURL: "https://openrouter.ai/api/v1" } : {}),
  });
}

export async function embedTexts(texts: string[]) {
  const model = process.env.OPENROUTER_EMBEDDING_MODEL || "openai/text-embedding-3-small";
  const openai = getClient();
  const resp = await openai.embeddings.create({
    model,
    input: texts,
  });

  return resp.data.map((d) => d.embedding as number[]);
}

