import test from "node:test";
import assert from "node:assert/strict";
import { createPath } from "../app/data";
import { overviewContext } from "../lib/topic-overview";
import { layoutVisualization, restoreVisualization, validateVisualization, visualizationNodeHeight, visualizationSchema, visualizationStorageKey, visualizationRequestSchema } from "../lib/topic-visualization";
import { POST } from "../app/api/topic-visualization/route";

const path = createPath("Machine Learning"), topic = path.topics[1];
const graph = () => ({ title: "Python concepts", summary: "Connect values and functions.", nodes: [1, 2, 3].map(i => ({ id: `n${i}`, label: `Concept ${i}`, explanation: `Explanation ${i}`, example: `Example ${i}` })), edges: [{ from: "n1", to: "n2", label: "contains" }, { from: "n1", to: "n3", label: "uses" }] });
const input = (extra = {}) => visualizationRequestSchema.parse({ pathTitle: path.title, topic, mode: "concept", ...extra });
const request = (body: unknown, origin = "http://localhost:3000", signal?: AbortSignal) => new Request("http://localhost:3000/api/topic-visualization", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body), signal });

test("visualizations reject duplicate nodes, dangling edges, cycles and disconnected ideas", () => {
  assert.equal(visualizationSchema.safeParse(graph()).success, true);
  const duplicate = graph(); duplicate.nodes[2].id = "n2";
  const dangling = graph(); dangling.edges[0].to = "n7";
  const cycle = graph(); cycle.edges = [{ from: "n2", to: "n3", label: "uses" }, { from: "n3", to: "n2", label: "uses" }];
  const self = graph(); self.edges[0].to = "n1";
  const repeated = graph(); repeated.edges[1] = repeated.edges[0];
  for (const invalid of [duplicate, dangling, cycle, self, repeated, { ...graph(), edges: [] }, { ...graph(), summary: "  " }]) assert.equal(visualizationSchema.safeParse(invalid).success, false);
  assert.equal(visualizationRequestSchema.safeParse({ ...input(), mode: "html" }).success, false);
});

test("step-by-step requires a linear ordered process, not a branching concept tree", () => {
  assert.throws(() => validateVisualization(graph(), "flow"), /ordered sequence/);
  const flow = graph(); flow.edges[1].from = "n2";
  assert.deepEqual(validateVisualization(flow, "flow"), flow);
  assert.deepEqual(validateVisualization(graph(), "concept"), graph());
});

test("layout keeps nodes within the canvas without overlapping, including wide and deep trees", () => {
  for (const shape of ["wide", "deep"]) {
    const tree = graph();
    tree.nodes = Array.from({ length: 7 }, (_, i) => ({ id: `n${i + 1}`, label: `Node ${i}`, explanation: "Explanation", example: "Example" }));
    tree.edges = tree.nodes.slice(1).map((node, i) => ({ from: shape === "wide" ? "n1" : tree.nodes[i].id, to: node.id, label: "connects" }));
    const layout = layoutVisualization(validateVisualization(tree, "concept"));
    for (const node of layout.nodes) {
      assert.ok(node.x >= 0 && node.x + 160 <= layout.width && node.y >= 0 && node.y + visualizationNodeHeight <= layout.height);
      for (const other of layout.nodes.filter(other => other.id !== node.id)) assert.ok(Math.abs(node.x - other.x) >= 160 || Math.abs(node.y - other.y) >= visualizationNodeHeight);
    }
  }
});

test("saved visualizations are isolated by topic and mode and reject stale or invalid content", () => {
  const context = overviewContext(path.title, topic);
  const saved = { version: 1, context, mode: "concept", visualization: graph() };
  assert.deepEqual(restoreVisualization(JSON.stringify(saved), context, "concept"), graph());
  assert.equal(restoreVisualization(JSON.stringify(saved), context, "flow"), null);
  assert.equal(restoreVisualization(JSON.stringify(saved), "changed topic", "concept"), null);
  assert.equal(restoreVisualization(JSON.stringify({ ...saved, mode: "flow" }), context, "flow"), null);
  for (const raw of [null, "broken", JSON.stringify({ ...saved, visualization: {} })]) assert.equal(restoreVisualization(raw, context, "concept"), null);
  assert.notEqual(visualizationStorageKey("a", "b", "concept"), visualizationStorageKey("a", "b", "flow"));
  assert.notEqual(visualizationStorageKey("a:b", "c", "concept"), visualizationStorageKey("a", "b:c", "concept"));
});

test("visualization API validates AI output, caches per mode, cancels and sanitizes errors", async () => {
  assert.equal((await POST(request({}))).status, 400);
  assert.equal((await POST(request(input(), "https://unrelated.example"))).status, 403);
  const originalFetch = globalThis.fetch, key = process.env.INFINOTO_ANTHROPIC_API_KEY;
  process.env.INFINOTO_ANTHROPIC_API_KEY = "visualization-secret";
  let calls = 0, output = graph(), stop = "end_turn", authError = false;
  globalThis.fetch = async (_url, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    assert.ok(body.output_config.format);
    assert.equal(body.tools, undefined);
    assert.match(body.system, /untrusted context/);
    if (authError) return Response.json({ type: "error", error: { type: "authentication_error", message: "visualization-secret" } }, { status: 401 });
    return Response.json({ id: "msg_visualization", type: "message", role: "assistant", model: "claude-sonnet-4-6", content: [{ type: "text", text: JSON.stringify(output) }], stop_reason: stop, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 100 } });
  };
  try {
    const result = await POST(request(input()));
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { topicId: topic.id, mode: "concept", visualization: graph() });
    assert.equal((await POST(request(input()))).status, 200); assert.equal(calls, 1);
    assert.equal((await POST(request(input({ mode: "flow" })))).status, 502, "branches cannot masquerade as sequential steps");
    output.edges[1].from = "n2";
    assert.equal((await POST(request(input({ mode: "flow" })))).status, 200, "failed responses are not cached");
    stop = "max_tokens";
    assert.equal((await POST(request(input({ pathTitle: "Truncated response" })))).status, 502);
    authError = true;
    const failed = await POST(request(input({ pathTitle: "Invalid credentials" })));
    assert.equal(failed.status, 401); assert.ok(!(await failed.text()).includes("visualization-secret"));
    const controller = new AbortController(); controller.abort(); const before = calls;
    assert.equal((await POST(request(input(), undefined, controller.signal))).status, 504); assert.equal(calls, before);
  } finally {
    globalThis.fetch = originalFetch;
    if (key === undefined) delete process.env.INFINOTO_ANTHROPIC_API_KEY; else process.env.INFINOTO_ANTHROPIC_API_KEY = key;
  }
});
