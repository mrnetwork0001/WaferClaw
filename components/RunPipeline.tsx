"use client";
import { useEffect, useState } from "react";
import type { RunView } from "@/lib/use-run";

type StageState = "pending" | "active" | "done";
interface Stage { key: string; label: string; hint: string; state: StageState }

/** Works out which step of the agent loop is happening right now, and which have already happened. */
function stages(view: RunView): Stage[] {
  const running = view.status === "running";
  const shopper = view.mode === "shopper";
  const decoding = view.streaming && view.liveStartMs != null;
  const waitingOnCerebras = view.queue != null || (view.streaming && view.liveStartMs == null);
  const checking = view.gifts.some((g) => g.link === "checking");
  const draftingPr = !shopper && view.content.includes("<<<PR_DIFF>>>");
  // Name the step after the model that is actually running (a fallback model is not Kimi).
  const decodeLabel = !view.model || /kimi/i.test(view.model) ? "Kimi decode" : "Model decode";

  let active = "";
  if (running) {
    if (waitingOnCerebras) active = "queue";
    else if (decoding) active = draftingPr ? "output" : "decode";
    else if (shopper && checking) active = "output";
    else if (shopper && view.calls.length > 0) active = "tools";
    else active = "boot";
  }

  const seen: Record<string, boolean> = {
    boot: view.runId != null,
    tools: view.toolCalls > 0,
    queue: view.queuedEver || view.calls.length > 0,
    decode: view.calls.length > 0 || decoding,
    output: shopper ? view.gifts.length > 0 : draftingPr,
    receipt: view.receipt != null,
  };

  const list: [string, string, string][] = shopper
    ? [
        ["boot", "Harness boot", "openclaw agent exec"],
        ["tools", "Web search", `${view.toolCalls} tool calls`],
        ["queue", "Cerebras queue", view.queue ? `waiting ${(view.queue.waitedMs / 1000).toFixed(0)}s` : "slot"],
        ["decode", decodeLabel, `${view.calls.length} model calls`],
        ["output", "Link check", `${view.gifts.length}/5 gifts`],
        ["receipt", "Receipt", "server time_info"],
      ]
    : [
        ["boot", "Harness boot", "openclaw agent exec"],
        ["queue", "Cerebras queue", view.queue ? `waiting ${(view.queue.waitedMs / 1000).toFixed(0)}s` : "slot"],
        ["decode", decodeLabel, "analysis"],
        ["output", "Draft PR", "git diff"],
        ["receipt", "Receipt", "server time_info"],
      ];

  return list.map(([key, label, hint]) => ({
    key, label, hint,
    // A step is done only if it actually happened on this run.
    state: key === active ? "active" : seen[key] ? "done" : "pending",
  }));
}

function useClock(view: RunView): number {
  const [now, setNow] = useState(0);
  const running = view.status === "running";
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [running]);
  if (running && view.startedAt != null) return Math.max(view.elapsedMs, now - view.startedAt);
  return view.elapsedMs;
}

export function RunPipeline({ view, onReset }: { view: RunView; onReset: () => void }) {
  const list = stages(view);
  const ms = useClock(view);
  const running = view.status === "running";
  const idle = view.status === "idle";
  const secs = ms / 1000;
  const clock = `${String(Math.floor(secs / 60)).padStart(2, "0")}:${(secs % 60).toFixed(1).padStart(4, "0")}`;

  return (
    <div className="flex items-stretch border-b border-wc-border bg-wc-panel">
      <ol className="flex min-w-0 flex-1 items-stretch" aria-label="Run progress">
        {list.map((s, i) => (
          <li
            key={s.key}
            aria-current={s.state === "active" ? "step" : undefined}
            className={`relative flex min-w-0 flex-1 items-center gap-2.5 border-r border-wc-border px-3 py-1.5 ${s.state === "active" ? "bg-wc-hot/[0.07]" : ""}`}
          >
            <span
              className={`h-2.5 w-2.5 shrink-0 ${
                s.state === "active" ? "blink bg-wc-hot" : s.state === "done" ? "bg-wc-bone" : "border border-wc-border-hi"
              }`}
            />
            <span className="min-w-0">
              <span className={`block truncate font-display text-[15px] font-bold uppercase leading-none tracking-wide ${
                s.state === "active" ? "text-wc-hot" : s.state === "done" ? "text-wc-bone" : "text-wc-fg-3"
              }`}>
                <span className="mr-1.5 font-mono text-[8px] font-semibold opacity-70">{i + 1}</span>{s.label}
              </span>
              <span className="mt-0.5 block truncate font-mono text-[8.5px] uppercase tracking-[0.1em] text-wc-fg-3">{s.hint}</span>
            </span>
            {s.state === "active" && <span className="hatch absolute inset-x-0 bottom-0 h-[3px] bg-wc-hot" />}
            {s.state === "done" && <span className="absolute inset-x-0 bottom-0 h-[3px] bg-wc-bone/70" />}
          </li>
        ))}
      </ol>
      <div className="flex shrink-0 items-center gap-3 px-3">
        <div className="text-right">
          <div className={`num tnum text-[26px] ${running ? "text-wc-hot" : "text-wc-bone"}`}>{clock}</div>
          <div className="font-mono text-[8px] uppercase tracking-[0.14em] text-wc-fg-3">{running ? "elapsed" : idle ? "ready" : "wall time"}</div>
        </div>
        <button
          onClick={onReset}
          disabled={idle}
          className="border border-wc-border-hi px-3 py-2 font-display text-[15px] font-bold uppercase leading-none tracking-wide text-wc-bone transition hover:border-wc-hot hover:text-wc-hot disabled:cursor-not-allowed disabled:opacity-30"
        >
          {running ? "Stop" : "Reset"}
        </button>
      </div>
    </div>
  );
}
