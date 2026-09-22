import { z } from "zod";

export const videoIdSchema = z.string().regex(/^[\w-]{11}$/);
export const youtubeRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("similar"), videoId: videoIdSchema, query: z.string().trim().min(2).max(160).optional() }),
  z.object({ action: z.literal("compare"), videoIds: z.tuple([videoIdSchema, videoIdSchema]).refine(ids => ids[0] !== ids[1]), concepts: z.array(z.string().trim().min(2).max(100)).max(6).default([]) }),
]);
export const chapterSchema = z.object({ title: z.string(), seconds: z.number().nonnegative() });
export const videoSchema = z.object({
  id: videoIdSchema, title: z.string(), channelId: z.string(), channelTitle: z.string(),
  description: z.string(), publishedAt: z.string(), durationSeconds: z.number().nonnegative(),
  chapters: z.array(chapterSchema),
});
export type YouTubeVideo = z.infer<typeof videoSchema>;
export type Chapter = z.infer<typeof chapterSchema>;
const evidenceSchema = z.object({ label: z.string(), kind: z.enum(["chapter", "description"]), seconds: z.number().nonnegative().optional() });
export const coverageRowSchema = z.object({ topic: z.string(), left: evidenceSchema.nullable(), right: evidenceSchema.nullable() });
export type CoverageRow = z.infer<typeof coverageRowSchema>;
export const comparisonSchema = z.object({ videos: z.tuple([videoSchema, videoSchema]), rows: z.array(coverageRowSchema) });
export const similarSchema = z.object({ base: videoSchema, candidates: z.array(videoSchema), query: z.string() });

export function parseVideoId(value: string): string | null {
  const input = value.trim();
  if (videoIdSchema.safeParse(input).success) return input;
  try {
    const url = new URL(input);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    const host = url.hostname.replace(/^(?:www\.|m\.)/, "");
    const id = host === "youtu.be" ? url.pathname.slice(1) : host === "youtube.com" ? (url.pathname === "/watch" ? url.searchParams.get("v") : /^\/(?:shorts|live|embed)\//.test(url.pathname) ? url.pathname.split("/")[2] : null) : null;
    return videoIdSchema.safeParse(id).success ? id : null;
  } catch { return null; }
}
export const videoUrl = (id: string, seconds?: number) => `https://www.youtube.com/watch?v=${id}${seconds !== undefined ? `&t=${Math.floor(seconds)}s` : ""}`;
export function durationSeconds(value: string): number {
  const match = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value);
  return match ? Number(match[1] || 0) * 86400 + Number(match[2] || 0) * 3600 + Number(match[3] || 0) * 60 + Number(match[4] || 0) : 0;
}
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds % 3600 / 60), rest = Math.floor(seconds % 60);
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}` : `${minutes}:${String(rest).padStart(2, "0")}`;
}
export function parseChapters(description: string, duration: number): Chapter[] {
  const chapters = new Map<number, Chapter>();
  for (const line of description.split("\n")) {
    // Creators often prefix their markers with stars, emoji, or lesson numbers.
    const clean = line.replace(/^[\s\p{So}\p{Sk}\p{M}•*#-]+/u, "").replace(/^\d+[.)]\s+/, "");
    const match = /^[([]?(\d{1,3}:\d{2}(?::\d{2})?)[)\]]?\s*[-–—:|]?\s+(.+?)\s*$/.exec(clean);
    if (!match) continue;
    const parts = match[1].split(":").map(Number);
    if (parts.slice(1).some(n => n >= 60)) continue;
    const seconds = parts.reduce((total, n) => total * 60 + n, 0);
    const title = match[2].trim();
    if (!title || /https?:\/\//.test(title) || (duration > 0 && seconds >= duration)) continue;
    if (!chapters.has(seconds)) chapters.set(seconds, { title: title.slice(0, 180), seconds });
  }
  return [...chapters.values()].sort((a, b) => a.seconds - b.seconds).slice(0, 120);
}

/** YouTube has no difficulty field. Only explicit title labels are treated as estimates. */
export function titleDifficulty(title: string): "Beginner" | "Intermediate" | "Advanced" | "Not assessed" {
  const labels = [ /\bbeginners?\b|\bfor absolute beginners\b/i.test(title), /\bintermediate\b/i.test(title), /\badvanced\b/i.test(title) ];
  return labels.filter(Boolean).length === 1 ? (["Beginner", "Intermediate", "Advanced"] as const)[labels.indexOf(true)] : "Not assessed";
}
function normalizeTopic(value: string) {
  return value.toLowerCase().normalize("NFKC").replace(/^(?:\d+[.)]\s*|introduction to\s+|intro to\s+|working with\s+|understanding\s+|using\s+|receiving\s+|the\s+)/g, "").replace(/\(\)\s+function\b/g, "").replace(/[^\p{L}\p{N}+#]+/gu, " ").trim();
}
function chapterWords(value: string) {
  return new Set(normalizeTopic(value).split(" ").filter(Boolean).map(word => {
    if (word === "intro") return "introduction";
    if (word.length > 4 && /ies$/.test(word)) return word.replace(/ies$/, "y");
    if (/(?:sses|ches|shes|xes)$/.test(word)) return word.slice(0, -2);
    if (word.length > 4 && /s$/.test(word) && !/(?:ss|us|is|ics|news|series|species)$/.test(word)) return word.slice(0, -1);
    return word;
  }));
}
export function chapterMatch(a: string, b: string): boolean {
  const x = chapterWords(a), y = chapterWords(b);
  if (!x.size || !y.size) return false;
  const common = [...x].filter(w => y.has(w)).length;
  if (common === x.size && common === y.size) return true;
  return common >= 2 && common / new Set([...x, ...y]).size >= 0.75;
}
function descriptionEvidence(video: YouTubeVideo, concept: string): CoverageRow["left"] {
  const normalized = normalizeTopic(concept);
  if (!normalized) return null;
  // Chapter markers are matched above; don't count the same marker again as prose evidence.
  const line = video.description.split("\n").find(text => !/https?:\/\/|\d{1,3}:\d{2}/.test(text) && (` ${normalizeTopic(text)} `).includes(` ${normalized} `));
  return line ? { kind: "description", label: line.trim().slice(0, 280) } : null;
}
/** Conservative text matching, not a claim that a video's full contents were analyzed. */
export function compareCoverage(left: YouTubeVideo, right: YouTubeVideo, concepts: string[] = []): CoverageRow[] {
  const rows: CoverageRow[] = [];
  const usedRight = new Set<number>();
  for (const chapter of left.chapters) {
    const index = right.chapters.findIndex((other, i) => !usedRight.has(i) && chapterMatch(chapter.title, other.title));
    if (index >= 0) usedRight.add(index);
    rows.push({ topic: chapter.title, left: { kind: "chapter", label: chapter.title, seconds: chapter.seconds }, right: index >= 0 ? { kind: "chapter", label: right.chapters[index].title, seconds: right.chapters[index].seconds } : descriptionEvidence(right, chapter.title) });
  }
  right.chapters.forEach((chapter, i) => {
    if (!usedRight.has(i)) rows.push({ topic: chapter.title, left: descriptionEvidence(left, chapter.title), right: { kind: "chapter", label: chapter.title, seconds: chapter.seconds } });
  });
  for (const concept of concepts) {
    if (rows.some(row => chapterMatch(row.topic, concept))) continue;
    const a = descriptionEvidence(left, concept), b = descriptionEvidence(right, concept);
    if (a || b) rows.push({ topic: concept, left: a, right: b });
  }
  return rows;
}
