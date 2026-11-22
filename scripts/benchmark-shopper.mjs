#!/usr/bin/env node
// Santa's Speedy Shopper in the terminal.
// Drives the running WaferClaw server (which spawns the real OpenClaw harness on Kimi K3.1 Pro
// via Cerebras) and prints the gifts and the server-reported speed numbers as an ASCII table.
// Usage: npm run dev   (in one terminal)
//        npm run bounty [-- "@handle or who the gifts are for"]
// Note: the official Speed Bounty number comes from the patched OpenClaw web chat (see
// OPENCLAW_SETUP.md). This table is the same task measured from the same Cerebras time_info.

const base = process.env.WAFERCLAW_URL || "http://127.0.0.1:3210";
const recipient = process.argv.slice(2).join(" ");
const C = { o: "\x1b[38;5;208m", c: "\x1b[36m", g: "\x1b[32m", r: "\x1b[31m", d: "\x1b[2m", b: "\x1b[1m", x: "\x1b[0m" };
const fmt = (n) => Math.round(n).toLocaleString("en-US");
const pad = (s, n) => { s = String(s); return s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n); };

console.log(`${C.o}${C.b}WaferClaw · Santa's Speedy Shopper${C.x}  ${C.d}OpenClaw harness → Cerebras Inference${C.x}`);
console.log(`${C.d}recipient: ${recipient || "tech & maker enthusiast (default)"}${C.x}\n`);

let res;
try {
  res = await fetch(`${base}/api/openclaw/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode: "shopper", recipient }),
  });
} catch {
  console.error(`${C.r}Could not reach ${base}. Start the app first: npm run dev${C.x}`);
  process.exit(1);
}
if (!res.ok || !res.body) { console.error(`${C.r}Run failed to start (HTTP ${res.status})${C.x}`); process.exit(1); }

const gifts = [];
const links = [];
const calls = [];
const lanes = [];   // the speed race: one lane per provider that got the identical request
let receipt = null, error = null, queued = false;
const decoder = new TextDecoder();
let buf = "";
const stamp = (ms) => `${C.d}+${(ms / 1000).toFixed(2).padStart(6)}s${C.x}`;

for await (const chunk of res.body) {
  buf += decoder.decode(chunk, { stream: true });
  let i;
  while ((i = buf.indexOf("\n\n")) >= 0) {
    const raw = buf.slice(0, i); buf = buf.slice(i + 2);
    if (!raw.startsWith("data:")) continue;
    const e = JSON.parse(raw.slice(5));
    if (e.t === "init") console.log(`${stamp(e.ms)} ${C.c}[OPENCLAW:INIT]${C.x} ${e.harness} · ${e.model}\n${" ".repeat(9)}${C.d}$ ${e.command}${C.x}`);
    else if (e.t === "queue") { if (!queued) console.log(`${stamp(e.ms)} ${C.o}[CEREBRAS:QUEUE]${C.x} endpoint busy (429), waiting…`); queued = true; }
    else if (e.t === "tool_call") console.log(`${stamp(e.ms)} ${C.c}[OPENCLAW:TOOL]${C.x} ${e.name} ${pad(e.args, 80)}`);
    else if (e.t === "call_end") { queued = false; calls.push(e); console.log(`${stamp(e.ms)} ${C.c}[OPENCLAW:STREAM]${C.x} call #${e.call}: ${fmt(e.usage.completion_tokens || 0)} tokens in ${(e.time_info.completion_time || 0).toFixed(2)}s = ${C.b}${fmt(e.tps)} tok/s${C.x}`); }
    else if (e.t === "gift") { gifts[e.index] = { ...e.gift, sourced: e.sourced, priceSeen: e.priceSeen, ms: e.ms }; console.log(`${stamp(e.ms)} ${C.g}[GIFT ${e.index + 1}/5]${C.x} ${e.gift.name}`); }
    else if (e.t === "verify" && e.status !== "checking") links[e.index] = e;
    else if (e.t === "race_start") lanes[e.rival] = { label: e.label, model: e.model };
    else if (e.t === "race_end") lanes[e.rival] = { ...lanes[e.rival], ...e };
    else if (e.t === "receipt") receipt = e.receipt;
    else if (e.t === "error") error = e.message;
  }
}

