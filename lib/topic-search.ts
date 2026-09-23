type TopicContext = { topicTitle: string; pathTitle: string; concepts: string[]; focus?: string };
const words = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}+#]+/gu, " ").split(/\s+/).filter(Boolean);
const generic = new Set(["learn", "learning", "programming", "tutorial", "tutorials", "introduction", "fundamentals", "essentials", "basics", "advanced", "beginner", "intermediate", "and", "for", "the", "of", "to", "a", "with", "in"]);
export function topicTerms(title: string): string[] { return [...new Set(words(title).filter(w => !generic.has(w)))]; }
export function searchSubject(input: TopicContext): string {
  const title = input.focus?.trim() || input.topicTitle.trim();
  // Generated roadmap labels need their actual concepts to become useful queries.
  const genericLabel = /^(?:core vocabulary|foundational concepts|essential tools|guided practice|key techniques|advanced concepts|specialized applications|real.world practice|independent research|build a capstone)$/i.test(title);
  if (genericLabel && input.concepts.some(concept => topicTerms(concept).length)) {
    return `${input.concepts.filter(concept => topicTerms(concept).length).slice(0, 2).join(" ")} for ${input.pathTitle}`;
  }
  // Broad labels need the learning goal to disambiguate them. Specific subjects
  // (e.g. Python programming) must not become searches for the whole ML roadmap.
  const broad = /^(?:mathematics|statistics|probability|transformers|attention|variables|functions|lists|loops|testing|deployment|authentication|core vocabulary|foundational concepts|essential tools|guided practice|key techniques|advanced concepts|specialized applications|real.world practice|independent research|build a capstone|data fundamentals)$/i.test(title);
  return broad && input.pathTitle.toLowerCase() !== title.toLowerCase() ? `${title} for ${input.pathTitle}` : title;
}
export function topicRelevance(title: string, description: string, topic: string): number {
  const terms = topicTerms(topic);
  if (!terms.length) return 1;
  const titleWords = new Set(words(title)), content = new Set(words(description));
  const matches = (term: string, set: Set<string>) => set.has(term) || (term.endsWith("s") && set.has(term.slice(0, -1))) || set.has(`${term}s`);
  const inTitle = terms.filter(t => matches(t, titleWords)).length / terms.length;
  const inBody = terms.filter(t => matches(t, content)).length / terms.length;
  return inTitle * 4 + inBody;
}
export function diversify<T>(items: T[], key: (item: T) => string, maxPerSource = 2): T[] {
  const counts = new Map<string, number>();
  return items.filter(item => { const source = key(item), count = counts.get(source) || 0; counts.set(source, count + 1); return count < maxPerSource; });
}
