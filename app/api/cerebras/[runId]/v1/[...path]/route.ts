// Pass-through proxy between OpenClaw and Cerebras Inference.
// OpenClaw's `cerebras` provider baseUrl is pointed here for the duration of a run, so every model
// call the agent makes is forwarded unchanged to https://api.cerebras.ai/v1 while we read the
// server-reported `usage` + `time_info` (the source of every TPS number in the UI) off the stream.
import { NextRequest } from "next/server";
import { emit, getRun, type RunState } from "@/lib/bus";
import { checkLink, extractGifts, urlWasSourced } from "@/lib/gifts";
import type { TimeInfo, Usage } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPSTREAM = (process.env.CEREBRAS_BASE_URL || "https://api.cerebras.ai/v1").replace(/\/+$/, "");
const MAX_QUEUE_WAIT_MS = 150_000;

type Ctx = { params: Promise<{ runId: string; path: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  const res = await fetch(`${UPSTREAM}/${path.join("/")}${req.nextUrl.search}`, { headers: authHeaders(req) });
  return new Response(res.body, { status: res.status, headers: { "content-type": res.headers.get("content-type") || "application/json" } });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { runId, path } = await ctx.params;
  const run = getRun(runId);
  const bodyText = await req.text();
  const url = `${UPSTREAM}/${path.join("/")}`;
  const isChat = path.join("/") === "chat/completions";

  let call = 0;
  if (run && isChat) {
    call = ++run.callSeq;
    noteToolResults(run, bodyText);
    emit(run, { t: "call_start", call });
  }

  // Cerebras answers 429 `queue_exceeded` when its shared queue is full. Wait and retry on the
  // agent's behalf so a busy endpoint slows a run down instead of failing it.
  const t0 = Date.now();
  let tries = 0;
  let res: Response;
  let attemptStart = t0;
  for (;;) {
    tries++;
    attemptStart = Date.now();
    res = await fetch(url, {
      method: "POST",
      headers: { ...authHeaders(req), "content-type": "application/json" },
      body: bodyText,
      signal: req.signal,
    });
    if (res.status !== 429) break;
    const errText = await res.text();
    const waited = Date.now() - t0;
    if (!/queue/i.test(errText) || waited > MAX_QUEUE_WAIT_MS) {
      if (run) emit(run, { t: "log", tag: "ERROR", text: `Cerebras 429 after ${tries} tries: ${errText.slice(0, 160)}` });
      return new Response(errText, { status: 429, headers: { "content-type": "application/json" } });
    }
    if (run && (tries === 1 || tries % 3 === 0)) emit(run, { t: "queue", call, tries, waitedMs: waited });
    await sleep(Math.min(3000, 900 + tries * 150));
  }
  if (run) run.queueMs += attemptStart - t0;

  const contentType = res.headers.get("content-type") || "application/json";
  if (!res.ok || !res.body || !run || !isChat || !contentType.includes("event-stream")) {
    if (run && !res.ok) {
      const text = await res.text();
      emit(run, { t: "log", tag: "ERROR", text: `Cerebras HTTP ${res.status}: ${text.slice(0, 200)}` });
      return new Response(text, { status: res.status, headers: { "content-type": contentType } });
    }
    return new Response(res.body, { status: res.status, headers: { "content-type": contentType } });
  }

  // Tee the SSE stream: bytes go to OpenClaw untouched, a parsed copy feeds the telemetry bus.
  const decoder = new TextDecoder();
  let buf = "";
  let firstTokenAt: number | null = null;
  let usage: Usage = {};
  let timeInfo: TimeInfo = {};
  let finish: string | null = null;
  let callContent = "";
  const toolCalls = new Map<number, { name: string; args: string }>();

  const handleLine = (line: string) => {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") return;
    let j: any;
    try { j = JSON.parse(data); } catch { return; }
    if (j.usage) usage = j.usage;
    if (j.time_info) timeInfo = j.time_info;
    const choice = j.choices?.[0];
    if (!choice) return;
    if (choice.finish_reason) finish = choice.finish_reason;
    const d = choice.delta || {};
    const reasoning: string | undefined = d.reasoning ?? d.reasoning_content;
    if (reasoning) {
      firstTokenAt ??= Date.now();
      emit(run, { t: "delta", call, kind: "reasoning", text: reasoning });
    }
    if (typeof d.content === "string" && d.content) {
      firstTokenAt ??= Date.now();
      callContent += d.content;
      emit(run, { t: "delta", call, kind: "content", text: d.content });
      if (run.mode === "shopper") surfaceGifts(run, callContent);
    }
    for (const tc of d.tool_calls || []) {
      firstTokenAt ??= Date.now();
      const cur = toolCalls.get(tc.index ?? 0) || { name: "", args: "" };
      if (tc.function?.name) cur.name = tc.function.name;
      if (tc.function?.arguments) cur.args += tc.function.arguments;
      toolCalls.set(tc.index ?? 0, cur);
    }
  };

  const finishCall = () => {
    for (const tc of toolCalls.values()) {
      const { name, args } = unwrapTool(tc.name, tc.args);
      run.toolCalls++;
      emit(run, { t: "tool_call", call, name, args });
    }
    run.content += callContent;
    const ct = timeInfo.completion_time || 0;
    const tokens = usage.completion_tokens || 0;
    const tps = ct > 0 ? tokens / ct : 0;
    const queueMs = (timeInfo.queue_time || 0) * 1000;
    run.queueMs += queueMs;
    const ttftMs = firstTokenAt ? Math.max(0, Math.round(firstTokenAt - attemptStart - queueMs)) : null;
    run.calls.push({ call, usage, time_info: timeInfo, tps, ttftMs });
    emit(run, { t: "call_end", call, usage, time_info: timeInfo, tps, ttftMs, finish });
  };

  const upstream = res.body;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
          buf += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            handleLine(buf.slice(0, nl).trimEnd());
            buf = buf.slice(nl + 1);
          }
        }
        if (buf.trim()) handleLine(buf.trim());
      } catch (err) {
        // OpenClaw closes the connection once it has the final chunk; only report real interruptions.
        if (!finish) emit(run, { t: "log", tag: "ERROR", text: `stream interrupted: ${String(err).slice(0, 120)}` });
      } finally {
        finishCall();
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
  });
}

