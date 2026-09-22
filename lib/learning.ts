import { z } from "zod";
import type { LearningPath } from "../app/data";

export const difficultySchema = z.enum(["Beginner", "Intermediate", "Advanced"]);
export const generatedPathSchema = z.object({
  title: z.string().min(1).max(70),
  description: z.string().min(1).max(350),
  topics: z.array(z.object({
    id: z.string().regex(/^[a-zA-Z0-9_-]+$/).max(40),
    title: z.string().min(1).max(65),
    description: z.string().min(1).max(450),
    difficulty: difficultySchema,
    hours: z.number().int().min(1).max(100),
    prerequisites: z.array(z.string()).max(6),
    concepts: z.array(z.string().min(1).max(70)).min(1).max(5),
  })).min(6).max(20),
});

export const conversationSchema = z.object({
  reply: z.string().min(1).max(1800),
  suggestions: z.array(z.string().min(1).max(90)).max(3),
  path: generatedPathSchema.nullable(),
});

export type ChatMessage = { id: string; role: "user" | "assistant"; content: string; pathId?: string };
export type GeneratedPath = z.infer<typeof generatedPathSchema>;

/** Check graph semantics separately from the model's JSON shape. Never invent missing edges. */
export function buildLearningPath(input: unknown): LearningPath {
  const data = generatedPathSchema.parse(input);
  const ids = new Set<string>(["0"]);
  const rows = new Map<string, number>([["0", 0]]);
  const occupied = new Map<number, number>();
  const result: LearningPath = {
    id: crypto.randomUUID(), title: data.title, description: data.description,
    createdAt: new Date().toISOString(), source: "claude",
    topics: [{ id: "0", title: data.title, description: data.description, subtitle: "Your personalized learning path", difficulty: "Beginner", hours: 0, icon: "spark", prerequisites: [], children: [], x: 260, y: 35, concepts: ["Start with the foundations", "Follow your own pace"] }],
  };
  for (const [index, item] of data.topics.entries()) {
    if (ids.has(item.id)) throw new Error("The generated path contains duplicate topics.");
    if (item.prerequisites.some(id => !ids.has(id))) throw new Error("The generated path contains an invalid prerequisite order.");
    if (new Set(item.prerequisites).size !== item.prerequisites.length) throw new Error("The generated path repeats a prerequisite.");
    const prerequisites = item.prerequisites.length ? item.prerequisites : ["0"];
    let row = Math.max(...prerequisites.map(id => rows.get(id)!)) + 1;
    while ((occupied.get(row) || 0) >= 3) row++;
    const column = occupied.get(row) || 0;
    occupied.set(row, column + 1);
    rows.set(item.id, row); ids.add(item.id);
    result.topics.push({ ...item, subtitle: item.concepts[0], prerequisites, children: [],
      x: 20 + column * 240, y: 35 + row * 178,
      icon: ["code", "math", "database", "network", "brain", "chart"][index % 6], resources: [],
    });
  }
  // Center each depth level while preserving topological order and non-overlapping cards.
  for (const topic of result.topics) {
    const row = rows.get(topic.id)!;
    if (row > 0) topic.x += (3 - occupied.get(row)!) * 120;
    topic.children = result.topics.filter(t => t.prerequisites.includes(topic.id)).map(t => t.id);
  }
  return result;
}

export const requestSchema = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(2400) })).min(1).max(16),
}).refine(data => data.messages[data.messages.length - 1]?.role === "user", "The last message must be from the learner.")
  .refine(data => data.messages.reduce((total, message) => total + message.content.length, 0) <= 18000, "This conversation is too long. Start a new conversation.");

export function isLearningPath(value: unknown): value is LearningPath {
  if (!value || typeof value !== "object") return false;
  const path = value as LearningPath;
  return typeof path.id === "string" && typeof path.title === "string" && Array.isArray(path.topics) && path.topics.length > 1 && path.topics.length <= 120 && path.topics.every(t =>
    t && typeof t.id === "string" && typeof t.title === "string" && typeof t.description === "string" &&
    typeof t.x === "number" && Number.isFinite(t.x) && typeof t.y === "number" && Number.isFinite(t.y) &&
    ["Beginner", "Intermediate", "Advanced"].includes(t.difficulty) && typeof t.hours === "number" && Number.isFinite(t.hours) && t.hours >= 0 &&
    Array.isArray(t.prerequisites) && t.prerequisites.every(id => typeof id === "string") &&
    Array.isArray(t.children) && t.children.every(id => typeof id === "string") &&
    Array.isArray(t.concepts) && t.concepts.every(concept => typeof concept === "string"));
}
