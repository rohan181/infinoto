"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, GitCompareArrows, LoaderCircle, Search, X, Layers2, Plus, Info } from "lucide-react";
import type { Resource } from "@/app/data";
import { comparisonSchema, formatDuration, parseVideoId, similarSchema, videoUrl, type CoverageRow, type YouTubeVideo } from "@/lib/youtube";
import { useRemoteAction } from "./use-remote-action";

type Comparison = ReturnType<typeof comparisonSchema.parse>;
type CoverageFilter = "All topics" | "Shared" | "Only in A" | "Only in B";
function VideoSummary({ video, label }: { video: YouTubeVideo; label: string }) {
  return <article className="compare-video-summary"><a href={videoUrl(video.id)} target="_blank" rel="noopener noreferrer" tabIndex={-1}><img src={`https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`} alt=""/></a><div><span className="compare-letter">{label}</span><small>{video.channelTitle}</small><h3><a href={videoUrl(video.id)} target="_blank" rel="noopener noreferrer">{video.title}<ArrowUpRight size={12}/></a></h3><p>{formatDuration(video.durationSeconds)} · {video.chapters.length} chapter markers{video.publishedAt && ` · ${video.publishedAt.slice(0, 4)}`}</p></div></article>;
}
function Evidence({ value, video }: { value: CoverageRow["left"]; video: YouTubeVideo }) {
  if (!value) return <span className="coverage-missing">Not listed</span>;
  return <a className="coverage-evidence" href={videoUrl(video.id, value.seconds)} target="_blank" rel="noopener noreferrer"><span><Check size={12}/>{value.kind === "chapter" ? `Chapter · ${formatDuration(value.seconds || 0)}` : "Description mention"}<ArrowUpRight size={11}/></span><small>{value.label}</small></a>;
}
export default function VideoComparison({ resource, concepts, onClose }: { resource: Resource; concepts: string[]; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [base, setBase] = useState<YouTubeVideo | null>(null);
  const [candidates, setCandidates] = useState<YouTubeVideo[]>([]);
  const [query, setQuery] = useState("");
  const [manual, setManual] = useState("");
  const [inputError, setInputError] = useState("");
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [filter, setFilter] = useState<CoverageFilter>("All topics");
  const [coverageQuery, setCoverageQuery] = useState("");
  const [chaptersOnly, setChaptersOnly] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState("");
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const [phase, setPhase] = useState<"search" | "compare">("search");
  const action = useRemoteAction();
  const { run, reset } = action;
  const id = parseVideoId(resource.url);
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    element?.showModal(); document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, []);
  useEffect(() => {
    if (id) void run("/api/youtube", { action: "similar", videoId: id }, raw => {
      const result = similarSchema.parse(raw); setBase(result.base); setCandidates(result.candidates); setQuery(result.query);
    });
    return reset;
  }, [id, run, reset]);
  useEffect(() => { if (comparison) resultHeading.current?.focus(); }, [comparison]);
  function search() {
    if (!query.trim() || !id) return;
    setInputError(""); setPhase("search");
    void run("/api/youtube", { action: "similar", videoId: id, query: query.trim() }, raw => {
      const result = similarSchema.parse(raw); setBase(result.base); setCandidates(result.candidates);
    });
  }
  function compare(otherId: string | null) {
    if (!otherId) { setInputError("Paste a valid YouTube video link or video ID."); return; }
    if (otherId === id) { setInputError("Choose a second video from another creator."); return; }
    setInputError(""); setPhase("compare"); setSelectedVideo(otherId);
    void run("/api/youtube", { action: "compare", videoIds: [id, otherId], concepts: concepts.slice(0, 6) }, raw => {
      setComparison(comparisonSchema.parse(raw)); setFilter("All topics"); setCoverageQuery(""); dialog.current?.scrollTo({ top: 0 });
    });
  }
  const rows = comparison?.rows || [];
  const shared = rows.filter(r => r.left && r.right).length;
  const onlyA = rows.filter(r => r.left && !r.right).length;
  const onlyB = rows.filter(r => !r.left && r.right).length;
  const visible = rows.filter(r => (filter === "All topics" || (filter === "Shared" ? r.left && r.right : filter === "Only in A" ? r.left && !r.right : !r.left && r.right)) && `${r.topic} ${r.left?.label || ""} ${r.right?.label || ""}`.toLowerCase().includes(coverageQuery.trim().toLowerCase()));
  const choices = chaptersOnly ? candidates.filter(v => v.chapters.length > 0) : candidates;
  return <dialog ref={dialog} className="video-comparison" aria-labelledby="comparison-title" onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="comparison-content"><header className="comparison-header"><div><span className="comparison-eyebrow"><GitCompareArrows size={14}/> VIDEO COMPARE</span><h2 id="comparison-title" ref={resultHeading} tabIndex={-1}>{comparison ? "See what each lesson adds." : "Find another perspective."}</h2><p>{comparison ? "Shared foundations. Extra chapters. A clearer next step." : "Compare two teachers before you invest your time."}</p></div><button className="comparison-close" aria-label="Close video comparison" onClick={onClose} autoFocus><X size={19}/></button></header>
      <div className="comparison-progress" aria-label="Comparison progress"><span className="complete"><Check size={12}/>Starting video</span><i/><span className={comparison ? "complete" : "current"}>{comparison ? <Check size={12}/> : <b>2</b>}Choose a teacher</span><i/><span className={comparison ? "current" : ""}><b>3</b>Compare coverage</span></div>
      {action.error && <div className="comparison-error" role="alert">{action.error}</div>}
      {inputError && <div className="comparison-error" role="alert">{inputError}</div>}
      {action.busy && <div className="comparison-loading" role="status"><LoaderCircle size={17} className="spin"/>{phase === "search" ? "Finding videos from other creators…" : "Reading descriptions and chapter markers…"}<button onClick={action.cancel}>Stop</button></div>}
      {!comparison ? <>
        <div className="comparison-step"><span>01</span><div><h3>Your starting video</h3><p>We use its title to find related videos from other creators.</p></div></div>
        {base ? <VideoSummary video={base} label="A"/> : <div className="comparison-base-fallback"><strong>{resource.title}</strong><p>{resource.author}</p></div>}
        <div className="comparison-step"><span>02</span><div><h3>A different teacher. The same subject.</h3><p>Choose a similar lesson, or paste a video link below.</p></div></div>
        <form className="comparison-search" onSubmit={e => { e.preventDefault(); search(); }}><label><Search size={16}/><input aria-label="Find similar videos" placeholder="Search a topic or similar title" maxLength={160} value={query} onChange={e => setQuery(e.target.value)}/></label><button type="submit" disabled={action.busy || query.trim().length < 2}>Find videos<ArrowRight size={14}/></button></form>
        <div className="candidate-toolbar"><span>{choices.length} similar lessons</span><label><input type="checkbox" checked={chaptersOnly} onChange={e => setChaptersOnly(e.target.checked)}/>With chapter markers</label></div>
        <div className="comparison-candidates">{choices.map(video => <button className={`comparison-candidate ${action.busy && selectedVideo === video.id ? "is-comparing" : ""}`} key={video.id} disabled={action.busy} onClick={() => compare(video.id)} aria-label={`Compare with ${video.title} by ${video.channelTitle}`}><span className="candidate-thumbnail"><img src={`https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`} alt="" loading="lazy"/><small>{formatDuration(video.durationSeconds)}</small></span><span className="candidate-text"><small>{video.channelTitle}</small><strong>{video.title}</strong><span>{video.chapters.length ? `${video.chapters.length} chapters to compare` : "Description only"}<span className="candidate-compare-label">{action.busy && selectedVideo === video.id ? "Comparing…" : "Compare"}<ArrowRight size={13}/></span></span></span></button>)}</div>
        {chaptersOnly && !choices.length && !!candidates.length && <p className="comparison-empty">No chapter markers in these results. Turn off the chapter filter to see all lessons.</p>}
        {!action.busy && !action.error && !candidates.length && base && <p className="comparison-empty">No other creators found for this title. Try a shorter topic or paste a video link below.</p>}
        <form className="comparison-manual" onSubmit={e => { e.preventDefault(); compare(parseVideoId(manual)); }}><label htmlFor="compare-video-url">Have a specific video in mind?</label><div><input id="compare-video-url" placeholder="Paste another creator’s YouTube link" maxLength={2000} value={manual} onChange={e => { setManual(e.target.value); setInputError(""); }}/><button disabled={action.busy || !manual.trim()} type="submit">Compare<GitCompareArrows size={14}/></button></div></form>
      </> : <>
        <button className="comparison-back" onClick={() => { reset(); setComparison(null); setInputError(""); }}><ArrowLeft size={14}/>Choose a different video</button>
        <div className="comparison-pair"><VideoSummary video={comparison.videos[0]} label="A"/><VideoSummary video={comparison.videos[1]} label="B"/></div>
        <div className="comparison-insights" aria-label="Coverage overview">{([{ value: "Shared", count: shared, title: "Shared topics", detail: "Listed by both creators", Icon: Layers2 }, { value: "Only in A", count: onlyA, title: "Only listed in A", detail: comparison.videos[0].channelTitle, Icon: Plus }, { value: "Only in B", count: onlyB, title: "Only listed in B", detail: comparison.videos[1].channelTitle, Icon: Plus }] as const).map(item => <button key={item.value} aria-pressed={filter === item.value} onClick={() => setFilter(filter === item.value ? "All topics" : item.value)}><span><item.Icon size={17}/>{item.title}</span><strong>{item.count}</strong><small>{item.detail}<ArrowRight size={14}/></small></button>)}</div>
        <div className="comparison-evidence-note"><Info size={17}/><div><p>Based on creator descriptions and chapter headings. <strong>“Not listed” doesn’t mean “not taught.”</strong></p><details><summary>How this comparison works</summary><p>Chapter names and description mentions are matched conservatively. Full video audio and transcripts have not been analyzed; similar topics with different names may not match.</p></details></div></div>
        <div className="coverage-section-heading"><div><h3>What’s inside each lesson</h3><p>Open any timestamp to jump straight to that topic.</p></div><label><Search size={15}/><input value={coverageQuery} onChange={e => setCoverageQuery(e.target.value)} placeholder="Find a topic…" aria-label="Search comparison topics"/>{coverageQuery && <button aria-label="Clear comparison search" onClick={() => setCoverageQuery("")}><X size={13}/></button>}</label></div>
        <div className="coverage-filters" role="group" aria-label="Comparison topics">{(["All topics", "Shared", "Only in A", "Only in B"] as CoverageFilter[]).map((item, index) => <button key={item} onClick={() => setFilter(item)} aria-pressed={filter === item}>{item === "Only in A" ? "Only listed in A" : item === "Only in B" ? "Only listed in B" : item}<span>{[rows.length, shared, onlyA, onlyB][index]}</span></button>)}</div>
        <div className="coverage-table-scroll" tabIndex={0} role="region" aria-label="Topic coverage comparison"><table className="coverage-table"><thead><tr><th scope="col">Listed topic</th><th scope="col"><b>A</b>{comparison.videos[0].channelTitle}</th><th scope="col"><b>B</b>{comparison.videos[1].channelTitle}</th></tr></thead><tbody>{visible.map((row, i) => <tr key={`${row.topic}-${i}`}><th scope="row">{row.topic}</th><td><Evidence value={row.left} video={comparison.videos[0]}/></td><td><Evidence value={row.right} video={comparison.videos[1]}/></td></tr>)}</tbody></table></div>
        <div className="coverage-mobile" aria-label="Topic coverage cards">{visible.map((row, i) => <article key={`${row.topic}-${i}`}><h4>{row.topic}<span>{row.left && row.right ? "Shared" : row.left ? "Only listed in A" : "Only listed in B"}</span></h4><div><span className="compare-letter">A</span><Evidence value={row.left} video={comparison.videos[0]}/></div><div><span className="compare-letter">B</span><Evidence value={row.right} video={comparison.videos[1]}/></div></article>)}</div>
        {!visible.length && <p className="comparison-empty">{rows.length ? "No topics in this group." : "These descriptions don’t provide enough topic evidence for a coverage comparison. Read the original descriptions below or choose videos with chapters."}</p>}
        <div className="comparison-descriptions">{comparison.videos.map((video, i) => <details key={video.id}><summary>Read {i === 0 ? "A" : "B"}’s source description</summary><p>{video.description || "This creator has not provided a description."}</p><a href={videoUrl(video.id)} target="_blank" rel="noopener noreferrer">Open original video<ArrowUpRight size={13}/></a></details>)}</div>
      </>}
      <footer className="comparison-footer">Source: YouTube Data API · Public creator metadata · No AI subscription required</footer>
    </div>
  </dialog>;
}
