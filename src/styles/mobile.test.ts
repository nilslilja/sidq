import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * ── What this file is for ────────────────────────────────────────────────────
 *
 * Two mobile rules on this site are invisible on the machine it is built on.
 * A Mac never zooms a form field and a mouse never misses a small button, so
 * both regressions ship looking perfect and are only ever found by somebody on
 * a phone who does not report them, they just leave.
 *
 * Neither rule lives on a component, deliberately. Both are base rules, so the
 * next input and the next link inherit them without anybody remembering. That
 * makes deleting them a one line change with no visible consequence, which is
 * exactly the kind of change a test has to be standing in front of.
 */

const css = readFileSync("src/styles/global.css", "utf8");

/** The declarations inside the first at-rule whose condition contains `needle`. */
function mediaBlock(needle: string): string {
  const at = css.indexOf(`@media ${needle}`);
  if (at === -1) return "";
  let depth = 0;
  for (let i = css.indexOf("{", at); i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(at, i + 1);
    }
  }
  return "";
}

describe("the phone rules nobody sees break", () => {
  /**
   * Mobile Safari zooms the page in when a focused control's text is under
   * 16px, and does not zoom back out. The email capture is the only thing a
   * phone visitor can do here, so the cost of this one is measured in
   * addresses not collected.
   */
  it("holds form text at sixteen pixels where a phone would zoom", () => {
    const block = mediaBlock("(hover: none) and (pointer: coarse)");
    expect(block).toContain("input");
    expect(block).toContain("textarea");
    expect(block).toMatch(/font-size:\s*max\(1rem/);
  });

  it("gives anything tappable a finger to land on", () => {
    const block = mediaBlock("(hover: none) and (pointer: coarse)");
    expect(block).toContain("a[href]");
    expect(block).toContain("button");
    expect(block).toMatch(/min-height:\s*44px/);
  });

  /**
   * Conditional on purpose, and conditional on the pointer rather than on the
   * width. Applied unconditionally the first would overrule every deliberate
   * type size on the site and the second would inflate the desktop app's own
   * dense chrome. Rewritten as a width, both would miss an iPad and both would
   * fire on a narrow window that never needed either.
   */
  it("asks about the pointer, not the width, and only there", () => {
    // Not "the rule appears somewhere", which a nested copy satisfies, but
    // "every place it appears is inside the condition". Lifting either one out
    // of its block is the mistake this is here for: the first would overrule
    // every deliberate type size on the site, and the second would inflate the
    // desktop app's own dense chrome.
    const occurrences = (haystack: string, needle: RegExp) =>
      haystack.match(new RegExp(needle, "g"))?.length ?? 0;

    const touch = mediaBlock("(hover: none) and (pointer: coarse)");
    const floor = /font-size:\s*max\(1rem/;
    expect(occurrences(css, floor)).toBe(1);
    expect(occurrences(touch, floor)).toBe(1);

    const finger = /min-height:\s*44px/;
    expect(occurrences(css, finger)).toBe(1);
    expect(occurrences(touch, finger)).toBe(1);
  });
});
