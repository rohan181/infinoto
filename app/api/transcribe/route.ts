import { z } from "zod";
import { MAX_AUDIO_BYTES, MAX_CONTENT } from "@/lib/content-analysis";
import { checkOrigin, providerFailure, RequestError, withRequestLimit } from "@/lib/server/provider";

export const runtime = "nodejs";
export const maxDuration = 120;
const transcriptSchema = z.object({ text: z.string().max(300000), segments: z.array(z.object({ start: z.number().finite().nonnegative().max(86400), text: z.string().max(10000) })).max(10000).optional() });

/** Bound multipart input even when Content-Length is absent or dishonest. */
async function readUpload(request: Request) {
  const limit = MAX_AUDIO_BYTES + 100000;
  if (Number(request.headers.get("content-length")) > limit) throw new RequestError("Audio must be 4 MB or smaller. Upload a shorter clip or use a transcript file.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError("Choose an audio file.");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new RequestError("Audio must be 4 MB or smaller.", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  let form: FormData;
  try { form = await new Response(Buffer.concat(chunks), { headers: { "Content-Type": request.headers.get("content-type") || "" } }).formData(); }
  catch { throw new RequestError("Send one audio file using the upload control."); }
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) throw new RequestError("Choose a non-empty audio file.");
  if (file.size > MAX_AUDIO_BYTES) throw new RequestError("Audio must be 4 MB or smaller.", 413);
  if (!/\.(?:mp3|mp4|mpeg|mpga|m4a|wav|webm)$/i.test(file.name)) throw new RequestError("Use MP3, MP4, MPEG, MPGA, M4A, WAV or WebM audio.");
  const offset = Number(form.get("offset") || 0);
  if (!Number.isFinite(offset) || offset < 0 || offset > 82800) throw new RequestError("Choose a valid clip start offset.");
  return { file, offset };
}

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const key = process.env.OPENAI_API_KEY?.trim();
    if (!key || /^(?:replace_with|your[_-]|<)/i.test(key)) throw new RequestError("Whisper needs OPENAI_API_KEY in the server environment. You can paste or upload a transcript instead.", 503);
    return await withRequestLimit(async () => {
      const { file, offset } = await readUpload(request);
      const form = new FormData();
      form.set("file", file); form.set("model", "whisper-1"); form.set("response_format", "verbose_json"); form.append("timestamp_granularities[]", "segment");
      let response: Response;
      try {
        response = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.any([request.signal, AbortSignal.timeout(105000)]), cache: "no-store" });
      } catch {
        if (request.signal.aborted) throw new RequestError("Transcription stopped.", 499);
        throw new RequestError("Whisper could not be reached or timed out. Try a shorter clip.", 504);
      }
      if (!response.ok) {
        if ([401, 403].includes(response.status)) throw new RequestError("Whisper rejected the server's OpenAI credentials. Check OPENAI_API_KEY and project access.", 503);
        if (response.status === 429) throw new RequestError("Whisper quota or rate limit reached. Check OpenAI API billing or retry later.", 429);
        if ([400, 413, 415].includes(response.status)) throw new RequestError("Whisper could not read this audio. Try a supported, shorter audio file.", 400);
        throw new RequestError("Whisper could not transcribe this file. Please retry.", 502);
      }
      const parsed = transcriptSchema.safeParse(await response.json().catch(() => null));
      if (!parsed.success || !parsed.data.text.trim()) throw new RequestError("No usable speech transcript was returned.", 502);
      // Preserve segment timestamps in editable plain text. No guessed timestamps if none were returned.
      const text = parsed.data.segments?.length ? parsed.data.segments.map(segment => {
        const s = Math.floor(segment.start + offset), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
        return `[${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}] ${segment.text.trim()}`;
      }).join("\n") : parsed.data.text;
      return Response.json({ text: text.slice(0, MAX_CONTENT), truncated: text.length > MAX_CONTENT, model: "whisper-1" }, { headers: { "Cache-Control": "no-store" } });
    });
  } catch (error) { return providerFailure(error); }
}
