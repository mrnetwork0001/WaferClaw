// Incremental extraction of gift objects from the model's streamed answer, plus link checks.
import type { Gift, LinkStatus } from "./types";

/** Returns every complete top-level-or-nested JSON object found in `text` that looks like a gift. */
export function extractGifts(text: string): Gift[] {
  const out: Gift[] = [];
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") { if (depth === 0) start = i; depth++; }
    else if (c === "}") {
      if (depth > 0) depth--;
      if (depth === 0 && start >= 0) {
        const gift = toGift(text.slice(start, i + 1));
        if (gift) out.push(gift);
        start = -1;
      }
    }
  }
  return out;
}

function toGift(raw: string): Gift | null {
  try {
    const o = JSON.parse(raw);
    if (!o || typeof o !== "object") return null;
    const url = String(o.url ?? o.link ?? "").trim();
    const name = String(o.name ?? o.title ?? "").trim();
    if (!name || !/^https?:\/\//i.test(url)) return null;
    return {
      name,
      url,
      price: String(o.price ?? "").trim(),
      retailer: String(o.retailer ?? o.store ?? hostOf(url)).trim(),
      reason: String(o.reason ?? o.why ?? "").trim(),
    };
  } catch {
    return null;
  }
}

export function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

/** True when the URL the model answered with literally appeared in the web results the agent received. */
export function urlWasSourced(url: string, toolText: string): boolean {
  if (!toolText) return false;
  const variants = new Set<string>();
  const trimmed = url.replace(/[/?#]+$/, "");
  variants.add(trimmed);
  try {
    const u = new URL(url);
    variants.add((u.hostname + u.pathname).replace(/\/+$/, ""));
    variants.add((u.hostname.replace(/^www\./, "") + u.pathname).replace(/\/+$/, ""));
  } catch { /* ignore */ }
  const hay = toolText.replace(/\\\//g, "/");
  for (const v of variants) if (v.length > 12 && hay.includes(v)) return true;
  return false;
}

