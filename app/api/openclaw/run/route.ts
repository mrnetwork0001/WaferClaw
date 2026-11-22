// POST /api/openclaw/run -> Server-Sent Events for one real OpenClaw agent turn.
import { NextRequest } from "next/server";
import { startRun } from "@/lib/openclaw-runner";
import { blockerPrompt, shopperPrompt } from "@/lib/prompts";
import type { Mode, TimedEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const mode: Mode = body.mode === "blocker" ? "blocker" : "shopper";
  const prompt =
    mode === "shopper"
      ? shopperPrompt({ recipient: String(body.recipient || "").slice(0, 400) })
      : blockerPrompt(typeof body.material === "string" ? body.material.slice(0, 12000) : undefined);

  // OpenClaw runs on this machine, so it reaches the proxy over loopback on the port we listen on.
  const port = req.nextUrl.port || process.env.PORT || "3000";
  const origin = `http://127.0.0.1:${port}`;

  const abort = new AbortController();
  req.signal.addEventListener("abort", () => abort.abort());
  const run = startRun({ mode, prompt, origin, signal: abort.signal });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (e: TimedEvent) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        if (e.t === "done") {
          closed = true;
          clearInterval(ping);
          run.listeners.delete(send);
          controller.close();
        }
      };
      const ping = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(`: ping\n\n`));
      }, 15000);
      for (const e of run.events) send(e);
      if (!closed) run.listeners.add(send);
    },
    cancel() {
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
