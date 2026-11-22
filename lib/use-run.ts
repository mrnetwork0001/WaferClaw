"use client";
// Client hook: starts a run, reads the SSE stream, and reduces events into UI state.
import { useCallback, useReducer, useRef } from "react";
import type { Gift, LinkStatus, Mode, Receipt, TimedEvent } from "./types";

export interface LogLine { id: number; ms: number; tag: string; text: string; live?: boolean }
export interface CallStat { call: number; tokens: number; seconds: number; tps: number }
export interface GiftCard { gift: Gift; sourced: boolean; ms: number; link: LinkStatus; http: number | null; pagePrice: string | null }

export interface RunView {
  status: "idle" | "running" | "done" | "error";
  mode: Mode;
  runId: string | null;
  model: string | null;
  harness: string | null;
  logs: LogLine[];
  calls: CallStat[];
  /** Characters streamed in the call currently in flight, and when its first token arrived. */
  liveChars: number;
  liveStartMs: number | null;
  liveNowMs: number;
  streaming: boolean;
  queue: { tries: number; waitedMs: number } | null;
  ttftMs: number | null;
  gifts: GiftCard[];
  content: string;
  receipt: Receipt | null;
  error: string | null;
  elapsedMs: number;
}

const initial: RunView = {
  status: "idle", mode: "shopper", runId: null, model: null, harness: null, logs: [], calls: [],
  liveChars: 0, liveStartMs: null, liveNowMs: 0, streaming: false, queue: null, ttftMs: null,
  gifts: [], content: "", receipt: null, error: null, elapsedMs: 0,
};

type Action = { type: "start"; mode: Mode } | { type: "events"; events: TimedEvent[] } | { type: "fail"; message: string };

let lineId = 0;
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

function push(logs: LogLine[], ms: number, tag: string, text: string, live = false): LogLine[] {
  const next = logs.filter((l) => !l.live);
  next.push({ id: ++lineId, ms, tag, text, live });
  return next.length > 300 ? next.slice(-300) : next;
}

function apply(s: RunView, e: TimedEvent): RunView {
  const ms = e.ms;
  s = { ...s, elapsedMs: ms };
  switch (e.t) {
    case "init":
      return { ...s, runId: e.runId, model: e.model, harness: e.harness };
    case "log":
      return { ...s, logs: push(s.logs, ms, e.tag === "ERROR" ? "ERROR" : `OPENCLAW:${e.tag}`, e.text) };
    case "queue":
      return {
        ...s,
        queue: { tries: e.tries, waitedMs: e.waitedMs },
        logs: push(s.logs, ms, "CEREBRAS:QUEUE", `endpoint busy (429 queue_exceeded) · waiting · try ${e.tries} · ${(e.waitedMs / 1000).toFixed(0)}s`, true),
      };
    case "call_start":
      return {
        ...s, streaming: true, liveChars: 0, liveStartMs: null, liveNowMs: ms,
        logs: push(s.logs, ms, "OPENCLAW:STREAM", `model call #${e.call} → ${s.model ?? ""}`),
      };
    case "delta": {
      const liveStartMs = s.liveStartMs ?? ms;
      const content = e.kind === "content" ? s.content + e.text : s.content;
      const tail = (e.kind === "reasoning" ? "(thinking) " : "") + e.text.replace(/\s+/g, " ").slice(-110);
      return {
        ...s, queue: null, content, liveStartMs, liveNowMs: ms, liveChars: s.liveChars + e.text.length,
        logs: push(s.logs, ms, "OPENCLAW:STREAM", tail, true),
      };
    }
    case "tool_call":
      return { ...s, logs: push(s.logs, ms, "OPENCLAW:TOOL", `${e.name} ${e.args.slice(0, 150)}`) };
    case "tool_results":
      return { ...s, logs: push(s.logs, ms, "OPENCLAW:TOOL", `← ${e.count} tool results returned to the model (${fmt(e.chars)} chars)`) };
    case "call_end": {
      const tokens = e.usage.completion_tokens || 0;
      const seconds = e.time_info.completion_time || 0;
      return {
        ...s, streaming: false, queue: null, ttftMs: s.ttftMs ?? e.ttftMs,
        calls: [...s.calls, { call: e.call, tokens, seconds, tps: e.tps }],
        logs: push(s.logs, ms, "OPENCLAW:STREAM", `call #${e.call} done · ${fmt(tokens)} tokens in ${seconds.toFixed(2)}s · ${fmt(e.tps)} tok/s (server time_info)`),
      };
    }
    case "gift": {
      if (s.gifts.length > e.index) return s;
      return {
        ...s,
        gifts: [...s.gifts, { gift: e.gift, sourced: e.sourced, ms, link: "checking", http: null, pagePrice: null }],
        logs: push(s.logs, ms, "OPENCLAW:TOOL", `gift #${e.index + 1} resolved · ${e.gift.name.slice(0, 60)} · ${e.sourced ? "url found in search results" : "url NOT in search results"}`),
      };
    }
    case "verify": {
      const gifts = s.gifts.map((g, i) => (i === e.index ? { ...g, link: e.status, http: e.http, pagePrice: e.pagePrice ?? g.pagePrice } : g));
      return { ...s, gifts };
    }
    case "final":
      return s.content.trim() ? s : { ...s, content: e.text };
    case "receipt":
      return { ...s, receipt: e.receipt };
    case "error":
      return { ...s, status: "error", error: e.message, streaming: false, queue: null, logs: push(s.logs, ms, "ERROR", e.message) };
    case "done":
      return { ...s, status: s.status === "error" ? "error" : "done", streaming: false, queue: null, logs: s.logs.filter((l) => !l.live) };
    default:
      return s;
  }
}

function reducer(s: RunView, a: Action): RunView {
  if (a.type === "start") return { ...initial, status: "running", mode: a.mode };
  if (a.type === "fail") return { ...s, status: "error", error: a.message, streaming: false, queue: null };
  return a.events.reduce(apply, s);
}

export function useRun() {
  const [view, dispatch] = useReducer(reducer, initial);
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(async (body: { mode: Mode; recipient?: string; material?: string }) => {
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    dispatch({ type: "start", mode: body.mode });
    try {
      const res = await fetch("/api/openclaw/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: abort.signal,
      });
      if (!res.ok || !res.body) throw new Error(`run failed to start (HTTP ${res.status})`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const events: TimedEvent[] = [];
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          if (chunk.startsWith("data:")) {
            try { events.push(JSON.parse(chunk.slice(5))); } catch { /* skip */ }
          }
        }
        if (events.length) dispatch({ type: "events", events });
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") dispatch({ type: "fail", message: String(err?.message || err) });
    }
  }, []);

  const stop = useCallback(() => abortRef.current?.abort(), []);
  return { view, start, stop };
}

/** Speed numbers derived from the server-reported per-call usage + time_info. */
export function speed(view: RunView) {
  const tokens = view.calls.reduce((a, c) => a + c.tokens, 0);
  const seconds = view.calls.reduce((a, c) => a + c.seconds, 0);
  const mean = seconds > 0 ? tokens / seconds : 0;
  const peak = view.calls.reduce((a, c) => Math.max(a, c.tps), 0);
  const last = view.calls.length ? view.calls[view.calls.length - 1].tps : 0;
  // While a call is streaming we only have characters and wall time: a rough client-side estimate.
  let liveEst = 0;
  if (view.streaming && view.liveStartMs != null) {
    const dt = Math.max(0.15, (view.liveNowMs - view.liveStartMs) / 1000);
    liveEst = view.liveChars / 4 / dt;
  }
  return { tokens, seconds, mean, peak, last, liveEst };
}
