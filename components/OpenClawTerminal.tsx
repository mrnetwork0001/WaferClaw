"use client";
import { useEffect, useRef } from "react";
import type { RunView } from "@/lib/use-run";

const TAG: Record<string, { text: string; cls: string }> = {
  "OPENCLAW:INIT": { text: "openclaw:init", cls: "text-wc-fg-3" },
  "OPENCLAW:TOOL": { text: "openclaw:tool", cls: "text-wc-fg-2" },
  "OPENCLAW:STREAM": { text: "openclaw:stream", cls: "text-wc-bone" },
  "OPENCLAW:RECEIPT": { text: "openclaw:receipt", cls: "text-wc-ok" },
  "OPENCLAW:VERIFY": { text: "openclaw:verify", cls: "text-wc-ok" },
  "CEREBRAS:QUEUE": { text: "cerebras:queue", cls: "text-wc-hot" },
  RACE: { text: "race", cls: "text-wc-fg-2" },
  ERROR: { text: "error", cls: "text-wc-bad" },
};

export function OpenClawTerminal({ view }: { view: RunView }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [view.logs]);

  return (
    <section className="panel flex min-h-0 flex-1 flex-col">
      <div className="panel-head">
        <h2 className="label"><span className="idx">03</span>Harness log</h2>
        <span className="label !text-wc-fg-3">{view.runId ? `run ${view.runId}` : "standing by"}</span>
      </div>
      <div ref={ref} className="scroll-thin min-h-[120px] flex-1 overflow-y-auto px-3 py-2 font-mono text-[10.5px] leading-[1.7]">
        {view.logs.length === 0 && (
          <p className="max-w-[46ch] text-wc-fg-3">
            Each line comes from a real <span className="text-wc-bone">openclaw agent exec</span> process, from a model call it makes to Cerebras, or from the speed race sent beside it.
          </p>
        )}
        {view.logs.map((l) => {
          const tag = TAG[l.tag] || { text: l.tag.toLowerCase(), cls: "text-wc-fg-2" };
          return (
            <div key={l.id} className="grid grid-cols-[44px_122px_1fr] gap-x-2">
              <span className="tnum text-right text-wc-fg-3">{(l.ms / 1000).toFixed(2)}</span>
              <span className={tag.cls}>{tag.text}</span>
              <span className={`min-w-0 break-words ${l.tag === "ERROR" ? "text-wc-bad" : l.live ? "text-wc-fg-2" : "text-wc-fg"}`}>
                {l.text}{l.live && <span className="blink text-wc-hot"> █</span>}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
