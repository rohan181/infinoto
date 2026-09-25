import test from "node:test";
import assert from "node:assert/strict";
import { fetchDiscovery } from "../lib/discovery-fetch";
import { resourceRequestSchema } from "../lib/resources";

const input = resourceRequestSchema.parse({ pathTitle: "Python", topicTitle: "Generators", category: "Blogs", provider: "exa", level: "All levels" });
const source = { id: "article", type: "Blogs", title: "Python generators", author: "Real Python", meta: "Article", level: "Not assessed", url: "https://realpython.com/introduction-to-python-generators/", art: "linear", provenance: { kind: "web-search", provider: "exa", sourceTitle: "Python generators", sourceUrl: "https://realpython.com/introduction-to-python-generators/", checkedAt: "2026-09-24T00:00:00Z" } };

test("temporary discovery errors retry once; valid cards survive a malformed neighbor", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => ++calls === 1 ? Response.json({ error: "Temporary error" }, { status: 502 }) : Response.json({ resources: [source, { title: "Incomplete" }] });
  try {
    const found = await fetchDiscovery(input, new AbortController().signal);
    assert.equal(calls, 2); assert.deepEqual(found.resources.map(r => r.id), ["article"]);
  } finally { globalThis.fetch = original; }
});

test("unreadable successes and temporary 500s recover without exposing HTML errors", async () => {
  const original = globalThis.fetch;
  try {
    for (const first of [new Response("<html>Gateway failure</html>"), new Response("upstream failed", { status: 500 }), Response.json(null)]) {
      let calls = 0;
      globalThis.fetch = async () => ++calls === 1 ? first : Response.json({ resources: [source] });
      assert.equal((await fetchDiscovery(input, new AbortController().signal)).resources.length, 1);
      assert.equal(calls, 2);
    }
    globalThis.fetch = async () => new Response("<html>Private server details</html>", { status: 503 });
    await assert.rejects(fetchDiscovery(input, new AbortController().signal), /^Error: Search couldn’t finish/);
  } finally { globalThis.fetch = original; }
});

test("cancelling during retry backoff does not send a second request", async () => {
  const original = globalThis.fetch;
  const controller = new AbortController();
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({}, { status: 502 }); };
  try {
    const pending = fetchDiscovery(input, controller.signal);
    setTimeout(() => controller.abort(), 10);
    await assert.rejects(pending, { name: "AbortError" });
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});

test("quota and credential errors do not retry; failed network retries are bounded", async () => {
  const original = globalThis.fetch;
  try {
    for (const status of [401, 402, 403, 429, 503]) {
      let calls = 0;
      globalThis.fetch = async () => { calls++; return Response.json({ error: "Check configuration" }, { status }); };
      await assert.rejects(fetchDiscovery(input, new AbortController().signal), /Check configuration/);
      assert.equal(calls, 1);
    }
    let calls = 0;
    globalThis.fetch = async () => { calls++; throw new TypeError("Network failed"); };
    await assert.rejects(fetchDiscovery(input, new AbortController().signal), /Network failed/);
    assert.equal(calls, 2);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(fetchDiscovery(input, controller.signal));
    assert.equal(calls, 2, "cancellation never starts another request");
  } finally { globalThis.fetch = original; }
});
