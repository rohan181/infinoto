import type { Difficulty, Resource, ResourceType, Topic } from "@/app/data";
import { mergeResources, resourceRecordSchema } from "./resources";

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

export function resourcesForTopic(topic: Topic): Resource[] {
  // Narrow starter matching to broad sections; specialized child topics should
  // retrieve their own sources rather than inherit unrelated introductory links.
  const title = topic.title.toLowerCase().trim();
  const starter = /^(python|python programming|python fundamentals|python basics)$/.test(title) ? python
    : /^(mathematics|math|linear algebra|mathematics for machine learning)$/.test(title) ? mathematics
    : /^(deep learning|neural networks)$/.test(title) ? deep : [];
  return mergeResources(starter, (topic.resources || []).filter(r => resourceRecordSchema.safeParse(r).success));
}
