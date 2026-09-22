import { createHash } from "node:crypto";
import { z } from "zod";
import type { Resource } from "@/app/data";
import { canonicalUrl, resourceRequestSchema } from "@/lib/resources";
import { compareCoverage, durationSeconds, formatDuration, parseChapters, titleDifficulty, videoIdSchema, videoUrl, type YouTubeVideo } from "@/lib/youtube";
import { RequestError } from "./provider";

const snippetSchema = z.object({ title: z.string(), description: z.string().default(""), channelId: z.string().default(""), channelTitle: z.string().default(""), publishedAt: z.string().default("") });
const responseSchema = z.object({ items: z.array(z.object({
  id: z.union([z.string(), z.object({ videoId: z.string().optional(), channelId: z.string().optional(), playlistId: z.string().optional() })]),
  snippet: snippetSchema.optional(), contentDetails: z.object({ duration: z.string().optional(), itemCount: z.number().optional() }).optional(),
  status: z.object({ privacyStatus: z.string().optional(), uploadStatus: z.string().optional() }).optional(),
})).default([]) });
type YouTubeResponse = z.infer<typeof responseSchema>;
const cache = new Map<string, { expires: number; data: YouTubeResponse }>();

async function youtube(endpoint: "search" | "videos" | "channels" | "playlists", params: Record<string, string>, signal: AbortSignal): Promise<YouTubeResponse> {
  signal.throwIfAborted();
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new RequestError("Add YOUTUBE_API_KEY to .env.local and restart the server to enable YouTube discovery and comparison.", 503);
  const query = new URLSearchParams(params);
  const cacheKey = `${createHash("sha256").update(key).digest("hex").slice(0, 12)}:${endpoint}:${query}`;
  const hit = cache.get(cacheKey);
  if (hit && hit.expires > Date.now()) return hit.data;
  let response: Response;
  try {
    // Keep credentials in a server-only header, never in returned URLs or logs.
    response = await fetch(`https://www.googleapis.com/youtube/v3/${endpoint}?${query}`, { headers: { "X-Goog-Api-Key": key }, signal, cache: "no-store" });
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    throw new RequestError("Could not reach YouTube. Please retry in a moment.", 502);
  }
  const raw = await response.json().catch(() => null);
  if (!response.ok) {
    const reasons = (raw?.error?.errors || []).map((item: { reason?: string }) => item.reason || "").join(" ");
    if (/quotaExceeded|dailyLimitExceeded|rateLimitExceeded/i.test(reasons) || response.status === 429) throw new RequestError("The YouTube API quota has been reached. Your collected videos remain available; try again after the quota resets.", 429);
    if (response.status === 400 || response.status === 401 || response.status === 403) throw new RequestError("YouTube rejected the API request. Check that YOUTUBE_API_KEY is valid, YouTube Data API v3 is enabled, and the key permits requests from this server.", 503);
    throw new RequestError("YouTube could not complete this request. Please retry.", 502);
  }
  const parsed = responseSchema.safeParse(raw);
  if (!parsed.success) throw new RequestError("YouTube returned an incomplete response. Please retry.", 502);
  if (cache.size >= 100) cache.delete(cache.keys().next().value!);
  cache.set(cacheKey, { expires: Date.now() + 10 * 60 * 1000, data: parsed.data });
  return parsed.data;
}

export async function getVideos(ids: string[], signal: AbortSignal): Promise<YouTubeVideo[]> {
  if (!ids.length) return [];
  const unique = [...new Set(ids)];
  if (unique.length > 20 || unique.some(id => !videoIdSchema.safeParse(id).success)) throw new RequestError("Please choose valid YouTube videos.");
  const data = await youtube("videos", { part: "snippet,contentDetails,status", id: unique.join(",") }, signal);
  const videos = data.items.flatMap((item): YouTubeVideo[] => {
    if (typeof item.id !== "string" || !item.snippet || !item.contentDetails?.duration || item.status?.privacyStatus !== "public" || item.status?.uploadStatus !== "processed") return [];
    const seconds = durationSeconds(item.contentDetails.duration), info = item.snippet;
    return [{ id: item.id, title: info.title, channelId: info.channelId, channelTitle: info.channelTitle, description: info.description, publishedAt: info.publishedAt, durationSeconds: seconds, chapters: parseChapters(info.description, seconds) }];
  });
  return unique.flatMap(id => videos.filter(v => v.id === id));
}

