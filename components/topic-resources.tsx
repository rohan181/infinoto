"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight, BookOpen, Bookmark, Check, ChevronDown, FileText, Globe2, GraduationCap, Library, ListVideo, LoaderCircle, Play, Radio, Search, SlidersHorizontal, Sparkles, Square, X } from "lucide-react";
import type { DiscoveryProvider, LearningPath, Resource, Topic } from "@/app/data";
import { resourcesForTopic } from "@/lib/curated-resources";
import { canonicalUrl, resourceRecordSchema } from "@/lib/resources";
import { balanceFormats, discoveryFilter, filterRecommendations, formats, isResourceSaved, manualSearchUrl, resourceFormat, type RecommendationFormat, type RecommendationLevel } from "@/lib/recommendations";
import { useRemoteAction } from "./use-remote-action";

export type SavedResource = Resource & { topicTitle: string; pathTitle: string };
const formatIcons = { All: Sparkles, Videos: Play, Channels: Radio, Playlists: ListVideo, Blogs: FileText, Books: BookOpen, Papers: GraduationCap, Courses: Library };
const openLabels = { Videos: "Watch video", Channels: "Visit channel", Playlists: "Open playlist", Blogs: "Read article", Books: "Explore book", Papers: "Read paper", Courses: "Open resource" };
const levels: RecommendationLevel[] = ["All levels", "Beginner", "Intermediate", "Advanced"];

