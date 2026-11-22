"use client";
import { useMemo } from "react";
import { speed, type RunView } from "@/lib/use-run";

const GPU_TPS = 65; // reference figure for a typical GPU endpoint; modelled, not measured here
const FULL_WAFER_TPS = 2500;
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

/** Die positions of a wafer: a 19×19 grid clipped to a disc with an orientation flat, ordered centre-out. */
function useDies() {
  return useMemo(() => {
    const dies: { x: number; y: number; d: number }[] = [];
    const N = 19, S = 10, R = 93;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = 5 + i * S, y = 5 + j * S;
        const far = Math.max(
          Math.hypot(x - 100, y - 100), Math.hypot(x + S - 100, y - 100),
          Math.hypot(x - 100, y + S - 100), Math.hypot(x + S - 100, y + S - 100),
        );
        if (far > R || y + S > 184) continue;
        dies.push({ x, y, d: Math.hypot(x + S / 2 - 100, y + S / 2 - 100) });
      }
    }
    return dies.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x);
  }, []);
}

export function WaferSpeedometer({ view }: { view: RunView }) {
  const s = speed(view);
  const dies = useDies();
  const done = view.status === "done" && view.receipt;
  const queued = view.queue != null;

  let value = 0;
  let caption = "No run yet";
  let state = "IDLE";
  if (done) { value = view.receipt!.meanTps; caption = "Mean decode speed, reported by Cerebras"; state = "FINAL"; }
  else if (view.streaming && s.liveEst > 0) { value = s.liveEst; caption = "Live estimate. Final figure comes from Cerebras"; state = "DECODING"; }
  else if (s.last > 0) { value = s.last; caption = "Last model call, reported by Cerebras"; state = view.status === "running" ? "RUNNING" : "FINAL"; }
  else if (queued) { caption = "Queued at Cerebras. Decode has not started"; state = "QUEUED"; }
  else if (view.status === "running") { caption = "Starting the OpenClaw harness"; state = "BOOT"; }

  const lit = Math.round(Math.min(1, value / FULL_WAFER_TPS) * dies.length);
  const live = view.status === "running";

  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="label"><span className="idx">01</span>Decode speed</h2>
        <span className={`label ${live ? "!text-wc-hot" : ""}`}>
          <span className={live ? "blink" : ""}>■</span> {state}
        </span>
      </div>

      <div className="flex items-center gap-4 px-3 pb-3 pt-2">
        <div className="w-[38%] max-w-[210px] shrink-0">
          <svg viewBox="0 0 200 200" className={`w-full ${view.streaming ? "wafer-live" : ""}`} role="img" aria-label={`${fmt(value)} tokens per second`}>
            <path d="M 57.3 186 A 96 96 0 1 1 142.7 186 Z" fill="#0D0C0A" stroke="#4A443C" strokeWidth="1" />
            <g>
              {dies.map((d, i) => {
                const on = i < lit;
                const edge = on && i >= lit - Math.max(4, Math.round(lit * 0.07));
                return (
                  <rect
                    key={i} x={d.x + 0.9} y={d.y + 0.9} width="8.2" height="8.2"
                    className={on ? "die-lit" : undefined}
                    fill={on ? (edge ? "#FFE1CF" : "#FF5A1F") : "#171512"}
                    stroke={on ? "none" : "#2A2722"} strokeWidth="0.6"
                    style={{ transition: "fill 0.25s linear" }}
                  />
                );
              })}
            </g>
          </svg>
          <p className="label mt-0.5 text-center !text-[8.5px] !text-wc-fg-3">Full wafer = {fmt(FULL_WAFER_TPS)} tok/s</p>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-end gap-2">
            <span className="num tnum text-[104px] text-wc-bone">{fmt(value)}</span>
            <span className="mb-2 font-mono text-[11px] font-semibold leading-tight tracking-wider text-wc-hot">TOK<br />/SEC</span>
          </div>
          <p className="mt-1.5 text-[11.5px] leading-snug text-wc-fg-2">{caption}</p>
          <dl className="mt-2.5 grid grid-cols-2 border-l border-t border-wc-border">
            <Spec k="Peak" v={s.peak ? fmt(s.peak) : "—"} u="tok/s" />
            <Spec k="TTFT" v={view.ttftMs != null ? fmt(view.ttftMs) : "—"} u="ms" />
            <Spec k="Decode" v={s.seconds ? s.seconds.toFixed(2) : "—"} u="s" />
            <Spec k="Tokens" v={s.tokens ? fmt(s.tokens) : "—"} u="" />
          </dl>
        </div>
      </div>

      <Race tokens={s.tokens} seconds={s.seconds} mean={s.mean} running={live} />
    </section>
  );
}

function Spec({ k, v, u }: { k: string; v: string; u: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-r border-wc-border px-2 py-1">
      <dt className="label whitespace-nowrap !text-[8.5px] !tracking-[0.1em] !text-wc-fg-3">{k}</dt>
      <dd className="font-mono tnum text-[12.5px] font-medium text-wc-bone">
        {v}{u && <span className="ml-1 text-[9px] text-wc-fg-3">{u}</span>}
      </dd>
    </div>
  );
}

function Race({ tokens, seconds, mean, running }: { tokens: number; seconds: number; mean: number; running: boolean }) {
  const has = tokens > 0 && seconds > 0;
  const gpuSeconds = has ? tokens / GPU_TPS : 0;
  const gpuFrac = has ? Math.min(1, seconds / gpuSeconds) : 0;
  return (
    <div className="border-t border-wc-border px-3 pb-2.5 pt-2">
      <div className="flex items-end justify-between">
        <h3 className="label"><span className="idx">02</span>Same tokens, two machines</h3>
        {has && (
          <span className="num tnum text-[30px] text-wc-hot">
            {(mean / GPU_TPS).toFixed(1)}×<span className="ml-1.5 font-mono text-[10px] font-semibold tracking-wider">FASTER</span>
          </span>
        )}
      </div>
      <Lane name="CEREBRAS CS-3" note="measured, this run" right={has ? `${seconds.toFixed(2)} s` : "—"} frac={has ? 1 : 0} hot moving={running && has} />
      <Lane name={`GPU ENDPOINT`} note={`modelled at ${GPU_TPS} tok/s`} right={has ? `${(gpuFrac * 100).toFixed(0)}% done, needs ${gpuSeconds.toFixed(1)} s` : "—"} frac={gpuFrac} />
    </div>
  );
}

function Lane({ name, note, right, frac, hot, moving }: { name: string; note: string; right: string; frac: number; hot?: boolean; moving?: boolean }) {
  return (
    <div className="mt-1.5">
      <div className="flex items-baseline justify-between font-mono text-[10px]">
        <span><span className={`font-semibold tracking-wider ${hot ? "text-wc-bone" : "text-wc-fg-2"}`}>{name}</span> <span className="text-wc-fg-3">{note}</span></span>
        <span className="tnum text-wc-fg-2">{right}</span>
      </div>
      <div className="mt-1 h-[9px] border border-wc-border bg-wc-bg">
        <div
          className={moving ? "hatch h-full" : "h-full"}
          style={{ width: `${Math.max(frac * 100, frac > 0 ? 1.5 : 0)}%`, backgroundColor: hot ? "#FF5A1F" : "#6B6458", transition: "width 0.9s cubic-bezier(.2,.8,.2,1)" }}
        />
      </div>
    </div>
  );
}
