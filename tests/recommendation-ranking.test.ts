import test from "node:test";
import assert from "node:assert/strict";
import type { Resource } from "../app/data";
import { learningPreference, rankRecommendations, recommendationFit } from "../lib/recommendation-ranking";
import { concreteConcepts, selectedTopicRelevance } from "../lib/topic-search";
import { exaSearchRequest } from "../lib/server/exa";
import { resourceRecordSchema, resourceRequestSchema, sourceAuthor } from "../lib/resources";

const context = { topicTitle: "Python generators", pathTitle: "Python", concepts: ["yield", "Lazy iteration", "Hands-on practice"], difficulty: "Beginner" as const };
function article(id: string, overrides: Partial<Resource> = {}): Resource {
  const url = `https://${id}.example.com/generators`;
  return { id, type: "Blogs", title: "Python generators explained", author: id, level: "Beginner", url, art: "linear", meta: "Article", sourceExcerpt: "A tutorial on Python generators, yield and lazy iteration with examples.", provenance: { kind: "web-search", provider: "exa", sourceTitle: "Python generators explained", sourceUrl: url, checkedAt: "2026-09-01T00:00:00Z" }, ...overrides };
}

test("focused lessons outrank newer broad courses, unrelated articles and advanced material", () => {
  const relevant = article("focused");
  const broad = article("broad", { title: "Python complete course", sourceExcerpt: "Python variables, lists and strings", level: "Beginner", provenance: { ...relevant.provenance!, checkedAt: "2026-09-24T00:00:00Z" } });
  const advanced = article("advanced", { level: "Advanced" });
  const unrelated = article("unrelated", { title: "Travel photography", sourceExcerpt: "Camera settings and light" });
  assert.equal(rankRecommendations([unrelated, broad, advanced, relevant], context)[0].id, "focused");
  assert.ok(recommendationFit(relevant, context).score > recommendationFit(broad, context).score);
  assert.equal(rankRecommendations([relevant, advanced], { ...context, difficulty: "Advanced" })[0].id, "advanced");
});

test("specialized topics require more than their shared language name and match concrete concepts", () => {
  assert.equal(selectedTopicRelevance("Python dictionaries tutorial", "Python strings and lists", context), 0);
  assert.ok(selectedTopicRelevance("Lazy iteration with yield", "", context) > 1);
  assert.equal(selectedTopicRelevance("Python dictionaries", "", { ...context, focus: "Python generators" }), 0);
  const math = { topicTitle: "Mathematics", pathTitle: "Machine Learning", concepts: ["Linear algebra", "Calculus", "Hands-on practice"] };
  assert.ok(selectedTopicRelevance("Linear algebra explained", "", math) > 1);
  assert.equal(selectedTopicRelevance("Machine learning roadmap", "hands-on practice", math), 0);
  assert.deepEqual(concreteConcepts(math), ["Linear algebra", "Calculus"]);
});

test("early recommendations diversify creators and preserve every distinct resource", () => {
  const same = ["a", "b", "c"].map(id => article(id, { url: `https://same.example.com/${id}` }));
  const alternate = article("alternative");
  const ordered = rankRecommendations([...same, alternate], context);
  assert.deepEqual(ordered.slice(0, 2).map(r => r.id), ["a", "alternative"]);
  assert.equal(ordered.length, 4);
  assert.equal(rankRecommendations([same[0], { ...same[0], id: "duplicate", url: `${same[0].url}?utm_source=tracking` }], context).length, 1);
  const broader = article("path", { matchContext: "path" });
  assert.equal(rankRecommendations([broader, alternate], context).at(-1)?.id, "path");
});

test("generic channels do not displace a direct lesson; fit explanations use source evidence", () => {
  const lesson = article("lesson");
  const channel = article("channel", { type: "YouTube", youtubeKind: "channel", title: "A Python creator", url: "https://youtube.com/@pythoncreator", sourceExcerpt: "Python lessons for beginners" });
  assert.equal(rankRecommendations([channel, lesson], context)[0].id, "lesson");
  const fit = recommendationFit(lesson, context);
  assert.deepEqual(fit.concepts, ["yield", "Lazy iteration"]);
  assert.match(fit.levelNote, /beginner/);
  const unassessed = recommendationFit(article("unknown", { level: "Not assessed", sourceExcerpt: "", title: "Python discussion", reason: "Claims to cover yield and lazy iteration" }), context);
  assert.equal(unassessed.levelNote, "Difficulty not assessed");
  assert.deepEqual(unassessed.concepts, [], "generated reasoning is not independent source evidence");
  assert.ok(resourceRecordSchema.safeParse(lesson).success);
});

test("web discovery targets the node stage without relabeling sources or forcing level quotas", () => {
  const input = resourceRequestSchema.parse({ pathTitle: "Python", topicTitle: "Python generators", topicDifficulty: "Beginner", level: "All levels", category: "Blogs", provider: "exa" });
  assert.match(exaSearchRequest(input).systemPrompt, /This node is Beginner/);
  assert.match(exaSearchRequest(input).systemPrompt, /Do not force a mix/);
  assert.match(learningPreference("Advanced", "Beginner"), /only resources suited to Advanced/);
  assert.ok(!learningPreference("Advanced", "Beginner").includes("This node is Beginner"));
});

test("missing-author placeholders never appear as author names", () => {
  for (const value of [null, undefined, "null", " unknown ", "N/A", "Not provided"]) assert.equal(sourceAuthor(value, "publisher.example"), "publisher.example");
  assert.equal(sourceAuthor("Ada Lovelace", "publisher.example"), "Ada Lovelace");
});