if (error) console.error(`\n${C.r}Run error: ${error}${C.x}`);
if (!receipt) process.exit(1);

const line = "─".repeat(118);
console.log(`\n┌${line}┐`);
console.log(`│ ${pad("#", 2)} ${pad("GIFT", 38)} ${pad("PRICE", 17)} ${pad("RETAILER", 14)} ${pad("FROM SEARCH", 11)} ${pad("LINK", 28)} │`);
console.log(`├${line}┤`);
gifts.forEach((g, i) => {
  const l = links[i];
  // Same rule as the web interface: the agent's price counts as read only when it appears in the
  // web results the agent received. Otherwise the product page's own price is used, and a price
  // that neither source confirms is marked as stated.
  const stated = /\d/.test(g.price || "") ? g.price : "";
  const price = stated && g.priceSeen ? stated : l?.pagePrice ? `${l.pagePrice} (page)` : stated ? `${stated} (stated)` : "see page";
  const link = !l ? "not checked" : l.status === "live" ? `live (HTTP ${l.http})` : l.status === "dead" ? `NOT FOUND (${l.http})` : "store blocks bots: open it";
  console.log(`│ ${pad(i + 1, 2)} ${pad(g.name, 38)} ${pad(price, 17)} ${pad(g.retailer, 14)} ${pad(g.sourced ? "yes" : "NO", 11)} ${pad(link, 28)} │`);
  console.log(`│    ${C.c}${pad(g.url, 113)}${C.x} │`);
});
console.log(`└${line}┘`);

console.log(`\n${C.b}BENCHMARK RECEIPT${C.x}  ${C.d}(speed = Cerebras-reported completion_tokens / completion_time, per model call)${C.x}`);
const rows = [
  ["Harness", receipt.harness],
  ["Model", receipt.model],
  ["Gifts with URL from live search", `${receipt.giftsSourced}/${receipt.giftsFound}`],
  ["Mean decode speed", `${fmt(receipt.meanTps)} tok/s`],
  ["Peak call", `${fmt(receipt.peakTps)} tok/s`],
  ["Completion tokens / decode time", `${fmt(receipt.completionTokens)} tokens / ${receipt.decodeSeconds.toFixed(2)}s`],
  ["Model calls / tool calls", `${receipt.modelCalls} / ${receipt.toolCalls}`],
  ["Time to first token", receipt.ttftMs != null ? `${receipt.ttftMs} ms` : "n/a"],
  ["Wall time (of which Cerebras queue)", `${receipt.wallSeconds.toFixed(1)}s (${receipt.queueSeconds.toFixed(1)}s)`],
  ["Receipt sha256", receipt.sha256],
];
for (const [k, v] of rows) console.log(`  ${pad(k, 38)} ${v}`);

// The race is shown only when a rival is configured (RACE_* in .env.local). Every lane got the
// same request and is timed the same way: tokens after the first chunk over first-to-last-chunk time.
const raced = lanes.filter(Boolean);
if (raced.length > 1) {
  console.log(`\n${C.b}SAME REQUEST, ${raced.length} PROVIDERS${C.x}  ${C.d}(tokens after the first chunk / time from first chunk to last)${C.x}`);
  for (const l of raced) {
    const result = l.ok
      ? `${fmt(l.tps)} tok/s · ${fmt(l.counted)} tokens in ${l.seconds.toFixed(2)}s${l.exact ? "" : " (token count estimated)"}`
      : `no result: ${l.error || "the run ended before this lane finished"}`;
    console.log(`  ${pad(l.label, 14)} ${pad(l.model, 34)} ${result}`);
  }
}
