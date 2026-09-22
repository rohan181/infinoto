import { resourceRequestSchema } from "@/lib/resources";
import { discoverResources } from "@/lib/server/discovery";
import { discoverWithExa } from "@/lib/server/exa";
import { providerFailure, readInput, withClaude, withRequestLimit } from "@/lib/server/provider";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const input = await readInput(request, resourceRequestSchema, 30000);
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(112000)]);
    const result = input.provider === "exa"
      ? await withRequestLimit(() => discoverWithExa(input, signal))
      : await withClaude((client, model) => discoverResources(client, model, input, signal));
    return Response.json({ ...result, provider: input.provider }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return providerFailure(error); }
}
