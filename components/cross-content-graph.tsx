"use client";

import { useState } from "react";
import { ArrowUpRight, Network } from "lucide-react";
import { evidenceLink, type AnalysisResult } from "@/lib/content-analysis";
import { socialSource } from "@/lib/social";
import { formatDuration } from "@/lib/youtube";

export default function CrossContentGraph({ result }: { result: AnalysisResult }) {
  const [selected, setSelected] = useState(0);
  const { sources, analysis } = result;
  const finding = analysis.findings[selected];
  if (!finding) return <div className="content-graph-empty"><Network size={28}/><p>No concept connections were established. Add source text or transcripts and analyze again.</p></div>;
  const height = Math.max(sources.length, analysis.findings.length) * 105 + 50;
  const sourceY = (index: number) => 50 + index * ((height - 150) / Math.max(1, sources.length - 1));
  const conceptY = (index: number) => 50 + index * 105;
  return <section className="content-graph" aria-label="Cross-content graph">
    <p className="cross-hint">Select a concept to trace its evidence across videos, articles, books and papers. Dashed lines indicate metadata-only evidence.</p>
    <div className="content-graph-scroll"><div className="content-graph-canvas" style={{ height }}>
      <span className="content-graph-label sources">SOURCES · {sources.length}</span><span className="content-graph-label concepts">CONCEPTS · {analysis.findings.length}</span>
      <svg width="800" height={height} aria-hidden="true">{analysis.findings.flatMap((item, index) => item.coverage.map(coverage => {
        const sourceIndex = sources.findIndex(source => source.id === coverage.sourceId);
        if (sourceIndex < 0) return null;
        const y1 = sourceY(sourceIndex), y2 = conceptY(index);
        return <path key={`${index}:${coverage.sourceId}`} className={`${selected === index ? "active" : ""} ${sources[sourceIndex].basis === "metadata" ? "metadata" : ""}`} d={`M280,${y1 + 34} C400,${y1 + 34} 400,${y2 + 34} 520,${y2 + 34}`}/>;
      }))}</svg>
      {sources.map((source, index) => <a key={source.id} className={`content-graph-node source ${finding.coverage.some(c => c.sourceId === source.id) ? "connected" : ""}`} style={{ left: 20, top: sourceY(index) }} href={source.url} target="_blank" rel="noopener noreferrer"><small>{source.type === "Social" ? socialSource(source.url)?.platform || "Social" : source.type} · {source.basis === "metadata" ? "Metadata only" : "Source text"}<ArrowUpRight size={12}/></small><strong>{source.title}</strong></a>)}
      {analysis.findings.map((item, index) => <button key={index} className={`content-graph-node concept ${selected === index ? "selected" : ""}`} style={{ left: 520, top: conceptY(index) }} aria-pressed={selected === index} onClick={() => setSelected(index)}><small>{item.coverage.length} {item.coverage.length === 1 ? "source" : "connected sources"}</small><strong>{item.concept}</strong></button>)}
    </div></div>
    <div className="content-graph-evidence" aria-live="polite"><h4>{finding.concept}</h4>{finding.coverage.map(coverage => {
      const source = sources.find(s => s.id === coverage.sourceId);
      return source ? <article key={source.id}><strong>{source.title}</strong><small>{coverage.depth}{source.basis === "metadata" ? " · metadata only" : ""}</small><div className="cross-evidence">{coverage.evidenceIds.map(id => {
        const evidence = source.evidence.find(e => e.id === id);
        return evidence ? <a key={id} href={evidenceLink(source, evidence.start)} target="_blank" rel="noopener noreferrer"><span>{evidence.start === null ? "Source excerpt" : `At ${formatDuration(evidence.start)}`}<ArrowUpRight size={12}/></span><q>{evidence.text.slice(0, 320)}{evidence.text.length > 320 ? "…" : ""}</q></a> : null;
      })}</div></article> : null;
    })}</div>
  </section>;
}
