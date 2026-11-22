# 🦞 OpenClaw setup for WaferClaw

WaferClaw uses two separate OpenClaw installs, both inside `.openclaw-sandbox/` in this project. Neither touches `~/.openclaw` or installs anything globally.

| Install | Used for | Location |
| --- | --- | --- |
| Standard OpenClaw (npm) | The WaferClaw app, and the public X / Reddit demo | `.openclaw-sandbox/app` + `state/` |
| Patched OpenClaw (git, commit `8b18b55` + official speed patch) | Speed Bounty entry only | `.openclaw-sandbox/bounty/` |

The hackathon rules require standard OpenClaw for public demos and the patched build only for the Speed Bounty.

## 1. Standard OpenClaw (the app)

```bash
npm run setup:openclaw
```

This installs `openclaw` into `.openclaw-sandbox/app`, copies [openclaw.config.json5](openclaw.config.json5) to `.openclaw-sandbox/state/openclaw.json`, installs the key-free DuckDuckGo search plugin, and creates `.env.local`. Put your key in `.env.local`:

```
CEREBRAS_API_KEY=csk-...
CEREBRAS_MODEL=moonshotai-kimi-k3.1-pro-trial
```

`scripts/oc` runs this isolated OpenClaw with the right environment, for example:

```bash
scripts/oc --version
scripts/oc models list --provider cerebras
scripts/oc agent exec "Say hello" --json
```

Config notes (from the official hackathon example):
- Model ID is `moonshotai-kimi-k3.1-pro-trial`, base URL `https://api.cerebras.ai/v1`, API `openai-completions`.
- Thinking is off by default; the config starts sessions at `low`. Kimi accepts `low`, `medium`, `high`, `max` and rejects `none`, `minimal`, `xhigh`.
- Tools are restricted to `web_search` and `web_fetch`.

Check which models your key can use:

```bash
curl -s https://api.cerebras.ai/v1/models -H "Authorization: Bearer $CEREBRAS_API_KEY" | grep -o '"id":"[^"]*"'
```

## 2. Patched OpenClaw (Speed Bounty)

The bounty is measured by the official patch ([openclaw-speed-patch](https://github.com/wkasekende/openclaw-speed-patch)), which adds a `<mean> tok/s mean · <p90> p90 (server)` readout to OpenClaw's own web chat. Start it with:

```bash
scripts/bounty-gateway.sh
```

Then open the URL it prints, paste the prompt from [DEMO_SCRIPT.md](DEMO_SCRIPT.md#speed-bounty-run), and record the screen. The entry is that video posted in `#share-your-demo` on the Cerebras Discord with the mean tok/s written in the message.

