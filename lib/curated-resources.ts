import type { Difficulty, Resource, ResourceType, Topic } from "@/app/data";
import { mergeResources, resourceRecordSchema, sourceAuthor, youtubeKindForUrl } from "./resources";

// Direct source pages reviewed on 21 September 2026. These are a small starter
// library, distinct from live recommendations returned by /api/resources.
const checkedAt = "2026-09-21T00:00:00.000Z";
function source(id: string, type: ResourceType, level: Difficulty, title: string, author: string, url: string, reason: string, book?: Resource["book"]): Resource {
  return { id: `curated-${id}`, type, level, title, author, url, reason, book, art: "linear",
    meta: type === "Books" ? "Book reference" : "Direct source",
    provenance: { kind: "curated", sourceTitle: title, sourceUrl: url, checkedAt } };
}

const python: Resource[] = [
  source("python-start", "YouTube", "Beginner", "Learn Python — Full Course for Beginners", "freeCodeCamp.org · Mike Dane", "https://www.youtube.com/watch?v=rfscVS0vtbw", "Starts with setup, variables, and control flow; no Python experience needed."),
  source("python-generators", "YouTube", "Intermediate", "Python Tutorial: Generators", "Corey Schafer", "https://www.youtube.com/watch?v=bD05uGo_sVI", "Builds on functions and loops to explain lazy iteration and memory-efficient code."),
  source("python-concurrency", "YouTube", "Advanced", "Python Concurrency From the Ground Up: LIVE!", "David Beazley · PyCon 2015", "https://www.youtube.com/watch?v=MCs5OvhV9S4", "Builds concurrency mechanisms from generators; assumes confident Python skills. A foundational 2015 talk."),
  source("python-variables", "Blogs", "Beginner", "Variables in Python: Usage and Best Practices", "Leodanis Pozo Ramos · Real Python", "https://realpython.com/python-variables/", "Introduces assignment and naming before moving into object references and scope."),
  source("python-yield", "Blogs", "Intermediate", "How to Use Generators and yield in Python", "Kyle Stratis · Real Python", "https://realpython.com/introduction-to-python-generators/", "Requires functions and iteration; develops generators and data-processing pipelines."),
  source("python-gil", "Blogs", "Advanced", "What Is the Python Global Interpreter Lock (GIL)?", "Real Python", "https://realpython.com/python-gil/", "Explores threading and CPU-bound performance in traditional GIL-enabled CPython; assumes concurrency basics."),
  source("automate", "Books", "Beginner", "Automate the Boring Stuff with Python", "Al Sweigart", "https://automatetheboringstuff.com/", "Learn basic Python through useful automation projects; the author provides an online edition.", { authors: "Al Sweigart", publisher: "No Starch Press" }),
  source("python-handbook", "Books", "Intermediate", "Python Data Science Handbook", "Jake VanderPlas", "https://jakevdp.github.io/PythonDataScienceHandbook/", "Assumes Python fundamentals and teaches NumPy, pandas, visualization, and machine learning.", { authors: "Jake VanderPlas" }),
  source("fluent-python", "Books", "Advanced", "Fluent Python, Second Edition", "Luciano Ramalho", "https://www.fluentpython.com/", "For experienced Python programmers studying the data model, protocols, and concurrency. Links to the book and companion material.", { authors: "Luciano Ramalho" }),
  source("python-docs", "Other", "Intermediate", "The Python Tutorial", "Python Software Foundation", "https://docs.python.org/3/tutorial/", "The official language tutorial assumes basic programming knowledge and covers Python’s core features."),
];
const mathematics: Resource[] = [
  source("vectors", "YouTube", "Beginner", "Vectors | Chapter 1, Essence of linear algebra", "3Blue1Brown", "https://www.youtube.com/watch?v=fNk_zzaMoSs", "Introduces vectors visually with minimal prerequisites beyond school algebra."),
  source("eigenvalues", "YouTube", "Intermediate", "Eigenvectors and eigenvalues | Essence of linear algebra", "3Blue1Brown", "https://www.youtube.com/watch?v=PFDu9oVAE-g", "Builds on matrices and linear transformations to explain eigenvectors geometrically."),
  source("positive-definite", "YouTube", "Advanced", "5. Positive Definite and Semidefinite Matrices", "Gilbert Strang · MIT OpenCourseWare", "https://www.youtube.com/watch?v=xsP-S7yKaRA", "Requires linear algebra and eigenvalues; studies matrix properties used in optimization and data analysis."),
  source("transformations", "Blogs", "Beginner", "Linear transformations and matrices", "Grant Sanderson · 3Blue1Brown", "https://www.3blue1brown.com/lessons/linear-transformations/", "A visual introduction to matrices as transformations, after basic vectors."),
  source("eigen-lesson", "Blogs", "Intermediate", "Eigenvectors and eigenvalues", "Grant Sanderson · 3Blue1Brown", "https://www.3blue1brown.com/lessons/eigenvalues/", "Connects matrix transformations to invariant directions; assumes basic matrix operations."),
  source("momentum", "Blogs", "Advanced", "Why Momentum Really Works", "Gabriel Goh · Distill", "https://distill.pub/2017/momentum/", "A mathematical treatment of optimization dynamics requiring calculus, eigenvalues, and gradient descent."),
  source("mml", "Books", "Intermediate", "Mathematics for Machine Learning", "Marc Peter Deisenroth, A. Aldo Faisal, Cheng Soon Ong", "https://mml-book.github.io/", "Develops linear algebra, probability, and optimization for ML; assumes comfort with mathematical notation.", { authors: "Marc Peter Deisenroth, A. Aldo Faisal, Cheng Soon Ong", publisher: "Cambridge University Press", year: "2020" }),
  source("mit-algebra", "Other", "Beginner", "18.06 Linear Algebra", "Gilbert Strang · MIT OpenCourseWare", "https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/", "An undergraduate course with lectures, assignments, and exams; start after school algebra."),
];
const deep: Resource[] = [
  source("deep-learning", "Books", "Advanced", "Deep Learning", "Ian Goodfellow, Yoshua Bengio, Aaron Courville", "https://www.deeplearningbook.org/", "A graduate-level text requiring linear algebra, probability, and calculus; an online edition is available.", { authors: "Ian Goodfellow, Yoshua Bengio, Aaron Courville", publisher: "MIT Press", year: "2016" }),
  source("training", "Papers", "Advanced", "Practical recommendations for gradient-based training of deep architectures", "Yoshua Bengio", "https://arxiv.org/abs/1206.5533", "Research-level guidance on neural-network training; requires backpropagation and optimization knowledge."),
  source("gan", "Papers", "Advanced", "Generative Adversarial Networks", "Ian Goodfellow et al.", "https://arxiv.org/abs/1406.2661", "The original GAN paper; assumes neural networks, probability, and gradient-based optimization."),
];

