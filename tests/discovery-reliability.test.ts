import test from "node:test";
import assert from "node:assert/strict";
import { DiscoveryCache } from "../lib/server/discovery-cache";
import { RequestGate } from "../lib/server/request-gate";

const signal = () => new AbortController().signal;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

test("concurrent discovery shares work and one reader's cancellation preserves the other", async () => {
  const cache = new DiscoveryCache<string[]>(value => value.length > 0);
  const result = deferred<string[]>();
  const controller = new AbortController();
  let calls = 0, shared: AbortSignal | undefined;
  const run = (s: AbortSignal) => { calls++; shared = s; return result.promise; };
  const first = cache.get("topic", controller.signal, run);
  const second = cache.get("topic", signal(), run);
  await Promise.resolve();
  controller.abort();
  await assert.rejects(first, { name: "AbortError" });
  assert.equal(shared?.aborted, false);
  result.resolve(["article"]);
  assert.deepEqual(await second, ["article"]);
  assert.deepEqual(await cache.get("topic", signal(), run), ["article"]);
  assert.equal(calls, 1);
});

test("abandoned searches abort and cannot cache late responses over a new search", async () => {
  const cache = new DiscoveryCache<string>(() => true);
  const old = deferred<string>();
  const controller = new AbortController();
  let upstream: AbortSignal | undefined;
  const first = cache.get("topic", controller.signal, s => { upstream = s; return old.promise; });
  await Promise.resolve();
  controller.abort();
  await assert.rejects(first);
  assert.equal(upstream?.aborted, true);
  assert.equal(await cache.get("topic", signal(), async () => "new"), "new");
  old.resolve("stale");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(await cache.get("topic", signal(), async () => "unexpected"), "new");
});

test("empty results, failures and expired entries are retried; cache remains bounded", async () => {
  const cache = new DiscoveryCache<string[]>(value => value.length > 0, 600000, 1);
  assert.deepEqual(await cache.get("empty", signal(), async () => []), []);
  await assert.rejects(cache.get("empty", signal(), async () => { throw new Error("upstream"); }), /upstream/);
  assert.deepEqual(await cache.get("empty", signal(), async () => ["recovered"]), ["recovered"]);
  await cache.get("other", signal(), async () => ["other"]);
  assert.deepEqual(await cache.get("empty", signal(), async () => ["refetched"]), ["refetched"]);
  const expired = new DiscoveryCache<string>(() => true, 0);
  await expired.get("key", signal(), async () => "old");
  assert.equal(await expired.get("key", signal(), async () => "fresh"), "fresh");
});

test("request bursts queue fairly, cancelled waiters are removed, and release is idempotent", async () => {
  const gate = new RequestGate(1, 2);
  const release = await gate.acquire(signal());
  const cancelled = new AbortController();
  const removed = gate.acquire(cancelled.signal);
  let started = false;
  const next = gate.acquire(signal()).then(done => { started = true; return done; });
  await assert.rejects(gate.acquire(signal()), /Queue full/);
  cancelled.abort();
  await assert.rejects(removed);
  assert.equal(started, false);
  release(); release();
  const finish = await next;
  assert.equal(started, true);
  let thirdStarted = false;
  const third = gate.acquire(signal()).then(done => { thirdStarted = true; return done; });
  await Promise.resolve();
  assert.equal(thirdStarted, false, "double release must not open another slot");
  finish();
  (await third)();
});
