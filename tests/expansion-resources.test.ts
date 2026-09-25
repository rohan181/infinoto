import test from "node:test";
import assert from "node:assert/strict";
import type { ContentBlock } from "@anthropic-ai/sdk/resources/messages";
import { createPath, type LearningPath } from "../app/data";
import { appendBranch, createBranchTopics, expandRequestSchema, layoutLearningPath, outlineParent } from "../lib/branches";
import { isLearningPath } from "../lib/learning";
import { buildSourceResources, canonicalUrl, extractSources, isDirectResourceUrl, mergeResources, resourceRecordSchema, resourceRequestSchema } from "../lib/resources";
import { resourcesForTopic } from "../lib/curated-resources";
import { POST as expand } from "../app/api/expand/route";
import { POST as discover } from "../app/api/resources/route";

const context = (path = createPath("Machine Learning"), topicId = "1") => expandRequestSchema.parse({ pathTitle: path.title, topicId, level: "Advanced", focus: "Internals", topics: path.topics });
function branch(parent = "1", prefix = "new") {
  return { summary: "Explore advanced internals.", topics: [0, 1, 2].map(i => ({
    id: `${prefix}-${i}`, title: `${prefix} Python internals ${i}`, description: "Study the mechanism through practical experiments.",
    difficulty: "Advanced", hours: 4, prerequisites: [i === 2 ? `${prefix}-0` : parent], concepts: ["Implementation", "Practice"],
  })) };
}
function checkLayout(path: LearningPath) {
  const occupied = new Set<string>();
  for (const topic of path.topics) {
    assert.ok(!occupied.has(`${topic.x}:${topic.y}`)); occupied.add(`${topic.x}:${topic.y}`);
    for (const id of topic.prerequisites) {
      const parent = path.topics.find(t => t.id === id)!;
      assert.ok(parent.y < topic.y); assert.ok(parent.children.includes(topic.id));
    }
  }
}

test("expands sections recursively without losing IDs, resources, or prerequisite order", () => {
  const initial = layoutLearningPath(createPath("Machine Learning"));
  initial.topics[1].resources = resourcesForTopic(initial.topics[1]);
  const first = createBranchTopics(branch(), context(initial));
  const expanded = appendBranch(initial, "1", first);
  const nested = createBranchTopics(branch(first[0].id, "nested"), context(expanded, first[0].id));
  const final = appendBranch(expanded, first[0].id, nested);
  assert.equal(initial.topics.length, 13); assert.equal(final.topics.length, 19);
  assert.deepEqual(final.topics[1].resources, initial.topics[1].resources);
  assert.deepEqual(final.topics.slice(0, 13).map(t => t.id), initial.topics.map(t => t.id));
  assert.equal(outlineParent(first[2]), first[0].id);
  assert.equal(outlineParent(nested[0]), first[0].id);
  assert.ok(isLearningPath(final)); checkLayout(final);
});

test("rejects repeated, disconnected, cyclic, and wrong-level branches", () => {
  const ctx = context();
  const duplicate = branch(); duplicate.topics[0].title = ctx.topics[0].title;
  assert.throws(() => createBranchTopics(duplicate, ctx), /repeats/);
  const forward = branch(); forward.topics[0].prerequisites = ["new-2"];
  assert.throws(() => createBranchTopics(forward, ctx), /earlier/);
  const unrelated = branch(); unrelated.topics[0].prerequisites = ["2"];
  assert.throws(() => createBranchTopics(unrelated, ctx), /earlier/);
  const wrongLevel = branch(); wrongLevel.topics[0].difficulty = "Beginner";
  assert.throws(() => createBranchTopics(wrongLevel, ctx), /difficulty/);
  const cycle = createPath("Machine Learning"); cycle.topics[0].prerequisites = ["1"];
  assert.throws(() => layoutLearningPath(cycle), /root|cycle/);
});

test("large maps reload and stay within the topic capacity", () => {
  let path = createPath("Machine Learning");
  while (path.topics.length < 115) {
    const additions = createBranchTopics(branch("1", `round-${path.topics.length}`), context(path));
    path = appendBranch(path, "1", additions);
  }
  assert.ok(isLearningPath(JSON.parse(JSON.stringify(path)))); checkLayout(path);
  assert.equal(expandRequestSchema.safeParse({ ...context(path), topics: [...path.topics, ...path.topics.slice(0, 4)] }).success, false);
});

