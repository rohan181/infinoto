import test from "node:test";
import assert from "node:assert/strict";
import { POST } from "../app/api/resources/route";
import { resourceRecordSchema, resourceRequestSchema } from "../lib/resources";
import { buildExaResources, discoverWithExa, exaSearchRequest } from "../lib/server/exa";

const input = (extra: object = {}) => resourceRequestSchema.parse({ provider: "exa", pathTitle: "Python", topicTitle: "Python generators", category: "Blogs", level: "Advanced", ...extra });
const article = "https://realpython.com/python-gil/";
const match = (url = article, level = "Advanced") => ({ url, level, reason: "Requires confident Python and concurrency fundamentals.", authors: "Real Python" });
const evidence = (url = article, title = "Retrieved article title") => ({ url, title, highlights: ["Python concurrency and the GIL"] });
const result = () => ({ results: [evidence()], output: { content: { matches: [match()] }, grounding: [] } });
const request = (body: unknown, origin = "http://localhost:3000") => new Request("http://localhost:3000/api/resources", { method: "POST", headers: { "Content-Type": "application/json", origin }, body: JSON.stringify(body) });

test("provider selection validates and preserves legacy Claude requests", () => {
  assert.equal(resourceRequestSchema.parse({ ...input(), provider: undefined }).provider, "claude");
  assert.equal(resourceRequestSchema.safeParse({ ...input(), provider: "unknown" }).success, false);
  const body = exaSearchRequest(input());
  assert.equal(body.type, "auto"); assert.deepEqual(body.contents, { highlights: true });
  assert.ok(body.outputSchema); assert.match(body.systemPrompt, /Advanced/);
  for (const key of ["numResults", "includeDomains", "excludeDomains", "category", "maxAgeHours"]) assert.ok(!(key in body));
  assert.match(exaSearchRequest(input({ category: "YouTube", youtubeKind: "playlist" })).systemPrompt, /playlist\?list/);
  assert.match(exaSearchRequest(input({ category: "Books" })).systemPrompt, /actual book reference pages/);
});

test("Exa cards use evidence URLs and titles, requested levels, and provider provenance", () => {
  const raw = result();
  raw.output.content.matches.push(match(), match("https://invented.example/article"), match(article, "Beginner"));
  const cards = buildExaResources(raw, input());
  assert.equal(cards.length, 1); assert.equal(cards[0].title, "Retrieved article title");
  assert.equal(cards[0].provenance?.provider, "exa"); assert.equal(cards[0].level, "Advanced");
  assert.ok(resourceRecordSchema.safeParse(cards[0]).success);
  assert.deepEqual(buildExaResources(raw, input({ excludeUrls: ["https://www.realpython.com/python-gil?utm_source=test"] })), []);
  assert.deepEqual(buildExaResources({ ...result(), output: { content: { matches: [match(article, "Beginner")] } } }, input()), []);
  assert.equal(buildExaResources({ ...result(), output: { content: JSON.stringify(result().output.content) } }, input()).length, 1);
});

test("grounded citations are supported while fabricated, unsafe, and wrong-format URLs are omitted", () => {
  const channel = "https://youtube.com/@coreyms";
  const video = "https://youtube.com/watch?v=rfscVS0vtbw";
  const search = "https://youtube.com/results?search_query=python";
  const raw = { results: [evidence(video), evidence(search), evidence("https://localhost/a")], output: {
    content: { matches: [match(channel), match(video), match(search), match("https://localhost/a"), match("https://youtube.com/@notretrieved")] },
    grounding: [{ field: "matches[0].url", citations: [{ url: channel, title: "Corey Schafer" }] }],
  } };
  const cards = buildExaResources(raw, input({ category: "YouTube", youtubeKind: "channel" }));
  assert.equal(cards.length, 1); assert.equal(cards[0].youtubeKind, "channel");
  assert.equal(cards[0].url, channel); assert.equal(cards[0].title, "Corey Schafer");
  assert.deepEqual(buildExaResources({ results: [], output: { content: { matches: [match()] } } }, input()), []);
});

