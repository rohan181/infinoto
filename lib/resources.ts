import { z } from "zod";
import type { ContentBlock } from "@anthropic-ai/sdk/resources/messages";
import type { Resource, ResourceType } from "@/app/data";
import { difficultySchema } from "./learning";

export const resourceTypeSchema = z.enum(["YouTube", "Blogs", "Books", "Papers", "Other"]);
export const resourceRecordSchema = z.object({
  id: z.string(), type: resourceTypeSchema, title: z.string().min(1), author: z.string(),
  meta: z.string(), level: difficultySchema, url: z.string(), art: z.string(), reason: z.string().optional(),
  provenance: z.object({ kind: z.enum(["curated", "web-search"]), sourceTitle: z.string(), sourceUrl: z.string(), checkedAt: z.string().datetime() }),
  book: z.object({ authors: z.string(), publisher: z.string().optional(), year: z.string().optional(), isbn: z.string().optional() }).optional(),
}).refine(r => isDirectResourceUrl(r.url, r.type) && canonicalUrl(r.url) === canonicalUrl(r.provenance.sourceUrl), "A resource must match its direct source link.");
export const resourceRequestSchema = z.object({
  pathTitle: z.string().trim().min(1).max(100), topicTitle: z.string().trim().min(1).max(100),
  description: z.string().max(500).default(""), concepts: z.array(z.string().max(100)).max(6).default([]),
  category: resourceTypeSchema, level: z.enum(["All levels", "Beginner", "Intermediate", "Advanced"]),
  excludeUrls: z.array(z.string().max(2000)).max(90).default([]),
});

export type SourceRecord = { id: number; url: string; title: string; excerpt: string };
export const rankedSourcesSchema = z.object({
  resources: z.array(z.object({
    sourceId: z.number().int().min(0), level: difficultySchema,
    reason: z.string().min(1).max(220),
    authors: z.string().max(160).nullable(), publisher: z.string().max(100).nullable(),
    year: z.string().max(12).nullable(), isbn: z.string().max(20).nullable(),
  })).max(6),
});

export function canonicalUrl(input: string): string | null {
  try {
    const url = new URL(input);
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return null;
    if (!url.hostname.includes(".") || /^(?:\d+\.){3}\d+$/.test(url.hostname) || /(?:localhost|\.local|\.internal|\.test)$/.test(url.hostname) || url.hostname.includes(":")) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) if (/^utm_|^(fbclid|gclid|si|feature)$/i.test(key)) url.searchParams.delete(key);
    url.hostname = url.hostname.replace(/^www\./, "");
    if (url.hostname === "youtu.be") { const id = url.pathname.slice(1); if (/^[\w-]{11}$/.test(id)) return `https://youtube.com/watch?v=${id}`; }
    if (url.hostname === "youtube.com" && url.pathname === "/watch") {
      const id = url.searchParams.get("v");
      if (/^[\w-]{11}$/.test(id || "")) return `https://youtube.com/watch?v=${id}`;
    }
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/$/, "");
    url.searchParams.sort();
    return url.toString();
  } catch { return null; }
}

export function isDirectResourceUrl(raw: string, category?: ResourceType): boolean {
  const normalized = canonicalUrl(raw);
  if (!normalized) return false;
  const url = new URL(normalized), host = url.hostname;
  if (/^(?:www\.)?(?:google\.[a-z.]+|bing\.com|duckduckgo\.com|search\.yahoo\.com|scholar\.google\.com)$/.test(host)) return false;
  if (/\/(?:search|results)(?:\/|$)/i.test(url.pathname) || url.searchParams.has("search_query")) return false;
  const youtube = /^(?:m\.)?youtube\.com$/.test(host);
  if (category === "YouTube") return youtube && ((url.pathname === "/watch" && /^[\w-]{11}$/.test(url.searchParams.get("v") || "")) || (url.pathname === "/playlist" && /^[\w-]{12,}$/.test(url.searchParams.get("list") || "")));
  if (youtube || host === "youtu.be") return !category;
  if (category === "Blogs" && (url.pathname === "/" || /arxiv\.org$/.test(host))) return false;
  return true;
}

/** Only provider search-result blocks supply URLs. Assistant prose never creates source evidence. */
export function extractSources(blocks: ContentBlock[], category: ResourceType, exclude: string[] = []): { sources: SourceRecord[]; toolErrors: string[] } {
  const excluded = new Set(exclude.map(canonicalUrl));
  const found = new Map<string, SourceRecord>();
  const toolErrors: string[] = [];
  for (const block of blocks) {
    if (block.type !== "web_search_tool_result") continue;
    if (!Array.isArray(block.content)) { toolErrors.push(block.content.error_code); continue; }
    for (const result of block.content) {
      const url = canonicalUrl(result.url);
      if (!url || excluded.has(url) || found.has(url) || !isDirectResourceUrl(url, category)) continue;
      found.set(url, { id: found.size, url, title: result.title.slice(0, 220), excerpt: "" });
    }
  }
  for (const block of blocks) {
    if (block.type !== "text") continue;
    for (const citation of block.citations || []) {
      if (citation.type !== "web_search_result_location") continue;
      const source = found.get(canonicalUrl(citation.url) || "");
      if (source && !source.excerpt) source.excerpt = citation.cited_text.slice(0, 150);
    }
  }
  return { sources: [...found.values()].slice(0, 30), toolErrors };
}

export function buildSourceResources(raw: unknown, sources: SourceRecord[], request: z.infer<typeof resourceRequestSchema>): Resource[] {
  const ranked = rankedSourcesSchema.parse(raw);
  const used = new Set<number>();
  return ranked.resources.flatMap((item): Resource[] => {
    if (used.has(item.sourceId)) return [];
    used.add(item.sourceId);
    const source = sources.find(s => s.id === item.sourceId);
    // Reject fabricated source IDs instead of quietly presenting a hallucinated recommendation.
    if (!source) throw new Error("A recommendation does not match a retrieved source.");
    if (request.level !== "All levels" && item.level !== request.level) return [];
    if (!isDirectResourceUrl(source.url, request.category)) throw new Error("The recommendation is not a direct source link.");
    const domain = new URL(source.url).hostname;
    return [{
      id: `source-${crypto.randomUUID()}`, type: request.category, title: source.title,
      author: item.authors || domain, meta: request.category === "Books" ? "Book reference" : "Direct source",
      level: item.level, url: source.url, art: "linear", reason: item.reason,
      provenance: { kind: "web-search", sourceTitle: source.title, sourceUrl: source.url, checkedAt: new Date().toISOString() },
      ...(request.category === "Books" ? { book: { authors: item.authors || "See source for author details", ...(item.publisher ? { publisher: item.publisher } : {}), ...(item.year ? { year: item.year } : {}), ...(/^\d[\d -]{8,18}[\dX]$/.test(item.isbn || "") ? { isbn: item.isbn! } : {}) } } : {}),
    }];
  });
}

export function mergeResources(existing: Resource[], additions: Resource[]): Resource[] {
  const index = new Map<string, Resource>();
  for (const item of [...existing, ...additions]) {
    const url = canonicalUrl(item.url);
    if (url) index.set(`${item.type}:${url}`, item);
  }
  return [...index.values()];
}
