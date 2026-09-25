import { discoveryAvailability } from "@/lib/server/discovery-config";
import { resourceRequestSchema } from "@/lib/resources";
import { discoverResources } from "@/lib/server/discovery";
import { discoverWithExa } from "@/lib/server/exa";
import { discoverWithYouTube } from "@/lib/server/youtube";
import { anthropicApiKey, providerFailure, readInput, withClaude, withRequestLimit } from "@/lib/server/provider";
import { createHash } from "node:crypto";
import { DiscoveryCache } from "@/lib/server/discovery-cache";
import type { Resource } from "@/app/data";

const cache = new DiscoveryCache<{ resources: Resource[]; note: string }>(result => result.resources.length > 0);

export const runtime = "nodejs";
export const maxDuration = 120;

// Only availability flags leave the server, never credentials.
export async function GET() {
  return Response.json({ available: discoveryAvailability() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    const input = await readInput(request, resourceRequestSchema, 30000);
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(112000)]);
    const credential = input.provider === "youtube" ? process.env.YOUTUBE_API_KEY : input.provider === "exa" ? process.env.EXA_API_KEY : anthropicApiKey();
    // Include credentials/model so a configuration change never reuses another account's results.
    const key = createHash("sha256").update(JSON.stringify([credential, process.env.ANTHROPIC_MODEL, input])).digest("hex");
    const result = await cache.get(key, signal, sharedSignal => input.provider === "youtube"
      ? withRequestLimit(() => discoverWithYouTube(input, sharedSignal), "discovery", sharedSignal)
      : input.provider === "exa"
      ? withRequestLimit(() => discoverWithExa(input, sharedSignal), "discovery", sharedSignal)
      : withClaude((client, model) => discoverResources(client, model, input, sharedSignal), "discovery", sharedSignal));
    return Response.json({ ...result, provider: input.provider }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return providerFailure(error); }
}
