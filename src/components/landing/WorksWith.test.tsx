import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { WorksWith } from "./WorksWith";
import { HeroStats } from "./HeroStats";
import { SUPPORTED, SOURCES } from "@/lib/companion/sources";

/*
 * The number on the hero and the names under it are the same claim stated two
 * ways, and both are read by strangers deciding whether to trust the product.
 * The failure worth preventing is not that they are wrong today — it is that a
 * reader gets added or dropped in sources.ts and the marketing page keeps
 * saying the old thing, silently, for months.
 */
describe("what the site claims it reads", () => {
  test("every supported product is named on the page", () => {
    render(<WorksWith />);
    for (const name of SUPPORTED) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  test("the hero's count is the number of products actually named", () => {
    render(<HeroStats />);
    const figure = screen.getByText(String(SUPPORTED.length));
    expect(figure).toBeInTheDocument();
    // And it is a real count rather than a coincidence with some other stat.
    expect(figure.nextElementSibling?.textContent).toMatch(/assistants it reads/i);
  });

  test("the editor entry is counted as the three products it covers", () => {
    /*
     * `Cursor, Windsurf, VS Code` is one reader in SOURCES and three things
     * people search the page for. Counting SOURCES directly would say eight and
     * undersell it, which is the mistake this flattening exists to prevent.
     */
    expect(SOURCES.length).toBeLessThan(SUPPORTED.length);
    for (const editor of ["Cursor", "Windsurf", "VS Code"]) {
      expect(SUPPORTED).toContain(editor);
    }
  });
});
