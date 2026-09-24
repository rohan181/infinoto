import test from "node:test";
import assert from "node:assert/strict";
import { createPath } from "../app/data";
import { quizContext, quizRequestSchema, quizSchema, quizScore, quizStorageKey, restoreQuizAttempt } from "../lib/quiz";
import { POST } from "../app/api/quiz/route";

const quiz = () => ({ questions: [0, 1, 2].map(i => ({ prompt: `Question ${i}?`, concept: `Concept ${i}`, options: ["First", "Second", "Third", "Fourth"], correctIndex: i, explanation: `Explanation ${i}.` })) });
const path = createPath("Python");
const topic = path.topics[1];
const input = () => quizRequestSchema.parse({ pathTitle: path.title, topic });
const request = (body: unknown, origin = "http://localhost:3000") => new Request("http://localhost:3000/api/quiz", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("quiz validation rejects incomplete, repeated, ambiguous choices and invalid answers", () => {
  assert.ok(quizSchema.safeParse(quiz()).success);
  assert.equal(quizSchema.safeParse({ questions: quiz().questions.slice(0, 2) }).success, false);
  const duplicate = quiz(); duplicate.questions[1].prompt = duplicate.questions[0].prompt.toUpperCase();
  assert.equal(quizSchema.safeParse(duplicate).success, false);
  const choices = quiz(); choices.questions[0].options[1] = " first ";
  assert.equal(quizSchema.safeParse(choices).success, false);
  const wrongIndex = quiz(); wrongIndex.questions[0].correctIndex = 4;
  assert.equal(quizSchema.safeParse(wrongIndex).success, false);
  assert.equal(quizRequestSchema.safeParse({ ...input(), topic: { ...input().topic, difficulty: "Expert" } }).success, false);
});

test("scores track committed answers, identify review concepts and distinguish incomplete attempts", () => {
  assert.deepEqual(quizScore(quiz(), []), { correct: 0, total: 3, answered: 0, finished: false, review: [] });
  assert.deepEqual(quizScore(quiz(), [0, 3]), { correct: 1, total: 3, answered: 2, finished: false, review: ["Concept 1"] });
  assert.deepEqual(quizScore(quiz(), [0, 1, 2]), { correct: 3, total: 3, answered: 3, finished: true, review: [] });
  assert.equal(quizScore(quiz(), [3, 3, 3]).correct, 0);
  assert.throws(() => quizScore(quiz(), [0, 1, 2, 3]), /Invalid/);
  assert.throws(() => quizScore(quiz(), [-1]), /Invalid/);
  assert.throws(() => quizScore(quiz(), [NaN]), /Invalid/);
});

test("attempts resume independently per path and topic, and discard stale or damaged content", () => {
  const context = quizContext(path.title, topic);
  const attempt = { version: 1, context, quiz: quiz(), answers: [0, 2] };
  assert.deepEqual(restoreQuizAttempt(JSON.stringify(attempt), context), attempt);
  assert.equal(restoreQuizAttempt(JSON.stringify(attempt), quizContext(path.title, { ...topic, concepts: ["Changed concept"] })), null);
  for (const raw of [null, "invalid", JSON.stringify({ ...attempt, answers: [9] }), JSON.stringify({ ...attempt, version: 2 })]) assert.equal(restoreQuizAttempt(raw, context), null);
  assert.notEqual(quizStorageKey("path-a", "1"), quizStorageKey("path-b", "1"));
  assert.notEqual(quizStorageKey("a:b", "c"), quizStorageKey("a", "b:c"));
  assert.equal(restoreQuizAttempt(JSON.stringify({ ...attempt, answers: [0, 1, 2] }), context)?.answers.length, 3);
});

test("quiz route validates requests and model output and keeps credentials server-side", async () => {
  assert.equal((await POST(request({}))).status, 400);
  assert.equal((await POST(request(input(), "https://other.example"))).status, 403);
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.INFINOTO_ANTHROPIC_API_KEY;
  process.env.INFINOTO_ANTHROPIC_API_KEY = "test-quiz-secret";
  let output = quiz(), stop = "end_turn", authError = false;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.ok(body.output_config.format);
    assert.equal(JSON.parse(body.messages[0].content).topic.id, topic.id);
    assert.match(body.system, /untrusted context/);
    assert.ok(init?.signal);
    if (authError) return Response.json({ type: "error", error: { type: "authentication_error", message: "test-quiz-secret" } }, { status: 401 });
    return Response.json({ id: "msg_test", type: "message", role: "assistant", model: "claude-sonnet-4-6", content: [{ type: "text", text: JSON.stringify(output) }], stop_reason: stop, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 100 } });
  };
  try {
    const response = await POST(request(input()));
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.topicId, topic.id); assert.deepEqual(result.quiz, quiz());
    assert.equal(response.headers.get("cache-control"), "no-store");
    output.questions[0].options = ["Same", "Same", "Same", "Same"];
    assert.equal((await POST(request(input()))).status, 502);
    output = quiz(); stop = "max_tokens";
    assert.equal((await POST(request(input()))).status, 502);
    authError = true;
    const error = await POST(request(input()));
    assert.equal(error.status, 401); assert.ok(!(await error.text()).includes("test-quiz-secret"));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.INFINOTO_ANTHROPIC_API_KEY; else process.env.INFINOTO_ANTHROPIC_API_KEY = originalKey;
  }
});
