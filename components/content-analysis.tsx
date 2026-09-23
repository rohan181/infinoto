"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, AudioLines, Check, FileText, GitCompareArrows, LoaderCircle, Plus, Search, Sparkles, X } from "lucide-react";
import type { Resource } from "@/app/data";
import { socialSource } from "@/lib/social";
import { canonicalUrl, isDirectResourceUrl } from "@/lib/resources";
import { analysisResponseSchema, evidenceLink, MAX_AUDIO_BYTES, MAX_CONTENT, type AnalysisResult, type AnalyzedSource } from "@/lib/content-analysis";
import { formatDuration, parseVideoId } from "@/lib/youtube";
import CrossContentGraph from "./cross-content-graph";
import { useRemoteAction } from "./use-remote-action";

type Pick = { url: string; title: string; type: Resource["type"]; text: string };
const basisLabels = { "provided-text": "Provided text / transcript", "retrieved-text": "Retrieved page text", metadata: "Metadata only" };
function EvidenceLinks({ source, ids }: { source: AnalyzedSource; ids: string[] }) {
  return <div className="cross-evidence">{ids.map(id => { const evidence = source.evidence.find(e => e.id === id); return evidence ? <a key={id} href={evidenceLink(source, evidence.start)} target="_blank" rel="noopener noreferrer"><span>{evidence.start !== null ? `At ${formatDuration(evidence.start)}` : "Source excerpt"}<ArrowUpRight size={12}/></span><q>{evidence.text.slice(0, 320)}{evidence.text.length > 320 ? "…" : ""}</q></a> : null; })}</div>;
}
export default function ContentAnalysis({ resources, initial, topic, concepts, onClose, initialView = "report" }: { initialView?: "report" | "graph"; resources: Resource[]; initial: Resource[]; topic: string; concepts: string[]; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [view, setView] = useState<"report" | "graph">(initialView);
  const [selected, setSelected] = useState<Pick[]>([]);
  const [filter, setFilter] = useState("");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [config, setConfig] = useState<{ transcription: boolean; analysis: boolean } | null>(null);
  const [uploading, setUploading] = useState("");
  const [uploadLabel, setUploadLabel] = useState("");
  const [offsets, setOffsets] = useState<Record<string, string>>({});
  const upload = useRef<AbortController | null>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const action = useRemoteAction();
  const busy = action.busy || !!uploading;
  const candidates = useMemo(() => {
    const unique = new Map<string, Resource>();
    for (const resource of [...initial, ...resources]) { const normalized = canonicalUrl(resource.url); if (normalized && isDirectResourceUrl(normalized) && !unique.has(normalized)) unique.set(normalized, { ...resource, url: normalized }); }
    return [...unique.values()];
  }, [initial, resources]);
  const matches = candidates.filter(r => `${r.title} ${r.author} ${r.type}`.toLowerCase().includes(filter.toLowerCase()));
  useEffect(() => {
    const element = dialog.current, previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    element?.showModal(); document.body.style.overflow = "hidden";
    const controller = new AbortController();
    fetch("/api/content-analysis", { signal: controller.signal, cache: "no-store" }).then(r => r.json()).then(value => {
      if (typeof value.transcription === "boolean" && typeof value.analysis === "boolean") setConfig(value);
    }).catch(() => {});
    return () => { controller.abort(); upload.current?.abort(); upload.current = null; element?.close(); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  useEffect(() => { if (result) resultHeading.current?.focus(); }, [result]);
  function change() { setResult(null); setError(""); setNotice(""); action.clearError(); }
  function toggle(resource: { url: string; title: string; type: Resource["type"] }) {
    change(); const normalized = canonicalUrl(resource.url)!;
    setSelected(items => items.some(r => r.url === normalized) ? items.filter(r => r.url !== normalized) : items.length < 6 ? [...items, { url: normalized, title: resource.title.slice(0, 300), type: resource.type, text: "" }] : items);
  }
  function editText(url: string, text: string) { change(); setSelected(items => items.map(item => item.url === url ? { ...item, text } : item)); }
  async function readText(resource: Pick, file?: File) {
    if (!file) return;
    if (!/\.(txt|srt|vtt|md)$/i.test(file.name) || file.size > 400000) { setError("Choose a TXT, SRT, VTT or Markdown file under 400 KB."); return; }
    if (upload.current) return;
    const controller = new AbortController(); upload.current = controller;
    setUploading(resource.url); setUploadLabel("Importing source text…");
    try {
      const text = await file.text();
      if (controller.signal.aborted || upload.current !== controller) return;
      editText(resource.url, text.slice(0, MAX_CONTENT));
      setNotice(text.length > MAX_CONTENT ? "Text imported. Only the first 18,000 characters will be analyzed." : "Text imported. Review it before analysis.");
    } catch { if (upload.current === controller) setError("Could not read that transcript file."); }
    finally { if (upload.current === controller) { upload.current = null; setUploading(""); } }

  }
  async function transcribe(resource: Pick, file?: File) {
    if (!file || upload.current) return;
    if (file.size > MAX_AUDIO_BYTES || !/\.(mp3|mp4|mpeg|mpga|m4a|wav|webm)$/i.test(file.name)) { setError("Choose MP3, MP4, MPEG, MPGA, M4A, WAV or WebM audio, up to 4 MB."); return; }
    const offset = Number(offsets[resource.url] || 0);
    if (!Number.isFinite(offset) || offset < 0 || offset > 82800) { setError("Enter a valid clip start between 0 and 82,800 seconds."); return; }
    change(); const controller = new AbortController(); upload.current = controller; setUploading(resource.url); setUploadLabel("Whisper is transcribing your audio…");
    const timer = setTimeout(() => controller.abort("timeout"), 115000);
    try {
      const form = new FormData(); form.set("file", file); form.set("offset", String(offset));
      const response = await fetch("/api/transcribe", { method: "POST", body: form, signal: controller.signal });
      const raw = await response.json();
      if (!response.ok) throw new Error(raw.error || "Transcription failed. Please retry.");
      if (typeof raw.text !== "string") throw new Error("The transcript was incomplete.");
      if (controller.signal.aborted || upload.current !== controller) return;
      editText(resource.url, raw.text.slice(0, MAX_CONTENT));
      setNotice(`Whisper transcript ready. Review names and technical terms before analysis.${raw.truncated ? " Only the first 18,000 characters are included." : ""}`);
    } catch (failure) {
      if (upload.current === controller) setError(controller.signal.aborted ? "Transcription stopped or timed out. Your existing text is unchanged." : failure instanceof Error ? failure.message : "Transcription failed.");
    } finally { clearTimeout(timer); if (upload.current === controller) { upload.current = null; setUploading(""); } }
  }
  return <dialog ref={dialog} className="cross-dialog" aria-labelledby="cross-title" onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <header className="cross-header"><div><span className="cross-eyebrow"><GitCompareArrows size={15}/> {initialView === "graph" ? "CROSS-CONTENT GRAPH" : "CROSS-CONTENT ANALYSIS"}</span><h2 id="cross-title">{initialView === "graph" ? "See how your content connects." : "Connect the explanations."}</h2><p>Compare videos, articles, social posts, papers and courses for <strong>{topic}</strong>.</p></div><button className="cross-close" onClick={onClose} aria-label="Close cross-content analysis" autoFocus><X size={20}/></button></header>
    <div className="cross-body">
      <div className="cross-intro"><Sparkles size={20}/><p>Choose 2–6 resources. We retrieve available web text and video descriptions. Add transcripts or audio to compare what a video actually says.</p></div>
      <fieldset disabled={busy} className="cross-inputs">
        <div className="cross-section-title"><h3>1. Choose your sources</h3><span>{selected.length} / 6 selected</span></div>
        <label className="cross-search"><Search size={16}/><input aria-label="Find sources to compare" placeholder="Search across your learning path…" value={filter} onChange={e => setFilter(e.target.value)}/></label>
        <div className="cross-picker">{matches.slice(0, 30).map(r => { const picked = selected.some(s => s.url === r.url); return <label key={r.url} className={picked ? "picked" : ""}><input type="checkbox" checked={picked} disabled={!picked && selected.length >= 6} onChange={() => toggle(r)}/><span><small>{r.type === "Other" ? "Web" : r.type}</small><strong>{r.title}</strong><small>{r.author}</small></span>{picked && <Check size={16}/>}</label>; })}{!matches.length && <p>No collected sources match. Add a direct link below.</p>}</div>
        {matches.length > 30 && <p className="cross-hint">Showing 30 of {matches.length}. Search to narrow the list.</p>}
        <form className="cross-add" onSubmit={e => {
          e.preventDefault(); const normalized = canonicalUrl(url);
          if (!normalized || !isDirectResourceUrl(normalized)) { setError("Use a direct HTTPS resource link, not a search page."); return; }
          if (selected.some(s => s.url === normalized)) { setError("That resource is already selected."); return; }
          toggle({ url: normalized, title: title.trim() || normalized, type: parseVideoId(normalized) ? "YouTube" : socialSource(normalized) ? "Social" : "Other" }); setUrl(""); setTitle("");
        }}><label>Another resource<input type="url" aria-label="Resource URL to compare" placeholder="https://…" maxLength={2000} required value={url} onChange={e => setUrl(e.target.value)}/></label><label>Title<input aria-label="Resource title to compare" placeholder="A name you’ll recognize" maxLength={300} value={title} onChange={e => setTitle(e.target.value)}/></label><button type="submit" disabled={selected.length >= 6 || !url.trim()}><Plus size={16}/>Add</button></form>
        {!!selected.length && <><div className="cross-section-title"><h3>2. Add evidence</h3><span>Optional · improves comparison</span></div><div className="cross-selected">{selected.map(resource => <article key={resource.url}>
          <div className="cross-source-heading"><div><small>{resource.type === "Other" ? "Web" : resource.type}</small><h4><a href={resource.url} target="_blank" rel="noopener noreferrer">{resource.title}<ArrowUpRight size={13}/></a></h4></div><button aria-label={`Remove ${resource.title} from analysis`} onClick={() => toggle(resource)}><X size={16}/></button></div>
          <label className="cross-text-label">Transcript or source text<textarea aria-label={`Source text for ${resource.title}`} placeholder={resource.type === "YouTube" ? "Paste a transcript, or upload captions/audio below. Without one, only video metadata is compared." : "Leave blank to retrieve page text, or paste an article / paper excerpt here."} value={resource.text} maxLength={MAX_CONTENT} onChange={e => editText(resource.url, e.target.value)}/></label>
          <div className="cross-upload-row"><label className="cross-upload"><FileText size={14}/>Import text<input aria-label={`Import transcript for ${resource.title}`} type="file" accept=".txt,.srt,.vtt,.md" onChange={e => { void readText(resource, e.target.files?.[0]); e.target.value = ""; }}/></label><label className={`cross-upload ${config?.transcription === false ? "unavailable" : ""}`}><AudioLines size={14}/>Transcribe with Whisper<input aria-label={`Transcribe audio for ${resource.title}`} disabled={config?.transcription === false} type="file" accept=".mp3,.mp4,.mpeg,.mpga,.m4a,.wav,.webm" onChange={e => { void transcribe(resource, e.target.files?.[0]); e.target.value = ""; }}/></label><small>{resource.text.length.toLocaleString()} / 18,000 characters</small></div>
          {parseVideoId(resource.url) && <label className="cross-offset">Clip starts at (seconds in original video)<input aria-label={`Audio start offset for ${resource.title}`} type="number" min="0" max="82800" value={offsets[resource.url] || "0"} onChange={e => setOffsets(s => ({ ...s, [resource.url]: e.target.value }))}/></label>}
        </article>)}</div></>}
      </fieldset>
      <p className="cross-hint">Audio uploads: up to 4 MB per clip. TXT, SRT and VTT transcripts keep existing timestamps. A YouTube link alone cannot be transcribed. Upload audio you have permission to use.</p>
      {config?.transcription === false && <p className="cross-config">Whisper needs <code>OPENAI_API_KEY</code> on the server. Text imports and page analysis are available without it.</p>}
      {config?.analysis === false && <p className="cross-config">Cross-content analysis needs <code>ANTHROPIC_API_KEY</code> on the server.</p>}
      <p className="cross-privacy">Uploaded audio goes to OpenAI for transcription. Selected source text goes to Claude for analysis; web links go to Exa for retrieval. Imported text and results stay in this dialog and are cleared when it closes.</p>
      {(error || action.error) && <div className="comparison-error" role="alert">{error || action.error}</div>}
      {notice && <p className="cross-notice" role="status">{notice}</p>}
      <div className="cross-actions"><button className="cross-run" disabled={busy || selected.length < 2 || config?.analysis === false} onClick={() => {
        change(); void action.run("/api/content-analysis", { topic, concepts: concepts.slice(0, 12), sources: selected }, raw => setResult(analysisResponseSchema.parse(raw)));
      }}><Sparkles size={16}/>{result ? "Analyze again" : initialView === "graph" ? "Generate cross-content graph" : "Analyze selected sources"}</button>{busy && <><span role="status"><LoaderCircle className="spin" size={16}/>{uploading ? uploadLabel : "Reading sources and comparing evidence…"}</span><button onClick={() => { action.cancel(); upload.current?.abort(); }}>Stop</button></>}</div>
      {result && <section className="cross-results" aria-label="Cross-content results"><h3 ref={resultHeading} tabIndex={-1}>How these resources fit together</h3><p>{result.analysis.summary}</p>
        <div className="cross-result-views" aria-label="Analysis view"><button aria-pressed={view === "graph"} onClick={() => setView("graph")}>Cross-content graph</button><button aria-pressed={view === "report"} onClick={() => setView("report")}>Detailed report</button></div>
        {view === "graph" && <CrossContentGraph key={result.analyzedAt} result={result}/>}
        <div hidden={view !== "report"}><div className="cross-source-status">{result.sources.map((source, i) => <article key={source.id}><span>{i + 1}</span><div><strong>{source.title}</strong><small className={source.basis === "metadata" ? "limited" : ""}>{basisLabels[source.basis]}</small><p>{source.note}</p></div></article>)}</div>
        <h4>Concept coverage</h4><p className="cross-hint">“Not established” means we found no supporting evidence in the analyzed text. It does not mean the full resource omits it.</p>
        {result.analysis.findings.map((finding, i) => <article className="cross-finding" key={i}><header><h4>{finding.concept}</h4><span>{finding.coverage.length > 1 ? `Shared evidence · ${finding.coverage.length} sources` : "Evidence in one source"}</span></header><div>{result.sources.map(source => { const coverage = finding.coverage.find(c => c.sourceId === source.id); return <section key={source.id}><strong>{source.title}</strong>{coverage ? <><small>{coverage.depth}{source.basis === "metadata" ? " · metadata only" : ""}</small><EvidenceLinks source={source} ids={coverage.evidenceIds}/></> : <p className="cross-hint">Not established in available text</p>}</section>; })}</div></article>)}
        {!result.analysis.findings.length && <p className="cross-hint">Not enough evidence to compare concepts. Add transcripts or longer source excerpts.</p>}
        {!!result.analysis.learningOrder.length && <><h4>Suggested learning order</h4><ol className="cross-order">{result.analysis.learningOrder.map(step => { const source = result.sources.find(s => s.id === step.sourceId); return source ? <li key={source.id}><strong>{source.title}</strong><p>{step.reason}</p><EvidenceLinks source={source} ids={step.evidenceIds}/></li> : null; })}</ol></>}
        {!!result.analysis.gaps.length && <div className="cross-gaps"><h4>Not established in these excerpts</h4><ul>{result.analysis.gaps.map((gap, i) => <li key={i}>{gap}</li>)}</ul></div>}
        </div><p className="cross-hint">AI analysis of the available evidence, not a guarantee of accuracy or teaching quality. Transcript errors and visual-only explanations may affect results.</p>
      </section>}
    </div>
  </dialog>;
}
