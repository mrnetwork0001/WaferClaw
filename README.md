# ⚡ WaferClaw — OpenClaw Command Center on Cerebras × Kimi K3.1 Pro

> Built for the Cerebras × Moonshot AI Kimi K3.1 Pro × OpenClaw Weekend Hackathon.
> **Stack:** [OpenClaw](https://openclaw.ai) harness · Kimi K3.1 Pro (`moonshotai-kimi-k3.1-pro-trial`) · [Cerebras Inference](https://cloud.cerebras.ai) · Next.js 15 / TypeScript / Tailwind
> **License:** Apache 2.0

WaferClaw is a split-screen cockpit for watching a real OpenClaw agent work at Cerebras speed. Every run spawns the actual `openclaw` harness; every speed number on screen is the one Cerebras reports for that run.

## What it does

**Left: telemetry**
- Decode speed (tokens/sec), time to first token, decode time and output tokens, read from the `usage` and `time_info` Cerebras attaches to each model call.
- A race bar: this run's measured decode time against the same tokens at a 65 tok/s GPU reference (the GPU bar is modelled, and labelled as such).
- The OpenClaw console: model handshake, each tool call, the token stream and the final receipt.

**Right: two modes**
1. **🎅 Santa's Speedy Shopper.** The agent searches real stores and returns 5 gifts. Each card shows the product, retailer, price, a clickable product URL, whether that URL appeared in the agent's live search results, and whether the page answered when checked. Type an X `@handle` to get gifts for that person. Nothing is hard-coded: products are found on every run.
2. **🛠️ Cross-Team Blocker & PR Solver.** Inspired by [@andrewdfeldman's post](https://x.com/andrewdfeldman/status/2122694244561276984) about an agent that finds what is stuck between teams. Give it GitHub, Slack and doc excerpts (a sample incident is included, or paste your own) and it returns 2 cross-team blockers, a next step per team and a draft pull-request diff.

## How it works

```
Browser ──► /api/openclaw/run ──► openclaw agent exec ──► /api/cerebras/<run>/v1 ──► api.cerebras.ai
   ▲               │                (real harness:          (pass-through proxy:
   └── SSE ────────┘                 search, fetch, answer)  reads usage + time_info)
```

- `lib/openclaw-runner.ts` spawns `openclaw agent exec --json` for each run, from an isolated install in `.openclaw-sandbox/`.
- For the duration of a run, OpenClaw's Cerebras base URL points at a pass-through route in this app. It forwards every request unchanged, waits out `429 queue_exceeded` responses when the endpoint is busy, and reads the server-side timing off the response stream.
- Speed is `completion_tokens / completion_time` as reported by Cerebras per model call. Queue, network and tool time are shown separately and do not inflate or deflate it.
- OpenClaw is limited to `web_search` and `web_fetch`; it cannot run commands or touch files.

