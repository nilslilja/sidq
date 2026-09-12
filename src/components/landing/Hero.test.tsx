import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Hero } from "./Hero";

/*
 * The headline and the pitch.
 *
 * ── Why these two strings have a test ────────────────────────────────────────
 * The headline has been rewritten four times. The first three went in three
 * days, each a true sentence about a symptom, and the cost was that the site
 * said something different every week — which is how a product ends up with no
 * identity. `docs/voice.md` now records the fourth as closed: it was chosen on
 * a stated bar rather than a feeling, and better sentences go into posts.
 *
 * A comment saying "do not change this" is a comment. This is the same claim in
 * a form that fails a build. Changing either line means deleting an assertion
 * that says out loud why it exists, which is a decision rather than an edit.
 *
 * It also catches the boring versions of the same accident: the `<h1>` losing
 * its id and taking `aria-labelledby="hero"` with it, or the non-breaking space
 * that stops "you" being orphaned on a phone getting normalised away.
 */

describe("the headline", () => {
  test("is the one that was chosen, and it is the h1", () => {
    render(<Hero />);
    const h1 = screen.getByRole("heading", { level: 1 });
    // Normalised, because the real string carries a non-breaking space that the
    // next test is responsible for. Comparing against a pasted literal would
    // mean an invisible byte decides whether the suite passes.
    expect(h1.textContent?.replace(/\s+/g, " ")).toBe(
      "The models remember everything except you",
    );
  });

  /*
   * Recognition before the promise.
   *
   * The headline and the line under it are both about a memory, which is what
   * Sidq is and not what somebody three seconds into this page has agreed they
   * need. A memory is an abstraction; hitting a limit four hours into something
   * is a Tuesday. If this line ever moves below the promise, or goes, the page
   * is describing a product to somebody still deciding whether to care.
   */
  test("the headline states the gap rather than the product", () => {
    /*
     * This checked that the moment was named before the promise, reading both
     * out of a paragraph that no longer exists. The ordering it protected is
     * now structural: the headline is the gap, and the only thing under it is
     * the line and the button.
     *
     * What is still worth pinning is that the headline has not quietly become
     * a feature list. "The models remember everything except you" is a
     * sentence about the reader, and the moment it starts describing Sidq the
     * hero has lost the thing that makes anybody read the second line.
     */
    render(<Hero />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toMatch(/remember everything/i);
    expect(h1.textContent).not.toMatch(/sidq/i);
  });

  test('holds "except you" together with a real non-breaking space', () => {
    /*
     * At 375 the container binds before the 22ch measure does, and the line
     * broke four ways with "you" alone on the last row. A normal space here
     * puts that orphan back on every narrow screen and nothing else notices.
     *
     * Asserted by code point rather than by pasting the character, so the
     * requirement is legible in the source instead of hiding in a byte.
     */
    render(<Hero />);
    const text = screen.getByRole("heading", { level: 1 }).textContent ?? "";
    const afterExcept = text.charCodeAt(
      text.indexOf("except") + "except".length,
    );
    expect(afterExcept).toBe(0x00a0);
  });

  test("still labels the section", () => {
    // The section is `aria-labelledby="hero"`. Drop the id and the landmark
    // loses its name, which no visual check would ever show.
    render(<Hero />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveAttribute(
      "id",
      "hero",
    );
  });
});
describe("what the hero still says without the paragraph", () => {
  /*
   * The explaining paragraph was cut so the hero is the claim, the line and the
   * button. These pin what that cut must not take with it.
   *
   * The three tests that used to live here all read the paragraph. They were
   * not wrong: the headline states a gap and not a product, so something in the
   * hero has to say what Sidq is. That job moved rather than disappeared, and
   * these assert where it moved to.
   */
  test("something still says what Sidq actually does", () => {
    // The compatibility line at the top carries the category now. Without it
    // the hero names a problem and sells nothing, which is what the old
    // "carries the category and the benefit" test existed to prevent.
    render(<Hero />);
    expect(screen.getByText(/Reads your/)).toBeInTheDocument();
    expect(screen.getByText(/and every other one/)).toBeInTheDocument();
  });

  test("the line somebody repeats is still over the button", () => {
    render(<Hero />);
    const line = screen.getByText(/Stop introducing yourself to robots/);
    expect(line).toBeVisible();
  });

  /*
   * "In your own words" left the hero with the paragraph, and that is a real
   * loss worth naming rather than hiding: it is the doctrine memory.rs is built
   * on, and it was the one line separating Sidq from every tool that summarises.
   *
   * What survives is the half that can still be broken silently. The hero may
   * not claim the opposite. If a future line ever promises a summary, a digest
   * or a recap, it is selling something the app refuses to do.
   */
  test("and nothing in it promises a summary", () => {
    const { container } = render(<Hero />);
    const copy = container.textContent ?? "";
    expect(copy).not.toMatch(/summar/i);
    expect(copy).not.toMatch(/\bdigest\b/i);
    expect(copy).not.toMatch(/\brecap\b/i);
  });
});

describe("the hero on a narrow screen", () => {
  /*
   * The bug this exists for, because nothing about it looked wrong on a laptop.
   *
   * PoweredByClaude is a `@container` that sizes itself from its parent — a
   * container sized by its own contents cannot constrain them. The hero lays
   * its children out in a flex column with `items-center`, where every child
   * shrinks to fit, so the badge's wrapper measured about a word wide and the
   * container query resolved at its smallest breakpoint. On a phone it rendered
   * one word per line, top to bottom.
   *
   * The fix is one class, which is exactly why it needs pinning: `w-full` on a
   * wrapper reads like decoration and deletes cleanly.
   */
  test("the badge fills the column instead of shrinking to its own text", () => {
    const { container } = render(<Hero />);
    const column = container.querySelector(".flex-col");
    const badge = container.querySelector('[class*="@container"]');
    expect(column).not.toBeNull();
    expect(badge).not.toBeNull();

    // Whatever holds the container has to have a width of its own to give it.
    const wrapper = [...column!.children].find((c) => c.contains(badge!));
    expect(wrapper?.className).toMatch(/\bw-full\b/);
  });

  test("and so does every line of copy that has to wrap", () => {
    const { container } = render(<Hero />);
    for (const el of container.querySelectorAll("h1, h1 ~ p")) {
      expect(el.className).toMatch(/\bw-full\b/);
    }
  });

  /*
   * The sky was three layers each pinned to a fixed 56rem while the content
   * box was sized separately. They agreed at one window height and nowhere
   * else. Everything decorative is tied to the section now.
   */
  test("nothing in the sky is pinned to a fixed height", () => {
    const { container } = render(<Hero />);
    for (const el of container.querySelectorAll('[aria-hidden="true"]')) {
      // A `min-h` floor is fine; a fixed `h` is the thing that stops agreeing
      // with the content beside it at every window size but one.
      expect(el.getAttribute("class") ?? "").not.toMatch(
        /(?<!min-)(?<!max-)\bh-\[\d+rem\]/,
      );
    }
  });
});
