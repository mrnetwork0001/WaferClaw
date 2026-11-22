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
You have a hard budget of 3 model turns in total (search, optional fetch, answer). Every extra turn waits in a long queue, so do not spend a turn on anything else, including looking up the recipient.

Hard rules:
- Every "url" must be copied character-for-character from a search result you received. Never write a URL from memory.
- Each url must be a specific product page on a real retail site, not a search page, category page, review or blog.
- 5 different products. Prefer different retailers.
- "price" must be a price you actually saw in a search result or fetched page, written like "$249.00". If you never saw one, write "see product page". Never guess a price.
- "reason" is one sentence, at most 22 words, personal to the recipient.

Output ONLY a JSON array with exactly 5 objects and nothing else (no markdown fences, no commentary):
[{"name": "...", "price": "...", "retailer": "...", "url": "https://...", "reason": "..."}]`;
}

/**
 * The race request for the shopper mode. The agent's own prompt tells the model to call web tools,
 * which a plain completion cannot do, so every provider in the race gets this tool-free version of
 * the same task instead. It asks for enough text to time properly.
 */
export function shopperRacePrompt({ recipient }: ShopperInput): string {
  const who = recipient.trim() || "a tech and maker enthusiast (budget: under $1,000 per gift)";
  const target = /^@\w{1,15}$/.test(who) ? `the person behind the X (Twitter) handle ${who}` : who;
  return `Write a Christmas gift guide for ${target}. You have no tools in this request, so answer from your own knowledge.

Give exactly 5 gifts. For each one write the product name, a retailer that sells it, a typical price, and a reason of about 150 words that is personal to the recipient.`;
}

export function blockerPrompt(custom?: string): string {
  const material = custom?.trim() ? custom.trim() : incidentToText(SAMPLE_INCIDENT);
  return `You are a cross-team incident analyst. Below is raw material from Engineering (GitHub), Support (Slack) and Product (architecture docs). Do not call any tools; everything you need is below.

${material}

Find what is blocked BETWEEN teams (each team holds part of the answer). Identify exactly 2 cross-team blockers, give one concrete next step per team, and draft a pull request that fixes the root cause using only the files shown above.

Reply in EXACTLY this format, with these marker lines, and nothing before or after:
<<<ANALYSIS_JSON>>>
{"blockers":[{"title":"...","severity":"P1|P2","teams":["Engineering","Support","Product"],"rootCause":"one or two sentences","evidence":[{"team":"...","quote":"short exact quote from the material"}]}],"nextSteps":{"Engineering":"...","Support":"...","Product":"..."}}
<<<PR_TITLE>>>
one line
<<<PR_BODY>>>
4 short plain-text lines (no markdown): What / Why / Test plan / Customer impact, each under 25 words
<<<PR_DIFF>>>
a valid unified git diff (diff --git a/... b/...) touching only files shown in the material
<<<END>>>`;
}
