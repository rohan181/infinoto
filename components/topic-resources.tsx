"use client";

import { useState } from "react";
import { ArrowUpRight, BookOpen, Bookmark, ChevronDown, FileText, Globe2, GraduationCap, LoaderCircle, RotateCcw, Search, Square, Youtube } from "lucide-react";
import type { Difficulty, LearningPath, Resource, ResourceType, Topic } from "@/app/data";
import { resourcesForTopic } from "@/lib/curated-resources";
import { resourceRecordSchema } from "@/lib/resources";
import { useRemoteAction } from "./use-remote-action";

export type SavedResource = Resource & { topicTitle: string; pathTitle: string };
const categories: ResourceType[] = ["YouTube", "Blogs", "Books", "Papers", "Other"];
const levels: Difficulty[] = ["Beginner", "Intermediate", "Advanced"];

export function ResourceCard({ resource, saved, onSave }: { resource: Resource; saved: boolean; onSave: () => void }) {
  const Icon = resource.type === "YouTube" ? Youtube : resource.type === "Papers" ? GraduationCap : resource.type === "Blogs" ? FileText : BookOpen;
  const provenance = resource.provenance;
  return <article className="resource-card"><div className={`resource-symbol ${resource.type.toLowerCase()}`}><Icon size={19} /></div><div className="resource-copy">
    <a href={resource.url} target="_blank" rel="noopener noreferrer">{resource.title}<ArrowUpRight size={13} /></a><span>{resource.author}</span>
    <div><span className={`level ${resource.level.toLowerCase()}`}>{resource.level}</span><small>{resource.meta}</small></div>
    {resource.reason && <p className="resource-reason">{resource.reason}</p>}
    {resource.book && <p className="book-reference">{[resource.book.publisher, resource.book.year, resource.book.isbn ? `ISBN ${resource.book.isbn}` : undefined].filter(Boolean).join(" · ") || "See the source for edition and publisher details."}</p>}
    {provenance && <span className="source-provenance"><Globe2 size={11} />{provenance.kind === "curated" ? "Curated" : "Web source"} · {new URL(resource.url).hostname.replace(/^www\./, "")}<time dateTime={provenance.checkedAt}>{provenance.kind === "curated" ? "Reviewed" : "Found"} {new Date(provenance.checkedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}</time></span>}
  </div><button className={`icon-button bookmark-button ${saved ? "is-saved" : ""}`} aria-label={`${saved ? "Unsave" : "Save"} ${resource.title}`} aria-pressed={saved} onClick={onSave}><Bookmark size={16} fill={saved ? "currentColor" : "none"} /></button></article>;
}

export default function TopicResources({ path, topic, saved, onSave, onResources }: {
  path: LearningPath; topic: Topic; saved: SavedResource[]; onSave: (resource: Resource, topic: string) => void;
  onResources: (topicId: string, resources: Resource[]) => void;
}) {
  const [category, setCategory] = useState<ResourceType>("YouTube");
  const [level, setLevel] = useState<"All levels" | Difficulty>("All levels");
  const [notice, setNotice] = useState("");
  const action = useRemoteAction();
  const all = resourcesForTopic(topic);
  const categoryResources = all.filter(r => r.type === category);
  const resources = categoryResources.filter(r => level === "All levels" || r.level === level);
  const full = categoryResources.length >= 90;
  function discover() {
    setNotice("");
    void action.run("/api/resources", { pathTitle: path.title, topicTitle: topic.title, description: topic.description, concepts: topic.concepts, category, level, excludeUrls: categoryResources.map(r => r.url).slice(-90) }, raw => {
      const result = raw as { resources: unknown; note: string };
      const parsed = resourceRecordSchema.array().max(6).parse(result.resources);
      onResources(topic.id, parsed);
      setNotice(typeof result.note === "string" ? result.note : `${parsed.length} new sources added.`);
    });
  }
  return <section className="topic-resources" aria-label="Learning resources">
    <div className="resources-heading"><span><Globe2 size={14} /> LEARN FROM THE SOURCE</span><small>Videos, reading & more</small></div>
    <div className="resource-tabs" role="tablist" aria-label="Resource category">{categories.map(type => <button key={type} id={`tab-${type}`} role="tab" aria-selected={category === type} aria-controls="resource-results" disabled={action.busy} className={category === type ? "active" : ""} onClick={() => { setCategory(type); setNotice(""); action.clearError(); }}>{type}</button>)}</div>
    <div className="resource-section"><div className="resource-filter"><span>{resources.length} {resources.length === 1 ? "source" : "sources"}</span><select aria-label="Resource difficulty" value={level} disabled={action.busy} onChange={e => { setLevel(e.target.value as typeof level); setNotice(""); action.clearError(); }}><option>All levels</option>{levels.map(item => <option key={item}>{item}</option>)}</select></div>
      <button className="discover-button" disabled={action.busy || full} onClick={discover}>{action.busy ? <LoaderCircle size={15} className="spin" /> : action.error ? <RotateCcw size={15} /> : <Search size={15} />}{action.busy ? "Searching the web…" : action.error ? "Retry source search" : resources.length ? "Find more sources" : "Find sources on the web"}{!action.busy && <ArrowUpRight size={13} />}</button>
      {action.busy && <div className="request-progress" role="status"><span>Finding {level === "All levels" ? "all difficulty levels" : level.toLowerCase()} {category.toLowerCase()}.</span><button className="text-button" onClick={action.cancel}><Square size={11} /> Stop</button></div>}
      {action.error && <p className="feature-error" role="alert">{action.error}</p>}
      {notice && <p className="feature-note" role="status">{notice}</p>}
      {full && <p className="feature-note">You have collected 90 sources in this category. Explore a more specific subtopic for more.</p>}
      <div id="resource-results" role="tabpanel" aria-labelledby={`tab-${category}`} className="resource-groups">
        {(level === "All levels" ? levels : [level]).map(difficulty => { const items = resources.filter(r => r.level === difficulty); return <details className="resource-group" key={`${category}-${difficulty}`} open><summary><span className={`level ${difficulty.toLowerCase()}`}>{difficulty}</span><span>{items.length} {items.length === 1 ? "source" : "sources"}</span><ChevronDown size={14} /></summary><div>{items.length ? items.map(resource => <ResourceCard key={resource.id} resource={resource} saved={saved.some(r => r.id === `${path.id}:${resource.id}`)} onSave={() => onSave(resource, topic.title)} />) : <p className="level-empty">No {difficulty.toLowerCase()} sources collected yet. Use web search to discover some.</p>}</div></details>; })}
      </div>
      <p className="resource-disclaimer">Direct links to original sources. Difficulty is an estimate; some sources may require payment. Curated examples are labeled separately from live web results.</p>
    </div>
  </section>;
}
