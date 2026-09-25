"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, GitBranch, ListOrdered, LoaderCircle, RefreshCw, Sparkles, X } from "lucide-react";
import type { LearningPath, Topic } from "@/app/data";
import { overviewContext } from "@/lib/topic-overview";
import { layoutVisualization, restoreVisualization, validateVisualization, visualizationNodeHeight, visualizationResponseSchema, visualizationStorageKey, type TopicVisualization, type VisualizationMode } from "@/lib/topic-visualization";
import { useRemoteAction } from "./use-remote-action";

export default function TopicVisualizationOption({ path, topic }: { path: LearningPath; topic: Topic }) {
  const [open, setOpen] = useState(false);
  return <><button className="overview-visualize" onClick={() => setOpen(true)}><GitBranch size={15}/>AI visualization<ArrowRight size={14}/></button>
    {open && <VisualizationDialog path={path} topic={topic} onClose={() => setOpen(false)}/>}</>;
}

function VisualizationDialog({ path, topic, onClose }: { path: LearningPath; topic: Topic; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [mode, setMode] = useState<VisualizationMode>("concept");
  useEffect(() => {
    const element = dialog.current, previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    element?.showModal(); document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return <dialog ref={dialog} className="visualization-dialog" aria-labelledby={titleId} onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <header className="visualization-header"><div><span><Sparkles size={14}/>AI VISUALIZATION</span><h2 id={titleId}>{topic.title}</h2><p>{topic.difficulty} · Explore how the ideas connect.</p></div><button className="icon-button" aria-label="Close visualization" onClick={onClose} autoFocus><X size={21}/></button></header>
    <div className="visualization-modes" role="group" aria-label="Visualization format"><button aria-pressed={mode === "concept"} onClick={() => setMode("concept")}><GitBranch size={15}/>Concept map</button><button aria-pressed={mode === "flow"} onClick={() => setMode("flow")}><ListOrdered size={15}/>Step-by-step</button></div>
    <VisualizationContent key={mode} path={path} topic={topic} mode={mode}/>
  </dialog>;
}

function VisualizationContent({ path, topic, mode }: { path: LearningPath; topic: Topic; mode: VisualizationMode }) {
  const canvas = useRef<HTMLDivElement>(null);
  const [graph, setGraph] = useState<TopicVisualization | null>(null);
  const [selected, setSelected] = useState("");
  const [storageNote, setStorageNote] = useState("");
  const { run, reset, busy, error, cancel } = useRemoteAction();
  const markerId = `visual-arrow-${useId().replace(/:/g, "")}`;
  const context = overviewContext(path.title, topic), storageKey = visualizationStorageKey(path.id, topic.id, mode);
  const body = JSON.stringify({ pathTitle: path.title, topic: { id: topic.id, title: topic.title, description: topic.description, difficulty: topic.difficulty, concepts: topic.concepts }, mode });
  const generate = useCallback(() => {
    const input = JSON.parse(body);
    void run("/api/topic-visualization", input, raw => {
      const result = visualizationResponseSchema.parse(raw);
      if (result.topicId !== input.topic.id || result.mode !== mode) throw new Error("This visualization does not match the selected topic. Please retry.");
      const value = validateVisualization(result.visualization, mode);
      setGraph(value); setSelected(value.nodes[0].id);
      try { localStorage.setItem(storageKey, JSON.stringify({ version: 1, context, mode, visualization: value })); setStorageNote(""); }
      catch { setStorageNote("Could not save this visualization. It remains available while this window is open."); }
    });
  }, [body, context, mode, storageKey, run]);
  useEffect(() => {
    let saved: TopicVisualization | null = null;
    try { saved = restoreVisualization(localStorage.getItem(storageKey), context, mode); }
    catch { setStorageNote("Browser storage is unavailable. This visualization will not be saved between visits."); }
    if (saved) { setGraph(saved); setSelected(saved.nodes[0].id); }
    const timer = saved ? undefined : setTimeout(generate, 350);
    return () => { clearTimeout(timer); reset(); };
  }, [context, mode, storageKey, generate, reset]);
  useEffect(() => {
    if (!graph || !canvas.current) return;
    const node = layoutVisualization(graph).nodes.find(item => item.id === selected);
    if (!node) return;
    const element = canvas.current;
    const top = node.y < element.scrollTop ? Math.max(0, node.y - 24)
      : node.y + visualizationNodeHeight > element.scrollTop + element.clientHeight ? node.y + visualizationNodeHeight - element.clientHeight + 24 : element.scrollTop;
    const left = node.x < element.scrollLeft || node.x + 160 > element.scrollLeft + element.clientWidth ? Math.max(0, node.x + 80 - element.clientWidth / 2) : element.scrollLeft;
    element.scrollTo({ top, left, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }, [graph, selected]);

  if (!graph) return <div className="visualization-pending">{error ? <div role="alert"><p>{error}</p><button className="secondary-button" onClick={generate} disabled={busy}><RefreshCw size={14}/>Retry visualization</button></div> : <div role="status"><LoaderCircle size={24} className="spin"/><p>Building your {mode === "concept" ? "concept map" : "step-by-step explanation"}…</p>{busy && <button className="secondary-button" onClick={cancel}>Stop generation</button>}</div>}</div>;
  const layout = layoutVisualization(graph), current = graph.nodes.find(node => node.id === selected) || graph.nodes[0];
  const index = graph.nodes.findIndex(node => node.id === current.id);
  const relations = graph.edges.filter(edge => edge.from === current.id || edge.to === current.id);
  return <div className="visualization-body"><h3>{graph.title}</h3><p className="visualization-summary">{graph.summary}</p><p className="visualization-hint">Select a {mode === "flow" ? "step" : "concept"} to explore its explanation and example.</p>
    <div className="visualization-workspace"><div ref={canvas} className="visualization-canvas" role="group" aria-label={mode === "flow" ? "Interactive steps" : "Interactive concept map"}><div className="visualization-board" style={{ width: layout.width, height: layout.height }}>
      <svg className="visualization-edges" width={layout.width} height={layout.height} aria-hidden="true"><defs><marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z"/></marker></defs>{graph.edges.map(edge => {
        const from = layout.nodes.find(node => node.id === edge.from)!, to = layout.nodes.find(node => node.id === edge.to)!;
        const x1 = from.x + 80, y1 = from.y + visualizationNodeHeight, x2 = to.x + 80, y2 = to.y - 4, middle = (y1 + y2) / 2;
        return <path key={`${edge.from}:${edge.to}`} className={edge.from === selected || edge.to === selected ? "selected" : ""} d={`M${x1} ${y1}C${x1} ${middle} ${x2} ${middle} ${x2} ${y2}`} markerEnd={`url(#${markerId})`}/>;
      })}</svg>
      {layout.nodes.map((node, i) => <button key={node.id} className={`visualization-node ${node.id === current.id ? "selected" : ""}`} style={{ left: node.x, top: node.y, height: visualizationNodeHeight }} aria-pressed={node.id === current.id} onClick={() => setSelected(node.id)}><small>{mode === "flow" ? `STEP ${i + 1}` : i === 0 ? "MAIN IDEA" : "CONCEPT"}</small><strong>{node.label}</strong></button>)}
    </div></div><section className="visualization-detail" aria-label="Selected concept" aria-live="polite"><span>{mode === "flow" ? `Step ${index + 1} of ${graph.nodes.length}` : "Explore this idea"}</span><h4>{current.label}</h4><p>{current.explanation}</p><h5>Example</h5><p>{current.example}</p><h5>Connections</h5><ul>{relations.map(edge => <li key={`${edge.from}:${edge.to}`}>{graph.nodes.find(node => node.id === edge.from)!.label} → {edge.label} → {graph.nodes.find(node => node.id === edge.to)!.label}</li>)}</ul>
      {mode === "flow" && <div className="visualization-step-controls"><button disabled={index === 0} onClick={() => setSelected(graph.nodes[index - 1].id)}><ArrowLeft size={14}/>Previous</button><button disabled={index === graph.nodes.length - 1} onClick={() => setSelected(graph.nodes[index + 1].id)}>Next<ArrowRight size={14}/></button></div>}
    </section></div><p className="visualization-note">AI-generated visual explanation{storageNote ? "" : " · Saved in this browser"}</p>{storageNote && <p className="visualization-note" role="status">{storageNote}</p>}
  </div>;
}