function entry(tags: string[], ...args: Parameters<typeof source>): Resource {
  const item = source(...args);
  return { ...item, topics: tags, youtubeKind: item.type === "YouTube" ? youtubeKindForUrl(item.url)! : undefined,
    provenance: { ...item.provenance!, checkedAt: "2026-09-22T00:00:00.000Z" } };
}
const ml = ["machine learning", "supervised learning", "unsupervised learning", "model evaluation", "data science", "statistics", "predictive modeling"];
const nn = ["neural networks", "deep learning", "transformers", "natural language processing", "artificial intelligence"];
const web = ["web development", "javascript", "react", "next.js", "full-stack", "frontend", "web architecture"];
const data = ["data fundamentals", "pandas", "data science", "data analysis", "exploratory analysis", "data visualization", "data pipelines"];

export const curatedLibrary: Resource[] = [
  ...python.map(r => ({ ...r, topics: ["python", ...(r.id === "curated-python-handbook" ? data : [])] })),
  ...mathematics.map(r => ({ ...r, topics: ["mathematics", "math", "linear algebra", "matrices", ...(r.id === "curated-momentum" ? ["gradient descent", "optimization"] : [])] })),
  ...deep.map(r => ({ ...r, topics: nn })),
  entry(["python", "django", "flask"], "corey-channel", "YouTube", "Intermediate", "Corey Schafer", "Corey Schafer", "https://www.youtube.com/@coreyms", "Patient, code-first explanations of Python, its standard library, and practical web development. Start with the basics playlist if you’re new."),
  entry(["python", ...web, "programming"], "fcc-channel", "YouTube", "Beginner", "freeCodeCamp.org", "freeCodeCamp.org", "https://www.youtube.com/@freecodecamp", "Long-form courses with complete projects. A useful starting point for learning a language from scratch."),
  entry([...ml, ...nn], "statquest-channel", "YouTube", "Beginner", "StatQuest with Josh Starmer", "Josh Starmer", "https://www.youtube.com/@statquest", "Build intuition for statistics and machine learning through visual, step-by-step explanations. The channel spans multiple levels."),
  entry(["mathematics", "linear algebra", "calculus", ...nn], "3b1b-channel", "YouTube", "Intermediate", "3Blue1Brown", "Grant Sanderson", "https://www.youtube.com/@3blue1brown", "Visual explanations that connect mathematical ideas. Best alongside hands-on exercises and basic algebra."),
  entry([...nn, "machine learning", "python"], "karpathy-channel", "YouTube", "Advanced", "Andrej Karpathy", "Andrej Karpathy", "https://www.youtube.com/@AndrejKarpathy", "Build neural networks and language models from the ground up. Requires Python, calculus, and some ML experience."),
  entry(web, "fireship-channel", "YouTube", "Intermediate", "Fireship", "Fireship", "https://www.youtube.com/@Fireship", "Concise explanations of modern web tools and concepts. Best for developers who already know the fundamentals."),
  entry(["python", "generators", "decorators", "classes"], "corey-playlist", "YouTube", "Beginner", "Python Tutorials", "Corey Schafer", "https://www.youtube.com/playlist?list=PL-osiE80TeTt2d9bfVyTiXJA-UTHn6WwU", "A sequence you can follow from language fundamentals into practical Python. Later lessons extend into intermediate techniques."),
  entry(["mathematics", "linear algebra", "vectors", "matrices"], "algebra-playlist", "YouTube", "Beginner", "Essence of linear algebra", "3Blue1Brown", "https://www.youtube.com/playlist?list=PLZHQObOWTQDPD3MizzM2xVFitgF8hE_ab", "Build geometric intuition before working through formal matrix calculations. Start with vectors and follow the sequence."),
  entry(ml, "ml-playlist", "YouTube", "Intermediate", "Machine Learning", "StatQuest with Josh Starmer", "https://www.youtube.com/playlist?list=PLblh5JKOoLUICTaGLRoHQDuF_7q2GfuJF", "Work through machine-learning methods one concept at a time. Basic probability and statistics will help."),
  entry(["statistics", "probability", "data fundamentals", "data science", "mathematics"], "stats-playlist", "YouTube", "Beginner", "Statistics Fundamentals", "StatQuest with Josh Starmer", "https://www.youtube.com/playlist?list=PLblh5JKOoLUK0FLuzwntyYI10UQFUhsY9", "A structured introduction to distributions, statistical ideas, and the language of data."),
  entry(nn, "nn-playlist", "YouTube", "Intermediate", "Neural Networks / Deep Learning", "StatQuest with Josh Starmer", "https://www.youtube.com/playlist?list=PLblh5JKOoLUIxGDQs4LFFD--41Vzf-ME1", "A guided sequence connecting neural-network fundamentals to more advanced architectures. Start after basic ML."),
  entry(web, "react-playlist", "YouTube", "Beginner", "Full Modern React Tutorial", "The Net Ninja", "https://www.youtube.com/playlist?list=PL4cUxeGkcC9gZD-Tvwfod2gaISzfRiP9d", "Build a small React application step by step. Assumes JavaScript basics; some tooling reflects the series’ original release."),
  entry(["model evaluation", "cross validation", "machine learning"], "cross-validation", "YouTube", "Intermediate", "Machine Learning Fundamentals: Cross Validation", "StatQuest with Josh Starmer", "https://www.youtube.com/watch?v=fSytzGwwBVw", "Understand how to compare models using held-out data. Assumes familiarity with fitting a basic model."),
  entry(["unsupervised learning", "clustering", "machine learning"], "kmeans", "YouTube", "Intermediate", "StatQuest: K-means clustering", "StatQuest with Josh Starmer", "https://www.youtube.com/watch?v=4b5d3muPQmA", "A visual walkthrough of clustering that builds on distances and basic statistics."),
  entry(nn, "nn-intro", "YouTube", "Beginner", "But what is a neural network?", "3Blue1Brown", "https://www.youtube.com/watch?v=aircAruvnKk", "An intuitive first look at neural networks through digit recognition. Basic algebra is enough to follow the main ideas."),
  entry(web, "javascript-start", "YouTube", "Beginner", "Learn JavaScript — Full Course for Beginners", "freeCodeCamp.org", "https://www.youtube.com/watch?v=PkZNo7MFNFg", "Learn the language’s building blocks through worked examples before moving to a frontend framework."),
  entry(["transformers", "natural language processing", "attention", "deep learning"], "illustrated-transformer", "Blogs", "Intermediate", "The Illustrated Transformer", "Jay Alammar", "https://jalammar.github.io/illustrated-transformer/", "Connect attention, embeddings, and the Transformer architecture visually. Best after a basic neural-network introduction."),
  entry(["neural networks", "deep learning", "natural language processing", "lstm"], "lstm", "Blogs", "Advanced", "Understanding LSTM Networks", "Christopher Olah", "https://colah.github.io/posts/2015-08-Understanding-LSTMs/", "Study recurrent-network memory mechanisms and gates. Assumes neural-network and sequence-modeling fundamentals."),
  entry(data, "pandas-dataframe", "Blogs", "Intermediate", "The pandas DataFrame: Make Working With Data Delightful", "Mirko Stojiljković · Real Python", "https://realpython.com/pandas-dataframe/", "Practice manipulating tables, missing values, and time series after learning Python basics."),
  entry(["ml in production", "model evaluation", "monitoring", "machine learning"], "data-shift", "Blogs", "Advanced", "Data Distribution Shifts and Monitoring", "Chip Huyen", "https://huyenchip.com/2022/02/07/data-distribution-shifts-and-monitoring.html", "Understand how production data changes and what to monitor. Requires experience training and evaluating models."),
  entry(["react", "next.js", "testing", "performance", "web architecture", "web development"], "react-render", "Blogs", "Intermediate", "Why React Re-Renders", "Josh W. Comeau", "https://www.joshwcomeau.com/react/why-react-re-renders/", "Build a practical model of state updates and rendering. Assumes you can already write React components."),
  entry(["css", "layouts", "web development", "frontend"], "flexbox", "Blogs", "Beginner", "An Interactive Guide to Flexbox", "Josh W. Comeau", "https://www.joshwcomeau.com/css/interactive-guide-to-flexbox/", "Explore layout behavior with interactive examples. A little HTML and CSS is enough to begin."),
  entry(ml, "isl", "Books", "Intermediate", "An Introduction to Statistical Learning", "Gareth James, Daniela Witten, Trevor Hastie, Robert Tibshirani", "https://www.statlearning.com/", "Develop statistical modeling skills with practical examples. The official site offers R and Python editions with different author lists.", { authors: "Gareth James, Daniela Witten, Trevor Hastie, Robert Tibshirani" }),
  entry(data, "python-analysis", "Books", "Intermediate", "Python for Data Analysis, Third Edition", "Wes McKinney", "https://wesmckinney.com/book/", "Build practical data-wrangling skills with pandas and NumPy. The author provides the third edition online.", { authors: "Wes McKinney", year: "2022" }),
  entry(["natural language processing", "transformers", "deep learning", "language models"], "llm-book", "Books", "Advanced", "Hands-On Large Language Models", "Jay Alammar & Maarten Grootendorst", "https://www.llm-book.com/", "Work through language-model concepts and applications with visual explanations. Assumes Python and ML experience.", { authors: "Jay Alammar & Maarten Grootendorst" }),
  entry(web, "eloquent-js", "Books", "Intermediate", "Eloquent JavaScript", "Marijn Haverbeke", "https://eloquentjavascript.net/", "A deeper treatment of JavaScript with exercises and projects. Start with basic syntax, then work through the book.", { authors: "Marijn Haverbeke" }),
  entry([...ml, "build a capstone"], "sklearn-examples", "Other", "Intermediate", "Scikit-learn examples", "Scikit-learn contributors", "https://scikit-learn.org/stable/auto_examples/index.html", "Run and adapt official examples for classification, clustering, evaluation, and practical ML projects."),
  entry(web, "react-docs", "Other", "Beginner", "React Quick Start", "React team", "https://react.dev/learn", "Learn components, events, and state from the official React guide after learning JavaScript basics."),
].map(item => ({ ...item, ...(item.type === "YouTube" ? { youtubeKind: youtubeKindForUrl(item.url)! } : {}) }));

const normalize = (text: string) => ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
function score(item: Resource, title: string, concepts: string[]) {
  const main = normalize(title), context = normalize(concepts.join(" "));
  return (item.topics || []).reduce((total, tag) => total + (main.includes(normalize(tag)) ? 8 : context.includes(normalize(tag)) ? 3 : 0), 0);
}

export function resourcesForTopic(topic: Topic, pathTitle = ""): Resource[] {
  const ranked = curatedLibrary.map(resource => ({ resource, direct: score(resource, topic.title, topic.concepts), broader: score(resource, pathTitle, []) }))
    .filter(item => item.direct > 0 || item.broader > 0)
    .sort((a, b) => b.direct - a.direct || b.broader - a.broader);
  const starter = ranked.map(({ resource, direct }): Resource => ({ ...resource, matchContext: direct ? "topic" : "path" }));
  const discovered = (topic.resources || []).filter(r => resourceRecordSchema.safeParse(r).success).map(r => ({ ...r, author: sourceAuthor(r.author, new URL(r.url).hostname), matchContext: "topic" as const }));
  return mergeResources(starter, discovered);
}
