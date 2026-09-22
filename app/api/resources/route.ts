import { resourceRequestSchema } from "@/lib/resources";
import { discoverResources } from "@/lib/server/discovery";
import { providerFailure, readInput, withClaude } from "@/lib/server/provider";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const input = await readInput(request, resourceRequestSchema, 30000);
    return await withClaude(async (client, model) => {
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(112000)]);
      const result = await discoverResources(client, model, input, signal);
      return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    });
  } catch (error) { return providerFailure(error); }
}
