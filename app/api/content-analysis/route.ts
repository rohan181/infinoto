import { analysisRequestSchema } from "@/lib/content-analysis";
import { analyzeContent } from "@/lib/server/content-analysis";
import { readInput, providerFailure, withClaude, anthropicApiKey } from "@/lib/server/provider";

export const runtime = "nodejs";
export const maxDuration = 120;
export async function GET() {
  return Response.json({ transcription: !!process.env.OPENAI_API_KEY?.trim(), analysis: !!anthropicApiKey() }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  try {
    const input = await readInput(request, analysisRequestSchema, 500000);
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(112000)]);
    const result = await withClaude((client, model) => analyzeContent(client, model, input, signal));
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return providerFailure(error); }
}
