"use client";
import { useState } from "react";
import type { GiftCard, RunView } from "@/lib/use-run";
import type { Receipt } from "@/lib/types";

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const HANDLES = ["@andrewdfeldman", "@Kimi_Moonshot"];

export function SantaShopperArena({ view, busy, onRun }: { view: RunView; busy: boolean; onRun: (recipient: string) => void }) {
  const [custom, setCustom] = useState("");
  const [who, setWho] = useState<string>("");
  const run = (recipient: string) => { setWho(recipient); onRun(recipient); };
  const mine = view.mode === "shopper";
  const gifts = mine ? view.gifts : [];

  return (
    <section className="panel flex h-full min-h-0 flex-col">
      <div className="panel-head">
        <h2 className="label"><span className="idx">04</span>Santa&apos;s Speedy Shopper <span className="text-wc-fg-3">/ 5 real gifts, found live</span></h2>
        <span className="label !text-wc-fg-3">{mine && who ? `for ${who}` : gifts.length ? `${gifts.length}/5` : ""}</span>
      </div>

      <div className="flex flex-wrap items-stretch gap-2 border-b border-wc-border px-3 py-2.5">
        <button
          onClick={() => run("")}
          disabled={busy}
          className="bg-wc-hot px-4 py-2 font-display text-[19px] font-bold uppercase leading-none tracking-wide text-wc-bg transition hover:bg-wc-bone disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy && mine ? "Running…" : "Run the 5-gift hunt"}
        </button>
        {HANDLES.map((h) => (
          <button
            key={h}
            onClick={() => run(h)}
            disabled={busy}
            className="border border-wc-border-hi px-3 font-mono text-[11px] text-wc-bone transition hover:border-wc-hot hover:text-wc-hot disabled:cursor-not-allowed disabled:opacity-40"
          >
            {h}
          </button>
        ))}
        <form className="flex min-w-[220px] flex-1" onSubmit={(e) => { e.preventDefault(); if (custom.trim()) run(custom.trim()); }}>
          <label className="sr-only" htmlFor="recipient">X handle or who the gifts are for</label>
          <input
            id="recipient"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="@handle, or who it is for"
            className="min-w-0 flex-1 border border-r-0 border-wc-border bg-wc-bg px-3 font-mono text-[11px] text-wc-bone placeholder:text-wc-fg-3 focus:border-wc-hot focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || !custom.trim()}
            className="border border-wc-border-hi px-3 font-mono text-[11px] font-semibold uppercase tracking-wider text-wc-bone transition hover:border-wc-hot hover:text-wc-hot disabled:cursor-not-allowed disabled:opacity-40"
          >
            Hunt
          </button>
        </form>
      </div>

      <ol className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {Array.from({ length: 5 }, (_, i) =>
          gifts[i] ? <GiftRow key={gifts[i].gift.url} n={i + 1} card={gifts[i]} /> : <EmptyRow key={i} n={i + 1} active={mine && busy} />,
        )}
      </ol>

      {mine && view.error && (
        <p role="alert" className="border-t border-wc-bad px-3 py-2 font-mono text-[11px] text-wc-bad">{view.error}</p>
      )}
      {mine && view.status === "done" && gifts.length < 5 && (
        <p role="status" className="border-t border-wc-hot px-3 py-2 font-mono text-[11px] text-wc-hot">
          The agent returned {gifts.length} of 5 gifts on this run. Nothing is filled in for it; run it again.
        </p>
      )}
      {mine && view.receipt && <Ticket receipt={view.receipt} gifts={gifts} who={who} />}
    </section>
  );
}

const two = (n: number) => String(n).padStart(2, "0");

function EmptyRow({ n, active }: { n: number; active: boolean }) {
  return (
    <li className={`flex h-[84px] items-center gap-4 border-b border-wc-border px-3 ${active ? "scan" : ""}`}>
      <span className="num w-[50px] text-[46px] text-wc-border-hi">{two(n)}</span>
      <span className="label !text-wc-fg-3">{active ? "Searching real stores" : "Open slot"}</span>
    </li>
  );
}

/** Prefer a price the agent read from search results; otherwise the one the product page itself declares. */
function priceOf(card: GiftCard): { text: string; from: string } {
  const p = card.gift.price;
  if (p && /\d/.test(p)) return { text: p, from: "agent-read" };
  if (card.pagePrice) return { text: card.pagePrice, from: "page-read" };
  return { text: card.link === "checking" ? "…" : "—", from: card.link === "checking" ? "" : "see page" };
}

