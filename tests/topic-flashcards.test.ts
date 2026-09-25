import test from "node:test";
import assert from "node:assert/strict";
import { createPath } from "../app/data";
import { overviewContext, overviewRequestSchema } from "../lib/topic-overview";
import { flashcardDeckSchema, flashcardStorageKey, newFlashcardSession, rateFlashcard, restoreFlashcards, reviewFlashcards } from "../lib/topic-flashcards";
import { POST } from "../app/api/topic-flashcards/route";

const path = createPath("Machine Learning"), topic = path.topics[1];
const deck = () => ({ cards: ["Variables", "Functions", "Lists", "Loops", "Conditions", "Dictionaries"].map(concept => ({ concept, question: `What are ${concept.toLowerCase()}?`, answer: `An explanation of ${concept.toLowerCase()} with an example.` })) });
const input = () => overviewRequestSchema.parse({ pathTitle: path.title, topic });
const request = (body: unknown, origin = "http://localhost:3000", signal?: AbortSignal) => new Request("http://localhost:3000/api/topic-flashcards", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body), signal });

test("flashcards reject incomplete, unbounded, or duplicate cards", () => {
  assert.equal(flashcardDeckSchema.safeParse(deck()).success, true);
  const value = deck();
  for (const cards of [value.cards.slice(0, 5), [...value.cards, ...value.cards], value.cards.map(card => ({ ...card, answer: " " })), value.cards.map(card => ({ ...card, question: "x".repeat(351) }))]) {
    assert.equal(flashcardDeckSchema.safeParse({ cards }).success, false);
  }
  value.cards[1].question = `  ${value.cards[0].question.toUpperCase()}  `;
  assert.equal(flashcardDeckSchema.safeParse(value).success, false);
});

test("review rounds retain skipped and missed cards, and reset without regenerating", () => {
  let session = newFlashcardSession(deck());
  session = rateFlashcard(session, "known");
  session = rateFlashcard(session, "review");
  session = { ...session, position: session.order.length };
  assert.equal(rateFlashcard(session, "known"), session, "completed rounds cannot rate a nonexistent card");
  session = reviewFlashcards(session, true);
  assert.deepEqual(session.order, [1, 2, 3, 4, 5]);
  assert.equal(session.position, 0);
  while (session.position < session.order.length) session = rateFlashcard(session, "known");
  assert.ok(session.ratings.every(rating => rating === "known"));
  assert.equal(reviewFlashcards(session, true), session);
  assert.deepEqual(reviewFlashcards(session, false), newFlashcardSession(deck()));
});

test("saved flashcards validate progress, separate paths, and invalidate changed topic context", () => {
  const context = overviewContext(path.title, topic);
  const session = rateFlashcard(newFlashcardSession(deck()), "review");
  const saved = { version: 1, context, session };
  assert.deepEqual(restoreFlashcards(JSON.stringify(saved), context), session);
  assert.equal(restoreFlashcards(JSON.stringify(saved), overviewContext(path.title, { ...topic, difficulty: "Advanced" })), null);
  for (const raw of [null, "broken", JSON.stringify({ ...saved, version: 2 }), ...[
    { ratings: ["known"] }, { order: [0, 0] }, { order: [7] }, { position: 7 }, { position: -1 }, { deck: {} },
  ].map(changes => JSON.stringify({ ...saved, session: { ...session, ...changes } }))]) {
    assert.equal(restoreFlashcards(raw, context), null);
  }
  assert.notEqual(flashcardStorageKey("a:b", "c"), flashcardStorageKey("a", "b:c"));
  assert.notEqual(flashcardStorageKey("a", topic.id), flashcardStorageKey("b", topic.id));
});

test("flashcard route validates requests, caches decks, and handles failed or cancelled generation", async () => {
  assert.equal((await POST(request({}))).status, 400);
  assert.equal((await POST(request(input(), "https://unrelated.example"))).status, 403);
  assert.equal((await POST(request({ ...input(), pathTitle: "x".repeat(13000) }))).status, 413);
  const originalFetch = globalThis.fetch, key = process.env.INFINOTO_ANTHROPIC_API_KEY;
  process.env.INFINOTO_ANTHROPIC_API_KEY = "flashcard-test-secret";
  let calls = 0, stop = "end_turn", authError = false, output: unknown = deck();
  globalThis.fetch = async (_url, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    assert.ok(body.output_config.format);
    assert.equal(body.tools, undefined);
    assert.match(body.system, /untrusted context/);
    assert.equal(JSON.parse(body.messages[0].content).topic.id, topic.id);
    if (authError) return Response.json({ type: "error", error: { type: "authentication_error", message: "flashcard-test-secret" } }, { status: 401 });
    return Response.json({ id: "msg_flashcards", type: "message", role: "assistant", model: "claude-sonnet-4-6", content: [{ type: "text", text: JSON.stringify(output) }], stop_reason: stop, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 100 } });
  };
  try {
    const found = await POST(request(input()));
    assert.equal(found.status, 200);
    assert.deepEqual(await found.json(), { topicId: topic.id, deck: deck() });
    assert.equal(found.headers.get("cache-control"), "no-store");
    assert.equal((await POST(request(input()))).status, 200);
    assert.equal(calls, 1);
    output = { cards: deck().cards.map(card => ({ ...card, question: "Duplicate?" })) };
    assert.equal((await POST(request({ ...input(), pathTitle: "Invalid output" }))).status, 502);
    output = deck(); stop = "max_tokens";
    assert.equal((await POST(request({ ...input(), pathTitle: "Incomplete output" }))).status, 502);
    authError = true;
    const failed = await POST(request({ ...input(), pathTitle: "Authentication failure" }));
    assert.equal(failed.status, 401);
    assert.ok(!(await failed.text()).includes("flashcard-test-secret"));
    const before = calls, controller = new AbortController(); controller.abort();
    assert.equal((await POST(request(input(), undefined, controller.signal))).status, 504);
    assert.equal(calls, before);
  } finally {
    globalThis.fetch = originalFetch;
    if (key === undefined) delete process.env.INFINOTO_ANTHROPIC_API_KEY; else process.env.INFINOTO_ANTHROPIC_API_KEY = key;
  }
});
