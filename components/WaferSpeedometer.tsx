"use client";
import { useMemo } from "react";
import { speed, type RaceView, type RunView } from "@/lib/use-run";

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
  else if (queued) { caption = `Queued at Cerebras for ${(view.queue!.waitedMs / 1000).toFixed(0)} s. Decode has not started`; state = "QUEUED"; }
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
            <defs>
              <clipPath id="wafer-clip"><path d="M 57.3 186 A 96 96 0 1 1 142.7 186 Z" /></clipPath>
              <linearGradient id="sweep-fade" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#FF5A1F" stopOpacity="0" />
                <stop offset="1" stopColor="#FF5A1F" stopOpacity="0.5" />
              </linearGradient>
            </defs>
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
            {live && (
              /* Probe sweep: shows the run is alive while it boots, searches or waits in the queue. */
              <g clipPath="url(#wafer-clip)">
                <g className="wafer-sweep">
                  <path d="M 100 100 L 32.1 32.1 A 96 96 0 0 1 100 4 Z" fill="url(#sweep-fade)" />
                  <line x1="100" y1="100" x2="100" y2="4" stroke="#FFE1CF" strokeWidth="1.4" />
                </g>
              </g>
            )}
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
            <Spec k="1st token*" v={view.ttftMs != null ? fmt(view.ttftMs) : "—"} u="ms" />
            <Spec k="Decode" v={s.seconds ? s.seconds.toFixed(2) : "—"} u="s" />
            <Spec k="Tokens" v={s.tokens ? fmt(s.tokens) : "—"} u="" />
          </dl>
          <p className="mt-1 text-[9px] leading-snug text-wc-fg-3">Peak, decode and tokens are Cerebras&apos;s figures. *Timed here, after its queue, first call.</p>
        </div>
      </div>

      <Race view={view} />
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

/**
 * Panel 02. With rival providers configured this is a real race: one identical request goes to
 * Cerebras and to each rival at the same moment, and every stream is timed the same way.
 * Without a rival it shows only this run's own model calls. Nothing is modelled.
 */
function Race({ view }: { view: RunView }) {
  const races = view.races.filter(Boolean);
  if (races.length === 0) return <Calls view={view} />;
  const me = races.find((r) => r.self) || null;
  const rivals = races.filter((r) => !r.self);
  const finished = (r: RaceView) => r.state === "done" && r.tps > 0;
  const settled = races.every((r) => r.state !== "running");
  // The headline compares Cerebras with the FASTEST rival, never a slower one.
  const fastest = rivals.filter(finished).reduce<RaceView | null>((a, r) => (!a || r.tps > a.tps ? r : a), null);
  const top = Math.max(1, ...races.map((r) => r.tps));
  // A multiplier is only honest when every lane ran the same model.
  const sameModel = me != null && rivals.every((r) => sameModelName(r.model, me.model));
  // ...and asked for the same reasoning effort, so the request really was identical.
  const sameReasoning = me != null && rivals.every((r) => r.reasoning === me.reasoning);
  const comparable = sameModel && sameReasoning && settled && me != null && finished(me) && fastest != null;
  const ratio = comparable ? me!.tps / fastest!.tps : 1;
  // Three identical requests to one endpoint differed by up to 10% in testing, so anything inside
  // that band is a tie, and is called one.
  const verdict = ratio >= 1.1 ? "faster than" : ratio <= 0.9 ? "slower than" : "level with";
  const others = comparable ? rivals.filter((r) => finished(r) && r !== fastest) : [];
  const approx = comparable && (!me!.exact || !fastest!.exact);
  return (
    <div className="border-t border-wc-border px-3 pb-2.5 pt-2">
      <div className="flex items-end justify-between gap-3">
        <h3 className="label whitespace-nowrap"><span className="idx">02</span>Same request, {races.length} providers</h3>
        {me != null && (!sameModel || !sameReasoning) && (
          <span className="font-mono text-[9.5px] font-semibold uppercase tracking-wider text-wc-bad">
            different {!sameModel ? "models" : "reasoning settings"} · not comparable
          </span>
        )}
        {comparable && (
          <span className="flex items-baseline gap-1.5 whitespace-nowrap">
            <span className="num tnum text-[30px] text-wc-hot">
              {approx ? "~" : ""}{verdict === "level with" ? ratio.toFixed(2) : (ratio >= 1 ? ratio : 1 / ratio).toFixed(1)}×
            </span>
            {/* Names the rival compared. It is the fastest one that produced a result, never a slower one. */}
            <span className="font-mono text-[9.5px] font-semibold uppercase tracking-wider text-wc-hot">
              {verdict} {fastest!.label}
            </span>
          </span>
        )}
      </div>
      {others.length > 0 && (
        <p className="text-right font-mono text-[9.5px] font-semibold uppercase tracking-wider text-wc-fg-2">
          {others
            .map((r) => {
              const q = me!.tps / r.tps;
              return `${(q >= 1 ? q : 1 / q).toFixed(1)}× ${q >= 1 ? "faster" : "slower"} than ${r.label}`;
            })
            .join(" · ")}
        </p>
      )}
      {races.map((race, i) => (
        <Lane
          key={i}
          name={race.label.toUpperCase()}
          hot={race.self}
          stack
          failed={race.state === "failed"}
          note={
            race.state === "failed"
              ? String(race.error || "request failed")
              : [
                  race.self ? race.model : "",
                  race.servedBy && !race.label.toLowerCase().includes(race.servedBy.toLowerCase()) ? `served by ${race.servedBy}` : "",
                  race.note,
                  race.self && race.serverTps ? `its own server reports ${fmt(race.serverTps)} tok/s for this request` : "",
                ].filter(Boolean).join(" · ")
          }
          right={
            race.state === "failed" ? "no result"
            : race.state === "running"
              ? race.tokens > 0 ? `${fmt(race.tps)} tok/s so far · ${fmt(race.tokens)} tokens`
                : race.waitedMs > 0 ? `queue full, waiting ${(race.waitedMs / 1000).toFixed(0)} s` : "waiting for first token"
              : `${fmt(race.tps)} tok/s · ${race.exact ? "" : "about "}${fmt(race.counted)} tokens in ${race.seconds.toFixed(2)} s`
          }
          frac={race.tps / top}
          moving={race.state === "running" && race.tokens > 0}
        />
      ))}
      <p className="mt-1.5 text-[9.5px] leading-snug text-wc-fg-3">
        {!sameModel && me != null ? `NOT like for like: Cerebras ran ${me.model}, rivals ran ${rivals.map((r) => r.model).join(", ")}. ` : ""}
        {sameModel && !sameReasoning && me != null ? `NOT like for like: reasoning was ${races.map((r) => `${r.label} ${r.reasoning}`).join(", ")}. ` : ""}
        One identical request ({view.mode === "shopper" ? "a tool-free version of this task" : "the prompt the agent received"}
        {sameModel ? `, same model: ${rivals[0]?.model ?? ""}` : ""}, same output cap{sameReasoning && me != null ? `, reasoning ${me.reasoning}` : ""}) goes to every provider as the run starts. Each stream is timed the same way here: tokens after the first
        chunk, over the time from first chunk to last{races.some((r) => r.state === "done" && !r.exact) ? " (\u201cabout\u201d marks a count estimated from text length)" : ""}.
        Queue and time to first token are not included. The line under each rival is its public description, not a measurement.
      </p>
    </div>
  );
}

