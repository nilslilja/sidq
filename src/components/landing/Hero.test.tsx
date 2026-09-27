import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Hero } from "./Hero";

/*
 * The headline and the pitch.
 *
 * ── Why these strings have a test ────────────────────────────────────────────
 * The headline is a decision, recorded in docs/voice.md with the date and the
 * reason it changed: the launch film ends on it, and somebody clicking through
 * from the film has to land on the same sentence. A comment saying "do not
 * change this" is a comment; this is the same claim in a form that fails a
 * build, so changing the line means deleting an assertion that says why.
 */

describe("the headline", () => {
  test("is the one the film ends on, and it is the h1", () => {
    render(<Hero />);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Your AIs, finally on the same page.",
      }),
    ).toBeInTheDocument();
  });

  /*
   * The last word is drawn, not typed, and it has to stay readable to anything
   * that cannot see the drawing: a screen reader, a search engine, a link
   * preview. It is an image with the word as its name.
   */
  test("writes its last word by hand, and still says it", () => {
    render(<Hero />);
    const word = screen.getByRole("img", { name: "page." });
    expect(word.tagName.toLowerCase()).toBe("svg");
    expect(word.querySelectorAll("path.handwriting-stroke").length).toBeGreaterThan(1);
    expect(word.querySelector("path.handwriting-ink")).not.toBeNull();
  });

  test("the pitch sits under it: tell one AI, the rest already know", () => {
    render(<Hero />);
    expect(screen.getByText("Tell one AI. The rest already know.")).toBeInTheDocument();
  });
});

describe("what the hero promises, and what it does not", () => {
  test("says it is early access, and where the memory lives", () => {
    render(<Hero />);
    expect(screen.getByText(/in early access\. Your memory stays on your Mac\./)).toBeInTheDocument();
  });

  /*
   * No badge above the headline. A pill with a dot and a line of small text
   * sitting over an h1 is the most recognisable mark of a generated landing
   * page, and it was on this one.
   */
  test("has nothing above the headline", () => {
    const { container } = render(<Hero />);
    const column = container.querySelector("h1")?.parentElement;
    expect(column?.firstElementChild?.tagName.toLowerCase()).toBe("h1");
    expect(container.querySelector(".rounded-full")).toBeNull();
  });

  test("offers the film beside the download", () => {
    render(<Hero />);
    expect(screen.getByRole("link", { name: /watch the film/i })).toHaveAttribute("href", "#film");
  });

  /*
   * The site rule is no dashes anywhere, and marketing copy is where they creep
   * back in first.
   */
  test("has no dashes in its copy", () => {
    const { container } = render(<Hero />);
    expect(container.textContent ?? "").not.toMatch(/[‒-―-]/);
  });
});
