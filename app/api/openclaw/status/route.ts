// GET /api/openclaw/status -> is the harness installed, is a key present, which model is configured.
import { raceConfigs } from "@/lib/race";
import { FALLBACK_MODELS, PRIMARY_MODEL, openclawInstalled, openclawVersion } from "@/lib/openclaw-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const installed = openclawInstalled();
  return Response.json({
    openclaw: { installed, version: installed ? await openclawVersion() : null },
    cerebras: { keyPresent: Boolean(process.env.CEREBRAS_API_KEY) && !/your-cerebras-api-key/i.test(process.env.CEREBRAS_API_KEY || "") },
    model: `cerebras/${PRIMARY_MODEL}`,
    fallbacks: FALLBACK_MODELS,
    race: raceConfigs().map((r) => ({ label: r.label, model: r.model, note: r.note, pinned: Object.keys(r.extraBody).length > 0, configError: r.configError })),
  });
}
