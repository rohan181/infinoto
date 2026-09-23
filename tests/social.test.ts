import test from "node:test";
import assert from "node:assert/strict";
import type Anthropic from "@anthropic-ai/sdk";
import { socialSource, socialDomains, socialPlatforms, matchesSocialPlatform } from "../lib/social";
import { canonicalUrl, isDirectResourceUrl, mergeResources, resourceRecordSchema, resourceRequestSchema } from "../lib/resources";
import { buildExaResources, exaSearchRequest } from "../lib/server/exa";
import { discoverResources } from "../lib/server/discovery";
import { analysisRequestSchema } from "../lib/content-analysis";
import { filterRecommendations, discoveryFilter, manualSearchUrl } from "../lib/recommendations";
import { createPath } from "../app/data";
import { resourcesForTopic } from "../lib/curated-resources";

const urls = [
  "https://reddit.com/r/learnpython/comments/abc123/python_generators/",
  "https://x.com/pythondev/status/123456789",
  "https://linkedin.com/posts/pythondev_python-generators-activity-123456789-abcd",
  "https://instagram.com/reel/ABC_123/",
  "https://tiktok.com/@pythondev/video/123456789",
];
const input = (socialPlatform: string = "All") => resourceRequestSchema.parse({ provider: "exa", pathTitle: "Python", topicTitle: "Python generators", category: "Social", socialPlatform, level: "All levels" });
const raw = (links = urls) => ({ results: links.map(url => ({ url, title: "Python generators explained", highlights: ["Python generators yield one value at a time."] })), output: { content: { matches: links.map(url => ({ url, level: "Intermediate", reason: "Explains Python generators.", authors: "Python creator" })) } } });

test("social links cover all five platforms and reject unrelated, login and search destinations", () => {
  urls.forEach((url, i) => { assert.equal(socialSource(url)?.platform, socialPlatforms[i]); assert.ok(isDirectResourceUrl(url, "Social")); });
  for (const url of ["https://reddit.com/r/learnpython", "https://x.com/pythondev", "https://linkedin.com/in/pythondev", "https://instagram.com/pythondev", "https://tiktok.com/@pythondev"]) assert.ok(socialSource(url), url);
  for (const url of ["https://evilreddit.com/r/learnpython", "https://x.com.evil.com/pythondev", "https://x.com/login", "https://x.com/search?q=python", "https://instagram.com/accounts/login", "https://instagram.com/explore", "https://tiktok.com/search", "https://linkedin.com/redirect", "https://reddit.com", "http://x.com/pythondev", "https://user:pass@x.com/pythondev", "https://x.com:444/pythondev", "https://example.com/python"]) assert.equal(isDirectResourceUrl(url, "Social"), false, url);
  assert.equal(canonicalUrl("https://twitter.com/pythondev/status/123456789?utm_source=test"), urls[1]);
  assert.equal(matchesSocialPlatform(urls[0], "X"), false);
  assert.equal(resourceRequestSchema.safeParse({ ...input(), socialPlatform: "Facebook" }).success, false);
  assert.equal(resourceRequestSchema.safeParse({ ...input(), provider: "youtube" }).success, false);
});

test("Exa social search applies approved platform domains and filters both ranked and raw results", () => {
  assert.deepEqual(exaSearchRequest(input()).includeDomains, socialDomains());
  assert.deepEqual(exaSearchRequest(input("X")).includeDomains, ["x.com", "twitter.com"]);
  assert.match(exaSearchRequest(input("Instagram")).query, /Python generators/);
  assert.doesNotMatch(exaSearchRequest(input()).query, /Reddit|LinkedIn|Instagram|TikTok/);
  const all = buildExaResources(raw(), input());
  assert.equal(all.length, 5);
  assert.ok(all.every(r => resourceRecordSchema.safeParse(r).success));
  for (const platform of socialPlatforms) {
    const ranked = buildExaResources(raw(), input(platform));
    const fallback = buildExaResources({ results: raw().results }, input(platform));
    assert.equal(ranked.length, 1); assert.equal(fallback.length, 1);
    assert.equal(socialSource(ranked[0].url)?.platform, platform);
    assert.equal(fallback[0].level, "Not assessed");
  }
  const reddit = [1, 2, 3].map(i => `https://reddit.com/r/python/comments/abc${i}/generators`);
  assert.equal(buildExaResources(raw(reddit), input("Reddit")).length, 3);
  const invented = raw(); invented.output.content.matches.push({ ...invented.output.content.matches[0], url: "https://x.com/invented/status/999" });
  assert.equal(buildExaResources(invented, input()).length, 5);
  assert.equal(buildExaResources(raw(), { ...input(), excludeUrls: urls }).length, 0);
});

test("social resources persist, stay in their format and participate in cross-content analysis", () => {
  const cards = buildExaResources(raw(), input());
  assert.equal(filterRecommendations(cards, "Social", "All levels").length, 5);
  assert.equal(filterRecommendations(cards, "Blogs", "All levels").length, 0);
  assert.equal(discoveryFilter("Social").category, "Social");
  assert.match(decodeURIComponent(manualSearchUrl("Python generators", "Social", "All levels", "TikTok")), /site:tiktok.com/);
  assert.equal(mergeResources(cards, cards).length, 5);
  const topic = { ...createPath("Python").topics[1], resources: JSON.parse(JSON.stringify(cards)) };
  assert.equal(resourcesForTopic(topic).filter(r => r.type === "Social").length, 5);
  assert.ok(analysisRequestSchema.safeParse({ topic: "Python generators", sources: cards.slice(0, 2).map(r => ({ url: r.url, title: r.title, type: r.type, text: "A generator yields values lazily." })) }).success);
});

test("Claude restricts search and ranking to the selected social platform", async () => {
  let searched = false;
  const client = { messages: {
    create: async (request: { tools: Array<{ allowed_domains: string[] }> }) => {
      assert.deepEqual(request.tools[0].allowed_domains, ["instagram.com"]); searched = true;
      return { stop_reason: "end_turn", content: [{ type: "web_search_tool_result", content: urls.map(url => ({ url, title: "Python generators" })) }] };
    },
    parse: async (request: { messages: Array<{ content: string }> }) => {
      const context = JSON.parse(request.messages[0].content);
      assert.equal(context.sources.length, 1); assert.equal(context.sources[0].url, canonicalUrl(urls[3]));
      return { stop_reason: "end_turn", parsed_output: { resources: [{ sourceId: context.sources[0].id, level: "Intermediate", reason: "Python generators explained", authors: null, publisher: null, year: null, isbn: null }] } };
    },
  } } as unknown as Anthropic;
  const result = await discoverResources(client, "test-model", { ...input("Instagram"), provider: "claude" }, new AbortController().signal);
  assert.ok(searched); assert.equal(result.resources.length, 1);
  assert.equal(socialSource(result.resources[0].url)?.platform, "Instagram");
});
