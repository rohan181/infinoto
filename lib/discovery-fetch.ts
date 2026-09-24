import type { z } from "zod";
import { resourceRecordSchema, type resourceRequestSchema } from "./resources";

/** One retry for temporary transport/server failures; never retry credentials or quota errors. */
export async function fetchDiscovery(input: z.infer<typeof resourceRequestSchema>, signal: AbortSignal) {
  for (let attempt = 0; attempt < 2; attempt++) {
    signal.throwIfAborted();
    let response: Response;
    try {
      response = await fetch("/api/resources", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal });
    } catch (error) {
      if (signal.aborted || attempt) throw error;
      continue;
    }
    if (!attempt && [502, 504].includes(response.status)) continue;
    const raw = await response.json();
    if (!response.ok) throw new Error(raw.error || "Search couldn’t finish. Please retry.");
    if (!Array.isArray(raw.resources) || raw.resources.length > 6) throw new Error("The source list was incomplete. Please retry.");
    // Keep valid sources if one result has incomplete metadata.
    const resources = (raw.resources as unknown[]).flatMap((item: unknown) => {
      const parsed = resourceRecordSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    });
    if (raw.resources.length && !resources.length) throw new Error("The source list was incomplete. Please retry.");
    return { resources, note: typeof raw.note === "string" ? raw.note : "" };
  }
  throw new Error("Could not reach search. Please retry.");
}
