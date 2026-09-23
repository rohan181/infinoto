import test from "node:test";
import assert from "node:assert/strict";
import { analysisRequestSchema, contentSegments, evidenceLink, validateAnalysis, type AnalyzedSource } from "../lib/content-analysis";
import { collectContent } from "../lib/server/content-analysis";
import { POST } from "../app/api/content-analysis/route";

const input = () => analysisRequestSchema.parse({ topic: "Python generators", concepts: ["Lazy iteration"], sources: [
  { url: "https://youtube.com/watch?v=AAAAAAAAAAA", title: "Generator lesson", type: "YouTube", text: "[00:01:30] Generators produce values lazily with yield.\n[00:02:00] Here is a worked example using range." },
  { url: "https://realpython.com/introduction-to-python-generators/", title: "Generator article", type: "Blogs", text: "Generators produce one value at a time. Use yield to pause the generator and resume it later." },
] });
const output = () => ({ summary: "Both excerpts explain generators.", findings: [{ concept: "Lazy iteration", coverage: [{ sourceId: "s0", depth: "explanation", evidenceIds: ["s0:e0"] }, { sourceId: "s1", depth: "explanation", evidenceIds: ["s1:e0"] }] }], learningOrder: [{ sourceId: "s0", reason: "Start with the explanation.", evidenceIds: ["s0:e0"] }], gaps: ["Error handling is not established in these excerpts."] });
const request = (body: unknown, origin = "http://localhost:3000") => new Request("http://localhost:3000/api/content-analysis", { method: "POST", headers: { "Content-Type": "application/json", origin }, body: JSON.stringify(body) });

test("transcripts preserve SRT, VTT and plain timestamps without guessing article timings", () => {
  assert.deepEqual(contentSegments("WEBVTT\n\n1\n00:00:03.200 --> 00:00:05.500\nA <b>neuron</b> computes a weighted sum.\n\n2\n00:01:20,000 --> 00:01:22,000\nAn activation introduces nonlinearity."), [
    { start: 3.2, text: "A neuron computes a weighted sum." }, { start: 80, text: "An activation introduces nonlinearity." },
  ]);
  assert.equal(contentSegments("[01:30] Python yield pauses execution.")[0].start, 90);
  assert.equal(contentSegments("[01:99] Invalid time remains untimed.")[0].start, null);
  assert.equal(contentSegments("A complete paragraph of article text.")[0].start, null);
  assert.equal(contentSegments(" ").length, 0);
});

test("sources must be distinct public direct links with bounded evidence", () => {
  assert.equal(analysisRequestSchema.safeParse({ ...input(), sources: [input().sources[0]] }).success, false);
  assert.equal(analysisRequestSchema.safeParse({ ...input(), sources: [input().sources[0], { ...input().sources[0], url: "https://www.youtube.com/watch?v=AAAAAAAAAAA" }] }).success, false);
  for (const url of ["http://example.com/article", "https://127.0.0.1/private", "https://localhost/private", "https://google.com/search?q=x"]) {
    assert.equal(analysisRequestSchema.safeParse({ ...input(), sources: [{ ...input().sources[0], url }, input().sources[1]] }).success, false);
  }
  assert.equal(analysisRequestSchema.safeParse({ ...input(), sources: input().sources.map(s => ({ ...s, text: "x".repeat(18001) })) }).success, false);
});

test("provided text needs no retrieval and citations cannot reference fabricated sources or timestamps", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Unexpected fetch"); };
  try {
    const sources = await collectContent(input(), new AbortController().signal);
    assert.ok(sources.every(s => s.basis === "provided-text"));
    const result = validateAnalysis(output(), sources);
    assert.equal(result.findings.length, 1);
    assert.equal(evidenceLink(sources[0], 90), "https://www.youtube.com/watch?v=AAAAAAAAAAA&t=90s");
    assert.equal(evidenceLink(sources[1], 90), sources[1].url);
    const wrong = output(); wrong.findings[0].coverage[0].evidenceIds = ["s1:e0"];
    assert.throws(() => validateAnalysis(wrong, sources), /Invalid evidence/);
    const fabricated = output(); fabricated.learningOrder[0].sourceId = "invented";
    assert.throws(() => validateAnalysis(fabricated, sources), /Invalid evidence/);
    const metadata: AnalyzedSource[] = sources.map(s => ({ ...s, basis: "metadata" }));
    assert.ok(validateAnalysis(output(), metadata).findings[0].coverage.every(c => c.depth === "mention"));
  } finally { globalThis.fetch = original; }
});

