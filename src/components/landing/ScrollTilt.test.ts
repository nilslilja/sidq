import { describe, test, expect } from 'vitest';
import { tiltPose, AT_REST } from './ScrollTilt';

/*
 * The tilt maths, checked directly.
 *
 * These exist because the effect cannot be verified in a browser harness: the
 * preview pane reports `window.innerHeight` as 0 and fires no scroll events for
 * programmatic scrolls, so the card reads as permanently at rest there whether
 * the maths is right or catastrophically wrong. Everything that actually decides
 * how this looks is in one pure function, so it gets tested like one.
 */

const VH = 900;
const CARD = 600;

describe('tiltPose', () => {
  test('is fully tilted back the moment the card enters from below', () => {
    const pose = tiltPose(VH, CARD, VH);

    expect(pose.rotateXDeg).toBeCloseTo(18, 5);
    expect(pose.scale).toBeCloseTo(0.94, 5);
    expect(pose.opacity).toBeCloseTo(0, 5);
  });

  test('is flat, full size and opaque once the card is centred', () => {
    // Centred means the middle of the card sits on the middle of the viewport.
    const centredTop = VH / 2 - CARD / 2;
    const pose = tiltPose(centredTop, CARD, VH);

    expect(pose.rotateXDeg).toBeCloseTo(0, 5);
    expect(pose.scale).toBeCloseTo(1, 5);
    expect(pose.opacity).toBeCloseTo(1, 5);
  });

  test('stays flat once scrolled past, never over-rotating', () => {
    // This is the case the browser was sitting at while reading a stale value:
    // the card well above the viewport must be resolved, not still animating.
    const pose = tiltPose(-940, CARD, VH);

    expect(pose.rotateXDeg).toBe(0);
    expect(pose.scale).toBe(1);
    expect(pose.opacity).toBe(1);
  });

  test('never tilts further than it started, however far below the fold', () => {
    const pose = tiltPose(VH * 4, CARD, VH);

    expect(pose.rotateXDeg).toBeLessThanOrEqual(18);
    expect(pose.opacity).toBeGreaterThanOrEqual(0);
  });

  test('stands up monotonically, never doubling back', () => {
    // A non-monotonic curve reads as the card wobbling, which is the single
    // most obvious way this kind of effect looks broken.
    const angles = [900, 800, 700, 600, 500, 400, 300, 200, 100, 0].map(
      (top) => tiltPose(top, CARD, VH).rotateXDeg,
    );

    for (let i = 1; i < angles.length; i++) {
      expect(angles[i]).toBeLessThanOrEqual(angles[i - 1]);
    }
  });

  test('finishes fading well before it finishes standing up', () => {
    // The card has to be readable while it is still moving, or the text appears
    // to arrive late and the whole thing reads as sluggish.
    const halfway = tiltPose(VH - (VH - (VH / 2 - CARD / 2)) * 0.5, CARD, VH);

    expect(halfway.opacity).toBe(1);
    expect(halfway.rotateXDeg).toBeGreaterThan(0);
  });

  test('rests when the viewport is too short for the tilt to read', () => {
    expect(tiltPose(400, CARD, 400)).toEqual(AT_REST);
  });

  test('rests rather than producing NaN when the viewport reports nothing', () => {
    /*
     * The preview pane genuinely returns 0 here, and an embedded webview can do
     * the same while layout is otherwise fine. Zero must mean "sit still", not
     * a division that puts NaN into a transform and blanks the card.
     */
    expect(tiltPose(500, CARD, 0)).toEqual(AT_REST);
    expect(tiltPose(500, CARD, Number.NaN)).toEqual(AT_REST);
  });

  test('handles a card taller than the viewport without inverting', () => {
    const tall = VH * 2;
    const pose = tiltPose(VH * 0.5, tall, VH);

    expect(pose.rotateXDeg).toBeGreaterThanOrEqual(0);
    expect(pose.rotateXDeg).toBeLessThanOrEqual(18);
    expect(Number.isFinite(pose.scale)).toBe(true);
  });
});
