// A sample (fictional) multi-team incident used as the default input for the Blocker & PR Solver.
// It is input material for the agent, not output: the blockers, next steps and PR diff are
// produced live by the model on every run.

export interface Source {
  team: "Engineering" | "Support" | "Product";
  system: string;
  title: string;
  body: string;
}

export const SAMPLE_INCIDENT: Source[] = [
  {
    team: "Engineering",
    system: "GitHub · issue #418 + file",
    title: "kv-portal: intermittent handoff timeouts under high concurrency",
    body: `Issue #418 (open, 6 days, unassigned)
@dana-inf: Since gateway v2.4 we see ~3% of requests fail with HandoffTimeout in kv_portal_router when concurrency > 40. Only large prompts. Can't repro below ~60k prompt tokens.
@ravi-k: Prefill for a 96k-token prompt takes ~900-1300 ms on the GPU tier. Is the router waiting long enough?
@dana-inf: Router uses HANDOFF_TIMEOUT_MS from config/handoff.py. Blocked: nobody on eng knows what value Product signed off on, the spec link in the README is dead.

--- config/handoff.py (main) ---
# Prefill -> decode KV handoff settings
HANDOFF_TIMEOUT_MS = 250
HANDOFF_RETRIES = 0
LARGE_PROMPT_TOKENS = 64_000

--- router/kv_portal_router.py (main) ---
from config.handoff import HANDOFF_TIMEOUT_MS, HANDOFF_RETRIES

async def await_handoff(batch):
    # waits for the prefill tier to ship KV state to the decode tier
    return await batch.kv_ready.wait(timeout_ms=HANDOFF_TIMEOUT_MS)`,
  },
  {
    team: "Support",
    system: "Slack · #customer-escalations",
    title: "Enterprise customer: 504s on long-context prompts",
    body: `[Mon 09:12] @mei (support): Northwind Analytics reports intermittent 504 Gateway Timeout since last Tuesday. Only on their contract-review workload (prompts 70k-110k tokens). Short prompts are fine.
[Mon 09:40] @mei: Ticket SUP-2291, P1. They are threatening to pause rollout. I have no ETA to give them.
[Mon 11:05] @jon (support): Same pattern from two more accounts (SUP-2297, SUP-2302). All started after gateway v2.4.
[Tue 08:30] @mei: Asked in #eng-inference twice, no owner. Blocked: support can't tell customers a workaround because we don't know if retrying is safe or if we should cap context at 64k.`,
  },
  {
    team: "Product",
    system: "Architecture doc · Disaggregated Inference v2.4",
    title: "Spec: prefill-to-decode handoff budget",
    body: `Section 4.2 Handoff budget
- Prompts <= 64k tokens: handoff budget 250 ms.
- Prompts > 64k tokens: handoff budget 1500 ms, with 1 retry, because GPU-tier prefill for large batches takes up to ~1.3 s.
- The router must select the budget by prompt size.
Section 6 Rollout
- v2.4 gateway ships the large-context tier to all enterprise accounts.
- Open question (owner: product-cloud): publish customer guidance on retries for long-context requests. Not started; waiting on Engineering to confirm the retry is idempotent.`,
  },
];

export function incidentToText(sources: Source[]): string {
  return sources
    .map((s) => `### SOURCE (${s.team}) — ${s.system}\n${s.title}\n${s.body}`)
    .join("\n\n");
}
