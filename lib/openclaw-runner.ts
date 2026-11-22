// Spawns the real OpenClaw harness (project-local, isolated install) for one agent turn and turns
// what happens into WaferClaw run events. The model calls OpenClaw makes are routed through the
// pass-through proxy at /api/cerebras/<runId>/v1, which is where usage + time_info are captured.
import { spawn, execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRun, emit, type RunState } from "./bus";
import { runRaces } from "./race";
import type { Mode, Receipt } from "./types";

const ROOT = process.cwd();
const SANDBOX = path.join(ROOT, ".openclaw-sandbox");
const OPENCLAW_BIN = path.join(SANDBOX, "app", "node_modules", "openclaw", "openclaw.mjs");

export const PRIMARY_MODEL = process.env.CEREBRAS_MODEL || "moonshotai-kimi-k3.1-pro-trial";
export const FALLBACK_MODELS = (process.env.CEREBRAS_FALLBACK_MODELS || "gpt-oss-120b,qwen-3.8-27b")
  .split(",").map((s) => s.trim()).filter(Boolean);

/** Environment that keeps OpenClaw's home, state and config inside .openclaw-sandbox/. */
export function openclawEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    OPENCLAW_HOME: path.join(SANDBOX, "home"),
    OPENCLAW_STATE_DIR: path.join(SANDBOX, "state"),
    OPENCLAW_CONFIG_PATH: path.join(SANDBOX, "state", "openclaw.json"),
    OPENCLAW_WORKSPACE_DIR: path.join(SANDBOX, "workspace"),
    NO_COLOR: "1",
  };
}

export function openclawInstalled(): boolean {
  return fs.existsSync(OPENCLAW_BIN);
}

let versionCache: string | null = null;
export function openclawVersion(): Promise<string> {
  if (versionCache) return Promise.resolve(versionCache);
  return new Promise((resolve) => {
    if (!openclawInstalled()) return resolve("not installed");
    execFile(process.execPath, [OPENCLAW_BIN, "--version"], { env: openclawEnv(), timeout: 20000 }, (err, stdout) => {
      const v = (stdout || "").trim().split("\n").pop() || "";
      if (!err && v) versionCache = v.replace(/^OpenClaw\s+/i, "OpenClaw ");
      resolve(versionCache || "unknown");
    });
  });
}

export interface StartOptions {
  mode: Mode;
  prompt: string;
  /** The identical request sent to every provider in the speed race (tool-free). */
  racePrompt: string;
  /** Origin of this Next.js server, e.g. http://127.0.0.1:3000 (OpenClaw calls the proxy on it). */
  origin: string;
  signal?: AbortSignal;
}

export function startRun(opts: StartOptions): RunState {
  const run = createRun(randomUUID().slice(0, 8), opts.mode, PRIMARY_MODEL);
  // The race is cancelled whenever the run ends without a receipt, so no lane keeps spending
  // quota for a result nobody will see.
  const raceAbort = new AbortController();
  void drive(run, opts, raceAbort).catch((err) => {
    raceAbort.abort();
    emit(run, { t: "error", message: String(err?.message || err) });
    emit(run, { t: "done" });
  });
  return run;
}

