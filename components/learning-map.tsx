"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Bookmark, BrainCircuit, Check, ChevronDown, ChevronRight, Code2, Database, FileText, GitBranch, GraduationCap, Layers3, List, Maximize, Minus, Network, Plus, Search, SlidersHorizontal, Sparkles, X, Youtube } from "lucide-react";
import { getResources, type LearningPath, type Resource, type ResourceType } from "@/app/data";

const icons: Record<string, typeof Sparkles> = { spark: Sparkles, code: Code2, math: GraduationCap, database: Database, network: Network, brain: BrainCircuit };
export type SavedResource = Resource & { topicTitle: string; pathTitle: string };
const categories: ResourceType[] = ["YouTube", "Blogs", "Papers", "Other"];

export function ResourceCard({ resource, saved, onSave }: { resource: Resource; saved: boolean; onSave: () => void }) {
  const Icon = resource.type === "YouTube" ? Youtube : resource.type === "Papers" ? GraduationCap : resource.type === "Blogs" ? FileText : BookOpen;
  return <article className="resource-card"><div className={`resource-symbol ${resource.type.toLowerCase()}`}><Icon size={19} /></div><div className="resource-copy"><a href={resource.url} target="_blank" rel="noopener noreferrer">{resource.title}<ArrowUpRight size={13} /></a><span>{resource.author}</span><div><span className={`level ${resource.level.toLowerCase()}`}>{resource.level}</span><small>{resource.meta}</small></div></div><button className={`icon-button bookmark-button ${saved ? "is-saved" : ""}`} aria-label={`${saved ? "Unsave" : "Save"} ${resource.title}`} aria-pressed={saved} onClick={onSave}><Bookmark size={16} fill={saved ? "currentColor" : "none"} /></button></article>;
}

