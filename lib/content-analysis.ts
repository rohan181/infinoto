import { z } from "zod";
import { canonicalUrl, isDirectResourceUrl, resourceTypeSchema } from "./resources";
import { parseVideoId, videoUrl } from "./youtube";

export const MAX_CONTENT = 18000;
export const MAX_AUDIO_BYTES = 4_000_000;
export const segmentSchema = z.object({ text: z.string().trim().min(1).max(2000), start: z.number().finite().nonnegative().max(86400).nullable() });
export type Segment = z.infer<typeof segmentSchema>;
export const sourceInputSchema = z.object({
  url: z.string().max(2000).refine(url => isDirectResourceUrl(url)),
  title: z.string().trim().min(1).max(300), type: resourceTypeSchema,
  text: z.string().max(MAX_CONTENT).default(""),
});
export const analysisRequestSchema = z.object({
  topic: z.string().trim().min(1).max(100), concepts: z.array(z.string().max(100)).max(12).default([]),
  sources: z.array(sourceInputSchema).min(2).max(6),
}).refine(input => new Set(input.sources.map(s => canonicalUrl(s.url))).size === input.sources.length, "Choose different resources.");
export type AnalysisInput = z.infer<typeof analysisRequestSchema>;
export const evidenceSchema = z.object({ id: z.string(), text: z.string(), start: z.number().nullable() });
export const analyzedSourceSchema = z.object({
  id: z.string(), title: z.string(), url: z.string().refine(url => isDirectResourceUrl(url)), type: resourceTypeSchema,
  basis: z.enum(["provided-text", "retrieved-text", "metadata"]), note: z.string(),
  evidence: z.array(evidenceSchema),
});
export type AnalyzedSource = z.infer<typeof analyzedSourceSchema>;
const findingSchema = z.object({
  concept: z.string().min(1).max(120),
  coverage: z.array(z.object({ sourceId: z.string(), depth: z.enum(["mention", "explanation", "worked example"]), evidenceIds: z.array(z.string()).min(1).max(3) })).min(1).max(6),
});
export const analysisOutputSchema = z.object({
  summary: z.string().max(700),
  findings: z.array(findingSchema).max(12),
  learningOrder: z.array(z.object({ sourceId: z.string(), reason: z.string().max(300), evidenceIds: z.array(z.string()).min(1).max(3) })).max(6),
  gaps: z.array(z.string().max(220)).max(8),
});
// Generation schemas keep prose unconstrained; normalize presentation lengths after
// parsing so an otherwise valid comparison cannot fail on a long summary sentence.
export const analysisModelSchema = analysisOutputSchema.extend({
  summary: z.string().describe("A concise summary, ideally under 100 words"),
  learningOrder: z.array(z.object({ sourceId: z.string(), reason: z.string(), evidenceIds: z.array(z.string()).min(1).max(3) })).max(6),
  gaps: z.array(z.string()).max(8),
});
export const analysisResponseSchema = z.object({ analysis: analysisOutputSchema, sources: z.array(analyzedSourceSchema), analyzedAt: z.string() });
export type AnalysisResult = z.infer<typeof analysisResponseSchema>;

function seconds(value: string): number | null {
  const parts = value.replace(",", ".").split(":").map(Number);
  if (parts.length < 2 || parts.length > 3 || parts.some(n => !Number.isFinite(n) || n < 0) || parts.slice(1).some(n => n >= 60)) return null;
  const total = parts.reduce((sum, n) => sum * 60 + n, 0);
  return total <= 86400 ? total : null;
}
/** Accept SRT/VTT, timestamped plain transcripts, and article text. No invented timings. */
export function contentSegments(text: string): Segment[] {
  const result: Segment[] = [];
  let start: number | null = null, lines: string[] = [];
  const flush = () => {
    const raw = lines.join("\n").trim();
    const value = start === null ? raw : raw.replace(/<\/?(?:b|i|u|c(?:\.[\w-]+)?|v|ruby|rt)(?:\s[^>]*)?>/gi, "");
    for (let i = 0; i < value.length; i += 1200) result.push({ text: value.slice(i, i + 1200), start });
    lines = [];
  };
  const textLines = text.slice(0, MAX_CONTENT).replace(/\r/g, "").split("\n");
  for (let lineIndex = 0; lineIndex < textLines.length; lineIndex++) {
    const line = textLines[lineIndex];
    const cue = /^\s*((?:\d{1,2}:)?\d{1,3}:\d{2}(?:[.,]\d{1,3})?)\s*-->/.exec(line);
    const stamped = /^\s*\[?((?:\d{1,2}:)?\d{1,3}:\d{2}(?:[.,]\d{1,3})?)\]?\s+(.+)$/.exec(line);
    if (cue) { flush(); start = seconds(cue[1]); }
    else if (stamped) { flush(); start = seconds(stamped[1]); lines.push(stamped[2]); }
    else if (!line.trim()) { flush(); start = null; }
    else if (!/^\s*WEBVTT.*$/.test(line) && !(/^\s*\d+\s*$/.test(line) && textLines[lineIndex + 1]?.includes("-->"))) lines.push(line);
  }
  flush();
  const compact: Segment[] = [];
  for (const segment of result) {
    const previous = compact[compact.length - 1];
    if (previous && previous.start === null && segment.start === null && previous.text.length + segment.text.length + 2 <= 1200) previous.text += `\n\n${segment.text}`;
    else compact.push({ ...segment });
  }
  return compact.slice(0, 100);
}

export function evidenceLink(source: AnalyzedSource, start: number | null) {
  const id = parseVideoId(source.url);
  return id && start !== null ? videoUrl(id, start) : source.url;
}
/** Source links and timestamps are constructed from input evidence, never generated by the model. */
export function validateAnalysis(raw: unknown, sources: AnalyzedSource[]) {
  const generated = analysisModelSchema.parse(raw);
  const clip = (text: string, max: number) => text.length <= max ? text : text.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
  const analysis = analysisOutputSchema.parse({ ...generated,
    summary: clip(generated.summary, 700),
    learningOrder: generated.learningOrder.map(step => ({ ...step, reason: clip(step.reason, 300) })),
    gaps: generated.gaps.map(gap => clip(gap, 220)),
  });
  function validate(sourceId: string, ids: string[]) {
    const source = sources.find(s => s.id === sourceId);
    if (!source || ids.some(id => !source.evidence.some(e => e.id === id))) throw new Error("Invalid evidence reference");
    return source;
  }
  for (const row of analysis.findings) {
    if (new Set(row.coverage.map(c => c.sourceId)).size !== row.coverage.length) throw new Error("Duplicate source coverage");
    for (const coverage of row.coverage) {
      const source = validate(coverage.sourceId, coverage.evidenceIds);
      // A description/chapter name cannot establish the depth of a lesson.
      if (source.basis === "metadata") coverage.depth = "mention";
    }
  }
  for (const step of analysis.learningOrder) validate(step.sourceId, step.evidenceIds);
  // A model may revisit a source in its study plan. Keep the first cited step
  // for each resource so the UI remains an ordered resource recommendation.
  analysis.learningOrder = analysis.learningOrder.filter((step, index, steps) => steps.findIndex(s => s.sourceId === step.sourceId) === index);
  return analysis;
}
