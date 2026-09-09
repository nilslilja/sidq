import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PAGES, metaFor } from "./seo";
import { ROUTES } from "@/entry-server";

/*
 * ── Why the site needs a test about its own <head> ───────────────────────────
 *
 * The prerenderer writes one shell into every route and swaps the body. That is
 * invisible in the browser and invisible in review, and it meant every page on
 * the site shipped `<link rel="canonical" href="https://www.sidq.tech/">`.
 *
 * A canonical is an instruction, not a hint: /pricing, /faq, /privacy and
 * /terms were each telling Google they were duplicates of the homepage and
 * should be dropped from the index, while sitemap.xml asked for all five. The
 * two files disagreed for months and nothing anywhere said so.
 *
 * Nothing here can be checked by looking at the page, which is exactly why it
 * is asserted rather than remembered.
 */

describe("every route says what it is", () => {
  test("the metadata table covers exactly the routes that are rendered", () => {
    // A route added to the prerenderer without an entry here would fall back to
    // the homepage's metadata, which is the bug this file exists for.
    expect(Object.keys(PAGES).sort()).toEqual([...ROUTES].sort());
  });

  test("no two pages claim the same canonical", () => {
    const canonicals = Object.values(PAGES).map((p) => p.canonical);
    expect(new Set(canonicals).size).toBe(canonicals.length);
  });

  test("a page's canonical is its own URL, never another page's", () => {
    for (const [route, meta] of Object.entries(PAGES)) {
      const expected =
        route === "/" ? "https://www.sidq.tech/" : `https://www.sidq.tech${route}`;
      expect(meta.canonical).toBe(expected);
    }
  });

  test("no two pages share a title", () => {
    const titles = Object.values(PAGES).map((p) => p.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  test("titles fit in a result instead of being cut off", () => {
    // Google truncates around 60 characters. A title that gets cut loses the
    // words at the end, which is where a description-style title puts its point.
    for (const [route, meta] of Object.entries(PAGES)) {
      expect(meta.title.length, `${route} title`).toBeLessThanOrEqual(62);
      expect(meta.title.length, `${route} title`).toBeGreaterThan(10);
    }
  });

  test("every page has a description, and it fits the snippet", () => {
    for (const [route, meta] of Object.entries(PAGES)) {
      expect(meta.description.length, `${route} description`).toBeGreaterThan(70);
      expect(meta.description.length, `${route} description`).toBeLessThanOrEqual(170);
    }
  });

  /*
   * The titles are what somebody typed, not what the page calls itself. Leading
   * with the brand spends the first characters on a word nobody is searching
   * and pushes the real words past the truncation point, and a result already
   * shows the site name above the title.
   */
  test("no title opens with the brand name", () => {
    for (const meta of Object.values(PAGES)) {
      expect(meta.title.toLowerCase().startsWith("sidq")).toBe(false);
    }
  });

  test("an unknown route falls back rather than throwing", () => {
    expect(metaFor("/nope").canonical).toBe(PAGES["/"].canonical);
  });
});

describe("the crawler files agree with the routes", () => {
  const sitemap = readFileSync("public/sitemap.xml", "utf8");
  const robots = readFileSync("public/robots.txt", "utf8");

  test("the sitemap lists every public route and nothing else", () => {
    const listed = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(listed.sort()).toEqual(Object.values(PAGES).map((p) => p.canonical).sort());
  });

  test("nothing the sitemap asks for is disallowed in robots.txt", () => {
    /*
     * The two files are written by hand and read by the same crawler. A URL
     * that is submitted and blocked is worse than one that is neither: it
     * reports as an error in Search Console and the page never gets looked at.
     */
    const blocked = [...robots.matchAll(/^Disallow:\s*(\S+)/gm)].map((m) => m[1]);
    for (const route of Object.keys(PAGES)) {
      expect(blocked, `${route} is in the sitemap`).not.toContain(route);
    }
  });

  test("the desktop app's own windows stay out of the index", () => {
    // /pill and /home render inside the packaged Mac app and are an empty
    // overlay on the web. Indexed, they are blank results under this domain.
    const blocked = [...robots.matchAll(/^Disallow:\s*(\S+)/gm)].map((m) => m[1]);
    for (const window of ["/pill", "/home", "/splash", "/welcome"]) {
      expect(blocked).toContain(window);
    }
  });
});