export function ResourceCard({ resource, saved, onSave }: { resource: Resource; saved: boolean; onSave: () => void }) {
  const [imageFailed, setImageFailed] = useState(false);
  const format = resourceFormat(resource), Icon = formatIcons[format];
  const url = canonicalUrl(resource.url);
  const videoId = url && format === "Videos" ? new URL(url).searchParams.get("v") : null;
  const initials = resource.author.split(/\s+/).slice(0, 2).map(part => part[0]).join("");
  return <article className={`recommendation-card kind-${format.toLowerCase()}`}>
    <a href={resource.url} target="_blank" rel="noopener noreferrer" className="recommendation-art" aria-label={`${openLabels[format]}: ${resource.title}`} tabIndex={-1}>
      {videoId && !imageFailed ? <img src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`} alt="" loading="lazy" onError={() => setImageFailed(true)} />
        : format === "Channels" ? <span className="creator-monogram">{initials}</span>
        : format === "Books" ? <span className="book-object"><BookOpen size={21} /><span>{resource.title}</span><small>{resource.author.split(",")[0]}</small></span>
        : format === "Playlists" ? <span className="playlist-art"><i/><i/><i/><ListVideo size={28}/></span>
        : <span className="reading-art"><Icon size={27} /><i/><i/><i/></span>}
      {format === "Videos" && <span className="video-play"><Play size={17} fill="currentColor" /></span>}
      <span className="art-format"><Icon size={10} />{format === "Channels" ? "CREATOR" : format === "Playlists" ? "SERIES" : format === "Books" ? "BOOK" : format === "Videos" ? "VIDEO" : "READ & LEARN"}</span>
    </a>
    <div className="recommendation-body"><div className="recommendation-kicker"><span>{resource.author}</span><button className={`save-pick ${saved ? "saved" : ""}`} aria-label={`${saved ? "Unsave" : "Save"} ${resource.title}`} aria-pressed={saved} onClick={onSave}><Bookmark size={15} fill={saved ? "currentColor" : "none"}/></button></div>
      <h3><a href={resource.url} target="_blank" rel="noopener noreferrer">{resource.title}</a></h3>
      <div className="recommendation-badges"><span className={`difficulty-dot ${resource.level.toLowerCase()}`}><i/>{resource.level}</span><span>{resource.provenance?.kind === "web-search" ? `${resource.provenance.provider === "exa" ? "Exa" : resource.provenance.provider === "claude" ? "Claude" : "Web"} discovery` : resource.provenance ? "Curated pick" : "Saved resource"}</span></div>
      {resource.reason && <p className="recommendation-reason">{resource.reason}</p>}
      {resource.book && <p className="recommendation-book-meta">{[resource.book.publisher, resource.book.year, resource.book.isbn ? `ISBN ${resource.book.isbn}` : undefined].filter(Boolean).join(" · ")}</p>}
      {resource.matchContext === "path" && <span className="broader-match">Related to your broader learning path</span>}
      <div className="recommendation-footer"><a href={resource.url} target="_blank" rel="noopener noreferrer">{openLabels[format]}<ArrowUpRight size={13}/></a><span title={resource.provenance ? `Source ${resource.provenance.kind === "curated" ? "reviewed" : "found"} ${resource.provenance.checkedAt.slice(0, 10)}` : undefined}><Globe2 size={10}/>{url ? new URL(url).hostname.replace(/^www\./, "") : "Source"}</span></div>
    </div>
  </article>;
}

export default function TopicResources({ path, topic, saved, onSave, onResources, onSelect, expanded, onExpand }: {
  path: LearningPath; topic: Topic; saved: SavedResource[]; onSave: (resource: Resource, topic: string) => void;
  onResources: (topicId: string, resources: Resource[]) => void; onSelect: (id: string) => void; expanded: boolean; onExpand: () => void;
}) {
  const [format, setFormat] = useState<RecommendationFormat>("All");
  const [level, setLevel] = useState<RecommendationLevel>("All levels");
  const [searchFormat, setSearchFormat] = useState<Exclude<RecommendationFormat, "All">>("Videos");
  const [query, setQuery] = useState("");
  const [creator, setCreator] = useState("All creators");
  const [notice, setNotice] = useState("");
  const [count, setCount] = useState(6);
  const [provider, setProvider] = useState<DiscoveryProvider>("exa");
  const providerLabel = provider === "exa" ? "Exa" : "Claude";
  const resultsRef = useRef<HTMLDivElement>(null);
  const action = useRemoteAction();
  const reset = action.reset;
  useEffect(() => {
    try {
      const previous = localStorage.getItem("infinity-discovery-provider");
      if (previous === "exa" || previous === "claude") setProvider(previous);
    } catch { /* Provider switching still works if browser storage is unavailable. */ }
  }, []);
  useEffect(() => { reset(); setNotice(""); setQuery(""); setCreator("All creators"); setCount(6); }, [topic.id, reset]);
  useEffect(() => { resultsRef.current?.scrollTo({ top: 0, behavior: "instant" }); }, [topic.id, format, level, query, creator, provider]);
  const all = useMemo(() => resourcesForTopic(topic, path.title), [topic, path.title]);
  const base = filterRecommendations(all, format, level, query);
  const creators = [...new Set(base.map(r => r.author))];
  const filtered = creator === "All creators" ? base : base.filter(r => r.author === creator);
  const resources = format === "All" ? balanceFormats(filtered) : filtered;
  const effectiveFormat = format === "All" ? searchFormat : format;
  const target = discoveryFilter(effectiveFormat);
  const existing = all.filter(r => r.type === target.category);
  const full = existing.length >= 90;
  const libraryCount = all.filter(r => r.provenance?.kind === "curated").length;
  function changeFormat(next: RecommendationFormat) { reset(); setFormat(next); setCreator("All creators"); setNotice(""); setCount(6); }
  function changeProvider(next: DiscoveryProvider) {
    reset(); setNotice(""); setProvider(next);
    try { localStorage.setItem("infinity-discovery-provider", next); } catch { /* Optional preference. */ }
  }
  function discover() {
    setNotice("");
    // Narrow All to the explicitly selected discovery format. This makes the
    // requested type visible and avoids quietly searching only YouTube.
    if (format === "All") setFormat(effectiveFormat);
    setQuery(""); setCreator("All creators"); setCount(6);
    void action.run("/api/resources", { pathTitle: path.title, topicTitle: topic.title, description: topic.description, concepts: topic.concepts, ...target, level, provider, excludeUrls: existing.map(r => r.url).slice(-90) }, raw => {
      const result = raw as { resources: unknown; note: string };
      const parsed = resourceRecordSchema.array().max(6).safeParse(result.resources);
      if (!parsed.success) throw new Error("The source list was incomplete. Your saved recommendations are unchanged; please retry.");
      const valid = parsed.data.filter(r => resourceFormat(r) === effectiveFormat);
      onResources(topic.id, valid);
      setNotice(valid.length ? `${providerLabel} found ${valid.length} new ${effectiveFormat.toLowerCase()} for this topic.` : `${providerLabel} found no new matching sources. Try another format, difficulty, or provider.`);
    });
  }
  const connectionIssue = [401, 403, 402, 503].includes(action.status || 0);
  return <section className={`recommendation-engine ${expanded ? "expanded" : ""}`} aria-label="Content recommendations">
    <header className="engine-header"><div className="engine-eyebrow"><span><Sparkles size={13}/> CONTENT RECOMMENDATIONS</span><span className="library-ready"><i/>Library ready</span></div><div className="engine-title"><div><h2>{expanded ? "Good content. Great progress." : "Your next good find."}</h2><p>Less searching. More learning.</p></div>{!expanded && <button aria-label="Expand content library" className="engine-expand" onClick={onExpand}><ArrowUpRight size={21}/></button>}</div>
      <label className="engine-topic"><span>FOR THIS TOPIC</span><select aria-label="Recommendation topic" value={topic.id} onChange={e => onSelect(e.target.value)}>{path.topics.map(t => <option key={t.id} value={t.id}>{t.id === "0" ? `${t.title} — overview` : t.title}</option>)}</select><ChevronDown size={15}/></label>
    </header>
    <div className="engine-controls"><div className="format-tabs" role="group" aria-label="Content format">{formats.map(item => { const Icon = formatIcons[item]; const total = filterRecommendations(all, item, level).length; return <button key={item} aria-pressed={format === item} className={format === item ? "selected" : ""} onClick={() => changeFormat(item)}><Icon size={14}/>{item === "All" ? "For you" : item}<small>{total}</small></button>; })}</div>
      <div className="engine-filter-row"><label className="engine-search"><Search size={14}/><input aria-label="Search recommendations" placeholder="Search a title or creator…" value={query} onChange={e => { setQuery(e.target.value); setCount(6); setCreator("All creators"); }}/>{query && <button aria-label="Clear recommendation search" onClick={() => setQuery("")}><X size={13}/></button>}</label><label className="engine-level"><SlidersHorizontal size={13}/><select aria-label="Recommendation difficulty" value={level} onChange={e => { reset(); setLevel(e.target.value as RecommendationLevel); setCreator("All creators"); setNotice(""); setCount(6); }}>{levels.map(item => <option key={item}>{item}</option>)}</select></label></div>
      <div className="discovery-provider-row"><span>SEARCH WITH</span><div className="discovery-provider-switch" role="group" aria-label="Discovery provider">{(["exa", "claude"] as const).map(engine => <button key={engine} aria-pressed={provider === engine} onClick={() => changeProvider(engine)}><span aria-hidden="true" className={`provider-mark ${engine}`}>{engine === "exa" ? "e" : "✳"}</span>{engine === "exa" ? "Exa" : "Claude"}{provider === engine && <Check size={12}/>}</button>)}</div><span className="provider-description">Your choice is saved</span></div>
      <div className="discovery-bar"><span><Globe2 size={13}/>{providerLabel} discovery</span>{format === "All" && <select aria-label="Web discovery format" value={searchFormat} onChange={e => setSearchFormat(e.target.value as typeof searchFormat)}>{formats.filter(f => f !== "All").map(item => <option key={item}>{item}</option>)}</select>}<button onClick={action.busy ? action.cancel : discover} disabled={full && !action.busy}>{action.busy ? <><Square size={12}/>Stop search</> : <><Sparkles size={13}/>{action.error ? `Retry ${providerLabel}` : `Find new ${effectiveFormat.toLowerCase()}`}<ArrowUpRight size={12}/></>}</button></div>
    </div>
    <div className="engine-results" ref={resultsRef} aria-live="polite" aria-busy={action.busy}>
      {action.busy && <div className="engine-loading" role="status"><LoaderCircle size={18} className="spin"/><div><strong>Searching with {providerLabel}…</strong><p>Finding {level === "All levels" ? "relevant" : level.toLowerCase()} {effectiveFormat.toLowerCase()} on the web. Your library stays available below.</p></div></div>}
      {action.error && <div className="engine-error" role="alert"><span className="error-orbit">!</span><div><strong>{connectionIssue ? `${providerLabel} discovery is unavailable` : `${providerLabel} couldn’t finish that search`}</strong><p>{connectionIssue ? "Your collected picks are still available. Try the other provider or check the details below." : action.error}</p>{connectionIssue && <details><summary>Connection details</summary><p>{action.error}</p></details>}<a href={manualSearchUrl(topic.title, effectiveFormat, level)} target="_blank" rel="noopener noreferrer">Search directly instead <ArrowUpRight size={12}/></a></div></div>}
      {notice && <p className="engine-notice" role="status"><Check size={14}/>{notice}</p>}
      <div className="results-heading"><div><span>{query ? "SEARCH RESULTS" : format === "All" ? "PICKED FOR YOUR NEXT STEP" : `${format.toUpperCase()} TO EXPLORE`}</span><small>{resources.length} {resources.length === 1 ? "recommendation" : "recommendations"}</small></div>{creators.length > 1 && <select aria-label="Filter by creator" value={creator} onChange={e => { setCreator(e.target.value); setCount(6); }}><option>All creators</option>{creators.map(item => <option key={item}>{item}</option>)}</select>}</div>
      <div className="recommendation-grid">{resources.slice(0, count).map(resource => <ResourceCard key={resource.id} resource={resource} saved={isResourceSaved(saved, path.id, resource)} onSave={() => onSave(resource, topic.title)}/>)}</div>
      {!resources.length && <div className="engine-empty"><span><Search size={25}/></span><h3>{query || creator !== "All creators" ? "No picks match that search." : "A new corner to explore."}</h3><p>{level !== "All levels" ? `No ${level.toLowerCase()} ${format === "All" ? "resources" : format.toLowerCase()} in this collection yet.` : "We haven’t collected this combination yet."} Try another filter, discover new sources, or search directly.</p><div><button onClick={() => { setQuery(""); setCreator("All creators"); setLevel("All levels"); changeFormat("All"); }}>Reset filters<ArrowRight size={13}/></button><a href={manualSearchUrl(topic.title, effectiveFormat, level)} target="_blank" rel="noopener noreferrer">Search the web<ArrowUpRight size={13}/></a></div></div>}
      {count < resources.length && <button className="show-more-picks" onClick={() => setCount(n => n + 6)}>Show {Math.min(6, resources.length - count)} more picks<ArrowDown size={14}/><small>{count} of {resources.length}</small></button>}
      {full && <p className="engine-footnote">This category has reached 90 collected sources. Explore a deeper topic for more.</p>}
      <footer className="engine-footnote"><span><Check size={12}/>{libraryCount} curated sources available without live search</span><p>Difficulty reflects suggested starting knowledge. Channels and series may span several levels. Source access can change; some books and articles require payment.</p></footer>
    </div>
  </section>;
}