function GiftRow({ n, card }: { n: number; card: GiftCard }) {
  const { gift } = card;
  const price = priceOf(card);
  return (
    <li className="row-in flex items-center gap-4 border-b border-wc-border px-3 py-2.5">
      <span className="num w-[50px] shrink-0 text-[46px] text-wc-hot">{two(n)}</span>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-[16px] font-semibold leading-tight text-wc-bone" title={gift.name}>{gift.name}</h3>
        <p className="mt-0.5 truncate text-[12.5px] text-wc-fg-2" title={gift.reason}>{gift.reason}</p>
        <div className="mt-1.5 flex items-center gap-3 font-mono text-[9.5px] uppercase tracking-[0.08em]">
          <span className="shrink-0 font-semibold text-wc-bone">{gift.retailer}</span>
          <a href={gift.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate normal-case tracking-normal text-wc-fg-2 underline decoration-wc-border-hi underline-offset-2 hover:text-wc-hot hover:decoration-wc-hot">
            {gift.url.replace(/^https?:\/\/(www\.)?/, "")}
          </a>
          <Flag ok={card.sourced} yes="Live search" no="Not in search" />
          <LinkFlag card={card} />
        </div>
      </div>
      <div className="w-[132px] shrink-0 text-right">
        <div className="num tnum text-[32px] text-wc-bone">{price.text}</div>
        <div className="mt-1 font-mono tnum text-[9px] uppercase tracking-wider text-wc-fg-3">
          {price.from ? `${price.from} · ` : ""}+{(card.ms / 1000).toFixed(2)}s
        </div>
      </div>
    </li>
  );
}

function Flag({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
  return <span className={`shrink-0 ${ok ? "text-wc-ok" : "text-wc-bad"}`}>■ {ok ? yes : no}</span>;
}

function LinkFlag({ card }: { card: GiftCard }) {
  if (card.link === "checking") return <span className="blink shrink-0 text-wc-fg-3">□ Checking</span>;
  if (card.link === "live") return <span className="shrink-0 text-wc-ok">■ Page {card.http}</span>;
  if (card.link === "dead") return <span className="shrink-0 text-wc-bad">■ Missing {card.http}</span>;
  return <span className="shrink-0 text-wc-fg-3" title="The retailer refuses automated checks. Open the link to confirm the page.">□ Bot-walled</span>;
}

function Ticket({ receipt, gifts, who }: { receipt: Receipt; gifts: GiftCard[]; who: string }) {
  const [copied, setCopied] = useState(false);
  const isKimi = /kimi/i.test(receipt.model);
  const text = [
    `Santa's Speedy Shopper${who.startsWith("@") ? ` for ${who}` : ""}: OpenClaw + ${isKimi ? "Kimi K3.1 Pro" : receipt.model} on @Cerebras`,
    `${fmt(receipt.meanTps)} tok/s mean, ${fmt(receipt.peakTps)} peak (server-side decode), ${receipt.completionTokens.toLocaleString("en-US")} tokens in ${receipt.decodeSeconds.toFixed(2)}s`,
    ...gifts.map((g, i) => `${i + 1}. ${g.gift.name}${/\d/.test(priceOf(g).text) ? `, ${priceOf(g).text}` : ""} ${g.gift.url}`),
    `#KimiOnCerebras @Kimi_Moonshot`,
  ].join("\n");
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <div className="ticket row-in mx-3 mb-3 mt-2 shrink-0 px-4 py-2.5">
      <div className="flex items-center gap-5">
        <div>
          <div className="font-mono text-[8.5px] font-semibold uppercase tracking-[0.16em]">Benchmark receipt</div>
          <div className="num tnum mt-0.5 text-[58px]">{fmt(receipt.meanTps)}</div>
          <div className="mt-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.12em]">tok/s mean decode</div>
        </div>
        <dl className="grid flex-1 grid-cols-[auto_1fr] gap-x-4 gap-y-[3px] border-l border-dashed border-[#0A0908]/40 pl-5 font-mono text-[10px]">
          <Row k="Model" v={receipt.model} />
          <Row k="Harness" v={receipt.harness} />
          <Row k="Gifts" v={`${receipt.giftsSourced ?? 0} of ${receipt.giftsFound ?? 0} URLs from live search · ${receipt.giftsLive ?? 0} pages confirmed live`} />
          <Row k="Decode" v={`${receipt.completionTokens.toLocaleString("en-US")} tokens in ${receipt.decodeSeconds.toFixed(2)} s · peak call ${fmt(receipt.peakTps)} tok/s`} />
          <Row k="Wall" v={`${receipt.wallSeconds.toFixed(1)} s, of which ${receipt.queueSeconds.toFixed(1)} s in Cerebras queue`} />
          <Row k="Run" v={`${receipt.runId} · sha256 ${receipt.sha256.slice(0, 20)}`} />
        </dl>
        <button onClick={copy} className="shrink-0 bg-[#0A0908] px-4 py-3 font-display text-[17px] font-bold uppercase leading-none tracking-wide text-wc-bone transition hover:bg-wc-hot hover:text-[#0A0908]">
          {copied ? "Copied" : "Copy X reply"}
        </button>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="uppercase tracking-[0.12em] opacity-55">{k}</dt>
      <dd className="tnum truncate font-medium">{v}</dd>
    </>
  );
}
