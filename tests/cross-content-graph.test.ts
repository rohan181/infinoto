import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CrossContentGraph from "../components/cross-content-graph";
import type { AnalysisResult } from "../lib/content-analysis";

const result: AnalysisResult = {
  analyzedAt: "2026-09-23", sources: [
    { id: "video", title: "Video lesson", url: "https://youtube.com/watch?v=rfscVS0vtbw", type: "YouTube", basis: "provided-text", note: "Transcript", evidence: [{ id: "v1", text: "A generator yields one item at a time.", start: 65 }] },
    { id: "article", title: "Article lesson", url: "https://example.com/generators", type: "Blogs", basis: "metadata", note: "Description only", evidence: [{ id: "a1", text: "Introduces generators.", start: null }] },
  ], analysis: { summary: "Both discuss generators.", findings: [
    { concept: "Generators", coverage: [{ sourceId: "video", depth: "explanation", evidenceIds: ["v1"] }, { sourceId: "article", depth: "mention", evidenceIds: ["a1"] }] },
  ], learningOrder: [], gaps: [] },
};

test("content graph renders only supported connections and links their evidence", () => {
  const html = renderToStaticMarkup(createElement(CrossContentGraph, { result }));
  assert.equal((html.match(/<path class=/g) || []).length, 2);
  assert.match(html, /active metadata/);
  assert.match(html, /2 connected sources/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /t=65/);
  assert.match(html, /A generator yields one item at a time/);
  assert.match(html, /mention · metadata only/);
});

test("content graph explains absent evidence without inventing connections", () => {
  const html = renderToStaticMarkup(createElement(CrossContentGraph, { result: { ...result, analysis: { ...result.analysis, findings: [] } } }));
  assert.match(html, /No concept connections were established/);
  assert.doesNotMatch(html, /content-graph-canvas/);
});
