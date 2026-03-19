import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import TurndownService from "turndown";
import * as cheerio from "cheerio";
import { chromium } from "playwright";

const ORIGIN = "https://www.dluxtech.com";
const SITEMAP_URL = `${ORIGIN}/sitemap.xml`;
const OUT_DIR = path.join(process.cwd(), "rag", "docs", "dluxtech-site");
const OUT_INDEX_MD = path.join(OUT_DIR, "index.md");

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function normalizeWhitespace(s: string) {
  return s.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function isInternalUrl(u: string) {
  try {
    const url = new URL(u);
    return url.origin === ORIGIN;
  } catch {
    return false;
  }
}

function slugFromUrl(u: string) {
  const url = new URL(u);
  let p = url.pathname.replace(/\/+$/, "");
  if (!p || p === "/") p = "/home";
  const cleaned = p
    .split("/")
    .filter(Boolean)
    .map((seg) => seg.replace(/[^\p{L}\p{N}\-_.]+/gu, "-").replace(/-+/g, "-"))
    .join("__");
  // keep it filesystem-safe and reasonably short
  return cleaned.slice(0, 180) || "page";
}

function renderPageMarkdown(p: { url: string; title: string; md: string; links: string[] }) {
  const md = p.md || "(No extractable content found)";
  const linkLines = p.links.slice(0, 80).map((u) => `- ${u}`).join("\n");
  return normalizeWhitespace(
    [
      `## ${p.title}`,
      "",
      `URL: ${p.url}`,
      "",
      md,
      "",
      "### Page links",
      "",
      linkLines || "- (none)",
      "",
    ].join("\n")
  );
}

async function fetchText(url: string) {
  const res = await fetch(url, {
    headers: {
      "user-agent": "dluxtech-rag-scraper/1.0 (+local dev)",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
  return await res.text();
}

async function renderPage(page: import("playwright").Page, url: string) {
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  } catch {
    // Some pages keep long-lived requests; fall back to DOMContentLoaded.
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  }
  await page.waitForTimeout(1200);
  const title = (await page.title()) || "";
  const text = await page.evaluate(() => document.body?.innerText || "");
  const links = await page.evaluate(() =>
    Array.from(document.querySelectorAll("a[href]"))
      .map((a) => (a as HTMLAnchorElement).href)
      .filter(Boolean)
  );
  return { title, text, links };
}

async function getSitemapUrls() {
  const xml = await fetchText(SITEMAP_URL);
  const $ = cheerio.load(xml, { xmlMode: true });
  const urls = $("url > loc")
    .toArray()
    .map((el) => $(el).text().trim())
    .filter(Boolean)
    .filter(isInternalUrl);

  return Array.from(new Set(urls));
}

function htmlToMarkdown(html: string) {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg").remove();

  // Try to prefer main content; fallback to body.
  const main =
    $("main").first().html() ||
    $('[role="main"]').first().html() ||
    $("#__next").first().html() ||
    $("body").first().html() ||
    "";

  const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
  let md = normalizeWhitespace(turndown.turndown(main));

  // Plain-text fallback (works for SSR/static HTML even without semantic tags).
  if (!md || md.length < 200) {
    const text = normalizeWhitespace($("body").text());
    if (text && text.length >= 200) md = text;
  }

  // If the site is mostly client-rendered, extract from Next.js data.
  if (!md || md.length < 200) {
    const $raw = cheerio.load(html);
    const nextDataText = $raw('script#__NEXT_DATA__').first().text();
    if (nextDataText) {
      try {
        const nextJson = JSON.parse(nextDataText);
        const strings: string[] = [];
        const seen = new Set<unknown>();

        const walk = (v: unknown) => {
          if (v === null || v === undefined) return;
          if (typeof v === "string") {
            const s = normalizeWhitespace(v);
            if (s && s.length >= 40) strings.push(s);
            return;
          }
          if (typeof v !== "object") return;
          if (seen.has(v)) return;
          seen.add(v);
          if (Array.isArray(v)) {
            for (const item of v) walk(item);
            return;
          }
          for (const val of Object.values(v as Record<string, unknown>)) walk(val);
        };

        walk(nextJson);
        const uniq = Array.from(new Set(strings));
        const fallback = uniq.slice(0, 200).join("\n\n");
        if (fallback && fallback.length >= 200) {
          md = normalizeWhitespace(fallback);
        }
      } catch {
        // ignore
      }
    }
  }

  return md;
}

function extractTitle(html: string) {
  const $ = cheerio.load(html);
  return normalizeWhitespace($("title").first().text() || "").replace(/\s+\|\s+.*$/, "").trim();
}

function extractInternalLinks(html: string) {
  const $ = cheerio.load(html);
  const links = $("a[href]")
    .toArray()
    .map((a) => String($(a).attr("href") || "").trim())
    .filter(Boolean)
    .map((href) => {
      try {
        return new URL(href, ORIGIN).toString();
      } catch {
        return "";
      }
    })
    .filter(Boolean)
    .filter(isInternalUrl)
    .filter((u) => !u.includes("#"));

  return Array.from(new Set(links));
}

function isLikelyServiceUrl(u: string) {
  const p = new URL(u).pathname.toLowerCase();
  return (
    p === "/services" ||
    p.includes("consulting") ||
    p.includes("managed") ||
    p.includes("content-management") ||
    p.includes("martech") ||
    p.includes("training") ||
    p.includes("dam")
  );
}

async function main() {
  ensureDir(OUT_DIR);
  ensureDir(path.join(OUT_DIR, "pages"));

  const urls = await getSitemapUrls();
  console.log(`Found ${urls.length} URLs in sitemap.`);

  const useBrowser = (process.env.RAG_SCRAPE_RENDER || "1") !== "0";
  if (useBrowser) {
    console.log("Using headless browser rendering for scraping.");
  } else {
    console.log("Using raw HTML fetch for scraping.");
  }

  const pages: {
    url: string;
    title: string;
    md: string;
    links: string[];
    outFile: string;
  }[] = [];

  if (useBrowser) {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    try {
      for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        try {
          const rendered = await renderPage(page, url);
          const title = normalizeWhitespace(rendered.title) || new URL(url).pathname;
          const md = normalizeWhitespace(rendered.text);
          const links = Array.from(new Set(rendered.links.filter(isInternalUrl))).filter(
            (u) => !u.includes("#")
          );
          const outFile = path.join(OUT_DIR, "pages", `${slugFromUrl(url)}.md`);
          pages.push({ url, title, md, links, outFile });
          console.log(`Scraped ${i + 1}/${urls.length}: ${url}`);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          console.warn(`Skip (${i + 1}/${urls.length}) ${url}: ${msg}`);
        }
      }
    } finally {
      await browser.close();
    }
  } else {
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      try {
        const html = await fetchText(url);
        const title = extractTitle(html) || new URL(url).pathname;
        const md = htmlToMarkdown(html);
        const links = extractInternalLinks(html);
        const outFile = path.join(OUT_DIR, "pages", `${slugFromUrl(url)}.md`);
        pages.push({ url, title, md, links, outFile });
        console.log(`Scraped ${i + 1}/${urls.length}: ${url}`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`Skip (${i + 1}/${urls.length}) ${url}: ${msg}`);
      }
    }
  }

  // Write each page as its own file (local archive for RAG)
  for (const p of pages) {
    fs.writeFileSync(p.outFile, renderPageMarkdown(p) + "\n", "utf8");
  }

  const serviceUrls = pages.map((p) => p.url).filter(isLikelyServiceUrl);

  const indexLines = [
    "# DLUX TECH Website Content (RAG Export)",
    "",
    `Source: ${ORIGIN}`,
    `Generated: ${new Date().toISOString()}`,
    `Pages saved under: ${path.relative(process.cwd(), path.join(OUT_DIR, "pages")).replace(/\\/g, "/")}`,
    "",
    "## Service links",
    "",
    ...Array.from(new Set(serviceUrls)).sort().map((u) => `- ${u}`),
    "",
    "## All pages",
    "",
    ...pages
      .map((p) => `- ${p.title}: ${p.url}`)
      .sort((a, b) => a.localeCompare(b)),
    "",
  ];

  fs.writeFileSync(OUT_INDEX_MD, normalizeWhitespace(indexLines.join("\n")) + "\n", "utf8");
  console.log(`Wrote ${OUT_INDEX_MD}`);
  console.log(`Wrote ${pages.length} page files into ${path.join(OUT_DIR, "pages")}`);
  console.log("Next: npm run rag:ingest");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

