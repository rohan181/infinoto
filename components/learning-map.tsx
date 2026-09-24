"use client";

import { useEffect, useRef, useState } from "react";
import { ClipboardCheck, ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, BrainCircuit, Check, ChevronDown, Code2, Database, GitBranch, GraduationCap, Layers3, List, Maximize, Minus, Network, Plus, Search, SlidersHorizontal, Sparkles, Library } from "lucide-react";
import { type LearningPath, type Resource, type Topic } from "@/app/data";

const icons: Record<string, typeof Sparkles> = { spark: Sparkles, code: Code2, math: GraduationCap, database: Database, network: Network, brain: BrainCircuit };
export { ResourceCard } from "./topic-resources";
export type { SavedResource } from "./topic-resources";
import TopicResources, { type SavedResource } from "./topic-resources";
import TopicQuiz from "./topic-quiz";
import { quizContext } from "@/lib/quiz";
import LearnNext from "./learn-next";
import NodeActions from "./node-actions";
import ContentAnalysis from "./content-analysis";
import { resourcesForTopic } from "@/lib/curated-resources";
import TopicExpansion, { TopicOutline } from "./topic-expansion";

export default function LearningMap({ path, completed, saved, onComplete, onSave, onBack, onRefine, onAddBranch, onResources, onCreatePath }: {
  onCreatePath: (path: LearningPath) => void; path: LearningPath; completed: string[]; saved: SavedResource[];
  onAddBranch: (parentId: string, topics: Topic[]) => void; onResources: (topicId: string, resources: Resource[]) => void;
  onComplete: (id: string) => void; onSave: (resource: Resource, topic: string) => void; onBack: () => void; onRefine: () => void;
}) {
  const [quizTopicId, setQuizTopicId] = useState<string | null>(null);
  const quizTopic = path.topics.find(t => t.id === quizTopicId);
  const [studyTopicId, setStudyTopicId] = useState<string | null>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [nodeAction, setNodeAction] = useState<{ id: string; mode: "nodes" | "path" } | null>(null);
  const [crossGraph, setCrossGraph] = useState(false);
  const [selectedId, setSelectedId] = useState(path.topics[1]?.id || "0");
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [level, setLevel] = useState("All levels");
  const [query, setQuery] = useState("");
  const [view, setView] = useState("map");
  const [zoom, setZoom] = useState(1);
  const [prereqs, setPrereqs] = useState(true);
  const [mode, setMode] = useState<"map" | "library">("map");
  const [width, setWidth] = useState(700);
  const mapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const topic = path.topics.find(t => t.id === selectedId) || path.topics[0];
  const progress = Math.round(completed.filter(id => id !== "0" && path.topics.some(t => t.id === id)).length / (path.topics.length - 1) * 100);
  const graphWidth = Math.max(740, ...path.topics.map(t => t.x + 240));
  const graphHeight = Math.max(...path.topics.map(t => t.y)) + 175;
  const baseScale = Math.max(.82, Math.min((width - 40) / graphWidth, 1));
  const scale = baseScale * zoom;
  const visible = path.topics.filter(t => {
    function hidden(id: string, seen = new Set<string>()): boolean {
      if (seen.has(id)) return false;
      seen.add(id);
      const node = path.topics.find(t => t.id === id);
      return !!node?.prerequisites.length && node.prerequisites.every(p => collapsed.includes(p) || hidden(p, new Set(seen)));
    }
    return !hidden(t.id);
  });
  const matching = (title: string, difficulty: string) => (!query || title.toLowerCase().includes(query.toLowerCase())) && (level === "All levels" || difficulty === level);
  useEffect(() => {
    const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    if (mapRef.current) observer.observe(mapRef.current);
    return () => observer.disconnect();
  }, [mode, view]);
  function select(id: string) {
    setSelectedId(id);
    requestAnimationFrame(() => {
      panelRef.current?.scrollTo({ top: 0, behavior: "instant" });
      if (window.innerWidth <= 1000) panelRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }
  function openStudyTopic(id: string) {
    setSelectedId(id); setStudyTopicId(id); setMode("map"); setView("map");
    setCollapsed([]); setQuery(""); setLevel("All levels");
    requestAnimationFrame(() => {
      if (detailsRef.current) {
        detailsRef.current.open = true;
        detailsRef.current.scrollIntoView({ block: "start", behavior: "smooth" });
        detailsRef.current.querySelector("summary")?.focus({ preventScroll: true });
      }
    });
  }
  return <section className="path-page learning-studio">
    <button className="text-button back-link" onClick={onBack}><ArrowLeft size={15} /> All learning paths</button>
    <div className="path-heading"><div><span className="eyebrow"><span className="studio-status-dot" /> YOUR LEARNING WORKSPACE <span className="path-origin">{path.source === "claude" ? "Personalized" : "Example path"}</span></span><h1>{path.title}</h1><p>{path.description}</p><div className="path-metadata"><span><Layers3 size={14} />{path.topics.length - 1} topics</span><span><GraduationCap size={15} />3 difficulty levels</span><span><BookOpen size={14} />{path.topics.reduce((sum, t) => sum + t.hours, 0)} estimated hours</span></div></div><button className="secondary-button" onClick={onRefine}><Sparkles size={15} /> Refine with Infinity</button></div>
    <div className="path-progress"><div><span>Your progress</span><strong>{progress}%</strong></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><small>{completed.filter(id => id !== "0" && path.topics.some(t => t.id === id)).length} / {path.topics.length - 1} topics completed</small></div>
    <LearnNext path={path} completed={completed} onSelect={openStudyTopic}/>
    <nav className="studio-navigation" aria-label="Learning workspace"><div><button className={mode === "map" ? "active" : ""} aria-pressed={mode === "map"} onClick={() => setMode("map")}><GitBranch size={17}/>Learning map</button><button className={mode === "library" ? "active" : ""} aria-pressed={mode === "library"} onClick={() => setMode("library")}><Library size={17}/>Content library<span>NEW</span></button><button onClick={() => setCrossGraph(true)}><Network size={17}/>Cross-content graph<span>NEW</span></button></div><p><span className="studio-status-dot"/>Your curiosity, connected.</p></nav>
    <div className={`studio-workspace ${mode === "library" ? "library-mode" : ""}`}>

      <div className="map-column" hidden={mode === "library"}><div className="map-toolbar"><div className="segmented"><button aria-label="Graph view" className={view === "map" ? "active" : ""} onClick={() => setView("map")}><GitBranch size={15} />Map</button><button aria-label="Outline view" className={view === "list" ? "active" : ""} onClick={() => setView("list")}><List size={16} />Outline</button></div><label className="select-wrap"><SlidersHorizontal size={13} /><select aria-label="Topic difficulty" value={level} onChange={e => setLevel(e.target.value)}><option>All levels</option><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label></div>
        <div className="map-canvas" ref={mapRef}><div className="canvas-controls"><label className="search-box"><Search size={14} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a topic…" aria-label="Find a topic" /></label><button className="prereq-switch" aria-pressed={prereqs} onClick={() => setPrereqs(v => !v)}><span className={prereqs ? "switch on" : "switch"} />Prerequisites</button></div>
          {view === "map" ? <div className="graph-scroll"><div className="graph-size" style={{ width: graphWidth * scale, height: (collapsed.includes("0") ? 200 : graphHeight) * scale }}><div className="graph" style={{ width: graphWidth, height: graphHeight, transform: `scale(${scale})` }}><svg className="graph-edges" width={graphWidth} height={graphHeight} aria-hidden="true">{visible.flatMap(child => child.prerequisites.map((parentId, i) => { const parent = visible.find(n => n.id === parentId); if (!parent || collapsed.includes(parent.id) || (!prereqs && i > 0)) return null; const x1 = parent.x + 110, y1 = parent.y + 148, x2 = child.x + 110, y2 = child.y; const midpoint = (y1 + y2) / 2; return <path key={`${parent.id}-${child.id}`} className={`${i > 0 ? "secondary-edge" : ""} ${topic.id === child.id ? "selected-edge" : ""}`} d={parent.y === child.y ? `M${parent.x + 220},${parent.y + 58} L${child.x},${child.y + 58}` : `M${x1},${y1} C${x1},${midpoint} ${x2},${midpoint} ${x2},${y2}`} />; }))}</svg>
          {visible.map(node => { const Icon = icons[node.icon] || Network; const done = completed.includes(node.id); return <div key={node.id} style={{ left: node.x, top: node.y }} className={`map-node ${node.id === "0" ? "root-node" : ""} ${topic.id === node.id ? "selected" : ""} ${!matching(node.title, node.difficulty) ? "dimmed" : ""}`}><button className="node-quiz" aria-label={`Quick quiz for ${node.title}`} title="Quick quiz" onClick={() => setQuizTopicId(node.id)}><ClipboardCheck size={13}/></button><button className="node-content" aria-label={`Explore ${node.title}`} onClick={() => select(node.id)}><div><span className={`node-icon ${node.difficulty.toLowerCase()}`}><Icon size={17} /></span>{node.id === "0" ? <small>YOUR LEARNING GOAL</small> : done ? <span className="completed-label"><Check size={12} />Done</span> : <span className={`level ${node.difficulty.toLowerCase()}`}>{node.difficulty}</span>}</div><strong>{node.title}</strong><span>{node.id === "0" ? `${path.topics.length - 1} connected topics` : `${node.hours}h · ${node.concepts[0]}`}</span></button><div className="node-quick-actions"><button aria-label={`Generate nodes from ${node.title}`} onClick={() => { setSelectedId(node.id); setNodeAction({ id: node.id, mode: "nodes" }); }}><Plus size={12}/>Generate nodes</button><button aria-label={`Create path from ${node.title}`} onClick={() => { setSelectedId(node.id); setNodeAction({ id: node.id, mode: "path" }); }}><GitBranch size={12}/>Create path</button></div>{node.children.length > 0 && <button className="node-expand" aria-label={`${collapsed.includes(node.id) ? "Expand" : "Collapse"} ${node.title}`} onClick={() => setCollapsed(c => c.includes(node.id) ? c.filter(id => id !== node.id) : [...c, node.id])}>{collapsed.includes(node.id) ? <Plus size={12} /> : <ChevronDown size={12} />}</button>}</div>; })}</div></div></div> : <TopicOutline path={path} selectedId={topic.id} completed={completed} matching={matching} onSelect={select} />}
          <div className="canvas-bottom"><div className="legend"><span><i />Beginner</span><span><i />Intermediate</span><span><i />Advanced</span></div><div className="zoom-controls"><button aria-label="Zoom out" disabled={zoom <= .6} onClick={() => setZoom(z => Math.max(.6,z-.1))}><Minus size={14} /></button><span>{Math.round(zoom*100)}%</span><button aria-label="Zoom in" disabled={zoom >= 1.5} onClick={() => setZoom(z => Math.min(1.5,z+.1))}><Plus size={14} /></button><button aria-label="Fit map" onClick={() => setZoom(Math.max(.1, Math.min(1, (width - 40) / graphWidth)) / baseScale)}><Maximize size={13} /></button></div></div>
        </div><div className="map-caption"><Sparkles size={12} /> Every branch is a new possibility. Select a topic to explore.</div>
      <details ref={detailsRef} open={studyTopicId === topic.id || undefined} className="selected-topic-details" key={`details-${topic.id}`}><summary><span className="selected-topic-icon"><Network size={18}/></span><span><small>YOUR SELECTED TOPIC</small><strong>{topic.title}</strong></span><span className="details-hint">Details & branches</span><ChevronDown size={16}/></summary><div className="topic-intro"><span className="topic-emblem"><Network size={24} /></span><h2>{topic.title}</h2><div className="topic-facts"><span className={`level ${topic.difficulty.toLowerCase()}`}>{topic.difficulty}</span><span>{topic.hours || "4–8"} estimated hours</span></div><p>{topic.description}</p>{prereqs && topic.prerequisites.length > 0 && <div className="prerequisites"><span><GitBranch size={14} /> Before you start</span>{topic.prerequisites.map(id => <button key={id} onClick={() => select(id)}>{completed.includes(id) ? <Check size={13} /> : <ArrowLeft size={13} />}{path.topics.find(t => t.id === id)?.title}<ArrowUpRight size={12} /></button>)}</div>}<div className="concept-label">WHAT YOU’LL LEARN</div><div className="concepts">{topic.concepts.map(concept => <span key={concept}>{concept}</span>)}</div></div>
      <div className="selected-node-actions"><button className="secondary-button" onClick={() => setQuizTopicId(topic.id)}><ClipboardCheck size={14}/>Quick quiz</button><button className="secondary-button" onClick={() => setNodeAction({ id: topic.id, mode: "nodes" })}><Plus size={14}/>Generate nodes</button><button className="secondary-button" onClick={() => setNodeAction({ id: topic.id, mode: "path" })}><GitBranch size={14}/>Create path from this node</button></div>
      <TopicExpansion key={`expand-${topic.id}`} path={path} topic={topic} onAdd={(parentId, topics) => { onAddBranch(parentId, topics); setCollapsed(c => c.filter(id => id !== parentId)); }} onSelect={select} /><div className="topic-actions">{topic.id !== "0" && <button className={`primary-button ${completed.includes(topic.id) ? "completed" : ""}`} onClick={() => onComplete(topic.id)}><Check size={16} />{completed.includes(topic.id) ? "Completed · Undo" : "Mark as completed"}</button>}{topic.children.length > 0 && <button className="text-button" onClick={() => select(topic.children.find(id => !completed.includes(id)) || topic.children[0])}>Explore the next topic<ArrowRight size={14} /></button>}</div></details>
      </div>
      <aside className="recommendation-panel" ref={panelRef}><button className="topic-quiz-entry" onClick={() => setQuizTopicId(topic.id)}><ClipboardCheck size={17}/><span>Quick quiz<small>Check your understanding of {topic.title}</small></span><ArrowRight size={15}/></button><TopicResources path={path} topic={topic} saved={saved} onSave={onSave} onResources={onResources} onSelect={select} expanded={mode === "library"} onExpand={() => setMode("library")} /></aside>
    </div>
    {quizTopic && <TopicQuiz key={quizContext(path.title, quizTopic)} path={path} topic={quizTopic} completed={completed.includes(quizTopic.id)} onComplete={() => { if (!completed.includes(quizTopic.id) && quizTopic.id !== "0") onComplete(quizTopic.id); }} onReview={() => { setQuizTopicId(null); setSelectedId(quizTopic.id); setMode("library"); requestAnimationFrame(() => panelRef.current?.scrollIntoView({ block: "start", behavior: "smooth" })); }} onClose={() => setQuizTopicId(null)}/>}
    {nodeAction && <NodeActions key={`${nodeAction.id}:${nodeAction.mode}`} path={path} topic={path.topics.find(t => t.id === nodeAction.id)!} mode={nodeAction.mode} onAdd={(id, topics) => { onAddBranch(id, topics); setCollapsed(c => c.filter(parent => parent !== id)); }} onCreatePath={onCreatePath} onSelect={select} onClose={() => setNodeAction(null)}/>}
    {crossGraph && <ContentAnalysis initialView="graph" resources={path.topics.flatMap(t => [...(t.resources || []), ...resourcesForTopic(t)])} initial={[...(topic.resources || []), ...resourcesForTopic(topic)]} topic={topic.title} concepts={topic.concepts} onClose={() => setCrossGraph(false)}/>}
  </section>;
}
