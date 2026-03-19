import OpenAI from "openai";
import { NextResponse } from "next/server";
import { embedTexts } from "@/lib/rag/embed";
import { queryTopKByEmbedding } from "@/lib/rag/db";
import fs from "node:fs";
import path from "node:path";

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

export const runtime = "nodejs";

type RelatedSource = {
  title: string;
  url: string;
};

const DLUX_PAGES = {
  contact: { title: "Contact DLUX", url: "https://www.dluxtech.com/contact-us" },
  about: { title: "About DLUX", url: "https://www.dluxtech.com/about-us" },
  growthStory: { title: "DLUX Growth Story", url: "https://www.dluxtech.com/our-growth-story" },
  team: { title: "DLUX Team", url: "https://www.dluxtech.com/our-team" },
  services: { title: "DLUX Services", url: "https://www.dluxtech.com/services" },
} as const satisfies Record<string, RelatedSource>;

type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

type ContactDetails = {
  phone?: string;
  email?: string;
  address?: string;
};

function extractRelatedSourcesFromText(text: string): RelatedSource[] {
  // Looks for lines like: "URL: https://example.com/path"
  const urls = Array.from(text.matchAll(/^URL:\s*(https?:\/\/\S+)\s*$/gim)).map((m) => m[1]);
  if (urls.length === 0) return [];

  // Best-effort title extraction from markdown headings, e.g. "## Some Page Title"
  const titleMatch = text.match(/^##\s+(.+?)\s*$/m);
  const fallbackTitle = titleMatch?.[1]?.trim() || "Open related page";

  const out: RelatedSource[] = [];
  const seen = new Set<string>();
  for (const u of urls) {
    if (seen.has(u)) continue;
    seen.add(u);
    out.push({ title: fallbackTitle, url: u });
  }
  return out;
}

function extractRelatedSourcesFromChunks(chunks: Array<{ source: string; content: string }>) {
  const out: RelatedSource[] = [];
  const seen = new Set<string>();

  for (const c of chunks) {
    const fromText = extractRelatedSourcesFromText(c.content);
    for (const s of fromText) {
      if (seen.has(s.url)) continue;
      seen.add(s.url);
      out.push(s);
    }
  }

  return out;
}

function uniqSources(sources: RelatedSource[]) {
  const out: RelatedSource[] = [];
  const seen = new Set<string>();
  for (const s of sources) {
    if (!s?.url || seen.has(s.url)) continue;
    seen.add(s.url);
    out.push({ title: s.title || "Open page", url: s.url });
  }
  return out;
}

function isGreetingOnly(userMessage: string) {
  const q = userMessage.trim().toLowerCase();
  if (!q) return true;
  // short greetings / openers
  return /^(hi|hello|hey|hai|hii|good (morning|afternoon|evening)|greetings|yo|sup)[!. ]*$/i.test(q);
}

function isChatbotMetaQuestion(userMessage: string) {
  const q = userMessage.trim().toLowerCase();
  if (!q) return false;

  // Asking about the assistant itself (name/capabilities/identity).
  if (
    /\b(what('?s| is) your name|your name|call you|call u|who are you|are you (an )?ai|what can you do|help me|how do you work)\b/.test(
      q
    )
  ) {
    return true;
  }

  // "call" that refers to calling the assistant (not DLUX).
  if (/\bcall\b/.test(q) && /\b(you|u|yourself|this bot|assistant)\b/.test(q)) return true;

  return false;
}

function detectLinkIntent(userMessage: string) {
  const q = userMessage.toLowerCase();

  const wantsContact =
    /\b(contact|reach|call|phone|email|mail|address|location|office|enquiry|inquiry|quote|pricing|proposal)\b/.test(
      q
    ) ||
    (/\b(book|schedule)\b/.test(q) && /\b(demo|call|meeting)\b/.test(q)) ||
    /\b(form|submit|enquire|enquiry|connect)\b/.test(q);

  const wantsStory = /\b(about|story|history|journey|mission|vision|values|who are you|who is dlux)\b/.test(q);

  const wantsTeam = /\b(team|leadership|founder|founders|people)\b/.test(q);

  const wantsServices =
    /\b(service|services|offering|offerings|solution|solutions|capabilit|implementation|consulting|managed)\b/.test(
      q
    );

  const wantsWhyDlux =
    (/\bwhy\b/.test(q) && /\bdlux\b/.test(q)) ||
    /\b(why choose|why should|choose dlux|why dlux tech)\b/.test(q);

  const wantsLeadership =
    /\b(founder|ceo|president|leadership|lead|executive|management|owner)\b/.test(q) && /\bdlux\b/.test(q);

  return {
    wantsContact,
    wantsStory,
    wantsTeam,
    wantsServices,
    wantsWhyDlux,
    wantsLeadership,
    shouldIncludeLinks: wantsContact || wantsStory || wantsTeam || wantsServices || wantsWhyDlux || wantsLeadership,
  };
}

function forcedSourcesForIntent(intent: ReturnType<typeof detectLinkIntent>): RelatedSource[] {
  const forced: RelatedSource[] = [];
  if (intent.wantsContact) forced.push(DLUX_PAGES.contact);
  if (intent.wantsStory) forced.push(DLUX_PAGES.growthStory, DLUX_PAGES.about);
  if (intent.wantsTeam || intent.wantsLeadership) forced.push(DLUX_PAGES.team, DLUX_PAGES.about);
  if (intent.wantsServices || intent.wantsWhyDlux) forced.push(DLUX_PAGES.services);
  if (intent.wantsWhyDlux) forced.push(DLUX_PAGES.growthStory);
  return uniqSources(forced);
}

function stripUrlsFromAssistantText(text: string) {
  let t = text || "";

  // Replace markdown links: [Label](https://example.com) -> Label
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1");

  // Remove bare URLs
  t = t.replace(/https?:\/\/\S+/g, "");

  // Remove leftover empty parentheses / double spaces after stripping
  t = t.replace(/\(\s*\)/g, "").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n");

  return t.trim();
}

function extractContactDetailsFromText(text: string): ContactDetails {
  const email = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0];

  // Basic international-ish phone matcher; expects at least 8 digits total.
  const phoneMatch = text.match(/(?:\+\d{1,3}\s*)?(?:\(?\d{2,4}\)?\s*)?[\d\s-]{6,}\d/g);
  const phone = phoneMatch?.map((s) => s.trim()).find((s) => s.replace(/[^\d]/g, "").length >= 8);

  // Heuristic: take a multi-line address block containing street keywords and avoid sentence-y text.
  const addressLines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/[.?!]$/.test(l)); // avoid full sentences
  const addrIdx = addressLines.findIndex((l) =>
    /(suite|level|\d+ .*street|street|st\b|road|rd\b|ave\b|avenue|parramatta|sydney|nsw|cbd)/i.test(l)
  );
  const address =
    addrIdx >= 0 ? addressLines.slice(addrIdx, addrIdx + 4).join(", ").replace(/\s{2,}/g, " ") : undefined;

  const out: ContactDetails = {};
  if (phone) out.phone = phone;
  if (email) out.email = email;
  if (address) out.address = address;
  return out;
}

