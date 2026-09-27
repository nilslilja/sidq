import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

/*
 * The front page must show the interface the product actually has.
 *
 * This is not hypothetical. The pill was remastered into liquid glass (glass
 * panes, inset rows, keycaps, a 22px radius) and the marketing mock was not
 * updated with it, so sidq.tech spent a week showing a flat picker the app no
 * longer had. It has since moved again, onto the website's paper, and this is
 * the test that dragged the mock along with it. Nobody noticed, because both versions look perfectly fine on
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
    "pane-paper",
    "row-paper-on",
    // The panel opens rather than appearing, and so does the body that replaces
    // the list once a conversation is picked.
    "animate-pane",
    "animate-pane-body",
    // The tick lands. This is the one moment the product proves it did
    // something, and it is the first thing an approximation would leave out.
    "animate-land",
    "chip-paper-on",
    "Saved to Downloads",
    "border-ink/[0.08]",
    "chip-paper",
    "rounded-[22px]",
    "rounded-[10px]",
  ];

  for (const surface of SURFACES) {
    test(`both use ${surface}`, () => {
      expect(REAL).toContain(surface);
      expect(MOCK).toContain(surface);
    });
  }

  test("neither has fallen back to a generation it left behind", () => {
    /*
     * The two tells: the solid dark fill that once stood in for the glass, and
     * the dark glass itself, which the website's paper replaced.
     */
    for (const old of ["bg-[#141319]", "pane-glass", "row-glass", "text-white/"]) {
      expect(REAL).not.toContain(old);
      expect(MOCK).not.toContain(old);
    }
  });

  test("the selected row is marked the way the real one marks it", () => {
    // The blue dot with a soft ring is the selection, not a background change.
    expect(REAL).toContain("ring-[3px] ring-[#2448E8]/15");
    expect(MOCK).toContain("ring-[3px] ring-[#2448E8]/15");
  });
});
