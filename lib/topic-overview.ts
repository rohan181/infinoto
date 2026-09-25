import { z } from "zod";
import type { Topic } from "@/app/data";
import { difficultySchema } from "./learning";

export const overviewRequestSchema = z.object({
  pathTitle: z.string().trim().min(1).max(100),
  topic: z.object({
    id: z.string().min(1).max(100), title: z.string().trim().min(1).max(100),
    description: z.string().max(500), difficulty: difficultySchema,
    concepts: z.array(z.string().trim().min(1).max(100)).max(12),
  }),
});
const text = (max: number) => z.string().trim().min(1).max(max);
export const overviewSchema = z.object({
  summary: text(1000),
  whyItMatters: text(500),
  keyIdeas: z.array(z.object({ title: text(100), explanation: text(500) })).min(3).max(5),
  example: z.object({ title: text(120), walkthrough: text(1400) }),
  practice: text(600),
});
export type Overview = z.infer<typeof overviewSchema>;
export const overviewResponseSchema = z.object({ topicId: z.string(), overview: overviewSchema });
const savedOverviewSchema = z.object({ version: z.literal(1), context: z.string(), overview: overviewSchema });

export function overviewContext(pathTitle: string, topic: Topic) {
  return JSON.stringify([pathTitle, topic.id, topic.title, topic.description, topic.difficulty, topic.concepts]);
}
export function overviewStorageKey(pathId: string, topicId: string) {
  return `infinity-overview-v1:${JSON.stringify([pathId, topicId])}`;
}
export function restoreOverview(raw: string | null, context: string): Overview | null {
  try {
    const parsed = savedOverviewSchema.safeParse(JSON.parse(raw || "null"));
    return parsed.success && parsed.data.context === context ? parsed.data.overview : null;
  } catch { return null; }
}