function authHeaders(req: NextRequest): Record<string, string> {
  const auth = req.headers.get("authorization") || `Bearer ${process.env.CEREBRAS_API_KEY || ""}`;
  return { authorization: auth };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** OpenClaw can route tools through a `dispatch_action` wrapper; show the real tool underneath. */
function unwrapTool(name: string, args: string): { name: string; args: string } {
  if (name === "dispatch_action") {
    try {
      const a = JSON.parse(args);
      const inner = String(a.id || "").split(":").pop() || name;
      return { name: inner, args: JSON.stringify(a.args ?? {}) };
    } catch { /* fall through */ }
  }
  return { name, args };
}

/** Records the tool results OpenClaw is sending back to the model (they are in the request body). */
function noteToolResults(run: RunState, bodyText: string) {
  try {
    const body = JSON.parse(bodyText);
    const tools = (body.messages || []).filter((m: any) => m.role === "tool");
    const text = tools.map((m: any) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content))).join("\n");
    if (text.length > run.toolText.length) {
      run.toolText = text;
      emit(run, { t: "tool_results", count: tools.length, chars: text.length });
    }
  } catch { /* not JSON */ }
}

/** Emits a gift card the moment its JSON object finishes streaming, then checks its link. */
function surfaceGifts(run: RunState, callContent: string) {
  const found = extractGifts(callContent);
  for (const gift of found) {
    if (run.gifts.length >= 5) break;
    if (run.gifts.some((g) => g.gift.url === gift.url)) continue;
    const sourced = urlWasSourced(gift.url, run.toolText);
    const index = run.gifts.length;
    run.gifts.push({ gift, sourced });
    emit(run, { t: "gift", index, gift, sourced, tps: 0 });
    emit(run, { t: "verify", index, status: "checking", http: null });
    const p = checkLink(gift.url).then((r) => {
      run.links[index] = r.status;
      emit(run, { t: "verify", index, status: r.status, http: r.http, pagePrice: r.price });
    });
    run.pending.push(p);
  }
}
