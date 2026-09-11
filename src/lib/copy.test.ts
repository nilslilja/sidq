import { describe, expect, it } from "vitest";

import { FAQS } from "../components/landing/Faq";
import { PLANS } from "./plans";
import { PAGES } from "./seo";

/*
 * ── Why this file exists ─────────────────────────────────────────────────────
 *
 * The FAQ read "Infinity handovers a week, and search reaches back Infinity
 * days" on the live site, for weeks, to everybody who opened it. The pricing
 * page's title promised "$19.99 a month for unlimited" next to a free tier that
 * was already unlimited, and its description sold a five-handover cap that no
 * longer existed.
 *
 * None of that was a typo. It was copy generated from numbers in
 * entitlements.ts, written so the two could never drift — and then the numbers
 * stopped being numbers. A template survives its value changing and does not
 * survive its *shape* changing, and nothing was watching the rendered result.
 *
 * So this reads the strings a visitor actually sees.
 */

/** What a number looks like when it stopped being one. */
const BROKEN = ["Infinity", "NaN", "undefined", "null", "[object Object]"];

function everyLine(): { where: string; text: string }[] {
  const lines: { where: string; text: string }[] = [];

  for (const faq of FAQS) {
    lines.push({ where: `FAQ: ${faq.q}`, text: faq.q });
    for (const part of Array.isArray(faq.a) ? faq.a : [faq.a]) {
      lines.push({ where: `FAQ: ${faq.q}`, text: part });
    }
  }

  for (const plan of PLANS) {
    lines.push({ where: `${plan.name} price`, text: plan.price });
    lines.push({ where: `${plan.name} promise`, text: plan.promise });
    for (const f of plan.features) lines.push({ where: `${plan.name} feature`, text: f });
    for (const l of plan.limits ?? []) lines.push({ where: `${plan.name} limit`, text: l });
    if (plan.priceNote) lines.push({ where: `${plan.name} priceNote`, text: plan.priceNote });
  }

  for (const [path, meta] of Object.entries(PAGES)) {
    lines.push({ where: `${path} title`, text: meta.title });
    lines.push({ where: `${path} description`, text: meta.description });
  }

  /*
   * Some copy is JSX rather than a string — a link inside an answer, mostly.
   * Those are not generated from numbers and are not what this is watching, so
   * they are dropped here rather than stringified into "[object Object]", which
   * would make the first test below pass on its own output.
   */
  return lines.filter((l) => typeof l.text === "string");
}

describe("what a visitor reads", () => {
  it("never shows a number that stopped being a number", () => {
    for (const { where, text } of everyLine()) {
      for (const broken of BROKEN) {
        expect(text, `${where} renders "${broken}"`).not.toContain(broken);
      }
    }
  });

  it("does not sell a cap that no longer exists", () => {
    /*
     * Every meter came out of entitlement.rs — handovers, history, sources —
     * and the copy that sold them stayed up. These are the exact phrases that
     * were live after the caps were gone.
     */
    const gone = [
      /five handovers/i,
      /5 handovers a week/i,
      /handovers a week/i,
      /search back \d/i,
      /reaches back \d+ days on free/i,
    ];

    for (const { where, text } of everyLine()) {
      for (const phrase of gone) {
        expect(text, `${where} still sells a removed cap`).not.toMatch(phrase);
      }
    }
  });

  it("has no em dashes anywhere a visitor can see", async () => {
    /*
     * Nils's rule, and he is right about it. An em dash between clauses is one
     * of the loudest tells that a machine wrote the sentence, and this is a
     * product sold to people who read machine output all day. They spot it.
     *
     * ── Why this reads the files instead of the exports ──────────────────────
     *
     * Most copy on this site is JSX text, not a string in a table: the hero,
     * the legal pages, the onboarding steps. A test over FAQS and PLANS would
     * have passed while the hero's own headline sentence carried one, which is
     * precisely what happened before this was written.
     *
     * Comments are skipped. Prose *about* an em dash is not an em dash, and a
     * scanner that cannot tell the difference gets deleted by whoever it next
     * accuses.
     */
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");

    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry) && !entry.includes(".test.")) files.push(full);
      }
    };
    walk("src");

    const offences: string[] = [];
    for (const file of files) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          const trimmed = line.trim();
          if (trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith("/*")) {
            return;
          }
          if (/[—–]/.test(line)) offences.push(`${file}:${i + 1}  ${trimmed.slice(0, 70)}`);
        });
    }

    expect(offences, `em dashes in copy:\n${offences.join("\n")}`).toHaveLength(0);
  });

  it("does not charge for something the tier below already gives", () => {
    /*
     * Pro's two bullets were word for word what the free card listed directly
     * above them, because the meters were removed and this card was not moved
     * with them. The page asked $19.99 a month for nothing.
     */
    const free = PLANS.find((p) => p.id === "free");
    const pro = PLANS.find((p) => p.id === "pro");
    expect(free && pro).toBeTruthy();

    const normalise = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, "").trim();
    const freeFeatures = new Set((free?.features ?? []).map(normalise));

    for (const feature of pro?.features ?? []) {
      expect(freeFeatures.has(normalise(feature)), `Pro sells "${feature}", which Free gives`).toBe(
        false,
      );
    }
  });
});
