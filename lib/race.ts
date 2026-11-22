// Real side-by-side. When a run starts, ONE identical request (same text, same model, same output
// cap) is sent at the same moment to Cerebras and to each configured rival provider that serves
// the same model from GPUs. Every stream is timed the same way, here.
// Nothing is modelled. With no rival configured in .env.local there is no race and no extra call.
import { emit, type RunState } from "./bus";

export interface RaceConfig {
  label: string; model: string; baseUrl: string; apiKey: string;
  /** Extra JSON merged into the request, e.g. to pin one upstream host on an aggregator. */
  extraBody: Record<string, unknown>;
  /** Set when this rival's settings are unusable; the lane then fails loudly instead of running wrongly. */
  configError: string | null;
  /** Free-text facts shown beside the rival on screen, e.g. hardware and quantization. */
  note: string;
}

// Rival 1 is RACE_*, rival 2 is RACE2_*, rival 3 is RACE3_*. Later rivals inherit the base URL,
// key and model of rival 1 unless they set their own, so two hosts behind one aggregator key only
// need their own LABEL, EXTRA_BODY and NOTE.
const SLOTS = ["", "2", "3"];
// The request is identical for every lane, so an extra body may add routing or reasoning settings
// but may not replace the model, the prompt, the cap or streaming.
const RESERVED_BODY_KEYS = ["model", "messages", "stream", "stream_options", "max_tokens", "max_completion_tokens"];

function readSlot(slot: string, first: RaceConfig | null): RaceConfig | null {
  const env = (name: string) => (process.env[`RACE${slot}_${name}`] || "").trim();
  const ownLabel = env("LABEL");
  const rawExtra = env("EXTRA_BODY");
  const ownBase = env("BASE_URL").replace(/\/+$/, "");
  if (slot && !ownLabel && !rawExtra && !env("MODEL") && !ownBase) return null;
  const baseUrl = ownBase || first?.baseUrl || "";
  const model = env("MODEL") || first?.model || "";
  // A key is only ever sent to the host it was configured for: a rival with its own base URL
  // must bring its own key and never inherits rival 1's.
  const sameHostAsFirst = !ownBase || ownBase === first?.baseUrl;
  const apiKey = env("API_KEY") || (sameHostAsFirst ? first?.apiKey || "" : "");
  if (!baseUrl || !model) return null;
  if (!slot && !apiKey) return null;

  let label = ownLabel;
  if (!label) {
    try { label = new URL(baseUrl).hostname; } catch { label = baseUrl; }
  }
  let extraBody: Record<string, unknown> = {};
  let configError: string | null = null;
  if (!apiKey) configError = `RACE${slot}_API_KEY is required because RACE${slot}_BASE_URL is a different host`;
  if (rawExtra && !configError) {
    try {
      const j = JSON.parse(rawExtra);
      if (!j || typeof j !== "object" || Array.isArray(j)) {
        configError = `RACE${slot}_EXTRA_BODY must be a JSON object`;
      } else {
        const clash = RESERVED_BODY_KEYS.find((k) => k in j);
        if (clash) configError = `RACE${slot}_EXTRA_BODY may not set "${clash}"`;
        else extraBody = j;
      }
    } catch {
      configError = `RACE${slot}_EXTRA_BODY is not valid JSON`;
    }
  }
  return { baseUrl, apiKey, model, extraBody, configError, label, note: env("NOTE") };
}

/** Every rival configured in the environment, in order. Empty means no race. */
export function raceConfigs(): RaceConfig[] {
  const first = readSlot("", null);
  if (!first) return [];
  const out = [first];
  for (const slot of SLOTS.slice(1)) {
    const cfg = readSlot(slot, first);
    if (cfg) out.push(cfg);
  }
  return out;
}

/** The reasoning effort a request body asks for, as shown on screen; "provider default" when it asks for none. */
function reasoningOf(extra: Record<string, unknown>): string {
  const direct = extra.reasoning_effort;
  if (typeof direct === "string" && direct) return direct.toLowerCase();
  const r = extra.reasoning as { effort?: unknown } | undefined;
  if (r && typeof r === "object" && typeof r.effort === "string" && r.effort) return r.effort.toLowerCase();
  return "provider default";
}

/** One lane of the race: Cerebras itself, or a rival. */
interface Entrant {
  self: boolean;
  label: string; model: string; note: string;
  url: string; apiKey: string;
  extraBody: Record<string, unknown>;
  reasoning: string;
  configError: string | null;
  /** How long to keep retrying while the endpoint answers 429 "queue full". Only the Cerebras preview needs this. */
  queueRetryMs: number;
}

