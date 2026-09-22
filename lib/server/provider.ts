import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

export class RequestError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export const failure = (message: string, status: number) => Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });

export async function readInput<T>(request: Request, schema: z.ZodType<T>, maxBytes = 40000): Promise<T> {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const caller = new URL(origin);
      if (caller.host !== (request.headers.get("host") || new URL(request.url).host) || !["http:", "https:"].includes(caller.protocol)) throw new Error();
    } catch { throw new RequestError("This request must come from Infinity.", 403); }
  }
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > maxBytes) throw new RequestError("This request is too large. Try a smaller learning map.", 413);
    body = JSON.parse(text);
  } catch (error) { if (error instanceof RequestError) throw error; throw new RequestError("Please send a valid request."); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new RequestError("Some topic or filter details are invalid. Refresh the page and try again.");
  return parsed.data;
}

let windowStart = Date.now(), requests = 0, active = 0;
export async function withClaude<T>(run: (client: Anthropic, model: string) => Promise<T>): Promise<T> {
  if (!process.env.ANTHROPIC_API_KEY) throw new RequestError("Add a valid ANTHROPIC_API_KEY to .env.local to enable Claude.", 503);
  if (Date.now() - windowStart > 3600000) { windowStart = Date.now(); requests = 0; }
  if (requests >= 30) throw new RequestError("The hourly generation limit has been reached. Please try again later.", 429);
  if (active >= 2) throw new RequestError("Infinity is working on other requests. Please try again in a moment.", 429);
  requests++; active++;
  try { return await run(new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 110000, maxRetries: 0 }), process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6"); }
  finally { active--; }
}

export function providerFailure(error: unknown): Response {
  if (error instanceof RequestError) return failure(error.message, error.status);
  if (error instanceof Anthropic.AuthenticationError) return failure("Anthropic rejected the API key. Replace ANTHROPIC_API_KEY in .env.local with a valid key.", 401);
  if (error instanceof Anthropic.PermissionDeniedError) return failure("Your Anthropic account does not have access to this model or web search.", 403);
  if (error instanceof Anthropic.NotFoundError) return failure("The Claude model is unavailable. Check ANTHROPIC_MODEL in .env.local.", 503);
  if (error instanceof Anthropic.RateLimitError) return failure("Claude is rate-limited. Please wait and retry.", 429);
  if (error instanceof Anthropic.BadRequestError) {
    if (/credit balance|billing|payment/i.test(error.message)) return failure("Your Anthropic account needs API credits. Add credits and retry.", 402);
    if (/web search.*(?:enabled|disabled)|web_search.*(?:enabled|disabled)/i.test(error.message)) return failure("Enable web search for your organization in the Anthropic console, then retry.", 503);
    return failure("Claude could not process this request. Check your model configuration or try a more focused topic.", 502);
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError || (error instanceof Error && /Abort|Timeout/.test(error.name))) return failure("The request timed out. Try a more focused topic or resource category.", 504);
  if (error instanceof Anthropic.APIConnectionError) return failure("Could not reach Claude. Check the server connection and retry.", 502);
  return failure("The response could not be validated. Please retry; your existing topics and resources are unchanged.", 502);
}
