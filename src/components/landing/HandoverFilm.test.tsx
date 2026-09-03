import { describe, expect, test } from "vitest";
import { sliceIntoLines } from "./HandoverFilm";

/*
 * The reply in the film is streamed as one running word count across the whole
 * answer, the way a model emits it, and then sliced back into lines to render.
 * The slicing is where that can go wrong silently: an off-by-one here shows up
 * as a line that never finishes or a caret on the wrong row, neither of which
 * is obvious when the whole thing is moving.
 */
const LINES = ["one two three", "four five", "six"];

describe("streaming the reply back into lines", () => {
  test("nothing is shown before the stream starts", () => {
    expect(sliceIntoLines(LINES, 0)).toEqual([
      { text: "", done: false },
      { text: "", done: false },
      { text: "", done: false },
    ]);
  });

  test("the budget is spent on the first line before any reaches the second", () => {
    const out = sliceIntoLines(LINES, 2);
    expect(out[0]).toEqual({ text: "one two", done: false });
    expect(out[1].text).toBe("");
  });

  test("a line that exactly fits is marked done, so the caret moves on", () => {
    const out = sliceIntoLines(LINES, 3);
    expect(out[0]).toEqual({ text: "one two three", done: true });
    expect(out[1]).toEqual({ text: "", done: false });
  });

  test("the budget carries into later lines", () => {
    const out = sliceIntoLines(LINES, 4);
    expect(out[0].done).toBe(true);
    expect(out[1]).toEqual({ text: "four", done: false });
  });

  test("every line is complete once the whole reply has been emitted", () => {
    const total = LINES.reduce((n, l) => n + l.split(" ").length, 0);
    const out = sliceIntoLines(LINES, total);
    expect(out.every((l) => l.done)).toBe(true);
    expect(out.map((l) => l.text)).toEqual(LINES);
  });

  test("a count past the end does not overrun", () => {
    const out = sliceIntoLines(LINES, 999);
    expect(out.map((l) => l.text)).toEqual(LINES);
  });
});
