// In-memory run registry shared by the run route (which spawns OpenClaw) and the
// Cerebras pass-through proxy route (which OpenClaw's model calls flow through).
import type { Gift, RunEvent, TimedEvent, TimeInfo, Usage, Mode } from "./types";

export interface CallRecord {
  call: number;
  usage: Usage;
  time_info: TimeInfo;
  tps: number;
  ttftMs: number | null;
}

export interface RunState {
  id: string;
  mode: Mode;
  model: string;
  startedAt: number;
  events: TimedEvent[];
  listeners: Set<(e: TimedEvent) => void>;
  callSeq: number;
  calls: CallRecord[];
  toolCalls: number;
  /** All tool-result text the agent has received so far (used to check a gift URL was really found on the web). */
  toolText: string;
  /** Assistant content accumulated across calls. */
  content: string;
  gifts: { gift: Gift; sourced: boolean }[];
  queueMs: number;
  /** In-flight link checks, awaited before the receipt is cut. */
  pending: Promise<void>[];
  links: string[];
  closed: boolean;
}

const g = globalThis as unknown as { __waferclawRuns?: Map<string, RunState> };
const runs: Map<string, RunState> = (g.__waferclawRuns ??= new Map());

export function createRun(id: string, mode: Mode, model: string): RunState {
  const run: RunState = {
    id, mode, model,
    startedAt: Date.now(),
    events: [],
    listeners: new Set(),
    callSeq: 0,
    calls: [],
    toolCalls: 0,
    toolText: "",
    content: "",
    gifts: [],
    queueMs: 0,
    pending: [],
    links: [],
    closed: false,
  };
  runs.set(id, run);
  // Keep the registry small.
  if (runs.size > 20) {
    const oldest = [...runs.keys()][0];
    runs.delete(oldest);
  }
  return run;
}

export function getRun(id: string): RunState | undefined {
  return runs.get(id);
}

export function emit(run: RunState, e: RunEvent): void {
  if (run.closed) return;
  const timed = { ...e, ms: Date.now() - run.startedAt } as TimedEvent;
  run.events.push(timed);
  for (const l of run.listeners) l(timed);
  if (e.t === "done") run.closed = true;
}
