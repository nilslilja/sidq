import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PoweredByClaude } from './PoweredByClaude';

/*
 * The rotating claim under the headline.
 *
 * Everything checked here failed silently on screen and passed every other
 * check: a logo that is present, correctly sized and the same colour as the
 * background is a hole, not an error, and a clause rendered in the wrong tone
 * is a line of text nobody can read.
 */

describe('the marks', () => {
  test('single-colour ones are drawn in the text colour, not as images', () => {
    /*
     * OpenAI ships theirs as fill="#000000" and xAI ships theirs as
     * currentColor, which inside an <img> resolves to the file's own default —
     * also black. Both were a 26 point hole on the dark hero and the dark setup
     * screen. A mask takes the colour of the text beside it.
     *
     * The component starts on the first model, which is ChatGPT.
     */
    const { container } = render(<PoweredByClaude />);

    const mark = container.querySelector('span[aria-hidden="true"]');
    expect(mark).not.toBeNull();
    expect(mark?.getAttribute('style')).toContain('openai-logo.svg');
    expect(mark?.getAttribute('style')?.toLowerCase()).toContain('currentcolor');

    // And it is not also being rendered the old way.
    expect(container.querySelector('img[src*="openai"]')).toBeNull();
  });
});

describe('the sentence', () => {
  test('holds one line where there is room, and wraps where there is not', () => {
    /*
     * Refusing to wrap outright was tried and it clipped instead: measured
     * across the widths setup actually opens at, its column is 266 to 384
     * points and the sentence is 355 at the smallest size, so "and every" was
     * cut off mid-word against the panel edge.
     *
     * `nowrap` is a container query now — on above a certain column width, off
     * below it — so the two failures cannot both be live at once.
     */
    const { container } = render(<PoweredByClaude />);
    const line = container.querySelector('span.\\@\\[26rem\\]\\:whitespace-nowrap');
    expect(line).not.toBeNull();
    expect(line?.className).not.toMatch(/(^|\s)whitespace-nowrap(\s|$)/);
    expect(line?.textContent).toContain('and every other one');
  });

  test('the column is the container, not the window', () => {
    // `sm:` and `lg:` measure the window. Setup is a wide window with a narrow
    // column, so window-based steps picked the largest size and overflowed.
    const { container } = render(<PoweredByClaude />);
    const root = container.firstElementChild;
    expect(root?.className).toContain('@container');
    expect(root?.className).toContain('w-full');
  });

  test('the trailing clause follows the tone it was given', () => {
    // It was `text-ink/35` on every surface, so on the dark setup screen it was
    // near-black on near-black: present, taking up space, unreadable.
    const dark = render(<PoweredByClaude tone="light" />);
    expect(dark.getByText(/and every other one/).className).toContain('text-white/35');
    dark.unmount();

    const light = render(<PoweredByClaude tone="dark" />);
    expect(light.getByText(/and every other one/).className).toContain('text-ink/35');
  });

  test('the locality note is always there', () => {
    // The line above is a strong claim about what Sidq holds. This is the one
    // that keeps it the right side of sounding like surveillance.
    render(<PoweredByClaude />);
    expect(screen.getAllByText('Every word stays on this Mac').length).toBeGreaterThan(0);
  });
});
