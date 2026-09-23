import test from "node:test";
import assert from "node:assert/strict";
import { preferredProvider } from "../lib/discovery-config";
import { GET } from "../app/api/resources/route";

test("missing engines and stale saved preferences choose configured providers", () => {
  const onlyClaude = { youtube: false, exa: false, claude: true };
  assert.equal(preferredProvider(onlyClaude, true, "youtube"), "claude");
  assert.equal(preferredProvider(onlyClaude, false, "exa"), "claude");
  const all = { youtube: true, exa: true, claude: true };
  assert.equal(preferredProvider(all, true), "youtube");
  assert.equal(preferredProvider(all, false), "exa");
  assert.equal(preferredProvider(all, false, "youtube"), "exa");
  assert.equal(preferredProvider(all, true, "claude"), "claude");
});

test("configuration endpoint returns only flags, ignoring blank and placeholder keys", async () => {
  const names = ["YOUTUBE_API_KEY", "EXA_API_KEY", "ANTHROPIC_API_KEY"];
  const old = names.map(name => process.env[name]);
  try {
    process.env.YOUTUBE_API_KEY = "   ";
    process.env.EXA_API_KEY = "replace_with_your_exa_key";
    process.env.ANTHROPIC_API_KEY = "secret-test-key";
    const response = await GET();
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(await response.json(), { available: { youtube: false, exa: false, claude: true } });
  } finally { names.forEach((name, i) => { if (old[i] === undefined) delete process.env[name]; else process.env[name] = old[i]; }); }
});