/** True when two provider-specific ids name the same model, e.g. "moonshotai-kimi-k3.1-pro-trial" and "moonshotai/Kimi-K3.1-Pro". */
function sameModelName(a: string, b: string): boolean {
  const norm = (m: string) =>
    m.toLowerCase().replace(/^cerebras\//, "").replace(/[-:](trial|highspeed|batch)$/, "").replace(/[^a-z0-9]/g, "");
  const x = norm(a), y = norm(b);
  return x !== "" && y !== "" && (x === y || x.endsWith(y) || y.endsWith(x));
}

/** This run's own model calls, each with the speed Cerebras reported for it. */
function Calls({ view }: { view: RunView }) {
  const top = Math.max(1, ...view.calls.map((c) => c.tps));
  return (
    <div className="border-t border-wc-border px-3 pb-2.5 pt-2">
      <h3 className="label"><span className="idx">02</span>Model calls, this run</h3>
      {view.calls.length === 0 && <p className="mt-1.5 font-mono text-[10px] text-wc-fg-3">Each call the agent makes to Cerebras appears here with its reported speed.</p>}
      {view.calls.slice(-4).map((c) => (
        <Lane key={c.call} name={`CALL ${c.call}`} note={`${fmt(c.tokens)} tokens in ${c.seconds.toFixed(2)} s`} right={`${fmt(c.tps)} tok/s`} frac={c.tps / top} hot />
      ))}
    </div>
  );
}

function Lane({ name, note, right, frac, hot, moving, failed, stack }: {
  name: string; note: string; right: string; frac: number; hot?: boolean; moving?: boolean; failed?: boolean;
  /** Put the note on its own line under the name instead of beside it. */
  stack?: boolean;
}) {
  const noteCls = failed ? "text-wc-bad" : "text-wc-fg-3";
  return (
    <div className="mt-1.5">
      <div className="flex items-baseline justify-between gap-3 font-mono text-[10px]">
        <span className="min-w-0 truncate" title={note}>
          <span className={`font-semibold tracking-wider ${hot ? "text-wc-bone" : "text-wc-fg-2"}`}>{name}</span>
          {!stack && <> <span className={noteCls}>{note}</span></>}
        </span>
        <span className="tnum shrink-0 text-wc-fg-2">{right}</span>
      </div>
      {stack && note && <div className={`truncate font-mono text-[9px] leading-tight ${noteCls}`} title={note}>{note}</div>}
      <div className="mt-1 h-[9px] border border-wc-border bg-wc-bg">
        <div
          className={moving ? "hatch h-full" : "h-full"}
          style={{ width: `${Math.max(frac * 100, frac > 0 ? 1.5 : 0)}%`, backgroundColor: hot ? "#FF5A1F" : "#6B6458", transition: "width 0.6s cubic-bezier(.2,.8,.2,1)" }}
        />
      </div>
    </div>
  );
}
