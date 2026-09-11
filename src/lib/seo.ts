import { GUIDES } from "@/lib/guides";
/*
 * What each page tells a search engine it is.
 *
 * ── The bug this file exists to fix ──────────────────────────────────────────
 *
 * The prerenderer writes one shell for every route and swaps only the body, so
 * all five pages shipped the homepage's <head>. Every one of them carried
 * `<link rel="canonical" href="https://www.sidq.tech/">`.
 *
 * A canonical is not a hint. It is an instruction telling Google that this URL
 * is a duplicate of that one and should be dropped from the index in its
 * favour. So /pricing, /faq, /privacy and /terms were each telling Google not
 * to index them, while sitemap.xml asked for all five. Google follows the
 * canonical. Four of the five URLs on the site were suppressing themselves, and
 * the sitemap made it look deliberate.
 *
 * They also all shared one <title>, which is the single strongest on-page
 * signal, and none of them had a meta description at all.
 *
 * ── Why the titles do not lead with the brand ────────────────────────────────
 *
 * Nobody is searching "Sidq". A result already shows the site name above the
 * title, so spending the first fifteen characters on it buys nothing and pushes
 * the words somebody actually typed past the truncation point. These lead with
 * the thing being searched for and let the SERP supply the brand.
 *
 * ── Why the titles are not the headline ──────────────────────────────────────
 *
 * "The models remember everything except you" is the right line on the page and
 * the wrong line in a result. It is a claim about a category, and a person
 * searching has typed a task: moving a conversation out of ChatGPT, keeping
 * context between assistants, finding an AI tool that does not upload anything.
 * The page can sell the memory once they arrive. The title has to match what
 * they asked for or they never arrive.
 */

export interface PageMeta {
  title: string;
  description: string;
  /** Absolute, and its own — never the homepage's. */
  canonical: string;
  /** Card headline. Separate from `title` because a card is read in a feed. */
  ogTitle?: string;
}

const SITE = "https://www.sidq.tech";

const HAND_WRITTEN: Record<string, PageMeta> = {
  "/": {
    title: "Carry an AI conversation from ChatGPT into Claude. Mac app.",
    description:
      "Sidq reads every AI conversation already on your Mac and carries any of them into any other assistant, word for word. Nothing is uploaded and it works offline.",
    canonical: `${SITE}/`,
    ogTitle: "Stop introducing yourself to robots.",
  },
  "/pricing": {
    /*
     * Both of these described a paywall that no longer exists, live, for weeks.
     *
     * "Five handovers a week free" — there is no cap and has not been one since
     * the meters came out. "Pro removes every limit at $19.99" — Free has no
     * limits to remove. A search result is the first sentence most people read
     * about Sidq, and both of its claims were false.
     */
    title: "Pricing. Free on your Mac. Pay for what runs without you.",
    description:
      "Unlimited handovers and full search, free, no card. Pro is $19.99 for what you cannot do by hand: one conversation carried across every model. Teams, one invoice.",
    canonical: `${SITE}/pricing`,
    ogTitle: "Sidq pricing",
  },
  "/faq": {
    title: "How Sidq works. Which AIs, what it reads, what it never sends.",
    description:
      "Which assistants Sidq reads, what happens to your conversations, whether anything is uploaded, what a team shares, and what you get without paying. Answered plainly.",
    canonical: `${SITE}/faq`,
    ogTitle: "The questions people actually ask",
  },
  /*
   * The title is the query, not a headline.
   *
   * A result is scanned for the line that repeats what was just typed, so this
   * one leads with the words rather than with a claim about the category.
   */
  "/chatgpt-to-claude": {
    title: "How to move a ChatGPT conversation into Claude",
    description:
      "Four ways to carry a ChatGPT conversation into Claude, worst to best: summarise it, copy and paste it, export your data, or hand it over in one keystroke. Three are free.",
    canonical: `${SITE}/chatgpt-to-claude`,
    ogTitle: "How to move a ChatGPT conversation into Claude",
  },
  "/privacy": {
    title: "Privacy. Your conversations never leave your Mac.",
    description:
      "What Sidq reads, where it keeps it, and what is never sent anywhere. Conversations are read from your own disk and go to your own clipboard.",
    canonical: `${SITE}/privacy`,
    ogTitle: "Privacy at Sidq",
  },
  "/terms": {
    title: "Terms of service.",
    description:
      "The terms you agree to when you use Sidq: what the licence covers, what happens to a subscription, and what is and is not warranted. Plain language, no schedules.",
    canonical: `${SITE}/terms`,
    ogTitle: "Sidq terms of service",
  },
};

/*
 * The generated guides, merged in from one source.
 *
 * Their titles and descriptions live beside their content in `src/lib/guides.ts`
 * so a page cannot end up with a canonical, a title and a body that disagree —
 * which is the failure this whole file exists because of.
 */
export const PAGES: Record<string, PageMeta> = {
  ...HAND_WRITTEN,
  ...Object.fromEntries(
    GUIDES.map((guide) => [
      guide.route,
      {
        title: guide.title,
        description: guide.description,
        canonical: `${SITE}${guide.route}`,
        ogTitle: guide.title,
      },
    ]),
  ),
};

/** A route's metadata, or the homepage's if the route is somehow unknown. */
export function metaFor(route: string): PageMeta {
  return PAGES[route] ?? PAGES["/"];
}
