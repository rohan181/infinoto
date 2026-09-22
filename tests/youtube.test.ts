import test from "node:test";
import assert from "node:assert/strict";
import { chapterMatch, compareCoverage, comparisonSchema, durationSeconds, parseChapters, parseVideoId, titleDifficulty, type YouTubeVideo } from "../lib/youtube";
import { resourceRecordSchema, resourceRequestSchema } from "../lib/resources";
import { discoverWithYouTube, getVideos } from "../lib/server/youtube";
import { POST as discover } from "../app/api/resources/route";
import { POST as compare } from "../app/api/youtube/route";

const a = "AAAAAAAAAAA", b = "BBBBBBBBBBB", same = "CCCCCCCCCCC", unavailable = "DDDDDDDDDDD";
const channelA = `UC${"a".repeat(22)}`, channelB = `UC${"b".repeat(22)}`, playlist = `PL${"p".repeat(24)}`;
const signal = () => new AbortController().signal;
const input = (extra: object = {}) => resourceRequestSchema.parse({ provider: "youtube", category: "YouTube", youtubeKind: "video", topicTitle: "Python", pathTitle: "Programming", level: "All levels", ...extra });
const request = (body: unknown, origin = "http://localhost:3000") => new Request("http://localhost:3000/api/youtube", { method: "POST", headers: { "Content-Type": "application/json", origin }, body: JSON.stringify(body) });
const snippet = (id: string) => ({ title: id === a ? "Python for Beginners" : "Python course", channelId: id === b ? channelB : channelA, channelTitle: id === b ? "Creator B" : "Creator A", description: id === a ? "00:00 Intro\n01:00 Strings\n03:00 Functions" : "0:00 Introduction\n2:00 Working with strings\n4:00 Decorators", publishedAt: "2024-01-01T00:00:00Z" });
const video = (id: string): YouTubeVideo => ({ id, ...snippet(id), durationSeconds: 1000, chapters: parseChapters(snippet(id).description, 1000) });

test("YouTube links and chapter timestamps are validated without fetching arbitrary URLs", () => {
  assert.equal(parseVideoId(`https://youtu.be/${a}?si=tracking`), a);
  assert.equal(parseVideoId(`https://www.youtube.com/watch?v=${a}&t=20`), a);
  assert.equal(parseVideoId(`https://youtube.com/shorts/${b}`), b);
  for (const url of [`https://youtube.com.evil.test/watch?v=${a}`, `https://youtube.com@evil.test/watch?v=${a}`, `http://youtube.com/watch?v=${a}`, `https://youtube.com/playlist?list=${playlist}`, "javascript:alert(1)"]) assert.equal(parseVideoId(url), null);
  assert.equal(durationSeconds("PT2H3M4S"), 7384);
  assert.deepEqual(parseChapters("0:00 Intro\n(01:05) Lists\n- [1:02:03] Advanced\n01:05 Duplicate\n1:99 Invalid\n99:00 Beyond video\n03:10 https://promo.test", 4000), [{ title: "Intro", seconds: 0 }, { title: "Lists", seconds: 65 }, { title: "Advanced", seconds: 3723 }]);
  assert.equal(titleDifficulty("An advanced guide"), "Advanced");
  assert.equal(titleDifficulty("Beginner to advanced Python"), "Not assessed");
  assert.equal(titleDifficulty("Python masterclass"), "Not assessed");
  assert.deepEqual(parseChapters("⭐️ (0:00:00) Introduction\n2. 0:20 Strings", 100), [{ title: "Introduction", seconds: 0 }, { title: "Strings", seconds: 20 }]);
});

test("comparison separates shared and extra chapter evidence without claiming missing coverage", () => {
  const rows = compareCoverage(video(a), video(b), ["Strings", "Neural networks"]);
  const strings = rows.filter(r => /strings/i.test(r.topic));
  assert.equal(strings.length, 1); assert.equal(strings[0].left?.seconds, 60); assert.equal(strings[0].right?.seconds, 120);
  assert.equal(rows.find(r => r.topic === "Functions")?.right, null);
  assert.equal(rows.find(r => r.topic === "Decorators")?.left, null);
  assert.ok(!rows.some(r => r.topic === "Neural networks"));
  const plainA = { ...video(a), chapters: [], description: "We discuss neural networks and evaluation." };
  const plainB = { ...video(b), chapters: [], description: "Training a model." };
  assert.deepEqual(compareCoverage(plainA, plainB), []);
  assert.equal(compareCoverage(plainA, plainB, ["neural networks"])[0].left?.kind, "description");
  assert.equal(compareCoverage(plainA, plainB, ["net"] ).length, 0);
  for (const [a, b] of [["Lists", "List"], ["While Loops", "Loops (while Loop)"], ["Receiving Input", "Input"], ["The range() Function", "Range"]]) assert.ok(chapterMatch(a, b));
  assert.equal(chapterMatch("Training a model", "Deploying a model"), false);
  assert.equal(chapterMatch("List methods", "Lists"), false);
  assert.equal(chapterMatch("Exercise", "Exercise 1"), false);
});

