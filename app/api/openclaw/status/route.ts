// GET /api/openclaw/status -> is the harness installed, is a key present, which model is configured.
import { FALLBACK_MODELS, PRIMARY_MODEL, openclawInstalled, openclawVersion } from "@/lib/openclaw-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const installed = openclawInstalled();
  return Response.json({
    openclaw: { installed, version: installed ? await openclawVersion() : null },
    cerebras: { keyPresent: Boolean(process.env.CEREBRAS_API_KEY) },
    model: `cerebras/${PRIMARY_MODEL}`,
    fallbacks: FALLBACK_MODELS,
  });
}
