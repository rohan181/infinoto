"use client";

import { useEffect, useRef, useState } from "react";
import type { Resource } from "@/app/data";
import { matchesSocialPlatform } from "@/lib/social";
import { fetchDiscovery } from "@/lib/discovery-fetch";
import { discoveryFilter, resourceFormat, type RecommendationFormat } from "@/lib/recommendations";
import type { z } from "zod";
import type { resourceRequestSchema } from "@/lib/resources";

type Input = z.infer<typeof resourceRequestSchema>;
type Result = { resources: Resource[]; note: string };
type State = { key: string; phase: "loading" | "ready" | "error" | "stopped"; error: string; note: string };
const cache = new Map<string, { result: Result; expires: number }>();

/** One active topic request; stale replies cannot write into the newly selected node. */
export function useTopicDiscovery(input: Input, format: RecommendationFormat, enabled: boolean, scope: string, onResults: (resources: Resource[]) => void) {
  const body = JSON.stringify(input);
  const key = JSON.stringify([scope, body]);
  const activeKey = useRef(key);
  activeKey.current = key;
  const callback = useRef(onResults);
  callback.current = onResults;
  const [attempt, setAttempt] = useState({ key: "", count: 0, excludeUrls: [] as string[] });
  const [state, setState] = useState<State>({ key: "", phase: "loading", error: "", note: "" });
  const pending = useRef<{ controller: AbortController; timer: ReturnType<typeof setTimeout> } | null>(null);
  const refreshCount = attempt.key === key ? attempt.count : 0;
  const excludeKey = JSON.stringify(attempt.key === key ? attempt.excludeUrls : input.excludeUrls);
  useEffect(() => {
    if (!enabled) return;
    const hit = cache.get(key);
    if (!refreshCount && hit && hit.expires > Date.now()) {
      callback.current(hit.result.resources);
      setState({ key, phase: "ready", error: "", note: hit.result.note });
      return;
    }
    const controller = new AbortController();
    setState({ key, phase: "loading", error: "", note: "" });
    const timer = setTimeout(async () => {
      if (controller.signal.aborted) return;
      const timeout = setTimeout(() => controller.abort("timeout"), 115000);
      try {
        const raw = await fetchDiscovery({ ...JSON.parse(body), excludeUrls: JSON.parse(excludeKey) }, controller.signal);
        if (controller.signal.aborted || activeKey.current !== key) return;
        const category = discoveryFilter(format).category;
        const requested = JSON.parse(body) as Input;
        const resources = raw.resources.filter(r => (format === "All" ? r.type === category : resourceFormat(r) === format) && (format !== "Social" || matchesSocialPlatform(r.url, requested.socialPlatform)));
        const summary = resources.length ? `${resources.length} ${refreshCount ? "new " : ""}sources found for this topic` : "No new matches. Try All levels or refine the search";
        const result = { resources, note: [summary, typeof raw.note === "string" ? raw.note : ""].filter(Boolean).join(". ") };
        if (!refreshCount && resources.length) {
          if (cache.size >= 100) cache.delete(cache.keys().next().value!);
          cache.set(key, { result, expires: Date.now() + 10 * 60 * 1000 });
        }
        callback.current(resources);
        setState({ key, phase: "ready", error: "", note: result.note });
      } catch (error) {
        if (activeKey.current !== key) return;
        if (controller.signal.aborted && controller.signal.reason !== "timeout") return;
        setState({ key, phase: "error", error: controller.signal.aborted ? "Search took too long. Try a more focused topic." : error instanceof Error ? error.message : "Could not reach search. Please retry.", note: "" });
      } finally {
        clearTimeout(timeout);
        if (pending.current?.controller === controller) pending.current = null;
      }
    }, 450);
    pending.current = { controller, timer };
    return () => { clearTimeout(timer); controller.abort(); pending.current = null; };
  }, [key, body, format, enabled, refreshCount, excludeKey]);
  const current = state.key === key ? state : { key, phase: "loading" as const, error: "", note: "" };
  return {
    ...current, busy: enabled && current.phase === "loading",
    refresh: (excludeUrls: string[] = []) => setAttempt(a => ({ key, count: a.key === key ? a.count + 1 : 1, excludeUrls })),
    cancel: () => { if (pending.current) { clearTimeout(pending.current.timer); pending.current.controller.abort(); } setState({ key, phase: "stopped", error: "", note: "Search paused. Your collected sources are still here." }); },
  };
}
