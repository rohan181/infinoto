import test from "node:test";
import assert from "node:assert/strict";
import { createPath } from "../app/data";
import { overviewContext, overviewRequestSchema, overviewSchema, overviewStorageKey, restoreOverview } from "../lib/topic-overview";
import { POST } from "../app/api/topic-overview/route";

const path = createPath("Machine Learning");
const topic = path.topics[1];
const overview = () => ({
  summary: "Python is a programming language used to express instructions that a computer can execute.",
  whyItMatters: "Python lets you explore data and build small experiments.",
  keyIdeas: ["Variables", "Control flow", "Functions"].map(title => ({ title, explanation: `Use ${title.toLowerCase()} to organize a program.` })),
  example: { title: "Calculate an average", walkthrough: "Add 2, 4 and 6 to get 12. Divide by 3 to get an average of 4." },
  practice: "Write a function that calculates the average of three numbers.",
});
const input = () => overviewRequestSchema.parse({ pathTitle: path.title, topic });
const request = (body: unknown, origin = "http://localhost:3000", signal?: AbortSignal) => new Request("http://localhost:3000/api/topic-overview", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body), signal });

test("overviews require a complete explanation, bounded text, and distinct topic contexts", () => {
  assert.equal(overviewSchema.safeParse(overview()).success, true);
  for (const extra of [{ summary: "  " }, { keyIdeas: [] }, { example: { title: "Example" } }, { practice: "x".repeat(601) }]) {
    assert.equal(overviewSchema.safeParse({ ...overview(), ...extra }).success, false);
  }
  assert.equal(overviewRequestSchema.safeParse({ ...input(), topic: { ...topic, difficulty: "Expert" } }).success, false);
  assert.notEqual(overviewContext(path.title, topic), overviewContext(path.title, { ...topic, difficulty: "Advanced" }));
  assert.notEqual(overviewContext(path.title, topic), overviewContext(path.title, { ...topic, concepts: ["Changed concept"] }));
});

test("saved overviews survive reloads, remain separate per path, and invalidate stale content", () => {
  const context = overviewContext(path.title, topic);
  const saved = { version: 1, context, overview: overview() };
  assert.deepEqual(restoreOverview(JSON.stringify(saved), context), overview());
  assert.equal(restoreOverview(JSON.stringify(saved), overviewContext("Another path", topic)), null);
  for (const raw of [null, "broken JSON", JSON.stringify({ ...saved, version: 2 }), JSON.stringify({ ...saved, overview: {} })]) {
    assert.equal(restoreOverview(raw, context), null);
  }
  assert.notEqual(overviewStorageKey("a:b", "c"), overviewStorageKey("a", "b:c"));
  assert.notEqual(overviewStorageKey("path-a", topic.id), overviewStorageKey("path-b", topic.id));
});

test("overview route validates before generation, caches successes, and sanitizes failures", async () => {
  assert.equal((await POST(request({}))).status, 400);
  assert.equal((await POST(request(input(), "https://unrelated.example"))).status, 403);
  assert.equal((await POST(request({ ...input(), pathTitle: "x".repeat(13000) }))).status, 413);
  const originalFetch = globalThis.fetch, key = process.env.INFINOTO_ANTHROPIC_API_KEY;
  process.env.INFINOTO_ANTHROPIC_API_KEY = "overview-test-secret";
  let calls = 0, stop = "end_turn", authError = false, output: unknown = overview();
  globalThis.fetch = async (_url, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    assert.ok(body.output_config.format);
    assert.equal(body.tools, undefined, "overviews do not add live search costs");
    assert.match(body.system, /untrusted context/);
    assert.equal(JSON.parse(body.messages[0].content).topic.id, topic.id);
    if (authError) return Response.json({ type: "error", error: { type: "authentication_error", message: "overview-test-secret" } }, { status: 401 });
    return Response.json({ id: "msg_overview", type: "message", role: "assistant", model: "claude-sonnet-4-6", content: [{ type: "text", text: JSON.stringify(output) }], stop_reason: stop, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 100 } });
  };
  try {
    const found = await POST(request(input()));
    assert.equal(found.status, 200);
    assert.deepEqual(await found.json(), { topicId: topic.id, overview: overview() });
    assert.equal(found.headers.get("cache-control"), "no-store");
    assert.equal((await POST(request(input()))).status, 200);
    assert.equal(calls, 1, "cached overview does not call the model again");
    output = { ...overview(), summary: " " };
    assert.equal((await POST(request({ ...input(), pathTitle: "Invalid output" }))).status, 502);
    output = overview(); stop = "max_tokens";
    assert.equal((await POST(request({ ...input(), pathTitle: "Incomplete output" }))).status, 502);
    authError = true;
    const failed = await POST(request({ ...input(), pathTitle: "Authentication failure" }));
    assert.equal(failed.status, 401);
    assert.ok(!(await failed.text()).includes("overview-test-secret"));
    const before = calls, controller = new AbortController(); controller.abort();
    assert.equal((await POST(request(input(), undefined, controller.signal))).status, 504);
    assert.equal(calls, before, "cancelled requests do not start generation, including on a cache hit");
  } finally {
    globalThis.fetch = originalFetch;
    if (key === undefined) delete process.env.INFINOTO_ANTHROPIC_API_KEY; else process.env.INFINOTO_ANTHROPIC_API_KEY = key;
  }
});
