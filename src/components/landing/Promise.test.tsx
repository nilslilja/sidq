import { describe, test, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { TellOne } from "./TellOne";
import { Compare } from "./Compare";
import { SUPPORTED } from "@/lib/companion/sources";

/*
 * The two sections that carry the film's promise onto the page people
 * download from. What is tested is the line between promise and product: the
 * film may show where Sidq is going, this page may not blur what works today.
 */

describe("tell one AI", () => {
  test("marks exactly what works today and what is coming next", () => {
    render(<TellOne />);
    expect(screen.getAllByText("Works today")).toHaveLength(2);
    expect(screen.getAllByText("Coming next")).toHaveLength(2);
  });

  test("the moments that work today are the ones 0.9.11 ships: Claude Code and Cursor", () => {
    render(<TellOne />);
    for (const app of ["Claude Code", "Cursor"]) {
      const card = screen.getByText(app).closest("li");
      expect(card).not.toBeNull();
      expect(within(card as HTMLElement).getByText("Works today")).toBeInTheDocument();
    }
  });
});

describe("the comparison", () => {
  test("counts the assistants from the list the app actually reads", () => {
    render(<Compare />);
    expect(screen.getByText(`${SUPPORTED.length} assistants`)).toBeInTheDocument();
  });

  test("names every column with a real name", () => {
    render(<Compare />);
    for (const name of ["Sidq", "ChatGPT memory", "Claude memory", "Gemini", "A notes doc"]) {
      expect(screen.getByRole("columnheader", { name })).toBeInTheDocument();
    }
  });

  /*
   * docs/voice.md: never punch at the labs. The cells say what each one does,
   * and none of them may call a product bad, broken or worse.
   */
  test("describes the others without punching at them", () => {
    const { container } = render(<Compare />);
    expect(container.textContent ?? "").not.toMatch(/\b(bad|broken|worse|fails|useless|dumb)\b/i);
  });

  test("has no dashes in its copy", () => {
    const { container } = render(
      <>
        <TellOne />
        <Compare />
      </>,
    );
    expect(container.textContent ?? "").not.toMatch(/[‒-―-]/);
  });
});
