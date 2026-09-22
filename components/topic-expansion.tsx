"use client";

import { useState } from "react";
import { ArrowUpRight, ChevronDown, GitBranch, LoaderCircle, Plus, RotateCcw, Square } from "lucide-react";
import type { Difficulty, LearningPath, Topic } from "@/app/data";
import { appendBranch, MAX_TOPICS, outlineParent } from "@/lib/branches";
import { useRemoteAction } from "./use-remote-action";

export default function TopicExpansion({ path, topic, onAdd, onSelect }: {
  path: LearningPath; topic: Topic; onAdd: (parentId: string, topics: Topic[]) => void; onSelect: (id: string) => void;
}) {
  const [level, setLevel] = useState<Difficulty>(topic.difficulty === "Beginner" ? "Intermediate" : "Advanced");
  const [focus, setFocus] = useState("");
  const [summary, setSummary] = useState("");
  const action = useRemoteAction();
  const children = path.topics.filter(t => outlineParent(t) === topic.id);
  const full = path.topics.length > MAX_TOPICS - 3;
  function expand() {
    setSummary("");
    void action.run("/api/expand", { pathTitle: path.title, topicId: topic.id, level, focus,
      topics: path.topics.map(({ id, title, description, difficulty, prerequisites }) => ({ id, title, description, difficulty, prerequisites })),
    }, raw => {
      const result = raw as { parentId: string; topics: Topic[]; summary: string };
      if (result.parentId !== topic.id || !Array.isArray(result.topics) || typeof result.summary !== "string") throw new Error("The new branch was incomplete. Please retry.");
      appendBranch(path, topic.id, result.topics); // Validate before updating the saved workspace.
      onAdd(topic.id, result.topics); setSummary(result.summary);
    });
  }
  return <section className="branch-section" aria-label="Deeper branches">
    <details className="branch-dropdown">
      <summary><span><GitBranch size={15} /> Go deeper <small>{children.length} {children.length === 1 ? "branch" : "branches"}</small></span><ChevronDown size={15} /></summary>
      <div className="branch-content">
        {children.length > 0 && <div className="branch-children">{children.map(child => <button key={child.id} onClick={() => onSelect(child.id)}><span><strong>{child.title}</strong><small>{child.difficulty} · {child.hours}h</small></span><ArrowUpRight size={14} /></button>)}</div>}
        <p>Grow this section into 3–5 new subtopics. Every new branch can go deeper, too.</p>
        <div className="branch-inputs"><label>Branch difficulty<select aria-label="Branch difficulty" value={level} disabled={action.busy} onChange={e => setLevel(e.target.value as Difficulty)}><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label><label>Specific focus <span>optional</span><input aria-label="Branch focus" value={focus} maxLength={250} disabled={action.busy} onChange={e => setFocus(e.target.value)} placeholder="e.g. internals or real-world projects" /></label></div>
        <button className="branch-generate" disabled={action.busy || full} onClick={expand}>{action.busy ? <LoaderCircle size={15} className="spin" /> : action.error ? <RotateCcw size={15} /> : <Plus size={15} />}{action.busy ? "Growing your branch…" : action.error ? "Retry branch generation" : children.length ? "Generate more branches" : "Generate deeper branches"}</button>
        {action.busy && <div className="request-progress" role="status"><span>Claude is connecting new concepts.</span><button className="text-button" onClick={action.cancel}><Square size={11} /> Stop</button></div>}
        {full && <p className="feature-note">This map has reached its {MAX_TOPICS}-topic capacity. Create a focused path to keep exploring.</p>}
        {action.error && <p className="feature-error" role="alert">{action.error}</p>}
        {summary && <p className="feature-success" role="status">{summary}</p>}
      </div>
    </details>
  </section>;
}

export function TopicOutline({ path, selectedId, completed, matching, onSelect }: {
  path: LearningPath; selectedId: string; completed: string[]; matching: (title: string, difficulty: string) => boolean; onSelect: (id: string) => void;
}) {
  const children = (id: string) => path.topics.filter(t => outlineParent(t) === id);
  const includesMatch = (node: Topic): boolean => matching(node.title, node.difficulty) || children(node.id).some(includesMatch);
  function render(node: Topic, depth: number): React.ReactNode {
    if (!includesMatch(node)) return null;
    const descendants = children(node.id).filter(includesMatch);
    const label = <button className={`outline-topic ${node.id === selectedId ? "active" : ""}`} onClick={e => { e.preventDefault(); onSelect(node.id); }}><span><strong>{node.title}</strong><small>{completed.includes(node.id) ? "Completed" : `${node.difficulty} · ${node.hours}h`}</small></span><ArrowUpRight size={14} /></button>;
    return descendants.length ? <details key={node.id} className="outline-branch" open={depth < 2}><summary><ChevronDown size={14} />{label}<small>{descendants.length}</small></summary><div className="outline-children">{descendants.map(t => render(t, depth + 1))}</div></details> : <div className="outline-leaf" key={node.id}>{label}</div>;
  }
  const roots = children("0").filter(includesMatch);
  return <div className="topic-outline"><p className="outline-hint">Open a dropdown to follow its branches. Select any topic to grow it.</p>{roots.map(node => render(node, 0))}{!roots.length && <div className="empty-small">No matching topics. Try another filter.</div>}</div>;
}