async function drive(run: RunState, opts: StartOptions, raceAbort: AbortController) {
  if (!process.env.CEREBRAS_API_KEY) throw new Error("CEREBRAS_API_KEY is not set (add it to .env.local).");
  if (!openclawInstalled()) throw new Error("OpenClaw is not installed in .openclaw-sandbox (run: npm run setup:openclaw).");
  const harness = await openclawVersion();
  const models = [PRIMARY_MODEL, ...FALLBACK_MODELS.filter((m) => m !== PRIMARY_MODEL)];

  // The speed race: one identical request to Cerebras and to every configured rival, sent now
  // (no rival configured: no race and no extra call).
  const raceSignal = opts.signal ? AbortSignal.any([opts.signal, raceAbort.signal]) : raceAbort.signal;
  const race = runRaces(run, opts.racePrompt, raceSignal);

  let envelope: any = null;
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    run.model = model;
    const command = `openclaw agent exec --json --model cerebras/${model} --thinking low`;
    emit(run, { t: "init", runId: run.id, model: `cerebras/${model}`, harness, mode: run.mode, command });
    emit(run, { t: "log", tag: "INIT", text: `${harness} · provider cerebras · model ${model} · isolated state .openclaw-sandbox/` });
    emit(run, { t: "log", tag: "INIT", text: `$ ${command}` });
    envelope = await execOpenClaw(run, model, opts);
    if (run.calls.length > 0 || opts.signal?.aborted) break;
    const why = envelope?.error?.message || "no model call completed";
    if (i < models.length - 1) {
      emit(run, { t: "log", tag: "ERROR", text: `${model} unavailable (${String(why).slice(0, 140)}). Falling back to ${models[i + 1]}.` });
    }
  }

  if (opts.signal?.aborted) {
    raceAbort.abort();
    emit(run, { t: "done" });
    return;
  }

  const finalText: string = (envelope?.final || "").trim() || run.content.trim();
  emit(run, { t: "final", text: finalText });
  if (run.calls.length === 0) {
    raceAbort.abort();
    emit(run, { t: "error", message: envelope?.error?.message || "OpenClaw finished without a completed model call." });
    emit(run, { t: "done" });
    return;
  }
  if (envelope && envelope.ok === false && envelope.error?.message) {
    emit(run, { t: "log", tag: "ERROR", text: `OpenClaw: ${String(envelope.error.message).slice(0, 200)}` });
  }

  await Promise.allSettled(run.pending);
  const receipt = buildReceipt(run, harness);
  emit(run, {
    t: "log",
    tag: "RECEIPT",
    text: `${receipt.meanTps.toFixed(0)} tok/s mean · ${receipt.peakTps.toFixed(0)} peak · ${receipt.completionTokens} tokens in ${receipt.decodeSeconds.toFixed(2)}s decode · sha256 ${receipt.sha256.slice(0, 12)}`,
  });
  emit(run, { t: "receipt", receipt });
  // The agent run is done; keep the stream open until every race lane finishes so its real result is shown.
  await race;
  emit(run, { t: "done" });
}

function execOpenClaw(run: RunState, model: string, opts: StartOptions): Promise<any> {
  return new Promise((resolve) => {
    const override = JSON.stringify({
      models: { providers: { cerebras: { baseUrl: `${opts.origin}/api/cerebras/${run.id}/v1` } } },
    });
    const args = [
      OPENCLAW_BIN, "agent", "exec", "--json",
      "--cwd", path.join(SANDBOX, "workspace"),
      "--timeout", process.env.WAFERCLAW_TIMEOUT_SECONDS || "420",
      "--model", `cerebras/${model}`,
      "--thinking", "low",
      "--config-override", override,
      "--message-file", "-",
    ];
    if (process.env.WAFERCLAW_CODE_MODE) args.push("--code-mode", process.env.WAFERCLAW_CODE_MODE);
    const child = spawn(process.execPath, args, { env: openclawEnv(), cwd: path.join(SANDBOX, "workspace") });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr = (stderr + d).slice(-4000)));
    child.stdin.end(opts.prompt);
    const onAbort = () => child.kill("SIGTERM");
    opts.signal?.addEventListener("abort", onAbort);
    child.on("error", (err) => resolve({ ok: false, error: { message: `could not start OpenClaw: ${err.message}` } }));
    child.on("close", () => {
      opts.signal?.removeEventListener("abort", onAbort);
      try {
        resolve(JSON.parse(stdout.slice(stdout.indexOf("{"))));
      } catch {
        resolve({ ok: false, error: { message: stderr.trim().split("\n").pop() || "OpenClaw produced no result" } });
      }
    });
  });
}

function buildReceipt(run: RunState, harness: string): Receipt {
  const completionTokens = sum(run.calls.map((c) => c.usage.completion_tokens || 0));
  const promptTokens = sum(run.calls.map((c) => c.usage.prompt_tokens || 0));
  const decodeSeconds = sum(run.calls.map((c) => c.time_info.completion_time || 0));
  const base: Omit<Receipt, "sha256"> = {
    runId: run.id,
    mode: run.mode,
    harness,
    model: `cerebras/${run.model}`,
    modelCalls: run.calls.length,
    completionTokens,
    promptTokens,
    decodeSeconds: round(decodeSeconds, 3),
    meanTps: decodeSeconds > 0 ? round(completionTokens / decodeSeconds, 1) : 0,
    peakTps: round(Math.max(0, ...run.calls.map((c) => c.tps)), 1),
    ttftMs: run.calls.find((c) => c.ttftMs != null)?.ttftMs ?? null,
    queueSeconds: round(run.queueMs / 1000, 2),
    wallSeconds: round((Date.now() - run.startedAt) / 1000, 2),
    toolCalls: run.toolCalls,
    startedAt: new Date(run.startedAt).toISOString(),
  };
  if (run.mode === "shopper") {
    base.giftsFound = run.gifts.length;
    base.giftsSourced = run.gifts.filter((g) => g.sourced).length;
    base.giftsLive = run.links.filter((s) => s === "live").length;
  }
  const sha256 = createHash("sha256").update(JSON.stringify(base)).digest("hex");
  return { ...base, sha256 };
}

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;