test("empty searches stay empty and incomplete synthesis produces an actionable error", () => {
  assert.deepEqual(buildExaResources({ results: [] }, input()), []);
  assert.throws(() => buildExaResources({ results: [evidence()] }, input()), /Choose All levels/);
  assert.throws(() => buildExaResources({ results: [evidence()], output: { content: "not JSON" } }, input()), /Choose All levels/);
  assert.throws(() => buildExaResources({ results: [evidence()], output: { content: {} } }, input()), /Choose All levels/);
  const bookUrl = "https://charuaggarwal.net/neural.htm";
  const book = buildExaResources({ results: [evidence(bookUrl, "Neural Networks and Deep Learning")], output: { content: { matches: [{ ...match(bookUrl), authors: "Charu C. Aggarwal" }] } } }, input({ category: "Books" }))[0];
  assert.equal(book.book?.authors, "Charu C. Aggarwal");
  assert.equal(book.book?.isbn, undefined); assert.equal(book.book?.publisher, undefined);
});

test("Exa routing works without Claude, forwards cancellation, and never leaks provider errors or keys", async () => {
  const originalFetch = globalThis.fetch, exaKey = process.env.EXA_API_KEY, claudeKey = process.env.ANTHROPIC_API_KEY;
  process.env.EXA_API_KEY = "test-exa-secret"; delete process.env.ANTHROPIC_API_KEY;
  let status = 200, calls = 0, unreadable = false;
  let observedSignal: AbortSignal | null | undefined;
  globalThis.fetch = async (url, init) => {
    calls++; assert.equal(url, "https://api.exa.ai/search");
    assert.equal(new Headers(init?.headers).get("x-api-key"), "test-exa-secret");
    assert.equal(init?.cache, "no-store"); observedSignal = init?.signal;
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body.contents, { highlights: true }); assert.ok(body.outputSchema);
    assert.ok(!String(init?.body).includes("test-exa-secret"));
    if (init?.signal?.aborted) throw new DOMException("stopped", "AbortError");
    return unreadable ? new Response("invalid", { status }) : Response.json(status === 200 ? result() : { error: "test-exa-secret; private provider details" }, { status });
  };
  try {
    assert.equal((await POST(request({ ...input(), provider: "invalid" }))).status, 400);
    assert.equal((await POST(request(input(), "https://unrelated.example"))).status, 403);
    assert.equal(calls, 0);
    const found = await POST(request(input())); const data = await found.json();
    assert.equal(found.status, 200); assert.equal(data.provider, "exa");
    assert.equal(data.resources[0].provenance.provider, "exa"); assert.equal(calls, 1);
    assert.ok(!JSON.stringify(data).includes("test-exa-secret"));
    // Explicit Claude selection is not silently replaced with Exa.
    assert.equal((await POST(request({ ...input(), provider: "claude" }))).status, 503);
    assert.equal(calls, 1);
    for (const failure of [401, 402, 403, 429, 500]) {
      status = failure;
      const response = await POST(request(input())); const error = await response.text();
      assert.equal(response.status, failure === 500 ? 502 : failure);
      assert.match(error, /Exa/); assert.ok(!error.includes("test-exa-secret"));
    }
    status = 200; unreadable = true;
    assert.equal((await POST(request(input()))).status, 502); unreadable = false;
    const controller = new AbortController(); controller.abort();
    await assert.rejects(discoverWithExa(input(), controller.signal), /stopped or timed out/);
    assert.equal(observedSignal, controller.signal);
    delete process.env.EXA_API_KEY;
    const beforeMissingKey = calls;
    const missing = await POST(request(input()));
    assert.equal(missing.status, 503); assert.match((await missing.json()).error, /EXA_API_KEY/);
    assert.equal(calls, beforeMissingKey);
  } finally {
    globalThis.fetch = originalFetch;
    if (exaKey === undefined) delete process.env.EXA_API_KEY; else process.env.EXA_API_KEY = exaKey;
    if (claudeKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = claudeKey;
  }
});