const searchBlock = (urls: Array<[string, string]>): ContentBlock => ({ type: "web_search_tool_result", caller: { type: "direct" }, tool_use_id: "srvtoolu_test", content: urls.map(([url, title]) => ({ type: "web_search_result", url, title, encrypted_content: "encrypted-test-evidence", page_age: null })) });
const resourceInput = () => resourceRequestSchema.parse({ pathTitle: "Python", topicTitle: "Python", category: "YouTube", level: "Advanced" });
const rank = (sourceId = 0, level = "Advanced") => ({ resources: [{ sourceId, level, reason: "Requires generators and concurrency knowledge.", authors: "David Beazley", publisher: null, year: null, isbn: null }] });

test("resource evidence comes only from real tool results, not model-authored URLs", () => {
  const blocks: ContentBlock[] = [
    { type: "text", text: "Try https://youtube.com/watch?v=ZZZZZZZZZZZ", citations: [] },
    searchBlock([["https://www.youtube.com/results?search_query=python", "Search"], ["https://www.youtube.com/watch?v=MCs5OvhV9S4&utm_source=test", "Python concurrency"], ["https://youtu.be/MCs5OvhV9S4", "Duplicate"]]),
  ];
  const { sources } = extractSources(blocks, "YouTube");
  assert.equal(sources.length, 1); assert.equal(sources[0].url, "https://youtube.com/watch?v=MCs5OvhV9S4");
  const resources = buildSourceResources(rank(), sources, resourceInput());
  assert.equal(resources[0].title, "Python concurrency"); assert.equal(resources[0].provenance?.kind, "web-search");
  assert.throws(() => buildSourceResources(rank(99), sources, resourceInput()), /retrieved source/);
  assert.deepEqual(buildSourceResources(rank(0, "Beginner"), sources, resourceInput()), []);
  assert.equal(extractSources(blocks, "YouTube", [resources[0].url]).sources.length, 0);
  assert.equal(mergeResources(resources, resources).length, 1);
});

test("direct URLs reject searches, script schemes, and private destinations", () => {
  for (const url of ["javascript:alert(1)", "http://example.com/a", "https://127.0.0.1/a", "https://localhost/a", "https://test.internal/a", "https://example.com/search?q=python", "https://google.com/search?q=python"]) assert.equal(isDirectResourceUrl(url, "Blogs"), false, url);
  assert.equal(isDirectResourceUrl("https://youtube.com/@channel", "YouTube", "channel"), true);
  assert.equal(isDirectResourceUrl("https://youtube.com/@channel", "YouTube", "video"), false);
  assert.equal(isDirectResourceUrl("https://realpython.com/", "Blogs"), false);
  assert.equal(canonicalUrl("https://www.realpython.com/python-gil/?utm_source=test#intro"), "https://realpython.com/python-gil");
});

test("book references retain supported metadata and starter sources have direct links", () => {
  const input = resourceRequestSchema.parse({ ...resourceInput(), category: "Books" });
  const { sources } = extractSources([searchBlock([["https://www.fluentpython.com/", "Fluent Python"]])], "Books");
  const ranked = rank(); ranked.resources[0].authors = "Luciano Ramalho";
  const books = buildSourceResources(ranked, sources, input);
  assert.equal(books[0].book?.authors, "Luciano Ramalho"); assert.equal(books[0].book?.isbn, undefined);
  const path = createPath("Machine Learning");
  for (const topic of path.topics) for (const resource of resourcesForTopic(topic)) assert.ok(resourceRecordSchema.safeParse(resource).success, resource.title);
  const python = resourcesForTopic(path.topics[1]);
  for (const type of ["YouTube", "Blogs", "Books"]) assert.equal(new Set(python.filter(r => r.type === type).map(r => r.level)).size, 3);
  assert.ok(resourcesForTopic({ ...path.topics[1], title: "Python bytecode specialization" }).length > 0);
});

const req = (body: unknown, origin = "http://localhost:3000") => new Request("http://localhost:3000/api/resources", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
const response = (content: ContentBlock[], stop_reason = "end_turn") => Response.json({ id: "msg_test", type: "message", role: "assistant", model: "claude-sonnet-4-6", content, stop_reason, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 100 } });

