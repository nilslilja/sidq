import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

/*
 * The front page must show the interface the product actually has.
 *
 * This is not hypothetical. The pill was remastered into liquid glass — glass
 * panes, inset rows, keycaps, a 22px radius — and the marketing mock was not
 * updated with it, so sidq.tech spent a week showing a flat picker the app no
 * longer had. Nobody noticed, because both versions look perfectly fine on
 * their own; the only way to see it is to put them side by side, which nobody
 * ever does.
 *
 * So the test does. It reads both files and fails when the mock stops using a
 * surface the real picker uses.
 */
/*
 * Comments are stripped before anything is matched.
 *
 * The first version of this failed on the comment in PillPreview that names
 * the flat panel it used to be — the file explaining the mistake counted as
 * making it. A guard that fires on its own documentation gets deleted rather
 * than fixed.
 */
const code = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const REAL = code("src/routes/Pill.tsx");
const MOCK = code("src/components/landing/PillPreview.tsx");

describe("the picture of the picker matches the picker", () => {
  /*
   * The surfaces, not every class. These are the ones that carry the look: if
   * the mock has all of them it cannot be a generation behind, and pinning
   * something finer would fail on ordinary layout edits and get deleted.
   */
  const SURFACES = [
    "pane-glass",
    "row-glass-on",
    "border-white/[0.06]",
    "chip-glass",
    "rounded-[22px]",
    "rounded-[10px]",
  ];

  for (const surface of SURFACES) {
    test(`both use ${surface}`, () => {
      expect(REAL).toContain(surface);
      expect(MOCK).toContain(surface);
    });
  }

  test("the mock has not fallen back to a flat panel", () => {
    /*
     * The exact tell from last time: a solid fill standing in for the glass.
     * The real picker has no such colour anywhere.
     */
    expect(MOCK).not.toContain("bg-[#141319]");
  });

  test("the selected row is marked the way the real one marks it", () => {
    // The violet dot with its glow is the selection, not a background change.
    expect(REAL).toContain("shadow-[0_0_8px_rgba(184,166,255,0.8)]");
    expect(MOCK).toContain("shadow-[0_0_8px_rgba(184,166,255,0.8)]");
  });
});
