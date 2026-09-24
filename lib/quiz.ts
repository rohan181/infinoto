import { z } from "zod";
import type { Topic } from "@/app/data";
import { difficultySchema } from "./learning";

export const quizRequestSchema = z.object({
  pathTitle: z.string().trim().min(1).max(100),
  topic: z.object({ id: z.string().min(1).max(100), title: z.string().min(1).max(100), description: z.string().max(500), difficulty: difficultySchema, concepts: z.array(z.string().min(1).max(100)).max(12) }),
});
export const quizModelSchema = z.object({ questions: z.array(z.object({
  prompt: z.string().min(1).max(700), concept: z.string().min(1).max(100),
  options: z.array(z.string().min(1).max(350)).length(4),
  correctIndex: z.number().int().min(0).max(3), explanation: z.string().min(1).max(900),
})).length(3) });
export const quizSchema = quizModelSchema.superRefine(({ questions }, context) => {
  const normalize = (text: string) => text.trim().toLowerCase();
  if (new Set(questions.map(q => normalize(q.prompt))).size !== questions.length) context.addIssue({ code: "custom", message: "Questions must be distinct." });
  questions.forEach((q, index) => {
    if ([q.prompt, q.concept, q.explanation, ...q.options].some(text => !text.trim())) context.addIssue({ code: "custom", message: "Quiz text cannot be blank.", path: ["questions", index] });
    if (new Set(q.options.map(normalize)).size !== 4) context.addIssue({ code: "custom", message: "Answer choices must be distinct.", path: ["questions", index, "options"] });
  });
});
export type Quiz = z.infer<typeof quizSchema>;
export const quizResponseSchema = z.object({ topicId: z.string(), quiz: quizSchema });
export const quizAttemptSchema = z.object({
  version: z.literal(1), context: z.string(), quiz: quizSchema,
  answers: z.array(z.number().int().min(0).max(3)).max(3),
});
export type QuizAttempt = z.infer<typeof quizAttemptSchema>;
export function quizContext(pathTitle: string, topic: Topic): string {
  return JSON.stringify([pathTitle, topic.id, topic.title, topic.description, topic.difficulty, topic.concepts]);
}
export function quizStorageKey(pathId: string, topicId: string): string {
  return `infinity-quiz-v1:${JSON.stringify([pathId, topicId])}`;
}
export function restoreQuizAttempt(raw: string | null, context: string): QuizAttempt | null {
  try {
    const parsed = quizAttemptSchema.safeParse(JSON.parse(raw || "null"));
    return parsed.success && parsed.data.context === context ? parsed.data : null;
  } catch { return null; }
}
export function quizScore(quiz: Quiz, answers: number[]) {
  if (answers.length > quiz.questions.length || answers.some(answer => !Number.isInteger(answer) || answer < 0 || answer > 3)) throw new Error("Invalid quiz answers.");
  const correct = answers.filter((answer, i) => answer === quiz.questions[i].correctIndex).length;
  const review = [...new Set(quiz.questions.filter((q, i) => i < answers.length && answers[i] !== q.correctIndex).map(q => q.concept))];
  return { correct, total: quiz.questions.length, answered: answers.length, finished: answers.length === quiz.questions.length, review };
}