function entrants(): Entrant[] {
  const rivals = raceConfigs();
  if (rivals.length === 0) return [];
  const base = (process.env.CEREBRAS_BASE_URL || "https://api.cerebras.ai/v1").replace(/\/+$/, "");
  const selfBody = { reasoning_effort: "low" };
  const self: Entrant = {
    self: true,
    label: "Cerebras",
    model: process.env.CEREBRAS_MODEL || "moonshotai-kimi-k3.1-pro-trial",
    note: "",
    url: `${base}/chat/completions`,
    apiKey: process.env.CEREBRAS_API_KEY || "",
    extraBody: selfBody,
    reasoning: reasoningOf(selfBody),
    configError: process.env.CEREBRAS_API_KEY ? null : "CEREBRAS_API_KEY is not set",
    queueRetryMs: 300_000,
  };
  return [
    self,
    ...rivals.map((r) => ({
      self: false, label: r.label, model: r.model, note: r.note,
      url: `${r.baseUrl}/chat/completions`, apiKey: r.apiKey,
      extraBody: r.extraBody, reasoning: reasoningOf(r.extraBody), configError: r.configError, queueRetryMs: 0,
    })),
  ];
}

const MAX_STREAM_MS = 150_000;
// A speed is only reported from a sample big enough to time, and the rule is about the sample,
// not the provider: the same token count is required of every lane, plus a window long enough
// that the 1 ms clock and network read scheduling cannot dominate the result.
const MIN_TOKENS = 600;
const MIN_WINDOW_SECONDS = 0.2;

