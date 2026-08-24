import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Hero } from './Hero';

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

describe('the headline', () => {
  test('is the one that was chosen, and it is the h1', () => {
    render(<Hero />);
    const h1 = screen.getByRole('heading', { level: 1 });
    // Normalised, because the real string carries a non-breaking space that the
    // next test is responsible for. Comparing against a pasted literal would
    // mean an invisible byte decides whether the suite passes.
    expect(h1.textContent?.replace(/\s+/g, ' ')).toBe(
      'The models remember everything except you',
    );
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
    const text = screen.getByRole('heading', { level: 1 }).textContent ?? '';
    const afterExcept = text.charCodeAt(text.indexOf('except') + 'except'.length);
    expect(afterExcept).toBe(0x00a0);
  });

  test('still labels the section', () => {
    // The section is `aria-labelledby="hero"`. Drop the id and the landmark
    // loses its name, which no visual check would ever show.
    render(<Hero />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveAttribute('id', 'hero');
  });
});

describe('the pitch', () => {
  test('is on the page, over the button', () => {
    /*
     * The headline is read; the pitch is repeated. It sits at the moment
     * somebody is deciding rather than buried in the body, and it is the only
     * deliberately rude sentence on the site.
     */
    render(<Hero />);
    expect(screen.getByText('Stop introducing yourself to robots.')).toBeInTheDocument();
  });
});

describe('the sub-line', () => {
  test('carries the category and the benefit, since the headline carries neither', () => {
    // The headline states the gap. Somebody who stops reading after two lines
    // still has to know what Sidq is and what it does for them.
    render(<Hero />);
    const sub = screen.getByText(/Sidq is the memory layer/);
    expect(sub.textContent).toMatch(/carried whole into whichever AI you open next/);
  });
});
