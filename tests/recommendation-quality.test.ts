import test from "node:test";
import assert from "node:assert/strict";
import { createPath, type Resource } from "../app/data";
import { resourcesForTopic } from "../lib/curated-resources";
import { rankRecommendations } from "../lib/recommendation-ranking";
import { resourceFormat } from "../lib/recommendations";
import { resourceRequestSchema } from "../lib/resources";
import { buildExaResources } from "../lib/server/exa";
import { lessonRelevance, selectedTopicRelevance, topicExcerpt } from "../lib/topic-search";

function article(id: string, title: string, excerpt: string, extra: Partial<Resource> = {}): Resource {
  const url = `https://${id}.example.com/lesson`;
  return { id, title, url, sourceExcerpt: excerpt, author: id, type: "Blogs", level: "Beginner", art: "linear", meta: "Article",
    provenance: { kind: "web-search", provider: "exa", sourceUrl: url, sourceTitle: title, checkedAt: "2026-09-25T00:00:00Z" }, ...extra };
}

test("quality fixtures prefer focused lessons over field-name matches across different subjects", () => {
  const cases = [
    { topicTitle: "Python generators", pathTitle: "Python", concepts: ["yield", "Lazy iteration"], good: "Python generators with yield", bad: "Python dictionaries and strings" },
    { topicTitle: "React useEffect", pathTitle: "Web development", concepts: ["Effect cleanup"], good: "React useEffect cleanup explained", bad: "React component styling" },
    { topicTitle: "Exposure triangle", pathTitle: "Photography", concepts: ["Aperture", "Shutter speed"], good: "Understanding shutter speed", bad: "Choosing a photography bag" },
    { topicTitle: "Mathematics", pathTitle: "Machine Learning", concepts: ["Linear algebra", "Calculus"], good: "Linear algebra explained", bad: "Machine learning career roadmap" },
    { topicTitle: "K-means clustering", pathTitle: "Machine Learning", concepts: ["Cluster centroids"], good: "K-means clustering worked example", bad: "Machine learning deployment guide" },
  ];
  for (const fixture of cases) {
    const good = article("focused", fixture.good, fixture.good);
    const bad = article("unrelated", fixture.bad, fixture.bad);
    assert.equal(selectedTopicRelevance(bad.title, bad.sourceExcerpt!, fixture), 0, fixture.topicTitle);
    assert.equal(rankRecommendations([bad, good], { ...fixture, difficulty: "Beginner" })[0].id, good.id, fixture.topicTitle);
  }
});

test("mixed recommendations preserve the strongest article and keep direct lessons before generic formats", () => {
  const context = { topicTitle: "Python generators", pathTitle: "Python", concepts: ["yield"], difficulty: "Beginner" as const };
  const blog = article("blog", "Python generators explained", "Python generators, yield, worked examples");
  const video = article("video", "Python generators", "Python generators and yield", { type: "YouTube", url: "https://youtube.com/watch?v=AAAAAAAAAAA" });
  const channel = article("channel", "Python creator", "Python lessons", { type: "YouTube", url: "https://youtube.com/@pythoncreator" });
  const ordered = rankRecommendations([channel, video, blog], context);
  assert.equal(ordered[0].id, blog.id);
  assert.deepEqual(ordered.slice(0, 2).map(resourceFormat), ["Blogs", "Videos"]);
  assert.equal(ordered.at(-1)?.id, channel.id);
});

test("creator diversity never pushes an unrelated beginner article above relevant advanced lessons", () => {
  const context = { topicTitle: "Python generators", pathTitle: "Python", concepts: [], difficulty: "Beginner" as const };
  const lessons = Array.from({ length: 12 }, (_, index) => article(`lesson-${index}`, "Python generators", "Examples of Python generators", { level: "Advanced", url: `https://same.example.com/lesson-${index}` }));
  const unrelated = article("unrelated", "Python lists for beginners", "A step-by-step tutorial on Python lists");
  const ordered = rankRecommendations([unrelated, ...lessons], context);
  assert.equal(ordered.at(-1)?.id, unrelated.id);
  assert.equal(ordered.length, 13);
});

test("shared curated tags and previously saved irrelevant articles remain broader resources", () => {
  const base = createPath("Machine Learning").topics[1];
  const legacy = article("legacy", "Python dictionaries", "Python strings and dictionaries");
  const resources = resourcesForTopic({ ...base, title: "Python generators", concepts: ["yield", "Lazy iteration"], resources: [legacy] }, "Python");
  assert.equal(resources.find(item => item.id === "curated-python-generators")?.matchContext, "topic");
  assert.equal(resources.find(item => item.id === "curated-python-start")?.matchContext, "path");
  assert.equal(resources.find(item => item.id === legacy.id)?.matchContext, "path");
});

test("Exa model explanations cannot make an unrelated article pass source-evidence checks", () => {
  const input = resourceRequestSchema.parse({ provider: "exa", pathTitle: "Python", topicTitle: "Python generators", category: "Blogs", level: "All levels" });
  const good = article("good", "Python generators explained", "Understand yield and Python generators");
  const bad = article("bad", "Python dictionaries explained", "Create and update Python dictionaries");
  const raw = {
    results: [bad, good].map(item => ({ url: item.url, title: item.title, highlights: [item.sourceExcerpt] })),
    output: { content: { matches: [bad, good].map(item => ({ url: item.url, level: "Beginner", reason: "Teaches Python generators with worked examples.", authors: null })) } },
  };
  assert.deepEqual(buildExaResources(raw, input).map(item => item.url), [good.url]);
});

test("video evidence keeps matching chapters after long descriptions without fabricating source text", () => {
  const context = { topicTitle: "Python generators", pathTitle: "Python", concepts: ["yield"] };
  const description = `${"Welcome to this channel.\n".repeat(100)}12:30 Python generators and yield\n15:00 Lazy iteration`;
  const excerpt = topicExcerpt(description, context);
  assert.ok(excerpt.length <= 1600);
  assert.match(excerpt, /12:30 Python generators and yield/);
  assert.ok(excerpt.split("\n").every(line => description.includes(line)));
  assert.ok(selectedTopicRelevance("Python full course", excerpt, context) >= 1);
});

test("incidental excerpt mentions do not qualify as focused lessons without a matching learning outcome", () => {
  const context = { topicTitle: "Mathematics", pathTitle: "Machine Learning", concepts: ["Linear algebra", "Calculus"], focus: "Calculus" };
  assert.equal(lessonRelevance("Scalars, vectors and matrices", "The next article covers calculus.", context, "Teaches vector and matrix notation."), 0);
  assert.ok(lessonRelevance("Math for ML", "A review of calculus and derivatives.", context, "Teaches calculus and matrix derivatives for optimization.") >= 1);
  assert.equal(lessonRelevance("Scalars and vectors", "Vector notation", context, "Teaches calculus."), 0, "generated claims cannot create evidence");
});