test("live discovery routes to YouTube only, retains direct metadata, and respects format, exclusions and difficulty", async () => {
  const fetch = globalThis.fetch, key = process.env.YOUTUBE_API_KEY;
  process.env.YOUTUBE_API_KEY = "youtube-fixture-discovery";
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++; const target = new URL(String(url));
    assert.equal(target.origin, "https://www.googleapis.com");
    assert.equal(target.searchParams.has("key"), false);
    assert.equal(new Headers(init?.headers).get("X-Goog-Api-Key"), "youtube-fixture-discovery");
    assert.ok(init?.signal); assert.equal(init?.cache, "no-store");
    const kind = target.searchParams.get("type");
    if (target.pathname.endsWith("/search")) return Response.json({ items: kind === "video" ? [a, b].map(id => ({ id: { videoId: id }, snippet: snippet(id) })) : [{ id: kind === "channel" ? { channelId: channelA } : { playlistId: playlist } }] });
    if (target.pathname.endsWith("/videos")) return Response.json({ items: [a, b].map(id => ({ id, snippet: snippet(id), contentDetails: { duration: "PT10M" }, status: { privacyStatus: "public", uploadStatus: "processed" } })) });
    return Response.json({ items: [{ id: target.pathname.endsWith("/channels") ? channelA : playlist, snippet: snippet(a), contentDetails: { itemCount: 14 } }] });
  };
  try {
    const response = await discover(request(input()));
    assert.equal(response.status, 200);
    const data = await response.json(); assert.equal(data.provider, "youtube");
    assert.equal(data.resources.length, 2); assert.equal(calls, 2);
    assert.equal(data.resources[0].author, "Creator A"); assert.equal(data.resources[0].youtube.durationSeconds, 600);
    assert.equal(data.resources[1].level, "Not assessed");
    assert.ok(data.resources.every((r: unknown) => resourceRecordSchema.safeParse(r).success));
    await discoverWithYouTube(input(), signal()); assert.equal(calls, 2, "repeated search uses metadata cache");
    assert.equal((await discoverWithYouTube(input({ excludeUrls: [`https://youtu.be/${a}`] }), signal())).resources.length, 1);
    const advanced = await discoverWithYouTube(input({ level: "Advanced" }), signal());
    assert.equal(advanced.resources.length, 0, "requested difficulty is never fabricated");
    for (const kind of ["channel", "playlist"] as const) {
      const result = await discoverWithYouTube(input({ youtubeKind: kind }), signal());
      assert.equal(result.resources[0].youtubeKind, kind); assert.ok(resourceRecordSchema.safeParse(result.resources[0]).success);
      if (kind === "playlist") assert.equal(result.resources[0].youtube?.videoCount, 14);
    }
    const before = calls;
    assert.equal((await discover(request({ ...input(), category: "Blogs" }))).status, 400);
    assert.equal((await compare(request({ action: "compare", videoIds: [a, a] }))).status, 400);
    assert.equal((await compare(request({ action: "similar", videoId: a }, "https://unrelated.test"))).status, 403);
    assert.equal(calls, before);
  } finally { globalThis.fetch = fetch; if (key === undefined) delete process.env.YOUTUBE_API_KEY; else process.env.YOUTUBE_API_KEY = key; }
});

test("similar candidates exclude the starting creator, comparison has real evidence, and errors stay sanitized", async () => {
  const fetch = globalThis.fetch, key = process.env.YOUTUBE_API_KEY;
  process.env.YOUTUBE_API_KEY = "youtube-fixture-compare";
  let fail = "", calls = 0;
  globalThis.fetch = async (url) => {
    calls++; const target = new URL(String(url));
    if (fail) return Response.json({ error: { message: "youtube-fixture-compare private details", errors: [{ reason: fail }] } }, { status: 403 });
    if (target.pathname.endsWith("/search")) return Response.json({ items: [a, b, same].map(id => ({ id: { videoId: id }, snippet: snippet(id) })) });
    return Response.json({ items: target.searchParams.get("id")!.split(",").filter(id => id !== unavailable).map(id => ({ id, snippet: snippet(id), contentDetails: { duration: "PT10M" }, status: { privacyStatus: "public", uploadStatus: "processed" } })) });
  };
  try {
    const similar = await compare(request({ action: "similar", videoId: a }));
    assert.equal(similar.status, 200); assert.deepEqual((await similar.json()).candidates.map((v: YouTubeVideo) => v.id), [b]);
    const result = await compare(request({ action: "compare", videoIds: [a, b] }));
    const data = await result.json(); assert.equal(result.status, 200); assert.ok(comparisonSchema.safeParse(data).success);
    assert.ok(data.rows.some((r: { left: unknown; right: unknown }) => r.left && r.right));
    assert.equal((await compare(request({ action: "compare", videoIds: [a, same] }))).status, 400);
    assert.equal((await compare(request({ action: "compare", videoIds: [a, unavailable] }))).status, 404);
    fail = "quotaExceeded";
    const quota = await compare(request({ action: "similar", videoId: b, query: "new query" }));
    assert.equal(quota.status, 429); assert.ok(!(await quota.text()).includes("youtube-fixture"));
    fail = "accessNotConfigured";
    assert.equal((await compare(request({ action: "similar", videoId: b, query: "another query" }))).status, 503);
    const before = calls; const controller = new AbortController(); controller.abort();
    await assert.rejects(getVideos([a], controller.signal)); assert.equal(calls, before);
    delete process.env.YOUTUBE_API_KEY;
    assert.equal((await compare(request({ action: "similar", videoId: a }))).status, 503);
  } finally { globalThis.fetch = fetch; if (key === undefined) delete process.env.YOUTUBE_API_KEY; else process.env.YOUTUBE_API_KEY = key; }
});
