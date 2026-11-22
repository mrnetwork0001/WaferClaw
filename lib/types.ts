// Shared event + data types for the WaferClaw run stream (server -> browser over SSE).

export type Mode = "shopper" | "blocker";

export interface TimeInfo {
  queue_time?: number;
  prompt_time?: number;
  completion_time?: number;
  total_time?: number;
}

export interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
  completion_tokens_details?: { reasoning_tokens?: number };
}

export interface Gift {
  name: string;
  price: string;
  retailer: string;
  url: string;
  reason: string;
}

export type LinkStatus = "checking" | "live" | "blocked" | "dead" | "unreachable";

export interface Receipt {
  runId: string;
  mode: Mode;
  harness: string;
  model: string;
  modelCalls: number;
  completionTokens: number;
  promptTokens: number;
  decodeSeconds: number;
  meanTps: number;
  peakTps: number;
  ttftMs: number | null;
  queueSeconds: number;
  wallSeconds: number;
  toolCalls: number;
  giftsFound?: number;
  giftsSourced?: number;
  giftsLive?: number;
  startedAt: string;
  sha256: string;
}

export type RunEvent =
  | { t: "init"; runId: string; model: string; harness: string; mode: Mode; command: string }
  | { t: "log"; tag: "INIT" | "TOOL" | "STREAM" | "QUEUE" | "RECEIPT" | "ERROR" | "VERIFY"; text: string }
  | { t: "queue"; call: number; tries: number; waitedMs: number }
  | { t: "call_start"; call: number }
  | { t: "delta"; call: number; kind: "content" | "reasoning"; text: string }
  | { t: "tool_call"; call: number; name: string; args: string }
  | { t: "tool_results"; count: number; chars: number }
  | {
      t: "call_end";
      call: number;
      usage: Usage;
      time_info: TimeInfo;
      tps: number;
      ttftMs: number | null;
      finish: string | null;
    }
  | { t: "gift"; index: number; gift: Gift; sourced: boolean; /** the agent's price appears in its own search or fetch results */ priceSeen: boolean; tps: number }
  | { t: "verify"; index: number; status: LinkStatus; http: number | null; pagePrice?: string | null }
  | { t: "race_start"; rival: number; self: boolean; label: string; model: string; note: string; reasoning: string }
  | { t: "race_wait"; rival: number; waitedMs: number; tries: number }
  | { t: "race_progress"; rival: number; tokens: number; tps: number }
  | {
      t: "race_end"; rival: number; ok: boolean; error: string | null;
      /** Tokens generated, tokens counted for the speed (after the first chunk), and first-to-last-chunk seconds. */
      tokens: number; counted: number; seconds: number; tps: number;
      ttftMs: number | null; exact: boolean; servedBy: string | null;
      /** The provider's own stated decode speed for this request, when it reports one (Cerebras does). */
      serverTps: number | null;
    }
  | { t: "final"; text: string }
  | { t: "receipt"; receipt: Receipt }
  | { t: "error"; message: string }
  | { t: "done" };

export type TimedEvent = RunEvent & { ms: number };
