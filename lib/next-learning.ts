import type { LearningPath, Topic } from "@/app/data";

export const DEFAULT_STUDY_MINUTES = 30;
export function parseStudyMinutes(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const minutes = Number(value);
  return Number.isInteger(minutes) && minutes >= 5 && minutes <= 480 ? minutes : null;
}

export type NextTopic = {
  topic: Topic; totalMinutes: number | null; sessionMinutes: number; fits: boolean;
  prerequisites: Topic[]; unlocks: Topic[]; focus: string; steps: { minutes: number; task: string }[];
};
export type NextLearning = { status: "ready" | "complete" | "blocked" | "empty"; readyCount: number; remainingCount: number; suggestions: NextTopic[] };

/** Recommendations use the current path only; the goal node is never a study prerequisite. */
export function recommendNextTopics(path: LearningPath, completed: string[], minutes: number): NextLearning {
  if (parseStudyMinutes(minutes) === null) throw new Error("Choose between 5 and 480 whole minutes.");
  const done = new Set(completed);
  const topics = path.topics.filter(topic => topic.id !== "0");
  const remaining = topics.filter(topic => !done.has(topic.id));
  const byId = new Map(topics.map(topic => [topic.id, topic]));
  const requirements = (topic: Topic) => [...new Set(topic.prerequisites.filter(id => id !== "0"))];
  if (!remaining.length) return { status: topics.length ? "complete" : "empty", readyCount: 0, remainingCount: 0, suggestions: [] };
  const ready = remaining.filter(topic => requirements(topic).every(id => byId.has(id) && done.has(id)));
  const suggestions = ready.map((topic): NextTopic => {
    const totalMinutes = Number.isFinite(topic.hours) && topic.hours > 0 ? Math.ceil(topic.hours * 60) : null;
    const sessionMinutes = totalMinutes === null ? minutes : Math.min(minutes, totalMinutes);
    const fits = totalMinutes !== null && totalMinutes <= minutes;
    const prerequisites = requirements(topic).map(id => byId.get(id)!);
    const unlocks = remaining.filter(next => requirements(next).includes(topic.id) && requirements(next).every(id => id === topic.id || (byId.has(id) && done.has(id))));
    const focus = topic.concepts.find(concept => concept.trim()) || topic.title;
    const review = Math.max(1, Math.floor(sessionMinutes * .15));
    const practice = Math.max(1, Math.floor(sessionMinutes * .3));
    // Topic estimates can be tiny in imported paths. Never allocate more than the budget.
    const steps = sessionMinutes < 5 ? [{ minutes: sessionMinutes, task: `Review ${focus} and note one takeaway.` }] : [
      { minutes: sessionMinutes - review - practice, task: `Study ${fits ? topic.title : focus} using a resource from this topic.` },
      { minutes: practice, task: "Work through one example or explain the idea in your own words." },
      { minutes: review, task: "Recall the key points and note what you want to revisit." },
    ];
    return { topic, totalMinutes, sessionMinutes, fits, prerequisites, unlocks, focus, steps };
  });
  const difficulty = { Beginner: 0, Intermediate: 1, Advanced: 2 };
  suggestions.sort((a, b) => Number(b.fits) - Number(a.fits)
    || Number(b.prerequisites.length > 0) - Number(a.prerequisites.length > 0)
    || b.unlocks.length - a.unlocks.length
    || difficulty[a.topic.difficulty] - difficulty[b.topic.difficulty]
    || (a.fits ? b.totalMinutes! - a.totalMinutes! : (a.totalMinutes ?? Infinity) - (b.totalMinutes ?? Infinity)));
  return { status: ready.length ? "ready" : "blocked", readyCount: ready.length, remainingCount: remaining.length, suggestions: suggestions.slice(0, 3) };
}

export function formatStudyTime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return `${hours}h${rest ? ` ${rest}m` : ""}`;
}
