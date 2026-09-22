import { youtubeRequestSchema } from "@/lib/youtube";
import { compareVideos, findSimilarVideos } from "@/lib/server/youtube";
import { providerFailure, readInput, withRequestLimit } from "@/lib/server/provider";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const input = await readInput(request, youtubeRequestSchema, 3000);
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(50000)]);
    const result = await withRequestLimit(async () => {
      if (input.action === "similar") return await findSimilarVideos(input.videoId, input.query, signal);
      return await compareVideos(input.videoIds, input.concepts, signal);
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return providerFailure(error); }
}