export async function discoverWithYouTube(input: z.infer<typeof resourceRequestSchema>, signal: AbortSignal) {
  const kind = input.youtubeKind === "all" ? "video" : input.youtubeKind;
  const query = `${input.topicTitle} ${input.pathTitle === input.topicTitle ? "" : input.pathTitle} ${input.level === "All levels" ? "" : input.level} ${kind === "channel" ? "tutorials" : kind === "playlist" ? "course" : "tutorial"}`.trim().slice(0, 240);
  const search = await youtube("search", { part: "snippet", q: query, type: kind, maxResults: "20", order: "relevance" }, signal);
  const ids = search.items.flatMap(item => typeof item.id === "object" ? [item.id[`${kind}Id` as "videoId" | "channelId" | "playlistId"] || ""] : []).filter(Boolean);
  const excluded = new Set(input.excludeUrls.map(canonicalUrl));
  const checkedAt = new Date().toISOString();
  let resources: Resource[] = [];
  if (kind === "video") {
    const videos = await getVideos(ids, signal);
    resources = videos.map(v => {
      const url = videoUrl(v.id);
      return { id: `youtube-video-${v.id}`, type: "YouTube", title: v.title, author: v.channelTitle, meta: formatDuration(v.durationSeconds), level: titleDifficulty(v.title), url, art: "linear", youtubeKind: "video", youtube: { channelId: v.channelId, durationSeconds: v.durationSeconds, publishedAt: v.publishedAt }, reason: "Matched to this topic by YouTube search. Compare the creator’s chapter list before choosing.", provenance: { kind: "web-search", provider: "youtube", sourceTitle: v.title, sourceUrl: url, checkedAt } };
    });
  } else if (ids.length) {
    const details = await youtube(kind === "channel" ? "channels" : "playlists", { part: kind === "channel" ? "snippet" : "snippet,contentDetails", id: ids.join(",") }, signal);
    resources = details.items.flatMap((item): Resource[] => {
      if (typeof item.id !== "string" || !item.snippet) return [];
      const info = item.snippet, url = kind === "channel" ? `https://www.youtube.com/channel/${item.id}` : `https://www.youtube.com/playlist?list=${item.id}`;
      return [{ id: `youtube-${kind}-${item.id}`, type: "YouTube", title: info.title, author: kind === "channel" ? info.title : info.channelTitle, meta: kind === "channel" ? "YouTube channel" : `${item.contentDetails?.itemCount ?? 0} videos`, level: titleDifficulty(info.title), url, art: "linear", youtubeKind: kind, youtube: { channelId: kind === "channel" ? item.id : info.channelId, ...(item.contentDetails?.itemCount !== undefined ? { videoCount: item.contentDetails.itemCount } : {}) }, reason: info.description.slice(0, 200) || "Matched to this topic by YouTube search.", provenance: { kind: "web-search", provider: "youtube", sourceTitle: info.title, sourceUrl: url, checkedAt } }];
    });
  }
  return { resources: resources.filter(r => !excluded.has(canonicalUrl(r.url)) && (input.level === "All levels" || r.level === input.level)).slice(0, 6), note: "Difficulty is estimated only from explicit labels in the creator’s title. Unlabeled results appear under All levels." };
}

export async function findSimilarVideos(id: string, query: string | undefined, signal: AbortSignal) {
  const [base] = await getVideos([id], signal);
  if (!base) throw new RequestError("This video is unavailable or private. Choose another public video.", 404);
  const searchQuery = query || base.title.replace(/\([^)]*\)|\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim().slice(0, 160);
  const search = await youtube("search", { part: "snippet", q: searchQuery, type: "video", maxResults: "15", order: "relevance" }, signal);
  const ids = search.items.flatMap(item => typeof item.id === "object" && item.id.videoId && item.id.videoId !== id && item.snippet?.channelId !== base.channelId ? [item.id.videoId] : []);
  const candidates = (await getVideos(ids, signal)).filter(v => v.channelId !== base.channelId).slice(0, 6);
  return { base, candidates, query: searchQuery };
}
export async function compareVideos(ids: [string, string], concepts: string[], signal: AbortSignal) {
  const videos = await getVideos(ids, signal);
  if (videos.length !== 2) throw new RequestError("One of these videos is unavailable or private. Choose another public video.", 404);
  if (videos[0].channelId === videos[1].channelId) throw new RequestError("Choose a video from a different creator to compare perspectives.");
  return { videos: [videos[0], videos[1]], rows: compareCoverage(videos[0], videos[1], concepts) };
}
