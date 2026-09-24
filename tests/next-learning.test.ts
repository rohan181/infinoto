import test from "node:test";
import assert from "node:assert/strict";
import type { Topic, LearningPath } from "../app/data";
import { parseStudyMinutes, recommendNextTopics } from "../lib/next-learning";
import { appendBranch, layoutLearningPath } from "../lib/branches";

function topic(id: string, hours: number, prerequisites: string[] = ["0"], difficulty: Topic["difficulty"] = "Beginner"): Topic {
  return { id, title: `Topic ${id}`, hours, prerequisites, difficulty, children: [], concepts: [`Concept ${id}`], description: "A learning topic", subtitle: "", icon: "network", x: 0, y: 0 };
}
const path = (...topics: Topic[]): LearningPath => ({ id: "test-path", title: "Test path", description: "", createdAt: "2026-09-24", topics: [topic("0", 0, []), ...topics] });

test("recommendations require every prerequisite and never suggest the goal or completed topics", () => {
  const map = path(topic("a", 1), topic("b", 1), topic("c", 1, ["a", "b"]));
  assert.deepEqual(recommendNextTopics(map, [], 60).suggestions.map(p => p.topic.id), ["a", "b"]);
  assert.deepEqual(recommendNextTopics(map, ["a", "a", "unknown"], 60).suggestions.map(p => p.topic.id), ["b"]);
  assert.deepEqual(recommendNextTopics(map, ["a", "b"], 60).suggestions.map(p => p.topic.id), ["c"]);
});

test("available time changes the recommendation among ready topics", () => {
  const map = path(topic("short", 1), topic("long", 2));
  const short = recommendNextTopics(map, [], 60).suggestions[0];
  const long = recommendNextTopics(map, [], 120).suggestions[0];
  assert.equal(short.topic.id, "short"); assert.equal(short.fits, true);
  assert.equal(long.topic.id, "long"); assert.equal(long.fits, true);
  assert.equal(recommendNextTopics(map, [], 30).suggestions[0].fits, false);
});

test("short sessions fit the budget and do not claim the whole topic can be finished", () => {
  const map = path(topic("a", 4));
  for (const minutes of [5, 15, 30, 45, 90, 120, 480]) {
    const pick = recommendNextTopics(map, [], minutes).suggestions[0];
    assert.ok(pick.steps.every(step => step.minutes > 0));
    assert.equal(pick.steps.reduce((sum, step) => sum + step.minutes, 0), pick.sessionMinutes);
    assert.ok(pick.sessionMinutes <= minutes);
    assert.equal(pick.totalMinutes, 240);
    assert.equal(pick.fits, minutes >= 240);
    assert.equal(pick.focus, "Concept a");
  }
});

test("recommendations continue completed work and count only topics immediately unlocked", () => {
  const map = path(topic("foundation", 1), topic("continue", 2, ["foundation"]), topic("other", 2), topic("next", 1, ["continue", "other"]));
  const result = recommendNextTopics(map, ["foundation"], 120);
  assert.equal(result.suggestions[0].topic.id, "continue");
  assert.deepEqual(result.suggestions[0].prerequisites.map(t => t.id), ["foundation"]);
  assert.equal(result.suggestions[0].unlocks.length, 0);
  assert.deepEqual(recommendNextTopics(map, ["foundation", "other"], 120).suggestions[0].unlocks.map(t => t.id), ["next"]);
});

test("all-complete, empty and blocked maps return actionable states", () => {
  assert.equal(recommendNextTopics(path(), [], 30).status, "empty");
  assert.equal(recommendNextTopics(path(topic("a", 1)), ["a"], 30).status, "complete");
  assert.equal(recommendNextTopics(path(topic("a", 1, ["missing"])), ["missing"], 30).status, "blocked");
  assert.equal(recommendNextTopics(path(topic("a", 1, ["b"]), topic("b", 1, ["a"])), [], 30).status, "blocked");
});

test("completing and undoing prerequisites updates eligibility, including generated branches", () => {
  const original = layoutLearningPath(path(topic("a", 1)));
  const addition = { ...topic("branch", 2, ["a"]), parentTopicId: "a" };
  const expanded = appendBranch(original, "a", [addition]);
  const before = JSON.stringify(expanded);
  assert.equal(recommendNextTopics(expanded, ["a"], 30).suggestions[0].topic.id, "branch");
  assert.equal(recommendNextTopics(expanded, [], 30).suggestions[0].topic.id, "a");
  assert.equal(JSON.stringify(expanded), before);
});

test("invalid time preferences are rejected instead of silently changing the user's budget", () => {
  for (const value of [null, undefined, "", " ", "abc", -1, 0, 4, 481, Infinity, NaN, 20.5, true, [], {}]) assert.equal(parseStudyMinutes(value), null);
  assert.equal(parseStudyMinutes("45"), 45);
  assert.equal(parseStudyMinutes(480), 480);
  assert.throws(() => recommendNextTopics(path(topic("a", 1)), [], 0), /5 and 480/);
});


test("missing estimates never promise an instant completion", () => {
  const result = recommendNextTopics(path(topic("unknown", 0)), [], 30).suggestions[0];
  assert.equal(result.totalMinutes, null);
  assert.equal(result.fits, false);
  assert.equal(result.sessionMinutes, 30);
});