test("web retrieval uses a fixed provider and matches evidence to exact requested URLs", async () => {
  const original = globalThis.fetch, key = process.env.EXA_API_KEY;
  process.env.EXA_API_KEY = "private-exa-fixture";
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://api.exa.ai/contents");
    assert.equal(new Headers(init?.headers).get("x-api-key"), "private-exa-fixture");
    const body = JSON.parse(String(init?.body)); assert.equal(body.text, true);
    return Response.json({ results: [{ url: body.urls[0], text: "Generator functions lazily produce values. ".repeat(10) }, { url: "https://unrequested.example/article", text: "Wrong evidence" }] });
  };
  try {
    const req = input(); req.sources[1].text = "";
    const sources = await collectContent(req, new AbortController().signal);
    assert.equal(sources[1].basis, "retrieved-text");
    assert.match(sources[1].evidence[0].text, /Generator functions/);
    globalThis.fetch = async () => new Response("private-exa-fixture", { status: 401 });
    const fallback = await collectContent(req, new AbortController().signal);
    assert.equal(fallback[1].basis, "metadata"); assert.match(fallback[1].note, /failed/);
    assert.ok(!JSON.stringify(fallback).includes("private-exa-fixture"));
  } finally { globalThis.fetch = original; if (key === undefined) delete process.env.EXA_API_KEY; else process.env.EXA_API_KEY = key; }
});

test("analysis endpoint validates Claude evidence, rejects foreign requests and sanitizes errors", async () => {
  const original = globalThis.fetch, key = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "private-claude-fixture";
  let bad = false, calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++; const body = JSON.parse(String(init?.body));
    const context = JSON.parse(body.messages[0].content);
    assert.equal(context.sources[0].evidence[0].start, 90);
    assert.ok(body.output_config.format);
    const result = output(); if (bad) result.findings[0].coverage[0].evidenceIds = ["fake"];
    return Response.json({ id: "msg_example", type: "message", role: "assistant", model: "claude-sonnet-4-6", content: [{ type: "text", text: JSON.stringify(result) }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 100, output_tokens: 200 } });
  };
  try {
    assert.equal((await POST(request(input(), "https://foreign.example"))).status, 403); assert.equal(calls, 0);
    const response = await POST(request(input())); assert.equal(response.status, 200);
    const body = await response.json(); assert.equal(body.sources.length, 2); assert.equal(body.analysis.findings.length, 1);
    bad = true; const failure = await POST(request(input())); assert.equal(failure.status, 502); assert.ok(!(await failure.text()).includes("private-claude-fixture"));
  } finally { globalThis.fetch = original; if (key === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = key; }
});


test("long generated prose is bounded without discarding valid comparison evidence", async () => {
  const sources = await collectContent(input(), new AbortController().signal);
  const raw = output(); raw.summary = "A detailed but supported summary. ".repeat(80);
  raw.learningOrder[0].reason = "Supported reason. ".repeat(50);
  const result = validateAnalysis(raw, sources);
  assert.ok(result.summary.length <= 700); assert.ok(result.learningOrder[0].reason.length <= 300);
  assert.equal(result.findings.length, 1);
});


test("revisiting a source in a generated study plan keeps one validated recommendation", async () => {
  const sources = await collectContent(input(), new AbortController().signal);
  const raw = output(); raw.learningOrder.push({ ...raw.learningOrder[0] });
  assert.equal(validateAnalysis(raw, sources).learningOrder.length, 1);
  raw.learningOrder[1].evidenceIds = ["invented"];
  assert.throws(() => validateAnalysis(raw, sources), /Invalid evidence/);
});

test("short article paragraphs are compacted without silently dropping most of the excerpt", () => {
  const text = Array.from({ length: 150 }, (_, i) => `Paragraph ${i}: this is some relevant explanation.`).join("\n\n");
  const segments = contentSegments(text);
  assert.ok(segments.length < 100);
  assert.match(segments.map(s => s.text).join(" "), /Paragraph 149/);
});


test("article code retains markup, indentation, newlines and numeric values", () => {
  const text = '<button>Save</button>\ndef example():\n    yield 42\n42\n<generator object example at 0x123>';
  assert.equal(contentSegments(text)[0].text, text);
});
