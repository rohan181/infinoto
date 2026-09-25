"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { ChevronDown, Lightbulb, LoaderCircle, RefreshCw, Sparkles } from "lucide-react";
import type { LearningPath, Topic } from "@/app/data";
import { overviewContext, overviewResponseSchema, overviewStorageKey, restoreOverview, type Overview } from "@/lib/topic-overview";
import { useRemoteAction } from "./use-remote-action";
import TopicVisualizationOption from "./topic-visualization";
import TopicFlashcardsOption from "./topic-flashcards";

/** Remount on context changes so cancelled responses cannot populate a different topic. */
export default function TopicOverview({ path, topic }: { path: LearningPath; topic: Topic }) {
  const titleId = useId();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [ready, setReady] = useState(false);
  const [storageNote, setStorageNote] = useState("");
  const { busy, error, run, reset, cancel } = useRemoteAction();
  const context = overviewContext(path.title, topic);
  const storageKey = overviewStorageKey(path.id, topic.id);
  const body = JSON.stringify({ pathTitle: path.title, topic: { id: topic.id, title: topic.title, description: topic.description, difficulty: topic.difficulty, concepts: topic.concepts } });
  const generate = useCallback(() => {
    const input = JSON.parse(body);
    void run("/api/topic-overview", input, raw => {
      const result = overviewResponseSchema.parse(raw);
      if (result.topicId !== input.topic.id) throw new Error("This overview belongs to another topic. Please retry.");
      setOverview(result.overview);
      try {
        localStorage.setItem(storageKey, JSON.stringify({ version: 1, context, overview: result.overview }));
        setStorageNote("");
      } catch { setStorageNote("This overview could not be saved in your browser. It remains available while this topic is open."); }
    });
  }, [body, context, storageKey, run]);

  useEffect(() => {
    let saved: Overview | null = null;
    try { saved = restoreOverview(localStorage.getItem(storageKey), context); }
    catch { setStorageNote("Browser storage is unavailable. Overviews cannot be saved between visits."); }
    setOverview(saved); setReady(true);
    // Avoid charging for topics passed over quickly or React's development remount.
    const timer = saved ? undefined : setTimeout(generate, 650);
    return () => { clearTimeout(timer); reset(); };
  }, [storageKey, context, generate, reset]);

  return <section className="topic-overview" aria-labelledby={titleId} aria-busy={!ready || busy}>
    <header className="overview-header"><span className="overview-icon"><Sparkles size={18}/></span><div><h3 id={titleId}>AI overview</h3><p>{topic.title} · {topic.difficulty}</p></div></header>
    {overview ? <>
      <p className="overview-summary">{overview.summary}</p>
      <details className="overview-details"><summary>Key ideas & example<ChevronDown size={15}/></summary><div className="overview-content">
        <h4>Why it matters</h4><p>{overview.whyItMatters}</p>
        <h4>Key ideas</h4><ul>{overview.keyIdeas.map((idea, i) => <li key={i}><strong>{idea.title}</strong><p>{idea.explanation}</p></li>)}</ul>
        <div className="overview-example"><span><Lightbulb size={15}/>A practical example</span><h4>{overview.example.title}</h4><p>{overview.example.walkthrough}</p></div>
        <h4>Try it yourself</h4><p>{overview.practice}</p>
      </div></details>
      <p className="overview-note">AI-generated explanation · Saved in this browser when storage is available.</p>
    </> : error ? <div className="overview-error" role="alert"><p>{error}</p><button className="secondary-button" onClick={generate} disabled={busy}><RefreshCw size={14}/>Retry overview</button></div>
      : <div className="overview-loading" role="status"><LoaderCircle size={16} className="spin"/><p>Preparing a clear explanation of {topic.title}…</p>{busy && <button onClick={cancel}>Stop</button>}</div>}
    <div className="topic-study-actions"><TopicVisualizationOption path={path} topic={topic}/><TopicFlashcardsOption path={path} topic={topic}/></div>
    {storageNote && <p className="overview-note" role="status">{storageNote}</p>}
  </section>;
}
