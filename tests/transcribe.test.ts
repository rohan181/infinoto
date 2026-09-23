import test from "node:test";
import assert from "node:assert/strict";
import { POST } from "../app/api/transcribe/route";
import { MAX_AUDIO_BYTES } from "../lib/content-analysis";

function request(name = "lesson.mp3", size = 20, offset = "60", origin = "http://localhost:3000") {
  const body = new FormData(); body.set("file", new File([new Uint8Array(size)], name, { type: "audio/mpeg" })); body.set("offset", offset);
  return new Request("http://localhost:3000/api/transcribe", { method: "POST", headers: { origin }, body });
}

test("Whisper uploads use server credentials, segment timestamps and clip offsets", async () => {
  const original = globalThis.fetch, key = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "private-openai-fixture";
  let calls = 0, status = 200;
  globalThis.fetch = async (url, init) => {
    calls++; assert.equal(url, "https://api.openai.com/v1/audio/transcriptions");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer private-openai-fixture");
    const form = init?.body as FormData;
    assert.equal(form.get("model"), "whisper-1"); assert.equal(form.get("response_format"), "verbose_json");
    assert.equal(form.get("timestamp_granularities[]"), "segment"); assert.ok(form.get("file") instanceof File);
    return Response.json(status === 200 ? { text: "Neurons compute weighted sums.", segments: [{ start: 3, text: "Neurons compute weighted sums." }] } : { error: { message: "private-openai-fixture" } }, { status });
  };
  try {
    const response = await POST(request()); assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { text: "[00:01:03] Neurons compute weighted sums.", truncated: false, model: "whisper-1" });
    for (const [providerStatus, expected] of [[401, 503], [429, 429], [400, 400], [500, 502]]) {
      status = providerStatus; const failure = await POST(request()); assert.equal(failure.status, expected); assert.ok(!(await failure.text()).includes("private-openai-fixture"));
    }
    const before = calls;
    assert.equal((await POST(request("lesson.exe"))).status, 400);
    assert.equal((await POST(request("lesson.mp3", 0))).status, 400);
    assert.equal((await POST(request("lesson.mp3", MAX_AUDIO_BYTES + 1))).status, 413);
    assert.equal((await POST(request("lesson.mp3", 10, "-10"))).status, 400);
    assert.equal((await POST(request("lesson.mp3", 10, "0", "https://foreign.example"))).status, 403);
    assert.equal(calls, before);
    delete process.env.OPENAI_API_KEY;
    const missing = await POST(request()); assert.equal(missing.status, 503); assert.match((await missing.json()).error, /OPENAI_API_KEY/);
  } finally { globalThis.fetch = original; if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key; }
});

test("multipart body limit is enforced without a Content-Length header", async () => {
  const key = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = "fixture-key";
  try {
    const request = new Request("http://localhost:3000/api/transcribe", { method: "POST", body: new Uint8Array(MAX_AUDIO_BYTES + 100001), headers: { "Content-Type": "multipart/form-data; boundary=x" } });
    assert.equal((await POST(request)).status, 413);
  } finally { if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key; }
});
