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

/** Fetches the product page from this machine: does the link resolve, and what price does the page itself state? */
export async function checkLink(url: string): Promise<{ status: LinkStatus; http: number | null; price: string | null }> {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(9000),
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml",
        "accept-language": "en-US,en;q=0.9",
      },
    });
    if (res.status >= 200 && res.status < 400) {
      const html = await readSome(res, 2_500_000);
      return { status: "live", http: res.status, price: priceFromHtml(html) };
    }
    res.body?.cancel().catch(() => {});
    if (res.status === 404 || res.status === 410) return { status: "dead", http: res.status, price: null };
    // Retail sites commonly answer 403/429/503 to non-browser clients; the page may still exist.
    return { status: "blocked", http: res.status, price: null };
  } catch {
    return { status: "unreachable", http: null, price: null };
  }
}

async function readSome(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let out = "";
  try {
    while (out.length < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      out += decoder.decode(value, { stream: true });
    }
  } catch { /* partial is fine */ }
  reader.cancel().catch(() => {});
  return out;
}

/** Reads the price a product page declares in its structured data (schema.org / Open Graph). */
export function priceFromHtml(html: string): string | null {
  const patterns: RegExp[] = [
    /<meta[^>]+(?:property|name)=["'](?:product:price:amount|og:price:amount)["'][^>]+content=["']([\d.,]+)["']/i,
    /<meta[^>]+content=["']([\d.,]+)["'][^>]+(?:property|name)=["'](?:product:price:amount|og:price:amount)["']/i,
    /<meta[^>]+itemprop=["']price["'][^>]+content=["']([\d.,]+)["']/i,
    /"(?:price|lowPrice|salePrice|currentPrice|current_retail|fullPrice|priceAmount|formatted_current_price|raw_price)"\s*:\s*\{?\s*(?:"(?:amount|value|raw_amount)"\s*:\s*)?"?\$?(\d[\d.,]*)"?/,
    /class="a-offscreen">\s*\$(\d[\d.,]*)/,
    /data-price(?:-amount)?=["']\$?(\d[\d.,]*)["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (!m) continue;
    const n = Number(m[1].replace(/[.,]+$/, "").replace(/,(?=\d{3}\b)/g, ""));
    if (!Number.isFinite(n) || n <= 0 || n > 100000) continue;
    // Use the currency declared right next to this price; pages often list several regions.
    const at = m.index ?? 0;
    const near = html.slice(Math.max(0, at - 300), at + 300);
    const cur = near.match(/"priceCurrency"\s*:\s*"([A-Z]{3})"/)?.[1] || near.match(/price:currency["'][^>]+content=["']([A-Z]{3})["']/i)?.[1] || "USD";
    const sym = cur === "USD" ? "$" : cur === "EUR" ? "€" : cur === "GBP" ? "£" : `${cur} `;
    return `${sym}${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return null;
}
