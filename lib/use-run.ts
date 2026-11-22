"use client";
// Client hook: starts a run, reads the SSE stream, and reduces events into UI state.
import { useCallback, useReducer, useRef } from "react";
import type { Gift, LinkStatus, Mode, Receipt, TimedEvent } from "./types";

export interface LogLine { id: number; ms: number; tag: string; text: string; live?: boolean }
export interface CallStat { call: number; tokens: number; seconds: number; tps: number }
export interface GiftCard {
  gift: Gift; sourced: boolean;
  /** The agent's price appears in the search or fetch results it received. */
  priceSeen: boolean;
  ms: number; link: LinkStatus; http: number | null; pagePrice: string | null;
}

export interface RaceView {
  /** True for the Cerebras lane, false for a rival. */
  self: boolean;
  label: string; model: string; note: string; servedBy: string | null; state: "running" | "done" | "failed";
  /** The reasoning effort this lane's request asked for, e.g. "low" or "provider default". */
  reasoning: string;
  /** Tokens generated; tokens counted for the speed (after the first chunk); first-to-last-chunk seconds. */
  tokens: number; counted: number; seconds: number; tps: number;
  ttftMs: number | null; exact: boolean; error: string | null;
  /** Time spent retrying a full queue before the request was accepted (Cerebras preview). */
  waitedMs: number;
  serverTps: number | null;
}

export interface RunView {
  /** Live results of the speed race: the Cerebras lane first, then each rival. Empty means no race ran. */
  races: RaceView[];
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
  /** Wall-clock start (ms since epoch) so the UI can tick between events. */
  startedAt: number | null;
  toolCalls: number;
  queuedEver: boolean;
}

const initial: RunView = {
  races: [],
  status: "idle", mode: "shopper", runId: null, model: null, harness: null, logs: [], calls: [],
  liveChars: 0, liveStartMs: null, liveNowMs: 0, streaming: false, queue: null, ttftMs: null,
  gifts: [], content: "", receipt: null, error: null, elapsedMs: 0, startedAt: null, toolCalls: 0, queuedEver: false,
};

type Action = { type: "start"; mode: Mode; at: number } | { type: "reset" } | { type: "events"; events: TimedEvent[] } | { type: "fail"; message: string };

let lineId = 0;
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

function push(logs: LogLine[], ms: number, tag: string, text: string, live = false): LogLine[] {
  const next = logs.filter((l) => !l.live);
  next.push({ id: ++lineId, ms, tag, text, live });
  return next.length > 300 ? next.slice(-300) : next;
}

function apply(s: RunView, e: TimedEvent): RunView {
  const ms = e.ms;
  // The run clock stops at the receipt. Race lanes can still report after that (Cerebras may keep
  // waiting for a free slot), and those late events must not stretch the run's wall time.
  if (!s.receipt) s = { ...s, elapsedMs: ms };
  switch (e.t) {
    case "init":
      return { ...s, runId: e.runId, model: e.model, harness: e.harness };
    case "log":
      return { ...s, logs: push(s.logs, ms, e.tag === "ERROR" ? "ERROR" : `OPENCLAW:${e.tag}`, e.text) };
    case "queue":
      return {
        ...s,
        queue: { tries: e.tries, waitedMs: e.waitedMs },
        queuedEver: true,
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
      return { ...s, toolCalls: s.toolCalls + 1, logs: push(s.logs, ms, "OPENCLAW:TOOL", `${e.name} ${e.args.slice(0, 150)}`) };
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
        gifts: [...s.gifts, { gift: e.gift, sourced: e.sourced, priceSeen: e.priceSeen, ms, link: "checking", http: null, pagePrice: null }],
        logs: push(s.logs, ms, "OPENCLAW:TOOL", `gift #${e.index + 1} resolved · ${e.gift.name.slice(0, 60)} · ${e.sourced ? "url found in search results" : "url NOT in search results"}`),
      };
    }
    case "verify": {
      const gifts = s.gifts.map((g, i) => (i === e.index ? { ...g, link: e.status, http: e.http, pagePrice: e.pagePrice ?? g.pagePrice } : g));
      return { ...s, gifts };
    }
    case "race_start": {
      const races = s.races.slice();
      races[e.rival] = {
        self: e.self, label: e.label, model: e.model, note: e.note, reasoning: e.reasoning, servedBy: null, state: "running",
        tokens: 0, counted: 0, seconds: 0, tps: 0, ttftMs: null, exact: false, error: null, waitedMs: 0, serverTps: null,
      };
      return { ...s, races, logs: push(s.logs, ms, "RACE", `race lane ${e.label} · ${e.model} · reasoning ${e.reasoning}`) };
    }
    case "race_wait": {
      const cur = s.races[e.rival];
      if (!cur) return s;
      const races = s.races.slice();
      races[e.rival] = { ...cur, waitedMs: e.waitedMs };
      return { ...s, races };
    }
    case "race_progress": {
      const cur = s.races[e.rival];
      if (!cur) return s;
      const races = s.races.slice();
      races[e.rival] = { ...cur, tokens: e.tokens, tps: e.tps };
      return { ...s, races };
    }
    case "race_end": {
      const cur = s.races[e.rival];
      if (!cur) return s;
      const races = s.races.slice();
      races[e.rival] = {
        ...cur, state: e.ok ? "done" : "failed", tokens: e.tokens, counted: e.counted, seconds: e.seconds, tps: e.tps,
        ttftMs: e.ttftMs, exact: e.exact, error: e.error, servedBy: e.servedBy, serverTps: e.serverTps,
      };
      const via = e.servedBy && !cur.label.toLowerCase().includes(e.servedBy.toLowerCase()) ? ` (served by ${e.servedBy})` : "";
      return {
        ...s, races,
        logs: push(s.logs, ms, "RACE", e.ok
          ? `${cur.label}${via} · ${fmt(e.counted)} tokens in ${e.seconds.toFixed(2)}s after the first chunk · ${fmt(e.tps)} tok/s`
          : `${cur.label} · no result · ${e.error}`),
      };
    }
    case "final":
      return s.content.trim() ? s : { ...s, content: e.text };
    case "receipt":
      return { ...s, receipt: e.receipt, status: "done", streaming: false, queue: null, elapsedMs: Math.round(e.receipt.wallSeconds * 1000) };
    case "error":
      return { ...s, status: "error", error: e.message, streaming: false, queue: null, logs: push(s.logs, ms, "ERROR", e.message) };
    case "done":
      return {
        ...s, status: s.status === "error" ? "error" : "done", streaming: false, queue: null,
        logs: s.logs.filter((l) => !l.live),
        // Nothing more will arrive: a lane still marked running never produced a result.
        races: s.races.map((r) => (r && r.state === "running" ? { ...r, state: "failed" as const, error: "the run ended before this lane finished" } : r)),
      };
    default:
      return s;
  }
}

function reducer(s: RunView, a: Action): RunView {
  if (a.type === "start") return { ...initial, status: "running", mode: a.mode, startedAt: a.at };
  if (a.type === "reset") return { ...initial, mode: s.mode };
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
    dispatch({ type: "start", mode: body.mode, at: Date.now() });
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

  /** Stops a run in flight (which also ends the OpenClaw process) and clears the board. */
  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    dispatch({ type: "reset" });
  }, []);
  return { view, start, reset };
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
