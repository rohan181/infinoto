import type { z } from "zod";
import { resourceRecordSchema, type resourceRequestSchema } from "./resources";

function retryDelay(signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, 350);
    signal.addEventListener("abort", abort, { once: true });
  });
}

/** One retry for temporary transport/server failures; never retry credentials or quota errors. */
export async function fetchDiscovery(input: z.infer<typeof resourceRequestSchema>, signal: AbortSignal) {
  for (let attempt = 0; attempt < 2; attempt++) {
    signal.throwIfAborted();
    if (attempt) await retryDelay(signal);
    let response: Response;
    try {
      response = await fetch("/api/resources", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal });
    } catch (error) {
      if (signal.aborted || attempt) throw error;
      continue;
    }
    if (!attempt && [500, 502, 504].includes(response.status)) continue;
    const raw = await response.json().catch(() => null);
    if (!response.ok) throw new Error(typeof raw?.error === "string" ? raw.error : "Search couldn’t finish. Please retry.");
    if (!raw || !Array.isArray(raw.resources) || raw.resources.length > 6) {
      if (!attempt) continue;
      throw new Error("The source list was incomplete. Please retry.");
    }
    // Keep valid sources if one result has incomplete metadata.
    const resources = (raw.resources as unknown[]).flatMap((item: unknown) => {
      const parsed = resourceRecordSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    });
    if (raw.resources.length && !resources.length) {
      if (!attempt) continue;
      throw new Error("The source list was incomplete. Please retry.");
    }
    return { resources, note: typeof raw.note === "string" ? raw.note : "" };
  }
  throw new Error("Could not reach search. Please retry.");
}