export default function LearningMap({ path, completed, saved, onComplete, onSave, onBack, onRefine }: {
  path: LearningPath; completed: string[]; saved: SavedResource[];
  onComplete: (id: string) => void; onSave: (resource: Resource, topic: string) => void; onBack: () => void; onRefine: () => void;
}) {
  const [selectedId, setSelectedId] = useState(path.topics[1]?.id || "0");
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [tab, setTab] = useState<ResourceType>("YouTube");
  const [level, setLevel] = useState("All levels");
  const [resourceLevel, setResourceLevel] = useState("All levels");
  const [query, setQuery] = useState("");
  const [view, setView] = useState("map");
  const [zoom, setZoom] = useState(1);
  const [prereqs, setPrereqs] = useState(true);
  const [showPanel, setShowPanel] = useState(true);
  const [width, setWidth] = useState(700);
  const mapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const topic = path.topics.find(t => t.id === selectedId) || path.topics[0];
  const allResources = getResources(topic, path.title);
  const resources = allResources.filter(r => r.type === tab && (resourceLevel === "All levels" || r.level === resourceLevel));
  const progress = Math.round(completed.filter(id => id !== "0").length / (path.topics.length - 1) * 100);
  const graphWidth = Math.max(740, ...path.topics.map(t => t.x + 240));
  const graphHeight = Math.max(...path.topics.map(t => t.y)) + 175;
  const scale = Math.max(.72, Math.min((width - 40) / graphWidth, 1)) * zoom;
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
  }, [showPanel, view]);
  function select(id: string) {
    setSelectedId(id); setShowPanel(true); setResourceLevel("All levels");
    if (window.innerWidth <= 800) requestAnimationFrame(() => panelRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
  }
  return <section className="path-page">
    <button className="text-button back-link" onClick={onBack}><ArrowLeft size={15} /> All learning paths</button>
    <div className="path-heading"><div><span className="eyebrow"><GitBranch size={13} />{path.source === "claude" ? "PERSONALIZED WITH CLAUDE" : "EXAMPLE LEARNING PATH"}</span><h1>{path.title}</h1><p>{path.description}</p><div className="path-metadata"><span><Layers3 size={14} />{path.topics.length - 1} topics</span><span><GraduationCap size={15} />3 difficulty levels</span><span><BookOpen size={14} />{path.topics.reduce((sum, t) => sum + t.hours, 0)} estimated hours</span></div></div><button className="secondary-button" onClick={onRefine}><Sparkles size={15} /> Refine with Infinity</button></div>
    <div className="path-progress"><div><span>Your progress</span><strong>{progress}%</strong></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><small>{completed.filter(id => id !== "0").length} / {path.topics.length - 1} topics completed</small></div>
    <div className={`map-workspace ${!showPanel ? "panel-closed" : ""}`}>
      <div className="map-column"><div className="map-toolbar"><div className="segmented"><button className={view === "map" ? "active" : ""} onClick={() => setView("map")}><GitBranch size={15} />Learning map</button><button aria-label="List view" className={view === "list" ? "active" : ""} onClick={() => setView("list")}><List size={16} /></button></div><label className="select-wrap"><SlidersHorizontal size={13} /><select aria-label="Topic difficulty" value={level} onChange={e => setLevel(e.target.value)}><option>All levels</option><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label></div>
        <div className="map-canvas" ref={mapRef}><div className="canvas-controls"><label className="search-box"><Search size={14} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a topic…" aria-label="Find a topic" /></label><button className="prereq-switch" aria-pressed={prereqs} onClick={() => setPrereqs(v => !v)}><span className={prereqs ? "switch on" : "switch"} />Prerequisites</button></div>
          {view === "map" ? <div className="graph-scroll"><div className="graph-size" style={{ width: graphWidth * scale, height: (collapsed.includes("0") ? 200 : graphHeight) * scale }}><div className="graph" style={{ width: graphWidth, height: graphHeight, transform: `scale(${scale})` }}><svg className="graph-edges" width={graphWidth} height={graphHeight} aria-hidden="true">{visible.flatMap(child => child.prerequisites.map((parentId, i) => { const parent = visible.find(n => n.id === parentId); if (!parent || collapsed.includes(parent.id) || (!prereqs && i > 0)) return null; const x1 = parent.x + 110, y1 = parent.y + 115, x2 = child.x + 110, y2 = child.y; const midpoint = (y1 + y2) / 2; return <path key={`${parent.id}-${child.id}`} className={`${i > 0 ? "secondary-edge" : ""} ${topic.id === child.id ? "selected-edge" : ""}`} d={parent.y === child.y ? `M${parent.x + 220},${parent.y + 58} L${child.x},${child.y + 58}` : `M${x1},${y1} C${x1},${midpoint} ${x2},${midpoint} ${x2},${y2}`} />; }))}</svg>
          {visible.map(node => { const Icon = icons[node.icon] || Network; const done = completed.includes(node.id); return <div key={node.id} style={{ left: node.x, top: node.y }} className={`map-node ${node.id === "0" ? "root-node" : ""} ${topic.id === node.id ? "selected" : ""} ${!matching(node.title, node.difficulty) ? "dimmed" : ""}`}><button className="node-content" aria-label={`Explore ${node.title}`} onClick={() => select(node.id)}><div><span className={`node-icon ${node.difficulty.toLowerCase()}`}><Icon size={17} /></span>{node.id === "0" ? <small>YOUR LEARNING GOAL</small> : done ? <span className="completed-label"><Check size={12} />Done</span> : <span className={`level ${node.difficulty.toLowerCase()}`}>{node.difficulty}</span>}</div><strong>{node.title}</strong><span>{node.id === "0" ? `${path.topics.length - 1} connected topics` : `${node.hours}h · ${node.concepts[0]}`}</span></button>{node.children.length > 0 && <button className="node-expand" aria-label={`${collapsed.includes(node.id) ? "Expand" : "Collapse"} ${node.title}`} onClick={() => setCollapsed(c => c.includes(node.id) ? c.filter(id => id !== node.id) : [...c, node.id])}>{collapsed.includes(node.id) ? <Plus size={12} /> : <ChevronDown size={12} />}</button>}</div>; })}</div></div></div> : <div className="topic-list">{path.topics.filter(t => t.id !== "0" && matching(t.title, t.difficulty)).map(node => <button key={node.id} className={`topic-row ${topic.id === node.id ? "active" : ""}`} onClick={() => select(node.id)}><span>{completed.includes(node.id) ? <Check size={17} /> : <BookOpen size={17} />}</span><div><strong>{node.title}</strong><small>{node.hours} estimated hours</small></div><span className={`level ${node.difficulty.toLowerCase()}`}>{node.difficulty}</span><ChevronRight size={15} /></button>)}{!path.topics.some(t => t.id !== "0" && matching(t.title,t.difficulty)) && <div className="empty-small">No matching topics. Try another filter.</div>}</div>}
          <div className="canvas-bottom"><div className="legend"><span><i />Beginner</span><span><i />Intermediate</span><span><i />Advanced</span></div><div className="zoom-controls"><button aria-label="Zoom out" disabled={zoom <= .6} onClick={() => setZoom(z => Math.max(.6,z-.1))}><Minus size={14} /></button><span>{Math.round(zoom*100)}%</span><button aria-label="Zoom in" disabled={zoom >= 1.5} onClick={() => setZoom(z => Math.min(1.5,z+.1))}><Plus size={14} /></button><button aria-label="Fit map" onClick={() => setZoom(1)}><Maximize size={13} /></button></div></div>
        </div><div className="map-caption"><Sparkles size={12} /> Every branch is a new possibility. Select a topic to explore.</div>
      </div>
      {showPanel && <aside className="topic-panel" ref={panelRef}><div className="panel-topline"><span>TOPIC EXPLORER</span><button className="icon-button" aria-label="Close topic" onClick={() => setShowPanel(false)}><X size={17} /></button></div><div className="topic-intro"><span className="topic-emblem"><Network size={24} /></span><h2>{topic.title}</h2><div className="topic-facts"><span className={`level ${topic.difficulty.toLowerCase()}`}>{topic.difficulty}</span><span>{topic.hours || "4–8"} estimated hours</span></div><p>{topic.description}</p>{prereqs && topic.prerequisites.length > 0 && <div className="prerequisites"><span><GitBranch size={14} /> Before you start</span>{topic.prerequisites.map(id => <button key={id} onClick={() => select(id)}>{completed.includes(id) ? <Check size={13} /> : <ArrowLeft size={13} />}{path.topics.find(t => t.id === id)?.title}<ArrowUpRight size={12} /></button>)}</div>}<div className="concept-label">WHAT YOU’LL LEARN</div><div className="concepts">{topic.concepts.map(concept => <span key={concept}>{concept}</span>)}</div></div>
      <div className="resource-tabs" role="tablist" aria-label="Resource category">{categories.map(category => <button key={category} role="tab" aria-selected={tab === category} className={tab === category ? "active" : ""} onClick={() => setTab(category)}>{category}</button>)}</div><div className="resource-section"><div className="resource-filter"><span>{resources.length} resources</span><select aria-label="Resource difficulty" value={resourceLevel} onChange={e => setResourceLevel(e.target.value)}><option>All levels</option><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></div><div className="resource-list">{resources.map(resource => <ResourceCard key={resource.id} resource={resource} saved={saved.some(r => r.id === `${path.id}:${resource.id}`)} onSave={() => onSave(resource,topic.title)} />)}{!resources.length && <div className="empty-small"><BookOpen size={22} /><p>No resources at this level.</p><button className="text-button" onClick={() => setResourceLevel("All levels")}>Show all levels <ArrowRight size={13} /></button></div>}</div><p className="resource-disclaimer">{path.source === "claude" ? "Claude suggests what to search for. Links open resource searches; results aren’t verified." : "Example resources and discovery links. Choose what works for you."}</p></div><div className="topic-actions">{topic.id !== "0" && <button className={`primary-button ${completed.includes(topic.id) ? "completed" : ""}`} onClick={() => onComplete(topic.id)}><Check size={16} />{completed.includes(topic.id) ? "Completed · Undo" : "Mark as completed"}</button>}{topic.children.length > 0 && <button className="text-button" onClick={() => select(topic.children.find(id => !completed.includes(id)) || topic.children[0])}>Explore the next topic<ArrowRight size={14} /></button>}</div></aside>}
    </div>
  </section>;
}
