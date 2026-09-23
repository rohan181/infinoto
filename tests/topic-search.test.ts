import test from "node:test";
import assert from "node:assert/strict";
import { diversify, searchSubject, topicRelevance } from "../lib/topic-search";
import { buildExaResources, exaSearchRequest } from "../lib/server/exa";
import { isDirectResourceUrl, resourceRecordSchema, resourceRequestSchema } from "../lib/resources";

test("selected topics drive searches, while generic labels retain necessary context", () => {
  const context = { pathTitle: "Machine Learning", concepts: ["Hands-on practice"] };
  assert.equal(searchSubject({ ...context, topicTitle: "Python programming" }), "Python programming");
  assert.equal(searchSubject({ ...context, topicTitle: "Neural networks" }), "Neural networks");
  assert.equal(searchSubject({ ...context, topicTitle: "Mathematics" }), "Mathematics for Machine Learning");
  assert.equal(searchSubject({ ...context, topicTitle: "Python programming", focus: "Python generators" }), "Python generators");
});

test("topic relevance prefers direct lessons and creator diversity limits repetition", () => {
  const focused = topicRelevance("Python generators explained", "Python yield examples", "Python generators");
  const unrelated = topicRelevance("Machine Learning Roadmap", "AI overview", "Python generators");
  const incidental = topicRelevance("Programming overview", "Python generators", "Python generators");
  assert.ok(focused > incidental); assert.equal(unrelated, 0);
  assert.equal(topicRelevance("Neural network explained", "", "Neural networks"), 4);
  const rows = [{ source: "A", id: 1 }, { source: "A", id: 2 }, { source: "A", id: 3 }, { source: "B", id: 4 }];
  assert.deepEqual(diversify(rows, r => r.source).map(r => r.id), [1, 2, 4]);
});

test("retrieved pages remain usable when synthesis is unavailable, without invented difficulty", () => {
  const article = "https://realpython.com/python-gil/";
  const req = resourceRequestSchema.parse({ provider: "exa", category: "Blogs", topicTitle: "Python GIL", pathTitle: "Python", level: "All levels" });
  const raw = { results: [{ url: article, title: "Understanding the Python GIL", highlights: ["Python GIL examples"] }, { url: "https://wrong.example/article", title: "Pottery for beginners" }] };
  const cards = buildExaResources(raw, req);
  assert.equal(cards.length, 1); assert.equal(cards[0].level, "Not assessed");
  assert.ok(resourceRecordSchema.safeParse(cards[0]).success);
  assert.equal(buildExaResources(raw, { ...req, excludeUrls: [article] }).length, 0);
  const search = exaSearchRequest({ ...req, topicTitle: "Python programming", pathTitle: "Machine Learning" });
  assert.ok(!search.query.includes("Machine Learning"));
  assert.ok(!search.query.includes("beginner intermediate advanced"));
  assert.match(search.systemPrompt, /original material/);
});

test("generated generic nodes search their concrete concepts", () => {
  assert.equal(searchSubject({ topicTitle: "Key techniques", pathTitle: "Photography", concepts: ["Exposure", "Composition"] }), "Exposure Composition for Photography");
  assert.equal(searchSubject({ topicTitle: "Key techniques", pathTitle: "Photography", concepts: [] }), "Key techniques for Photography");
});


test("blog recommendations exclude course exercises, documentation and forum answers", () => {
  for (const url of ["https://developers.google.com/machine-learning/crash-course/neural-networks/interactive-exercises", "https://developer.mozilla.org/en-US/docs/Web/CSS/flex", "https://reddit.com/r/python/comments/example", "https://university.example/learning/courses/python"]) {
    assert.equal(isDirectResourceUrl(url, "Blogs"), false);
    assert.equal(isDirectResourceUrl(url, "Other"), true);
  }
  assert.equal(isDirectResourceUrl("https://victorzhou.com/blog/intro-to-neural-networks", "Blogs"), true);
});
