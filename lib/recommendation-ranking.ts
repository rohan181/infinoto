import type { Difficulty, Resource } from "@/app/data";
import { canonicalUrl } from "./resources";
import { resourceFormat } from "./recommendations";
import { concreteConcepts, selectedTopicRelevance, topicRelevance, topicTerms, type TopicContext } from "./topic-search";

export type RecommendationContext = TopicContext & { difficulty: Difficulty };
const stages: Record<Difficulty, number> = { Beginner: 0, Intermediate: 1, Advanced: 2 };

/** Metadata-based fit, not a claim that the source has been watched or fact-checked. */
export function recommendationFit(resource: Resource, context: RecommendationContext) {
  const evidence = resource.sourceExcerpt || (resource.provenance?.kind === "curated" ? resource.reason || "" : "");
  const relevance = selectedTopicRelevance(resource.title, evidence, context);
  const concepts = context.focus?.trim() ? [] : concreteConcepts(context).filter(concept => topicRelevance("", `${resource.title} ${evidence}`, concept) >= 0.99);
  const gap = resource.level === "Not assessed" ? null : stages[resource.level] - stages[context.difficulty];
  const levelFit = gap === 0 ? 5 : gap === null ? 0 : gap > 0 ? -5 * gap : -1.5 * Math.abs(gap);
  const format = resourceFormat(resource);
  const directLesson = format === "Videos" || format === "Blogs";
  const teaching = /\b(?:tutorial|explained|explanation|lesson|guide|examples?|exercise|walkthrough|step.by.step)\b/i.test(`${resource.title} ${evidence}`) ? 1.5 : 0;
  const promotional = /\b(?:best courses|top \d+|roadmap|salary|coupon|discount|sponsored)\b/i.test(resource.title) ? 4 : 0;
  const score = relevance * 3 + Math.min(concepts.length, 3) * 1.5 + levelFit + teaching
    + (directLesson ? 2 : format === "Channels" ? -3 : 0) - promotional;
  const explanation = resource.matchContext === "path" ? "Broader path resource"
    : concepts.length ? `Matches ${concepts.slice(0, 2).join(" · ")}`
    : relevance >= 1 ? "Matches this topic" : "Related learning resource";
  const levelNote = gap === 0 ? `Matches the node’s ${context.difficulty.toLowerCase()} level`
    : gap !== null && gap > 0 ? "Needs more prior knowledge" : gap !== null && gap < 0 ? "Useful for reviewing foundations" : "Difficulty not assessed";
  return { score, relevance, concepts, explanation, levelNote };
}

function creatorKey(resource: Resource): string {
  if (resource.type === "YouTube") return resource.youtube?.channelId || resource.author.toLowerCase().trim();
  return new URL(resource.url).hostname.replace(/^www\./, "");
}

/** Greedy ordering keeps every valid card, while reducing repeated creators and formats up front. */
export function rankRecommendations(resources: Resource[], context: RecommendationContext): Resource[] {
  const seen = new Set<string>();
  const candidates = resources.filter(resource => {
    const url = canonicalUrl(resource.url);
    if (!url || seen.has(url)) return false;
    seen.add(url); return true;
  }).map((resource, index) => ({ resource, index, fit: recommendationFit(resource, context) }));
  const ordered: Resource[] = [];
  const creators = new Map<string, number>(), formats = new Map<string, number>(), titles = new Map<string, number>();
  for (const broader of [false, true]) {
    const pool = candidates.filter(item => (item.resource.matchContext === "path") === broader);
    while (pool.length) {
      const adjusted = (item: typeof pool[number]) => {
        const title = topicTerms(item.resource.title).join(" ");
        return item.fit.score - (creators.get(creatorKey(item.resource)) || 0) * 5
          - (formats.get(resourceFormat(item.resource)) || 0) * 1.5 - (titles.get(title) || 0) * 3;
      };
      pool.sort((a, b) => adjusted(b) - adjusted(a) || a.index - b.index);
      const { resource } = pool.shift()!;
      ordered.push(resource);
      const creator = creatorKey(resource), format = resourceFormat(resource), title = topicTerms(resource.title).join(" ");
      creators.set(creator, (creators.get(creator) || 0) + 1);
      formats.set(format, (formats.get(format) || 0) + 1);
      titles.set(title, (titles.get(title) || 0) + 1);
    }
  }
  return ordered;
}

export function learningPreference(level: string, preferred?: Difficulty): string {
  return level !== "All levels" ? `Keep only resources suited to ${level}; never relabel a resource to fill a quota.`
    : preferred ? `This node is ${preferred}. Prioritize resources suited to that stage and useful prerequisites. Include more demanding sources only as clearly labeled next steps. Do not force a mix of levels or mislabel difficulty.`
      : "Order by direct relevance and teaching value. Do not force a mix of difficulty levels or mislabel difficulty.";
}
