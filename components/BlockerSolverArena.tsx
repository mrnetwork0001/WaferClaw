"use client";
import { useMemo, useState } from "react";
import { SAMPLE_INCIDENT } from "@/lib/blocker-scenarios";
import type { RunView } from "@/lib/use-run";

interface Blocker { title: string; severity?: string; teams?: string[]; rootCause?: string; evidence?: { team: string; quote: string }[] }
interface Analysis { blockers?: Blocker[]; nextSteps?: Record<string, string> }

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const TEAM_CODE: Record<string, string> = { Engineering: "ENG", Support: "SUP", Product: "PRD" };

/** Splits the model's marker-delimited answer; works on partial text while it is still streaming. */
function parse(content: string) {
  const section = (name: string) => {
    const start = content.indexOf(`<<<${name}>>>`);
    if (start < 0) return "";
    const from = start + name.length + 6;
    const next = content.indexOf("<<<", from);
    return content.slice(from, next < 0 ? undefined : next).trim();
  };
  let analysis: Analysis | null = null;
  const raw = section("ANALYSIS_JSON");
  if (raw) { try { analysis = JSON.parse(raw); } catch { analysis = null; } }
  return { analysis, analysisPending: Boolean(raw) && !analysis, title: section("PR_TITLE"), body: section("PR_BODY"), diff: section("PR_DIFF").replace(/^```(diff)?\n?|```$/g, "") };
}

