"use client";
import { useEffect, useState } from "react";
import { BlockerSolverArena } from "@/components/BlockerSolverArena";
import { LogoMark, Wordmark } from "@/components/Logo";
import { OpenClawTerminal } from "@/components/OpenClawTerminal";
import { RunPipeline } from "@/components/RunPipeline";
import { SantaShopperArena } from "@/components/SantaShopperArena";
import { WaferSpeedometer } from "@/components/WaferSpeedometer";
import { useRun } from "@/lib/use-run";
import type { Mode } from "@/lib/types";

interface Status { openclaw: { installed: boolean; version: string | null }; cerebras: { keyPresent: boolean }; model: string }

export default function Page() {
  const [mode, setMode] = useState<Mode>("shopper");
  const [status, setStatus] = useState<Status | null>(null);
  const { view, start, reset } = useRun();
  const busy = view.status === "running";

  useEffect(() => {
    fetch("/api/openclaw/status").then((r) => r.json()).then(setStatus).catch(() => setStatus(null));
  }, []);

  const connected = Boolean(status?.openclaw.installed && status?.cerebras.keyPresent);
  const model = (view.model || status?.model || "cerebras/…").replace(/^cerebras\//, "");
  const harness = status == null ? "checking" : connected ? `ready · ${(status.openclaw.version || "").replace(/^OpenClaw\s+/, "").split(" ")[0]}` : status.openclaw.installed ? "no API key" : "not installed";

  return (
    <div className="flex min-h-screen flex-col lg:h-screen">
      <header className="flex flex-wrap items-stretch justify-between gap-x-6 border-b border-wc-border bg-wc-panel lg:h-[52px] lg:flex-nowrap">
        <div className="flex items-center gap-2.5 px-3 py-2">
          <LogoMark />
          <Wordmark />
        </div>

        <nav className="flex" aria-label="Mode">
          <Tab n="A" active={mode === "shopper"} onClick={() => setMode("shopper")}>Santa&apos;s Speedy Shopper</Tab>
          <Tab n="B" active={mode === "blocker"} onClick={() => setMode("blocker")}>Cross-Team Blocker &amp; PR Solver</Tab>
        </nav>

        <dl className="flex items-stretch font-mono text-[9.5px]">
          <Cell k="OpenClaw harness">
            <span className={connected ? "text-wc-ok" : "text-wc-bad"}>■ {harness}</span>
          </Cell>
          <Cell k="Model · Cerebras"><span className="text-wc-bone">{model}</span></Cell>
        </dl>
      </header>

      <RunPipeline view={view} onReset={reset} />

      <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 lg:grid-cols-12">
        <div className="flex min-h-0 flex-col gap-3 lg:col-span-5">
          <WaferSpeedometer view={view} />
          <OpenClawTerminal view={view} />
        </div>
        <div className="min-h-0 lg:col-span-7">
          {mode === "shopper" ? (
            <SantaShopperArena view={view} busy={busy} onRun={(recipient) => start({ mode: "shopper", recipient })} />
          ) : (
            <BlockerSolverArena view={view} busy={busy} onRun={(material) => start({ mode: "blocker", material })} />
          )}
        </div>
      </main>
    </div>
  );
}

function Tab({ n, active, onClick, children }: { n: string; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-2 border-b-[3px] px-4 font-display text-[18px] font-bold uppercase leading-none tracking-wide transition ${
        active ? "border-wc-hot text-wc-bone" : "border-transparent text-wc-fg-3 hover:text-wc-fg-2"
      }`}
    >
      <span className={`font-mono text-[9px] font-semibold ${active ? "text-wc-hot" : ""}`}>{n}</span>
      {children}
    </button>
  );
}

function Cell({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col justify-center border-l border-wc-border px-3 py-1.5">
      <dt className="uppercase tracking-[0.14em] text-wc-fg-3" style={{ fontSize: 8 }}>{k}</dt>
      <dd className="mt-0.5 font-medium">{children}</dd>
    </div>
  );
}