/** Output cap per race request. Speed is tokens over time, so a cap does not bias it; it bounds cost and waiting. */
function maxTokens(): number {
  const n = Number(process.env.RACE_MAX_TOKENS);
  return Number.isFinite(n) && n >= 800 && n <= 8000 ? Math.round(n) : 1500;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function httpError(status: number, text: string): string {
  let message = text;
  try { message = JSON.parse(text)?.error?.message || JSON.parse(text)?.message || text; } catch { /* not JSON */ }
  return `HTTP ${status}: ${String(message).slice(0, 150)}`;
}

/** Sends the identical race request to every lane at once and reports each measured speed. Never throws. */
export async function runRaces(run: RunState, prompt: string, signal?: AbortSignal): Promise<void> {
  await Promise.all(entrants().map((e, lane) => runLane(run, lane, e, prompt, signal)));
}

async function runLane(run: RunState, rival: number, e: Entrant, prompt: string, signal?: AbortSignal): Promise<void> {
  emit(run, { t: "race_start", rival, self: e.self, label: e.label, model: e.model, note: e.note, reasoning: e.reasoning });
  const fail = (error: string) =>
    emit(run, { t: "race_end", rival, ok: false, error, tokens: 0, counted: 0, seconds: 0, tps: 0, ttftMs: null, exact: false, servedBy: null, serverTps: null });
  // Settings we cannot use must stop this lane: running unpinned could put a different host on
  // screen than the label says.
  if (e.configError) return fail(e.configError);

  const deadline = AbortSignal.timeout(MAX_STREAM_MS + e.queueRetryMs);
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  const body = JSON.stringify({
    model: e.model,
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: maxTokens(),
    messages: [{ role: "user", content: prompt }],
    ...e.extraBody,
  });

  try {
    const began = Date.now();
    let t0 = began;
    let tries = 0;
    let res: Response;
    for (;;) {
      tries++;
      t0 = Date.now();
      res = await fetch(e.url, {
        method: "POST",
        signal: combined,
        headers: { authorization: `Bearer ${e.apiKey}`, "content-type": "application/json" },
        body,
      });
      if (res.status !== 429 || e.queueRetryMs === 0) break;
      const text = await res.text().catch(() => "");
      // Only a full queue is worth waiting out; any other 429 is a real refusal.
      if (!/queue/i.test(text)) return fail(httpError(429, text));
      if (Date.now() - began > e.queueRetryMs) return fail(`no free slot after ${Math.round((Date.now() - began) / 1000)} s (queue full)`);
      emit(run, { t: "race_wait", rival, waitedMs: Date.now() - began, tries });
      await sleep(Math.min(3000, 900 + tries * 150));
    }
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      return fail(httpError(res.status, text));
    }

    const decoder = new TextDecoder();
    let buf = "";
    let chars = 0, firstReadChars = 0, reasoningChars = 0;
    let firstAt: number | null = null, lastAt = t0, lastEmit = 0;
    let usage: any = null, timeInfo: any = null;
    let streamError: string | null = null;
    // Aggregators name the upstream host that actually served the request; keep it for the screen.
    let servedBy: string | null = res.headers.get("x-inference-provider");

    // `now` is the arrival time of the network read the line came in, so every event that
    // arrived together shares one timestamp.
    const onLine = (raw: string, now: number) => {
      const line = raw.trim();
      if (!line.startsWith("data:")) return;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") return;
      let j: any;
      try { j = JSON.parse(data); } catch { return; }
      if (j.error) streamError = String(j.error.message || JSON.stringify(j.error)).slice(0, 160);
      if (j.usage) usage = j.usage;
      if (j.time_info) timeInfo = j.time_info;
      if (typeof j.provider === "string" && j.provider) servedBy = j.provider;
      const d = j.choices?.[0]?.delta || {};
      const reasoning: string = d.reasoning || d.reasoning_content || "";
      const piece: string = (d.content || "") + reasoning;
      if (!piece) return;
      if (firstAt == null) firstAt = now;
      // Everything that arrived with the first read was generated before timing started.
      if (now === firstAt) firstReadChars += piece.length;
      lastAt = now;
      chars += piece.length;
      reasoningChars += reasoning.length;
    };

    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      const now = Date.now();
      buf += decoder.decode(chunk, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        onLine(buf.slice(0, nl), now);
        buf = buf.slice(nl + 1);
      }
      // A live figure only once there is a window worth dividing by.
      if (firstAt != null && now - firstAt >= 300 && now - lastEmit > 250) {
        lastEmit = now;
        emit(run, { t: "race_progress", rival, tokens: Math.round(chars / 4), tps: (chars - firstReadChars) / 4 / ((now - firstAt) / 1000) });
      }
    }
    // A final event without a trailing newline (often the one carrying usage) is still in the buffer.
    if (buf.trim()) onLine(buf, Date.now());

    // A stream that carried an error did not complete; never turn a partial answer into a speed.
    if (streamError) return fail(`stream error: ${streamError}`);
    if (firstAt == null || chars === 0) return fail("no tokens returned");

    const estimate = chars / 4;
    const reported: number | null = typeof usage?.completion_tokens === "number" ? usage.completion_tokens : null;
    let tokens = Math.round(estimate);
    if (reported != null) {
      // Some hosts count reasoning tokens they never streamed. Those were not timed here, so they
      // are left out, but only when the text that actually arrived says so.
      const reasoningTokens = Number(usage?.completion_tokens_details?.reasoning_tokens) || 0;
      const withoutHidden = reported - reasoningTokens;
      const hidden = reasoningChars === 0 && reasoningTokens > 0 && Math.abs(withoutHidden - estimate) < Math.abs(reported - estimate);
      tokens = Math.max(0, hidden ? withoutHidden : reported);
      // A count far out of line with the streamed text means tokens were counted that were not
      // timed, or the reverse. Refuse to turn that into a speed.
      if (tokens > estimate * 5 || tokens < estimate / 5) {
        return fail(`token count ${tokens} does not match the text received (about ${Math.round(estimate)} tokens)`);
      }
    }
    // speed = tokens that arrived after the first network read / time from the first read to the last.
    const counted = tokens * ((chars - firstReadChars) / chars);
    const seconds = (lastAt - firstAt) / 1000;
    if (counted < MIN_TOKENS || seconds < MIN_WINDOW_SECONDS) {
      return fail(`sample too small to time: ${Math.round(counted)} tokens after the first chunk in ${seconds.toFixed(2)} s (needs ${MIN_TOKENS})`);
    }
    // Cerebras also states its own decode time; keep it as a cross-check on the timing done here.
    const serverSeconds = Number(timeInfo?.completion_time) || 0;
    emit(run, {
      t: "race_end", rival, ok: true, error: null,
      tokens, counted: Math.round(counted), seconds, tps: counted / seconds,
      ttftMs: firstAt - t0, exact: reported != null, servedBy,
      serverTps: serverSeconds > 0 && reported != null ? reported / serverSeconds : null,
    });
  } catch (err: any) {
    fail(String(err?.message || err).slice(0, 160));
  }
}
