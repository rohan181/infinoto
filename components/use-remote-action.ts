"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useRemoteAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<number | null>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => { pending.current?.abort(); pending.current = null; }, []);
  const reset = useCallback(() => {
    pending.current?.abort(); pending.current = null;
    setBusy(false); setError(""); setStatus(null);
  }, []);
  async function run(url: string, body: unknown, onSuccess: (result: unknown) => void) {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true); setError(""); setStatus(null);
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 118000);
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal });
      const result = await response.json();
      if (!response.ok) { if (pending.current === controller) setStatus(response.status); throw new Error(result.error || "The request failed. Please retry."); }
      if (pending.current === controller && !controller.signal.aborted) onSuccess(result);
    } catch (failure) {
      if (pending.current === controller) setError(controller.signal.aborted
        ? timedOut ? "This request took too long. Try a narrower focus or one difficulty level." : "Request stopped. You can retry whenever you’re ready."
        : failure instanceof Error ? failure.message : "Could not connect. Please retry.");
    } finally {
      clearTimeout(timeout);
      if (pending.current === controller) { pending.current = null; setBusy(false); }
    }
  }
  return { busy, error, status, run, reset, clearError: () => setError(""), cancel: () => pending.current?.abort() };
}
