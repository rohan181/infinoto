"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, ArrowDown, ArrowRight, RefreshCw, Settings2, Link2, ArrowUpRight, BookOpen, Bookmark, Check, ChevronDown, FileText, Globe2, GitCompareArrows, GraduationCap, Library, ListVideo, LoaderCircle, Play, Radio, Search, SlidersHorizontal, Sparkles, X } from "lucide-react";
import type { DiscoveryProvider, LearningPath, Resource, Topic } from "@/app/data";
import { resourcesForTopic } from "@/lib/curated-resources";
import { matchesSocialPlatform, socialSource, socialPlatforms, type SocialFilter } from "@/lib/social";
import { canonicalUrl } from "@/lib/resources";
import { balanceFormats, discoveryFilter, filterRecommendations, formats, isResourceSaved, manualSearchUrl, resourceFormat, type RecommendationFormat, type RecommendationLevel } from "@/lib/recommendations";
import ContentAnalysis from "./content-analysis";
import VideoComparison from "./video-comparison";
import { formatDuration } from "@/lib/youtube";
import { preferredProvider, type DiscoveryAvailability } from "@/lib/discovery-config";
import { useTopicDiscovery } from "./use-topic-discovery";

export type SavedResource = Resource & { topicTitle: string; pathTitle: string };
const formatIcons = { All: Sparkles, Videos: Play, Channels: Radio, Playlists: ListVideo, Blogs: FileText, Books: BookOpen, Papers: GraduationCap, Courses: Library, Social: MessageCircle };
const openLabels = { Videos: "Watch video", Channels: "Visit channel", Playlists: "Open playlist", Blogs: "Read article", Books: "Explore book", Papers: "Read paper", Courses: "Open resource", Social: "View on platform" };
const levels: RecommendationLevel[] = ["All levels", "Beginner", "Intermediate", "Advanced"];

