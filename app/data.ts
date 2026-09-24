export type Difficulty = "Beginner" | "Intermediate" | "Advanced";
export type ResourceType = "YouTube" | "Blogs" | "Books" | "Papers" | "Social" | "Other";
export type YouTubeKind = "video" | "playlist" | "channel";
export type DiscoveryProvider = "exa" | "claude" | "youtube";
export type Topic = { id: string; title: string; subtitle: string; difficulty: Difficulty; hours: number; icon: string; prerequisites: string[]; children: string[]; x: number; y: number; description: string; concepts: string[]; resources?: Resource[]; parentTopicId?: string; expandedAt?: string };
export type LearningPath = { id: string; title: string; description: string; topics: Topic[]; createdAt: string; source?: "claude" | "example" };
export type Resource = { id: string; type: ResourceType; title: string; author: string; meta: string; level: Difficulty | "Not assessed"; url: string; art: string; reason?: string; sourceExcerpt?: string; youtubeKind?: YouTubeKind; youtube?: { channelId: string; durationSeconds?: number; publishedAt?: string; videoCount?: number }; topics?: string[]; matchContext?: "topic" | "path"; provenance?: { kind: "curated" | "web-search"; provider?: DiscoveryProvider; sourceTitle: string; sourceUrl: string; checkedAt: string }; book?: { authors: string; publisher?: string; year?: string; isbn?: string } };

const layouts = [
  [240, 30], [10, 207], [240, 207], [470, 207],
  [10, 390], [240, 390], [470, 390],
  [10, 573], [240, 573], [470, 573],
  [10, 756], [240, 756], [240, 939],
];

const mlNames = ["Machine Learning", "Python programming", "Mathematics", "Data fundamentals", "Supervised learning", "Unsupervised learning", "Model evaluation", "Neural networks", "Natural language processing", "ML in production", "Deep learning", "Transformers", "Build a capstone"];
const webNames = ["Web Development", "HTML & accessibility", "CSS & layouts", "JavaScript", "React fundamentals", "Next.js", "APIs & databases", "Full-stack applications", "Testing & performance", "Deployment", "Authentication", "Web architecture", "Build a capstone"];
const dsNames = ["Data Science", "Python programming", "Statistics & probability", "Data fundamentals", "Data visualization", "Exploratory analysis", "SQL & databases", "Machine learning", "Experiment design", "Data pipelines", "Predictive modeling", "Causal inference", "Build a capstone"];

export function createPath(title: string, level: Difficulty = "Beginner"): LearningPath {
  const normalized = title.toLowerCase();
  const names = /machine learning|artificial intelligence|^ai$/.test(normalized) ? [...mlNames] : /web|next.?js|frontend|front.end/.test(normalized) ? [...webNames] : /data science|data analysis/.test(normalized) ? [...dsNames] : [title, "Core vocabulary", "Foundational concepts", "Essential tools", "Guided practice", "Key techniques", "Evaluate your work", "Advanced concepts", "Specialized applications", "Real-world practice", "Independent research", "Explore a specialization", "Build a capstone"];
  names[0] = title;
  const parents: string[][] = [[], ["0"], ["0"], ["0"], ["1", "2"], ["2", "3"], ["3"], ["4"], ["5"], ["6"], ["7"], ["8"], ["9", "10", "11"]];
  if (/web|next.?js|frontend|front.end/.test(normalized)) {
    parents[4] = ["1", "2", "3"];
    parents[5] = ["4"];
    parents[7] = ["5", "6"];
    parents[8] = ["4", "5"];
    parents[9] = ["6"];
    parents[10] = ["6", "7"];
    parents[11] = ["7", "8"];
  }
  const children = names.map((_, i) => parents.flatMap((requirements, j) => requirements.includes(String(i)) ? [String(j)] : []));
  const subtitles = ["Your learning journey", "Write your first building blocks", "Understand the why behind it", "Build a strong foundation", "Learn by doing", "Find patterns and connections", "Measure what matters", "Go a little deeper", "Turn theory into possibility", "Bring your knowledge to life", "Explore the inner workings", "Connect the bigger picture", "Make something of your own"];
  const icons = ["spark", "code", "math", "database", "chart", "network", "gauge", "brain", "message", "box", "network", "spark", "flag"];
  const topics: Topic[] = names.map((name, i) => ({ id: String(i), title: name, subtitle: subtitles[i], difficulty: i < 4 ? "Beginner" : i < 7 ? "Intermediate" : "Advanced", hours: i === 0 ? 0 : [4, 6, 8, 5][i % 4], icon: icons[i], prerequisites: parents[i], children: children[i], x: layouts[i][0], y: layouts[i][1], description: `Build a practical understanding of ${name.toLowerCase()} and how it connects to ${title.toLowerCase()}. Work through the essentials, explore a few examples, and put what you learn into practice.`, concepts: i === 2 && /machine learning/i.test(title) ? ["Linear algebra", "Calculus", "Probability & statistics"] : [`${name} essentials`, "Hands-on practice", "Real-world applications"] }));
  if (/machine learning/i.test(title)) topics[2].description = "The language behind machine learning. Build an intuitive understanding of the math that makes models work, one concept at a time.";
  if (level !== "Beginner") topics[0].subtitle = `A ${level.toLowerCase()} starting point`;
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, title, description: `From first principles to real-world projects. Your personal roadmap to ${title.toLowerCase()}.`, topics, createdAt: new Date().toISOString() };
}

export const initialPath = { ...createPath("Machine Learning"), id: "machine-learning" };
