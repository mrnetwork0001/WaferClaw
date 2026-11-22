// Spawns the real OpenClaw harness (project-local, isolated install) for one agent turn and turns
// what happens into WaferClaw run events. The model calls OpenClaw makes are routed through the
// pass-through proxy at /api/cerebras/<runId>/v1, which is where usage + time_info are captured.
import { spawn, execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRun, emit, type RunState } from "./bus";
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