export function ResourceCard({ resource, saved, onSave, onCompare }: { resource: Resource; saved: boolean; onSave: () => void; onCompare?: () => void }) {
  const [imageFailed, setImageFailed] = useState(false);
  const format = resourceFormat(resource), Icon = formatIcons[format];
  const social = resource.type === "Social" ? socialSource(resource.url) : null;
  const openLabel = social ? `Open ${social.platform}` : openLabels[format];
  const url = canonicalUrl(resource.url);
  const videoId = url && format === "Videos" ? new URL(url).searchParams.get("v") : null;
  const initials = resource.author.split(/\s+/).slice(0, 2).map(part => part[0]).join("");
  return <article className={`recommendation-card kind-${format.toLowerCase()}`}>
    <a href={resource.url} target="_blank" rel="noopener noreferrer" className="recommendation-art" aria-label={`${openLabel}: ${resource.title}`} tabIndex={-1}>
      {videoId && !imageFailed ? <img src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`} alt="" loading="lazy" onError={() => setImageFailed(true)} />
        : format === "Channels" ? <span className="creator-monogram">{initials}</span>
        : format === "Books" ? <span className="book-object"><BookOpen size={21} /><span>{resource.title}</span><small>{resource.author.split(",")[0]}</small></span>
        : format === "Playlists" ? <span className="playlist-art"><i/><i/><i/><ListVideo size={28}/></span>
        : <span className="reading-art"><Icon size={27} /><i/><i/><i/></span>}
      {format === "Videos" && <span className="video-play"><Play size={17} fill="currentColor" /></span>}
      {resource.youtube?.durationSeconds !== undefined && <span className="art-duration">{formatDuration(resource.youtube.durationSeconds)}</span>}
      <span className="art-format"><Icon size={10} />{social ? `${social.platform} · ${social.kind}` : format === "Channels" ? "CREATOR" : format === "Playlists" ? "SERIES" : format === "Books" ? "BOOK" : format === "Videos" ? "VIDEO" : "READ & LEARN"}</span>
    </a>
    <div className="recommendation-body"><div className="recommendation-kicker"><span>{resource.author}</span><button className={`save-pick ${saved ? "saved" : ""}`} aria-label={`${saved ? "Unsave" : "Save"} ${resource.title}`} aria-pressed={saved} onClick={onSave}><Bookmark size={15} fill={saved ? "currentColor" : "none"}/></button></div>
      <h3><a href={resource.url} target="_blank" rel="noopener noreferrer">{resource.title}</a></h3>
      <div className="recommendation-badges"><span className={`difficulty-dot ${resource.level.toLowerCase().replace(/\s+/g, "-")}`}><i/>{resource.level}</span><span>{resource.provenance?.provider === "youtube" ? "YouTube" : resource.provenance?.kind === "web-search" ? `${resource.provenance.provider === "exa" ? "Exa" : resource.provenance.provider === "claude" ? "Claude" : "Web"} discovery` : resource.provenance ? "Curated pick" : "Saved resource"}</span></div>
      {resource.youtube && <p className="youtube-resource-meta">{[resource.youtube.durationSeconds !== undefined ? formatDuration(resource.youtube.durationSeconds) : null, resource.youtube.videoCount !== undefined ? `${resource.youtube.videoCount} videos` : null, resource.youtube.publishedAt?.slice(0, 10)].filter(Boolean).join(" · ")}</p>}
      {resource.reason && <p className="recommendation-reason">{resource.reason}</p>}
      {resource.book && <p className="recommendation-book-meta">{[resource.book.publisher, resource.book.year, resource.book.isbn ? `ISBN ${resource.book.isbn}` : undefined].filter(Boolean).join(" · ")}</p>}
      {resource.matchContext === "path" && <span className="broader-match">Related to your broader learning path</span>}
      <div className="recommendation-footer"><a href={resource.url} target="_blank" rel="noopener noreferrer">{openLabel}<ArrowUpRight size={13}/></a><span title={resource.provenance ? `Source ${resource.provenance.kind === "curated" ? "reviewed" : "found"} ${resource.provenance.checkedAt.slice(0, 10)}` : undefined}><Globe2 size={10}/>{url ? new URL(url).hostname.replace(/^www\./, "") : "Source"}</span></div>
      {videoId && onCompare && <button className="compare-resource" aria-label={`Compare ${resource.title} with another creator`} onClick={onCompare}><GitCompareArrows size={14}/>Compare videos<ArrowRight size={13}/></button>}
    </div>
  </article>;
}

export default function TopicResources({ path, topic, saved, onSave, onResources, onSelect, expanded, onExpand }: {
  path: LearningPath; topic: Topic; saved: SavedResource[]; onSave: (resource: Resource, topic: string) => void;
  onResources: (topicId: string, resources: Resource[]) => void; onSelect: (id: string) => void; expanded: boolean; onExpand: () => void;
}) {
  const [format, setFormat] = useState<RecommendationFormat>("Videos");
  const [socialPlatform, setSocialPlatform] = useState<SocialFilter>("All");
  const [level, setLevel] = useState<RecommendationLevel>("All levels");
  const [query, setQuery] = useState("");
  const [creator, setCreator] = useState("All creators");
  const [focusDraft, setFocusDraft] = useState("");
  const [focus, setFocus] = useState({ topicId: "", value: "" });
  const [count, setCount] = useState(6);
  const [videoProvider, setVideoProvider] = useState<DiscoveryProvider>("youtube");
  const [webProvider, setWebProvider] = useState<"exa" | "claude">("exa");
  const [available, setAvailable] = useState<DiscoveryAvailability | null>(null);
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState(false);
  const [includeRelated, setIncludeRelated] = useState(false);
  const [crossAnalysis, setCrossAnalysis] = useState(false);
  const [compareResource, setCompareResource] = useState<Resource | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const effectiveFormat = format === "All" ? "Videos" : format;
  const target = discoveryFilter(effectiveFormat);
  const provider = target.category === "YouTube" ? videoProvider : webProvider;
  const providerLabel = provider === "youtube" ? "YouTube" : provider === "exa" ? "Exa" : "Claude";
  useEffect(() => {
    const controller = new AbortController();
    let video: string | null = null, web: string | null = null;
    try {
      video = localStorage.getItem("infinity-video-provider"); web = localStorage.getItem("infinity-web-provider");
    } catch { /* Preferences are optional. */ }
    fetch("/api/resources", { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]), cache: "no-store" })
      .then(response => response.ok ? response.json() : Promise.reject(new Error("Configuration unavailable")))
      .then(({ available: configured }) => {
        if (!configured || !["youtube", "exa", "claude"].every(key => typeof configured[key] === "boolean")) throw new Error("Invalid configuration");
        if (controller.signal.aborted) return;
        setAvailable(configured);
        setVideoProvider(preferredProvider(configured, true, video));
        setWebProvider(preferredProvider(configured, false, web) as "exa" | "claude");
      })
      .catch(() => { /* A transient config failure leaves explicit engine controls available. */ })
      .finally(() => { if (!controller.signal.aborted) setReady(true); });
    return () => controller.abort();
  }, []);
  useEffect(() => { setCrossAnalysis(false); setCompareResource(null); setQuery(""); setCreator("All creators"); setFocusDraft(""); setCount(6); }, [topic.id]);
  const all = useMemo(() => resourcesForTopic(topic, path.title), [topic, path.title]);
  const crossResources = useMemo(() => [...path.topics.flatMap(t => resourcesForTopic(t, path.title)), ...saved], [path, saved]);
  const scoped = includeRelated ? all : all.filter(r => r.matchContext !== "path");
  const platformScoped = format === "Social" ? scoped.filter(r => r.type === "Social" && matchesSocialPlatform(r.url, socialPlatform)) : scoped;
  const base = filterRecommendations(platformScoped, format, level, query);
  const creators = [...new Set(base.map(r => r.author))];
  const selectedCreator = creators.includes(creator) ? creator : "All creators";
  const filtered = selectedCreator === "All creators" ? base : base.filter(r => r.author === selectedCreator);
  const resources = format === "All" ? balanceFormats(filtered) : filtered;
  const existing = all.filter(r => resourceFormat(r) === effectiveFormat && (format !== "Social" || matchesSocialPlatform(r.url, socialPlatform)));
  const full = existing.length >= 90;
  const activeFocus = focus.topicId === topic.id ? focus.value : "";
  const action = useTopicDiscovery({ pathTitle: path.title, topicTitle: topic.title, description: topic.description, concepts: topic.concepts.slice(0, 6), focus: activeFocus, ...target, ...(format === "Social" ? { socialPlatform } : {}), level, provider, excludeUrls: [] }, effectiveFormat, ready, `${path.id}:${topic.id}`, additions => onResources(topic.id, additions));
  useEffect(() => { resultsRef.current?.scrollTo({ top: 0, behavior: "instant" }); }, [topic.id, format, level, query, creator, provider, socialPlatform]);
  function changeFormat(next: RecommendationFormat) { setFormat(next); setCreator("All creators"); setQuery(""); setCount(6); }
  function changeProvider(next: DiscoveryProvider) {
    if (target.category === "YouTube") setVideoProvider(next); else if (next !== "youtube") setWebProvider(next);
    try { localStorage.setItem(target.category === "YouTube" ? "infinity-video-provider" : "infinity-web-provider", next); } catch { /* Optional preference. */ }
  }
  const hasFilters = !!query || level !== "All levels" || selectedCreator !== "All creators";
  return <section className={`recommendation-engine library-refresh ${expanded ? "expanded" : ""}`} aria-label="Content recommendations">
    <header className="engine-header">
      <div className="engine-eyebrow"><span><Library size={14}/> YOUR LEARNING LIBRARY</span><span className="library-ready"><i/>Follows your topic</span></div>
      <div className="engine-title"><div><h2>Find your next <span>aha.</span></h2><p>Good explanations. Different perspectives. One place.</p></div>{!expanded && <button aria-label="Expand content library" className="engine-expand" onClick={onExpand}><ArrowUpRight size={20}/></button>}</div>
      <label className="engine-topic"><span>EXPLORING</span><select aria-label="Recommendation topic" value={topic.id} onChange={e => onSelect(e.target.value)}>{path.topics.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select><ChevronDown size={16}/></label>
      <div className="topic-context"><span className="topic-level">{topic.difficulty}</span><span>{topic.concepts.slice(0, 2).join(" · ")}</span></div>
    </header>
    <div className="cross-entry"><button onClick={() => { action.cancel(); setCrossAnalysis(true); }}><GitCompareArrows size={17}/><span>Cross-content analysis<small>Compare videos, articles & social posts · Add audio with Whisper</small></span><ArrowUpRight size={16}/></button></div>
    <div className="engine-controls">
      <div className="format-tabs" role="group" aria-label="Content format">{formats.map(item => { const Icon = formatIcons[item]; const total = filterRecommendations(scoped, item, level).length; return <button key={item} aria-pressed={format === item} className={format === item ? "selected" : ""} onClick={() => changeFormat(item)}><Icon size={15}/>{item === "All" ? "All sources" : item === "Courses" ? "Web" : item}<small>{total || ""}</small></button>; })}</div>
      {format === "Social" && <div className="social-controls"><div className="social-platforms" role="group" aria-label="Social platform">{(["All", ...socialPlatforms] as const).map(platform => <button key={platform} aria-pressed={socialPlatform === platform} onClick={() => { setSocialPlatform(platform); setCreator("All creators"); setCount(6); }}>{platform === "All" ? "All platforms" : platform}</button>)}</div><p>Public posts, discussions and creators related to this topic. Some links may require signing in. Add source text to compare posts in your cross-content graph.</p></div>}
      <div className="engine-filter-row"><label className="engine-search"><Search size={15}/><input aria-label="Search recommendations" placeholder="Filter this collection…" value={query} onChange={e => { setQuery(e.target.value); setCount(6); setCreator("All creators"); }}/>{query && <button aria-label="Clear recommendation search" onClick={() => setQuery("")}><X size={14}/></button>}</label><label className="engine-level"><SlidersHorizontal size={14}/><select aria-label="Recommendation difficulty" value={level} onChange={e => { setLevel(e.target.value as RecommendationLevel); setCreator("All creators"); setCount(6); }}>{levels.map(item => <option key={item}>{item}</option>)}</select></label></div>
      <div className="library-search-status"><span><i className={action.busy ? "searching" : ""}/>{action.busy ? `Finding ${effectiveFormat === "Courses" ? "web resources" : effectiveFormat === "Social" ? "social content" : effectiveFormat.toLowerCase()} for this topic` : `Searching with ${providerLabel}`}</span><button aria-expanded={settings} aria-controls="library-search-settings" onClick={() => setSettings(v => !v)}><Settings2 size={14}/>Search settings<ChevronDown size={12}/></button></div>
      {settings && <div id="library-search-settings" className="library-search-settings">
        <div className="discovery-provider-row"><span>SEARCH ENGINE</span><div className="discovery-provider-switch" role="group" aria-label="Discovery provider">{(target.category === "YouTube" ? ["youtube", "exa", "claude"] as const : ["exa", "claude"] as const).map(engine => <button key={engine} aria-pressed={provider === engine} disabled={available !== null && !available[engine]} title={available && !available[engine] ? "Not configured on this server" : undefined} onClick={() => changeProvider(engine)}>{engine === "youtube" ? <Play size={12}/> : <Sparkles size={12}/>} {engine === "youtube" ? "YouTube" : engine === "exa" ? "Exa" : "Claude"}{provider === engine && <Check size={12}/>}</button>)}</div></div>
        <p>Videos use {videoProvider === "youtube" ? "YouTube" : videoProvider === "exa" ? "Exa" : "Claude"}; social, blogs and web use {webProvider === "exa" ? "Exa" : "Claude"}. Available choices are remembered.</p>
        <form className="refine-resource-search" onSubmit={e => { e.preventDefault(); setFocus({ topicId: topic.id, value: focusDraft.trim() }); }}><label htmlFor="resource-focus">Refine the live search</label><div><input id="resource-focus" value={focusDraft} onChange={e => setFocusDraft(e.target.value)} maxLength={100} placeholder={`e.g. ${topic.title} worked examples`}/><button type="submit">Apply<ArrowRight size={13}/></button></div></form>
        {activeFocus && <button className="clear-search-focus" onClick={() => { setFocus({ topicId: topic.id, value: "" }); setFocusDraft(""); }}>Clear “{activeFocus}”<X size={12}/></button>}
        <label className="related-resource-toggle"><input type="checkbox" checked={includeRelated} onChange={e => setIncludeRelated(e.target.checked)}/>Include broader learning-path resources</label>
      </div>}
    </div>
    <div className="engine-results" ref={resultsRef} aria-busy={action.busy}>
      <div className="results-heading"><div><span>{format === "All" ? "Your collection" : format === "Courses" ? "From across the web" : format === "Social" ? `${socialPlatform === "All" ? "Social" : socialPlatform} for you` : `${format} for you`}</span><small>{resources.length} sources · {topic.title}</small></div>{creators.length > 1 && <select aria-label="Filter by creator" value={selectedCreator} onChange={e => { setCreator(e.target.value); setCount(6); }}><option>All creators</option>{creators.map(item => <option key={item}>{item}</option>)}</select>}</div>
      {hasFilters && <div className="active-library-filters"><span>{level !== "All levels" ? level : "Filtered collection"}{selectedCreator !== "All creators" ? ` · ${selectedCreator}` : ""}</span><button onClick={() => { setLevel("All levels"); setQuery(""); setCreator("All creators"); }}>Clear filters<X size={12}/></button></div>}
      {action.busy && <div className="engine-loading" role="status"><LoaderCircle size={19} className="spin"/><div><strong>Finding a good place to start…</strong><p>Searching {providerLabel} for {activeFocus || topic.title}.</p></div><button onClick={action.cancel}>Stop</button></div>}
      {action.error && <div className="engine-error" role="alert"><span className="error-orbit">!</span><div><strong>{providerLabel} search needs attention</strong><p>{action.error}</p><div className="search-recovery"><button onClick={() => action.refresh()}>Retry search<RefreshCw size={13}/></button><button onClick={() => setSettings(true)}>Change engine</button><a href={manualSearchUrl(activeFocus || topic.title, effectiveFormat, level, socialPlatform)} target="_blank" rel="noopener noreferrer">Search directly<ArrowUpRight size={12}/></a></div></div></div>}
      {!action.busy && action.note && <p className="engine-notice" role="status"><Check size={13}/>{action.note}</p>}
      {action.busy && !resources.length && <div className="resource-skeletons" aria-hidden="true">{[0, 1, 2].map(i => <div key={i}><i/><span/><span/><span/></div>)}</div>}
      <div className="recommendation-grid">{resources.slice(0, count).map(resource => <ResourceCard key={resource.id} resource={resource} saved={isResourceSaved(saved, path.id, resource)} onSave={() => onSave(resource, topic.title)} onCompare={() => setCompareResource(resource)}/>)}</div>
      {!resources.length && !action.busy && <div className="engine-empty"><span><Search size={25}/></span><h3>{hasFilters ? "Let’s widen the search." : "A topic worth exploring."}</h3><p>{hasFilters ? "No sources match these filters yet. Try All levels to include sources whose difficulty has not been assessed." : format === "Social" ? "No public social results found for this topic and platform yet. Try another platform or refine the search." : "No suitable sources found for this topic yet. Refine the search or try another engine."}</p><div><button onClick={() => { if (hasFilters) { setQuery(""); setCreator("All creators"); setLevel("All levels"); } else setSettings(true); }}>{hasFilters ? "Clear filters" : "Refine search"}<ArrowRight size={13}/></button></div></div>}
      {count < resources.length && <button className="show-more-picks" onClick={() => setCount(n => n + 6)}>Show {Math.min(6, resources.length - count)} more<ArrowDown size={14}/><small>{count} of {resources.length}</small></button>}
      {!action.busy && !full && <button className="find-more-sources" onClick={() => action.refresh(existing.map(r => r.url).slice(-90))}><RefreshCw size={14}/>{action.phase === "stopped" ? "Resume search" : "Find more sources"}<span>with {providerLabel}</span></button>}
      <footer className="engine-footnote"><span><Link2 size={13}/>Direct sources, chosen for this topic</span><p>{format === "Social" ? "Search covers publicly indexed content. Availability varies by platform; these are external links, not a live social feed." : provider === "youtube" ? "Difficulty follows labels in video titles. All levels includes unlabeled lessons." : "Difficulty is an estimate of starting knowledge. Some sources may require payment."}</p></footer>
    </div>
    {crossAnalysis && <ContentAnalysis key={`${path.id}:${topic.id}`} resources={crossResources} initial={all} topic={topic.title} concepts={topic.concepts} onClose={() => setCrossAnalysis(false)}/>}
    {compareResource && <VideoComparison key={compareResource.id} resource={compareResource} concepts={topic.concepts} onClose={() => setCompareResource(null)}/>}
  </section>;
}
