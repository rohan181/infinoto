import test from "node:test";
import assert from "node:assert/strict";
import type { ContentBlock } from "@anthropic-ai/sdk/resources/messages";
import { createPath } from "../app/data";
import { curatedLibrary, resourcesForTopic } from "../lib/curated-resources";
import { balanceFormats, discoveryFilter, filterRecommendations, isResourceSaved, manualSearchUrl, resourceFormat } from "../lib/recommendations";
import { buildSourceResources, canonicalUrl, extractSources, mergeResources, resourceRecordSchema, resourceRequestSchema, youtubeKindForUrl } from "../lib/resources";

test("YouTube formats normalize tracking and channel tabs without mixing formats", () => {
  assert.equal(canonicalUrl("https://www.youtube.com/@coreyms/videos?view=0&sort=dd"), "https://youtube.com/@coreyms");
  assert.equal(canonicalUrl("https://m.youtube.com/%40coreyms/playlists"), "https://youtube.com/@coreyms");
  assert.equal(canonicalUrl("https://www.youtube.com/playlist?list=PL-osiE80TeTt2d9bfVyTiXJA-UTHn6WwU&utm_source=test"), "https://youtube.com/playlist?list=PL-osiE80TeTt2d9bfVyTiXJA-UTHn6WwU");
  assert.equal(youtubeKindForUrl("https://youtu.be/rfscVS0vtbw?si=tracking"), "video");
  assert.equal(youtubeKindForUrl("https://youtube.com/channel/UC8butISFwT-Wl7EV0hUK0BQ"), "channel");
  assert.equal(youtubeKindForUrl("https://youtube.com/results?search_query=python"), null);
  assert.equal(youtubeKindForUrl("https://youtube.com.evil.example/@coreyms"), null);
  const channel = curatedLibrary.find(r => r.id === "curated-corey-channel")!;
  assert.equal(resourceRecordSchema.safeParse({ ...channel, youtubeKind: "video" }).success, false);
  assert.equal(resourceRequestSchema.parse({ pathTitle: "Python", topicTitle: "Python", category: "YouTube", level: "Beginner" }).youtubeKind, "all");
});

test("only search evidence of the requested YouTube format reaches ranking", () => {
  const block: ContentBlock = { type: "web_search_tool_result", caller: { type: "direct" }, tool_use_id: "test", content: [
    "https://youtube.com/watch?v=rfscVS0vtbw", "https://youtube.com/@coreyms", "https://youtube.com/@coreyms/videos",
    "https://youtube.com/playlist?list=PL-osiE80TeTt2d9bfVyTiXJA-UTHn6WwU",
  ].map(url => ({ type: "web_search_result", url, title: "Source title", encrypted_content: "evidence", page_age: null })) };
  for (const format of ["Videos", "Channels", "Playlists"] as const) {
    const target = discoveryFilter(format);
    const { sources } = extractSources([block], target.category, [], target.youtubeKind);
    assert.equal(sources.length, 1);
    const input = resourceRequestSchema.parse({ pathTitle: "Python", topicTitle: "Python", level: "Intermediate", ...target });
    const resources = buildSourceResources({ resources: [{ sourceId: 0, level: "Intermediate", reason: "Assumes programming fundamentals.", authors: "Instructor", publisher: null, year: null, isbn: null }] }, sources, input);
    assert.equal(resourceFormat(resources[0]), format);
    assert.equal(resources[0].youtubeKind, target.youtubeKind);
    assert.equal(extractSources([block], target.category, [sources[0].url], target.youtubeKind).sources.length, 0);
  }
});

test("the curated catalog supplies real format-specific picks without API access", () => {
  const seen = new Set<string>();
  for (const resource of curatedLibrary) {
    assert.ok(resourceRecordSchema.safeParse(resource).success, resource.title);
    const key = `${resource.type}:${canonicalUrl(resource.url)}`;
    assert.ok(!seen.has(key), resource.title); seen.add(key);
    assert.equal(resource.provenance?.kind, "curated");
  }
  const path = createPath("Machine Learning");
  const python = resourcesForTopic(path.topics[1], path.title);
  for (const format of ["Videos", "Channels", "Playlists", "Blogs", "Books"] as const) assert.ok(filterRecommendations(python, format, "All levels").length, format);
  const specialized = { ...path.topics[1], title: "Quantum field theory", concepts: [], resources: [] };
  assert.deepEqual(resourcesForTopic(specialized), []);
  const related = resourcesForTopic(specialized, path.title);
  assert.ok(related.length > 0);
  assert.ok(related.every(r => r.matchContext === "path"));
});

test("format, difficulty and creator search compose; mixed picks preserve topic priority", () => {
  const path = createPath("Machine Learning");
  const picks = resourcesForTopic(path.topics[1], path.title);
  const blogs = filterRecommendations(picks, "Blogs", "Advanced", "python gil");
  assert.equal(blogs.length, 1); assert.equal(blogs[0].id, "curated-python-gil");
  assert.deepEqual(filterRecommendations(picks, "Videos", "Beginner", "doesnotexist"), []);
  const corey = filterRecommendations(picks, "Channels", "All levels", "Corey");
  assert.equal(corey.length, 1); assert.equal(corey[0].id, "curated-corey-channel");
  const balanced = balanceFormats(picks);
  assert.deepEqual(balanced.slice(0, 5).map(resourceFormat), ["Videos", "Channels", "Playlists", "Blogs", "Books"]);
  const firstBroader = balanced.findIndex(r => r.matchContext === "path");
  assert.ok(firstBroader > 0);
  assert.ok(balanced.slice(firstBroader).every(r => r.matchContext === "path"));
  assert.equal(balanced.length, picks.length);
});

test("rediscovery preserves bookmark identity and matches canonical URLs within each path", () => {
  const channel = curatedLibrary.find(r => r.id === "curated-corey-channel")!;
  const rediscovered = { ...channel, id: "fresh-id", url: `${channel.url}/videos?utm_source=test` };
  const merged = mergeResources([channel], [rediscovered]);
  assert.equal(merged.length, 1); assert.equal(merged[0].id, channel.id);
  const saved = [{ ...channel, id: `my-path:${channel.id}` }];
  assert.equal(isResourceSaved(saved, "my-path", rediscovered), true);
  assert.equal(isResourceSaved(saved, "another-path", rediscovered), false);
  const fallback = new URL(manualSearchUrl("C++ & Python", "Channels", "Advanced"));
  assert.equal(fallback.searchParams.get("search_query"), "C++ & Python Advanced Channels");
  assert.equal(resourceRecordSchema.safeParse({ ...channel, url: fallback.href }).success, false);
});

test("newly discovered sources are visible before older picks in their format", () => {
  const blog = curatedLibrary.find(r => r.id === "curated-python-gil")!;
  const older = { ...blog, id: "older", provenance: { ...blog.provenance!, kind: "web-search" as const, checkedAt: "2026-09-21T00:00:00.000Z" } };
  const newest = { ...older, id: "newest", provenance: { ...older.provenance, checkedAt: "2026-09-22T00:00:00.000Z" } };
  assert.deepEqual(filterRecommendations([blog, older, newest], "Blogs", "Advanced").map(r => r.id), ["newest", "older", blog.id]);
});