export function BlockerSolverArena({ view, busy, onRun }: { view: RunView; busy: boolean; onRun: (material?: string) => void }) {
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const [copied, setCopied] = useState(false);
  const mine = view.mode === "blocker";
  const parsed = useMemo(() => parse(mine ? view.content : ""), [mine, view.content]);
  const blockers = parsed.analysis?.blockers ?? [];
  const steps = parsed.analysis?.nextSteps ?? {};

  const copyPr = async () => {
    await navigator.clipboard.writeText(`${parsed.title}\n\n${parsed.body}\n\n${parsed.diff}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <section className="panel flex h-full min-h-0 flex-col">
      <div className="panel-head">
        <h2 className="label whitespace-nowrap"><span className="idx">04</span>Cross-team blocker &amp; PR solver <span className="text-wc-fg-3">/ after{" "}
          <a className="underline underline-offset-2 hover:text-wc-hot" href="https://x.com/andrewdfeldman/status/2122694244561276984" target="_blank" rel="noreferrer">@andrewdfeldman</a></span>
        </h2>
        <span className="label !text-wc-fg-3">{customOpen && custom.trim() ? "your material" : "fictional sample input"}</span>
      </div>

      <div className="border-b border-wc-border px-3 py-2.5">
        <div className="flex items-stretch gap-2">
          <button
            onClick={() => onRun(customOpen && custom.trim() ? custom : undefined)}
            disabled={busy}
            className="bg-wc-hot px-4 py-2 font-display text-[19px] font-bold uppercase leading-none tracking-wide text-wc-bg transition hover:bg-wc-bone disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy && mine ? "Auditing…" : customOpen && custom.trim() ? "Run audit on your pasted material" : "Run OpenClaw blocker audit"}
          </button>
          <button onClick={() => setCustomOpen((v) => !v)} className="border border-wc-border-hi px-3 font-mono text-[11px] text-wc-bone transition hover:border-wc-hot hover:text-wc-hot">
            {customOpen ? "Back to the sample incident" : "Paste your own"}
          </button>
          <p className="ml-auto max-w-[36ch] self-center text-right text-[11.5px] leading-snug text-wc-fg-2">Three teams each hold part of the answer. The agent finds what is stuck between them.</p>
        </div>
        {customOpen ? (
          <textarea
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            aria-label="Your own GitHub, Slack and doc excerpts"
            spellCheck={false}
            placeholder="Paste GitHub issues, Slack threads and doc excerpts here. Left empty, the audit runs on the sample incident."
            className="scroll-thin mt-2 h-[92px] w-full resize-none border border-wc-border bg-wc-bg p-2 font-mono text-[10.5px] text-wc-bone placeholder:text-wc-fg-3 focus:border-wc-hot focus:outline-none"
          />
        ) : (
          <div className="mt-2 grid grid-cols-1 border-l border-wc-border md:grid-cols-3">
            {SAMPLE_INCIDENT.map((s) => (
              <div key={s.team} className="border-b border-r border-t border-wc-border px-2.5 py-1.5">
                <div className="label !text-[8.5px]"><span className="font-semibold text-wc-bone">{TEAM_CODE[s.team]}</span> {s.system}</div>
                <div className="mt-0.5 truncate text-[12px] font-semibold text-wc-bone">{s.title}</div>
                <pre className="scroll-thin mt-1 h-[46px] overflow-y-auto whitespace-pre-wrap font-mono text-[9px] leading-snug text-wc-fg-3">{s.body}</pre>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
        <div className="scroll-thin min-h-0 overflow-y-auto border-wc-border lg:border-r">
          {blockers.length === 0 && (
            <div className={`flex h-[84px] items-center gap-4 border-b border-wc-border px-3 ${mine && busy ? "scan" : ""}`}>
              <span className="num w-[50px] text-[46px] text-wc-border-hi">B1</span>
              <span className="label !text-wc-fg-3">
                {mine && busy ? (parsed.analysisPending ? "Writing the analysis" : "Reading the three sources") : "Run the audit to correlate the three sources"}
              </span>
            </div>
          )}
          {blockers.map((b, i) => (
            <article key={i} className="row-in flex gap-4 border-b border-wc-border px-3 py-2.5">
              <span className="num w-[50px] shrink-0 text-[46px] text-wc-hot">B{i + 1}</span>
              <div className="min-w-0">
                <h4 className="text-[14.5px] font-semibold leading-snug text-wc-bone">
                  {b.severity && <span className="mr-2 bg-wc-bad px-1 py-px align-middle font-mono text-[9px] font-bold text-wc-bg">{b.severity}</span>}
                  {b.title}
                </h4>
                <p className="mt-1 text-[12.5px] leading-snug text-wc-fg-2">{b.rootCause}</p>
                <ul className="mt-1.5 space-y-0.5">
                  {(b.evidence ?? []).slice(0, 3).map((e, j) => (
                    <li key={j} className="font-mono text-[9.5px] leading-snug text-wc-fg-3">
                      <span className="font-semibold text-wc-bone">{TEAM_CODE[e.team] || e.team}</span> “{e.quote}”
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
          {Object.keys(steps).length > 0 && (
            <div className="row-in px-3 py-2.5">
              <h3 className="label">Next step per team</h3>
              <dl className="mt-1.5 grid grid-cols-[40px_1fr] gap-x-2 gap-y-1.5">
                {Object.entries(steps).map(([team, step]) => (
                  <div key={team} className="contents">
                    <dt className="pt-0.5 font-mono text-[10px] font-semibold text-wc-hot">{TEAM_CODE[team] || team}</dt>
                    <dd className="text-[12.5px] leading-snug text-wc-bone">{step}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          {mine && view.error && <p role="alert" className="border-t border-wc-bad px-3 py-2 font-mono text-[11px] text-wc-bad">{view.error}</p>}
        </div>

        <div className="flex min-h-0 flex-col">
          <div className="flex items-center justify-between gap-2 border-b border-wc-border px-3 py-1.5">
            <div className="min-w-0">
              <div className="label !text-[8.5px] !text-wc-fg-3">Draft pull request</div>
              <div className="truncate text-[13px] font-semibold text-wc-bone">{parsed.title || "—"}</div>
            </div>
            <button onClick={copyPr} disabled={!parsed.diff} className="shrink-0 border border-wc-border-hi px-2.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-wc-bone transition hover:border-wc-hot hover:text-wc-hot disabled:opacity-30">
              {copied ? "Copied" : "Copy PR"}
            </button>
          </div>
          {parsed.body && <p className="scroll-thin max-h-[84px] shrink-0 overflow-y-auto whitespace-pre-wrap border-b border-wc-border px-3 py-1.5 text-[11.5px] leading-snug text-wc-fg-2">{parsed.body.replace(/\*\*/g, "")}</p>}
          <pre className="scroll-thin min-h-0 flex-1 overflow-auto bg-wc-bg px-3 py-2 font-mono text-[10.5px] leading-[1.6]">
            {parsed.diff
              ? parsed.diff.split("\n").map((line, i) => <DiffLine key={i} line={line} />)
              : <span className="text-wc-fg-3">The generated git diff streams in here.</span>}
          </pre>
          {mine && view.receipt && (
            <div className="ticket row-in mx-3 mb-3 mt-2 flex shrink-0 items-baseline gap-4 px-3 py-1.5 font-mono text-[10px]">
              <span className="num tnum text-[30px]">{view.receipt.wallSeconds.toFixed(1)}s</span>
              <span className="font-semibold uppercase tracking-wider">wall time, of which {view.receipt.queueSeconds.toFixed(1)} s queue</span>
              <span className="font-medium">{fmt(view.receipt.meanTps)} tok/s mean · {fmt(view.receipt.completionTokens)} tokens · {view.receipt.model}</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function DiffLine({ line }: { line: string }) {
  let cls = "text-wc-fg-2";
  if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("diff ") || line.startsWith("index ")) cls = "text-wc-fg-3";
  else if (line.startsWith("@@")) cls = "text-wc-hot";
  else if (line.startsWith("+")) cls = "bg-wc-ok/10 text-wc-ok";
  else if (line.startsWith("-")) cls = "bg-wc-bad/10 text-wc-bad";
  return <div className={cls}>{line || " "}</div>;
}
