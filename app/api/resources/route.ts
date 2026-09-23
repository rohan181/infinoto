import { discoveryAvailability } from "@/lib/server/discovery-config";
import { resourceRequestSchema } from "@/lib/resources";
import { discoverResources } from "@/lib/server/discovery";
import { discoverWithExa } from "@/lib/server/exa";
import { discoverWithYouTube } from "@/lib/server/youtube";
import { providerFailure, readInput, withClaude, withRequestLimit } from "@/lib/server/provider";

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
    const result = input.provider === "youtube"
      ? await withRequestLimit(() => discoverWithYouTube(input, signal), "discovery")
      : input.provider === "exa"
      ? await withRequestLimit(() => discoverWithExa(input, signal), "discovery")
      : await withClaude((client, model) => discoverResources(client, model, input, signal), "discovery");
    return Response.json({ ...result, provider: input.provider }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return providerFailure(error); }
}
