// POST /api/openclaw/run -> Server-Sent Events for one real OpenClaw agent turn.
import { NextRequest } from "next/server";
import { startRun } from "@/lib/openclaw-runner";
import { blockerPrompt, shopperPrompt, shopperRacePrompt } from "@/lib/prompts";
import type { Mode, TimedEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

export async function POST(req: NextRequest) {
  // Starting a run spends the owner's API quota, so only this app's own pages may do it: a
  // cross-site page cannot send application/json without a preflight, and its Origin would differ.
  const from = req.headers.get("origin");
  if (from) {
    let sameHost = false;
    try { sameHost = new URL(from).host === req.headers.get("host"); } catch { /* malformed */ }
    if (!sameHost) return new Response("forbidden", { status: 403 });
  }
  if (!(req.headers.get("content-type") || "").includes("application/json")) {
    return new Response("expected application/json", { status: 415 });
  }
  const body = await req.json().catch(() => ({}));
  const mode: Mode = body.mode === "blocker" ? "blocker" : "shopper";
  const recipient = String(body.recipient || "").slice(0, 400);
  const prompt =
    mode === "shopper"
      ? shopperPrompt({ recipient })
      : blockerPrompt(typeof body.material === "string" ? body.material.slice(0, 12000) : undefined);
  // The race sends one identical request to every provider. The blocker prompt needs no tools, so
  // it is used as is; the shopper prompt does, so the race uses a tool-free version of that task.
  const racePrompt = mode === "shopper" ? shopperRacePrompt({ recipient }) : prompt;

  // OpenClaw runs on this machine, so it reaches the proxy over loopback on the port we listen on.
  const port = req.nextUrl.port || process.env.PORT || "3000";
  const origin = `http://127.0.0.1:${port}`;

  const abort = new AbortController();
  req.signal.addEventListener("abort", () => abort.abort());
  const run = startRun({ mode, prompt, racePrompt, origin, signal: abort.signal });

  const encoder = new TextEncoder();
  let closed = false;
  let ping: ReturnType<typeof setInterval> | null = null;
  let send: ((e: TimedEvent) => void) | null = null;
  // One place that detaches this response from the run, whether it ended normally or the browser left.
  const detach = () => {
    closed = true;
    if (ping) clearInterval(ping);
    if (send) run.listeners.delete(send);
  };
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (text: string) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(text)); } catch { detach(); }
      };
      send = (e: TimedEvent) => {
        write(`data: ${JSON.stringify(e)}\n\n`);
        if (e.t === "done" && !closed) {
          detach();
          try { controller.close(); } catch { /* already closed */ }
        }
      };
      ping = setInterval(() => write(`: ping\n\n`), 15000);
      for (const e of run.events) send(e);
      if (!closed) run.listeners.add(send);
    },
    cancel() {
      detach();
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