function extractContactDetailsFromContactPageMarkdown(text: string): ContactDetails {
  const lines = text.split("\n").map((l) => l.trim());

  const phoneIdx = lines.findIndex((l) => /^\+\d/.test(l) && l.replace(/[^\d]/g, "").length >= 8);
  const emailIdx = lines.findIndex((l) => /@/.test(l) && /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(l));

  const phone = phoneIdx >= 0 ? lines[phoneIdx] : undefined;
  const email =
    emailIdx >= 0 ? lines[emailIdx].match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0] : undefined;

  // Address: typically directly below phone/email on the contact page.
  const startIdx = Math.max(phoneIdx, emailIdx);
  let address: string | undefined;
  if (startIdx >= 0) {
    const addrLines: string[] = [];
    for (let i = startIdx + 1; i < Math.min(startIdx + 8, lines.length); i++) {
      const l = lines[i];
      if (!l) continue;
      if (/^###\b/.test(l)) break;
      if (/^[-*]\s+https?:\/\//i.test(l)) break;
      if (/^https?:\/\//i.test(l)) break;
      if (/submit\b/i.test(l)) continue;
      if (/services\b/i.test(l) && addrLines.length > 0) break;
      if (/[.?!]$/.test(l)) continue; // skip sentences
      // stop if we hit another obvious section label
      if (/^(services|about|platform|resources|policies)\b/i.test(l) && addrLines.length > 0) break;
      addrLines.push(l);
      if (addrLines.length >= 3) break;
    }
    const candidate = addrLines.join(", ").replace(/\s{2,}/g, " ").trim();
    if (candidate && /(street|suite|level|parramatta|sydney|nsw|cbd|\d{4,})/i.test(candidate)) {
      address = candidate;
    }
  }

  const out: ContactDetails = {};
  if (phone) out.phone = phone;
  if (email) out.email = email;
  if (address) out.address = address;
  return out;
}

function getLocalContactDetails(): ContactDetails | null {
  try {
    const p = path.join(process.cwd(), "rag", "docs", "dluxtech-site", "pages", "contact-us.md");
    if (!fs.existsSync(p)) return null;
    const text = fs.readFileSync(p, "utf8");
    const details = extractContactDetailsFromContactPageMarkdown(text);
    return Object.keys(details).length ? details : null;
  } catch {
    return null;
  }
}

function normalizeForDedup(s: string) {
  return s
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function selectDiverseTop<T extends { source: string; chunkIndex: number; content: string; score: number }>(
  rows: T[],
  opts?: { maxTotal?: number; maxPerSource?: number }
) {
  const maxTotal = opts?.maxTotal ?? 6;
  const maxPerSource = opts?.maxPerSource ?? 2;

  const perSource = new Map<string, number>();
  const seenSnippets = new Set<string>();
  const out: T[] = [];

  for (const r of rows) {
    if (out.length >= maxTotal) break;
    const count = perSource.get(r.source) ?? 0;
    if (count >= maxPerSource) continue;

    const key = normalizeForDedup(r.content).slice(0, 240);
    if (key && seenSnippets.has(key)) continue;

    seenSnippets.add(key);
    perSource.set(r.source, count + 1);
    out.push(r);
  }

  return out;
}

function coerceTurns(v: unknown): ChatTurn[] | null {
  if (!Array.isArray(v)) return null;
  const turns: ChatTurn[] = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if ((role === "user" || role === "assistant") && typeof content === "string" && content.trim()) {
      turns.push({ role, content: content.trim() });
    }
  }
  return turns;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log("Request Body:", body);

    const userMessage = String(body?.message ?? "");
    const greetingOnly = isGreetingOnly(userMessage);
    const metaQuestion = isChatbotMetaQuestion(userMessage);
    const linkIntent = detectLinkIntent(userMessage);

    // Greeting-only: keep it friendly and ask what they need, no buttons.
    if (greetingOnly) {
      return NextResponse.json({
        reply: "Hi! What can I help you with at DLUX TECH today—services, platforms, or a quick chat about your goals?",
        sources: [],
      });
    }

    // Questions about the assistant itself should not trigger contact details.
    if (metaQuestion) {
      return NextResponse.json({
        reply:
          "You can call me the DLUX Assistant. I can help answer questions about DLUX TECH, our services and platforms, and guide you to the right pages when needed. What are you looking to achieve?",
        sources: [],
      });
    }

    const [queryEmbedding] = await embedTexts([userMessage]);
    const rawTop = queryTopKByEmbedding(queryEmbedding, Number(process.env.RAG_TOP_K || 8));
    const top = selectDiverseTop(rawTop, { maxTotal: 6, maxPerSource: 2 });
    const forcedSources = forcedSourcesForIntent(linkIntent);
    const relatedSources = extractRelatedSourcesFromChunks(top);
    const sourcesForUi = uniqSources([...forcedSources, ...relatedSources]).slice(0, 5);
    const contextBlock = top
      .map(
        (r) =>
          `SOURCE: ${r.source} (chunk ${r.chunkIndex}, score ${r.score.toFixed(3)})\n${r.content}`
      )
      .join("\n\n---\n\n");

    // Contact intent: answer with concrete details + Contact button.
    if (linkIntent.wantsContact) {
      const local = getLocalContactDetails();
      // Use local contact page as source of truth; only fall back to context if local missing.
      const fromContext = !local ? extractContactDetailsFromText(contextBlock) : {};
      const details: ContactDetails = { ...fromContext, ...local };

      const lines: string[] = ["Here are the best ways to reach DLUX TECH:"];
      if (details.phone) lines.push(`- Phone: ${details.phone}`);
      if (details.email) lines.push(`- Email: ${details.email}`);
      if (details.address) lines.push(`- Address: ${details.address}`);
      lines.push("", "What would you like to discuss (services, platform support, or a project requirement)?");

      return NextResponse.json({
        reply: stripUrlsFromAssistantText(lines.join("\n")),
        sources: uniqSources([DLUX_PAGES.contact, ...sourcesForUi]).slice(0, 5),
      });
    }

    const historyTurns = coerceTurns((body as { messages?: unknown })?.messages) || [];
    const recentTurns = historyTurns.slice(-10); // keep it small for cost/latency

    const completion = await openai.chat.completions.create({
      model: process.env.OPENROUTER_CHAT_MODEL || "openai/gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
You are an AI assistant for DLUX TECH.

Rules:
- Prefer DLUX TECH information from CONTEXT when the user’s question is about DLUX TECH.
- If the user asks for contact details, booking a call/demo, or any form/enquiry, direct them to the Contact page.
- If the user asks about DLUX (about/story/journey/mission), give a short, high-level summary and point them to the Growth Story/About pages.
- If the user asks something unrelated to DLUX TECH, answer briefly and helpfully in general terms, then ask one short clarifying question about their DLUX need.
- Do not invent phone numbers, emails, addresses, or claims that are not in CONTEXT.
- Do NOT include any URLs in the message text. Never print raw links. If a page should be linked, refer to it by name only (the UI will show buttons separately).
- Avoid repeating yourself across turns. If the user asks a follow-up, add new points or a different angle instead of restating the same sentences.
- For \"Why DLUX TECH?\" questions, answer with practical differentiators (services, approach, outcomes) using CONTEXT.
- For founder/CEO/president/leadership questions, ONLY answer if the leadership details appear in CONTEXT; otherwise say you don’t have that information and offer to connect them via the contact option.
- CEO of DLUX TECH is Luxman Pai.
- Keep the response concise and clear.

CONTEXT:
${contextBlock || "(no relevant context found)"}

`,
        },
        ...recentTurns.map((t) => ({ role: t.role, content: t.content } as const)),
        { role: "user", content: userMessage },
      ],
    });

    const rawReply = completion.choices[0].message.content || "";
    const reply = stripUrlsFromAssistantText(rawReply);

    return NextResponse.json({
      reply,
      sources: sourcesForUi,
    });
  } catch (error: unknown) {
    console.error("FULL ERROR:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
export async function GET() {
  return Response.json({ status: "Chat API is working" });
}
