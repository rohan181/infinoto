import type { Difficulty, Resource, ResourceType, YouTubeKind } from "@/app/data";
import { canonicalUrl, youtubeKindForUrl } from "./resources";

export const formats = ["All", "Videos", "Channels", "Playlists", "Blogs", "Books", "Papers", "Courses"] as const;
export type RecommendationFormat = typeof formats[number];
export type RecommendationLevel = "All levels" | Difficulty;
export function resourceFormat(resource: Resource): Exclude<RecommendationFormat, "All"> {
  if (resource.type !== "YouTube") return resource.type === "Other" ? "Courses" : resource.type;
  const kind = youtubeKindForUrl(resource.url);
  return kind === "channel" ? "Channels" : kind === "playlist" ? "Playlists" : "Videos";
}
export function discoveryFilter(format: RecommendationFormat): { category: ResourceType; youtubeKind: YouTubeKind | "all" } {
  if (["All", "Videos", "Channels", "Playlists"].includes(format)) return { category: "YouTube", youtubeKind: format === "Channels" ? "channel" : format === "Playlists" ? "playlist" : format === "Videos" ? "video" : "all" };
  return { category: format === "Courses" ? "Other" : format as ResourceType, youtubeKind: "all" };
}
export function filterRecommendations(resources: Resource[], format: RecommendationFormat, level: RecommendationLevel, query = ""): Resource[] {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return resources.filter(r => (format === "All" || resourceFormat(r) === format) && (level === "All levels" || r.level === level)
    && terms.every(term => `${r.title} ${r.author} ${r.reason || ""}`.toLowerCase().includes(term)))
    .sort((a, b) => Number(a.matchContext === "path") - Number(b.matchContext === "path")
      || Number(b.provenance?.kind === "web-search") - Number(a.provenance?.kind === "web-search")
      || (a.provenance?.kind === "web-search" && b.provenance?.kind === "web-search" ? b.provenance.checkedAt.localeCompare(a.provenance.checkedAt) : 0));
}
export function balanceFormats(resources: Resource[]): Resource[] {
  const distribute = (items: Resource[]) => {
    const queues = formats.filter(f => f !== "All").map(format => items.filter(r => resourceFormat(r) === format));
    const result: Resource[] = [];
    while (queues.some(q => q.length)) for (const queue of queues) { const item = queue.shift(); if (item) result.push(item); }
    return result;
  };
  return [...distribute(resources.filter(r => r.matchContext !== "path")), ...distribute(resources.filter(r => r.matchContext === "path"))];
}
export function isResourceSaved(resources: Resource[], pathId: string, resource: Resource): boolean {
  return resources.some(item => item.id.startsWith(`${pathId}:`) && (item.id === `${pathId}:${resource.id}` || (item.type === resource.type && canonicalUrl(item.url) === canonicalUrl(resource.url))));
}
export function manualSearchUrl(topic: string, format: RecommendationFormat, level: RecommendationLevel): string {
  const query = [topic, level === "All levels" ? "" : level, format === "All" ? "learning resources" : format].filter(Boolean).join(" ");
  return ["Videos", "Channels", "Playlists"].includes(format) ? `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}` : `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}