test("new routes validate requests, expand recursively, search with citations, and rank separately", async () => {
  assert.equal((await expand(req({}))).status, 400);
  assert.equal((await discover(req(resourceInput(), "https://unrelated.example"))).status, 403);
  assert.equal((await discover(req({ ...resourceInput(), category: "Unknown" }))).status, 400);
  const originalFetch = globalThis.fetch, originalKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "unit-test-placeholder";
  let mode = "branch", searches = 0, rankings = 0;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    if (mode === "auth") return Response.json({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }, { status: 401 });
    if (mode === "branch") return response([{ type: "text", text: JSON.stringify(branch()), citations: [] }]);
    if (body.tools) {
      searches++; assert.equal(body.output_config, undefined);
      assert.equal(body.tools[0].type, "web_search_20250305");
      if (mode === "channels") {
        assert.match(body.messages[0].content, /educational YouTube CHANNELS/);
        return response([searchBlock([["https://youtube.com/watch?v=MCs5OvhV9S4", "Video to exclude"], ["https://youtube.com/@coreyms", "Corey Schafer"]])]);
      }
      if (mode === "search-error") return response([{ type: "web_search_tool_result", caller: { type: "direct" }, tool_use_id: "srvtoolu_test", content: { type: "web_search_tool_result_error", error_code: "too_many_requests" } }]);
      if (mode === "pause" && searches === 1) return response([searchBlock([["https://www.youtube.com/watch?v=MCs5OvhV9S4", "Python Concurrency from the Ground Up"]])], "pause_turn");
      if (mode === "pause") assert.equal(body.messages[1].content[0].content[0].encrypted_content, "encrypted-test-evidence");
      return response([searchBlock([["https://www.youtube.com/watch?v=MCs5OvhV9S4", "Python Concurrency from the Ground Up"]])]);
    }
    rankings++; assert.ok(body.output_config.format); assert.equal(body.tools, undefined);
    if (mode === "channels") {
      const context = JSON.parse(body.messages[0].content);
      assert.equal(context.youtubeKind, "channel"); assert.equal(context.sources.length, 1);
      assert.equal(context.sources[0].url, "https://youtube.com/@coreyms");
    }
    return response([{ type: "text", text: JSON.stringify(rank()), citations: [] }]);
  };
  try {
    const expanded = await expand(req(context())); assert.equal(expanded.status, 200);
    assert.equal((await expanded.json()).topics.length, 3);
    mode = "sources";
    const found = await discover(req(resourceInput())); assert.equal(found.status, 200);
    const result = await found.json(); assert.equal(result.resources.length, 1); assert.equal(rankings, 1); assert.equal(searches, 1);
    assert.equal(result.resources[0].level, "Advanced"); assert.ok(!JSON.stringify(result).includes("unit-test-placeholder"));
    mode = "channels";
    const channels = await discover(req({ ...resourceInput(), youtubeKind: "channel" }));
    assert.equal(channels.status, 200); assert.equal((await channels.json()).resources[0].youtubeKind, "channel");
    mode = "pause"; searches = 0;
    assert.equal((await discover(req({ ...resourceInput(), focus: "pause fixture" }))).status, 200); assert.equal(searches, 2);
    mode = "search-error"; const unavailable = await discover(req({ ...resourceInput(), focus: "search error fixture" }));
    assert.equal(unavailable.status, 503); assert.match((await unavailable.json()).error, /Web search/);
    mode = "auth";
    for (const [route, body] of [[expand, context()], [discover, { ...resourceInput(), focus: "authentication fixture" }]] as const) {
      const rejected = await route(req(body)); assert.equal(rejected.status, 401);
      assert.match((await rejected.json()).error, /rejected the API key/);
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = originalKey;
  }
});

test("any node can become an independent, expandable path that survives storage", async () => {
  const { createTopicPath } = await import("../lib/branches");
  const original = layoutLearningPath(createPath("Machine Learning"));
  const node = original.topics[7];
  node.resources = resourcesForTopic(node);
  const before = JSON.stringify(original);
  const seed = createTopicPath(node);
  assert.notEqual(seed.id, original.id);
  assert.equal(seed.title, node.title);
  assert.deepEqual(seed.topics[0].prerequisites, []);
  assert.deepEqual(seed.topics[0].resources, node.resources);
  assert.equal(seed.topics[0].parentTopicId, undefined);
  const additions = createBranchTopics(branch("0", "focused"), context(seed, "0"));
  const focused = appendBranch(seed, "0", additions);
  assert.ok(isLearningPath(JSON.parse(JSON.stringify(focused))));
  checkLayout(focused);
  const nested = createBranchTopics(branch(additions[0].id, "deeper"), context(focused, additions[0].id));
  checkLayout(appendBranch(focused, additions[0].id, nested));
  assert.equal(JSON.stringify(original), before);
  const rootPath = createTopicPath(original.topics[0]);
  assert.deepEqual(rootPath.topics[0].children, []);
  assert.deepEqual(rootPath.topics[0].prerequisites, []);
});
