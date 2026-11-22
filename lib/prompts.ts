import { incidentToText, SAMPLE_INCIDENT } from "./blocker-scenarios";

export interface ShopperInput {
  /** Free-form description of who the gifts are for, or an X @handle. */
  recipient: string;
}

export function shopperPrompt({ recipient }: ShopperInput): string {
  const who = recipient.trim() || "a tech and maker enthusiast (budget: under $1,000 per gift)";
  const isHandle = /^@\w{1,15}$/.test(who);
  const target = isHandle
    ? `the person behind the X (Twitter) handle ${who}. Infer their interests from what you know about them; if you do not know them, treat them as a tech enthusiast`
    : who;
  return `You are Santa's Speedy Shopper. Find exactly 5 real Christmas gifts for ${target}.

Work in exactly three steps, as fast as possible:
STEP 1 - In ONE turn, call web_search 5 or 6 times in parallel, one query per gift idea, each aimed at a product page on a real retailer's own site (for example apple.com, bestbuy.com, amazon.com, bhphotovideo.com, target.com, lego.com or a brand's own store). Put the word "price" in each query.
STEP 2 - Pick the 5 best product pages. For those whose price was not visible in the search results, call web_fetch on them in ONE parallel turn to read the price. Skip this step if you already have all 5 prices.
STEP 3 - Answer. Never search or fetch again after step 2.

Hard rules:
- Every "url" must be copied character-for-character from a search result you received. Never write a URL from memory.
- Each url must be a specific product page on a real retail site, not a search page, category page, review or blog.
- 5 different products. Prefer different retailers.
- "price" must be a price you actually saw in a search result or fetched page, written like "$249.00". If you never saw one, write "see product page". Never guess a price.
- "reason" is one sentence, at most 22 words, personal to the recipient.

Output ONLY a JSON array with exactly 5 objects and nothing else (no markdown fences, no commentary):
[{"name": "...", "price": "...", "retailer": "...", "url": "https://...", "reason": "..."}]`;
}

