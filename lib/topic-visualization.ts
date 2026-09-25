import { z } from "zod";
import { overviewRequestSchema } from "./topic-overview";

export const visualizationModeSchema = z.enum(["concept", "flow"]);
export type VisualizationMode = z.infer<typeof visualizationModeSchema>;
export const visualizationRequestSchema = overviewRequestSchema.extend({ mode: visualizationModeSchema });
const text = (max: number) => z.string().trim().min(1).max(max);
export const visualizationModelSchema = z.object({
  title: text(100), summary: text(400),
  nodes: z.array(z.object({ id: z.string().regex(/^n[1-7]$/), label: text(48), explanation: text(500), example: text(400) })).min(3).max(7),
  edges: z.array(z.object({ from: text(2), to: text(2), label: text(70) })).min(2).max(6),
});
export const visualizationSchema = visualizationModelSchema.superRefine((graph, context) => {
  const ids = new Set(graph.nodes.map(node => node.id));
  const root = graph.nodes[0].id;
  const incoming = new Map<string, number>();
  const seen = new Set<string>();
  let invalid = ids.size !== graph.nodes.length || graph.edges.length !== graph.nodes.length - 1;
  for (const edge of graph.edges) {
    const key = `${edge.from}:${edge.to}`;
    if (!ids.has(edge.from) || !ids.has(edge.to) || edge.from === edge.to || seen.has(key)) invalid = true;
    seen.add(key); incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1);
  }
  if (incoming.has(root) || graph.nodes.slice(1).some(node => incoming.get(node.id) !== 1)) invalid = true;
  const reachable = new Set([root]);
  for (let i = 0; i < graph.nodes.length; i++) for (const edge of graph.edges) if (reachable.has(edge.from)) reachable.add(edge.to);
  if (reachable.size !== ids.size) invalid = true;
  if (invalid) context.addIssue({ code: "custom", message: "The visualization must be a connected tree with unique nodes and valid connections." });
});
export type TopicVisualization = z.infer<typeof visualizationSchema>;
export const visualizationNodeHeight = 88;
export function validateVisualization(raw: unknown, mode: VisualizationMode): TopicVisualization {
  const graph = visualizationSchema.parse(raw);
  if (mode === "flow" && graph.nodes.slice(1).some((node, i) => !graph.edges.some(edge => edge.from === graph.nodes[i].id && edge.to === node.id))) {
    throw new Error("The steps must form one ordered sequence.");
  }
  return graph;
}
export const visualizationResponseSchema = z.object({ topicId: z.string(), mode: visualizationModeSchema, visualization: visualizationSchema });
export function visualizationStorageKey(pathId: string, topicId: string, mode: VisualizationMode) {
  return `infinity-visualization-v1:${JSON.stringify([pathId, topicId, mode])}`;
}
export function restoreVisualization(raw: string | null, context: string, mode: VisualizationMode): TopicVisualization | null {
  try {
    const saved = z.object({ version: z.literal(1), context: z.string(), mode: visualizationModeSchema, visualization: z.unknown() }).parse(JSON.parse(raw || "null"));
    return saved.context === context && saved.mode === mode ? validateVisualization(saved.visualization, mode) : null;
  } catch { return null; }
}

/** Deterministic tree layout; the model supplies concepts, never coordinates or code. */
export function layoutVisualization(graph: TopicVisualization) {
  const depths = new Map([[graph.nodes[0].id, 0]]);
  const queue = [graph.nodes[0].id];
  for (let i = 0; i < queue.length; i++) {
    for (const edge of graph.edges.filter(edge => edge.from === queue[i])) {
      if (depths.has(edge.to)) continue;
      depths.set(edge.to, depths.get(edge.from)! + 1); queue.push(edge.to);
    }
  }
  const levels = Array.from({ length: Math.max(...depths.values()) + 1 }, (_, depth) => queue.filter(id => depths.get(id) === depth));
  const width = Math.max(560, ...levels.map(level => level.length * 190 + 32));
  const nodes = graph.nodes.map(node => {
    const depth = depths.get(node.id)!, level = levels[depth];
    return { ...node, x: width / 2 + (level.indexOf(node.id) - (level.length - 1) / 2) * 190 - 80, y: 24 + depth * (visualizationNodeHeight + 46) };
  });
  return { width, height: levels.length * (visualizationNodeHeight + 46) + 8, nodes };
}
