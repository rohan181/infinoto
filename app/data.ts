export type Difficulty = "Beginner" | "Intermediate" | "Advanced";
export type ResourceType = "YouTube" | "Blogs" | "Papers" | "Other";
export type Topic = { id: string; title: string; subtitle: string; difficulty: Difficulty; hours: number; icon: string; prerequisites: string[]; children: string[]; x: number; y: number; description: string; concepts: string[]; resources?: Resource[] };
export type LearningPath = { id: string; title: string; description: string; topics: Topic[]; createdAt: string; source?: "claude" | "example" };
export type Resource = { id: string; type: ResourceType; title: string; author: string; meta: string; level: Difficulty; url: string; art: string };

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

export function getResources(topic: Topic, pathTitle: string): Resource[] {
  if (topic.resources?.length) return topic.resources;
  const query = `${topic.id === "0" ? pathTitle : `${topic.title} ${pathTitle}`}`;
  const q = encodeURIComponent(query);
  if (topic.id === "2" && /machine learning/i.test(pathTitle)) return [
    { id: "linear-algebra", type: "YouTube", title: "Essence of linear algebra", author: "3Blue1Brown", meta: "Visual lecture series", level: "Beginner", url: "https://www.youtube.com/playlist?list=PLZHQObOWTQDMsr9K-rj53DwVRMYO3t5Yr", art: "linear" },
    { id: "calculus", type: "YouTube", title: "Essence of calculus", author: "3Blue1Brown", meta: "Visual lecture series", level: "Intermediate", url: "https://www.youtube.com/playlist?list=PLZHQObOWTQDMdJyla2Z3cPn5Eyb9yaSdd", art: "calculus" },
    { id: "statistics", type: "YouTube", title: "Statistics, made intuitive", author: "StatQuest with Josh Starmer", meta: "Explore the video library", level: "Beginner", url: "https://www.youtube.com/@statquest", art: "stats" },
    { id: "math-blog", type: "Blogs", title: "A visual introduction to linear algebra", author: "3Blue1Brown", meta: "Visual lessons & explanations", level: "Beginner", url: "https://www.3blue1brown.com/topics/linear-algebra", art: "linear" },
    { id: "distill", type: "Blogs", title: "Explore machine learning visually", author: "Distill", meta: "Interactive research articles", level: "Advanced", url: "https://distill.pub/", art: "calculus" },
    { id: "math-papers", type: "Papers", title: "Mathematics for machine learning research", author: "arXiv", meta: "Search open-access papers", level: "Advanced", url: "https://arxiv.org/search/?query=mathematics+machine+learning&searchtype=all", art: "stats" },
    { id: "math-book", type: "Other", title: "Mathematics for Machine Learning", author: "Deisenroth, Faisal & Ong", meta: "Free textbook · Exercises", level: "Intermediate", url: "https://mml-book.github.io/", art: "linear" },
    { id: "mit-linear", type: "Other", title: "Linear Algebra · MIT OpenCourseWare", author: "Gilbert Strang · MIT", meta: "Course · Lectures & assignments", level: "Beginner", url: "https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/", art: "calculus" },
  ];
  return [
    { id: `${topic.id}-video-b`, type: "YouTube", title: `${topic.title}: start here`, author: "YouTube discovery", meta: "Find beginner tutorials", level: "Beginner", url: `https://www.youtube.com/results?search_query=${q}+beginner+tutorial`, art: "linear" },
    { id: `${topic.id}-video-i`, type: "YouTube", title: `${topic.title} in practice`, author: "YouTube discovery", meta: "Find project walkthroughs", level: "Intermediate", url: `https://www.youtube.com/results?search_query=${q}+project+tutorial`, art: "calculus" },
    { id: `${topic.id}-video-a`, type: "YouTube", title: `A deeper look at ${topic.title.toLowerCase()}`, author: "YouTube discovery", meta: "Find advanced lectures", level: "Advanced", url: `https://www.youtube.com/results?search_query=${q}+advanced+lecture`, art: "stats" },
    ...(["Beginner", "Intermediate", "Advanced"] as Difficulty[]).map((level): Resource => ({ id: `${topic.id}-blog-${level}`, type: "Blogs", title: `${topic.title}: ${level.toLowerCase()} reading`, author: "Article discovery", meta: "Search articles & tutorials", level, url: `https://www.google.com/search?q=${q}+${level.toLowerCase()}+tutorial+article`, art: "linear" })),
    { id: `${topic.id}-paper`, type: "Papers", title: `Research on ${topic.title.toLowerCase()}`, author: "arXiv", meta: "Search open-access research", level: "Advanced", url: `https://arxiv.org/search/?query=${q}&searchtype=all`, art: "stats" },
    { id: `${topic.id}-other`, type: "Other", title: `${topic.title} courses & practice`, author: "Learning resource discovery", meta: "Search courses, docs & exercises", level: topic.difficulty, url: `https://www.google.com/search?q=${q}+free+course+documentation+exercises`, art: "calculus" },
  ];
}
