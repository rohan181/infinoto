import { z } from "zod";
import type { LearningPath, Topic } from "@/app/data";
import { difficultySchema } from "./learning";

export const MAX_TOPICS = 120;
const idSchema = z.string().min(1).max(100);
export const topicSummarySchema = z.object({
  id: idSchema, title: z.string().min(1).max(100),
  description: z.string().max(500), difficulty: difficultySchema,
  prerequisites: z.array(idSchema).max(10),
});
export const expandRequestSchema = z.object({
  pathTitle: z.string().min(1).max(100), topicId: idSchema,
  level: difficultySchema, focus: z.string().trim().max(250).default(""),
  topics: z.array(topicSummarySchema).min(1).max(MAX_TOPICS - 3),
}).refine(input => input.topics.some(t => t.id === input.topicId), "The selected topic is missing.");

export const branchResponseSchema = z.object({
  summary: z.string().min(1).max(400),
  topics: z.array(z.object({
    id: z.string().regex(/^[a-zA-Z0-9_-]+$/).min(1).max(40),
    title: z.string().min(1).max(65), description: z.string().min(1).max(450),
    difficulty: difficultySchema, hours: z.number().int().min(1).max(100),
    prerequisites: z.array(idSchema).max(6),
    concepts: z.array(z.string().min(1).max(70)).min(1).max(5),
  })).min(3).max(5),
});

export function createBranchTopics(raw: unknown, context: z.infer<typeof expandRequestSchema>): Topic[] {
  const data = branchResponseSchema.parse(raw);
  if (context.topics.length + data.topics.length > MAX_TOPICS) throw new Error("This map has reached its topic limit.");
  const seenTitles = new Set(context.topics.map(t => t.title.trim().toLocaleLowerCase()));
  const idMap = new Map<string, string>();
  const existingIds = new Set(context.topics.map(t => t.id));
  const createdAt = new Date().toISOString();
  return data.topics.map((topic): Topic => {
    if (existingIds.has(topic.id) || idMap.has(topic.id)) throw new Error("The branch contains a duplicate topic ID.");
    if (topic.difficulty !== context.level) throw new Error("The generated branch does not match the requested difficulty.");
    const normalized = topic.title.trim().toLocaleLowerCase();
    if (seenTitles.has(normalized)) throw new Error("The branch repeats a topic already in the map.");
    seenTitles.add(normalized);
    const requested = topic.prerequisites.length ? topic.prerequisites : [context.topicId];
    const prerequisites = requested.map(id => {
      if (id === context.topicId) return id;
      if (idMap.has(id)) return idMap.get(id)!;
      throw new Error("A new branch must connect to its parent or an earlier new subtopic.");
    });
    const id = `branch-${crypto.randomUUID()}`;
    idMap.set(topic.id, id);
    return { ...topic, id, prerequisites: [...new Set(prerequisites)], parentTopicId: context.topicId,
      expandedAt: createdAt, children: [], resources: [], subtitle: topic.concepts[0], icon: "network", x: 0, y: 0 };
  });
}

/** Recompute every row from the DAG; existing IDs/resources/progress remain stable. */
export function layoutLearningPath(path: LearningPath): LearningPath {
  if (path.topics.length > MAX_TOPICS) throw new Error("This learning map is full.");
  const byId = new Map(path.topics.map(t => [t.id, t]));
  if (byId.size !== path.topics.length || !byId.has("0")) throw new Error("The learning map has duplicate or missing IDs.");
  const rows = new Map<string, number>();
  const visiting = new Set<string>();
  const occupied = new Map<number, number>();
  const positions = new Map<string, number>();
  function place(id: string): number {
    if (rows.has(id)) return rows.get(id)!;
    if (visiting.has(id)) throw new Error("The learning map contains a cycle.");
    const topic = byId.get(id);
    if (!topic) throw new Error("A prerequisite could not be found.");
    visiting.add(id);
    const prerequisites = topic.prerequisites.length ? topic.prerequisites : id === "0" ? [] : ["0"];
    if (id === "0" && prerequisites.length) throw new Error("The root cannot have prerequisites.");
    let row = prerequisites.length ? Math.max(...prerequisites.map(place)) + 1 : 0;
    while ((occupied.get(row) || 0) >= 3) row++;
    positions.set(id, occupied.get(row) || 0); occupied.set(row, (occupied.get(row) || 0) + 1);
    rows.set(id, row); visiting.delete(id); return row;
  }
  path.topics.forEach(t => place(t.id));
  const topics = path.topics.map(topic => ({ ...topic,
    prerequisites: topic.id !== "0" && !topic.prerequisites.length ? ["0"] : topic.prerequisites,
    x: 20 + positions.get(topic.id)! * 240 + (3 - occupied.get(rows.get(topic.id)!)!) * 120,
    y: 35 + rows.get(topic.id)! * 178,
    children: [] as string[],
  }));
  topics.forEach(topic => { topic.children = topics.filter(t => t.prerequisites.includes(topic.id)).map(t => t.id); });
  return { ...path, topics };
}

export function appendBranch(path: LearningPath, parentId: string, additions: Topic[]): LearningPath {
  if (!path.topics.some(t => t.id === parentId) || !additions.length || additions.some(t => t.parentTopicId !== parentId)) throw new Error("The generated branch belongs to a different topic.");
  return layoutLearningPath({ ...path, topics: [...path.topics, ...additions] });
}

export function outlineParent(topic: Topic): string | undefined {
  return topic.prerequisites[0] || topic.parentTopicId;
}
