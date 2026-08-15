import { describe, test, expect } from 'vitest';
import { entitlementsFor, planFromTier, isUnlimited, type Entitlements } from './entitlements';
import { PLANS, type PlanId } from './plans';

/*
 * These tests exist to stop the pricing page and the product disagreeing.
 *
 * Every claim on a card is enforced somewhere by reading entitlements.ts. If a
 * feature line is added to a plan without a matching entitlement, or a paid tier
 * quietly loses one, that is a customer paying for something they do not get,
 * and it should fail here rather than in a refund request.
 */

describe('entitlements', () => {
  test('an unknown tier gets the free plan, never a paid one', () => {
    expect(planFromTier(undefined)).toBe('free');
    expect(planFromTier(null)).toBe('free');
    expect(planFromTier('enterprise-lol')).toBe('free');
    expect(planFromTier('')).toBe('free');
  });

  test('the legacy paid value still maps to Pro', () => {
    // Everyone who subscribed before the tiers split is sitting on 'paid'.
    // Losing them would be an outage for exactly the people who pay.
    expect(planFromTier('paid')).toBe('pro');
  });

  test('free is metered on the two things that cost money or carry the value', () => {
    const free = entitlementsFor('free');

    expect(isUnlimited(free.rebuildsPerWeek)).toBe(false);
    expect(isUnlimited(free.companionMinutesPerDay)).toBe(false);
    expect(free.calibration).toBe(false);
  });

  test('free is metered rather than crippled', () => {
    const free = entitlementsFor('free');

    // Every capability is present in some amount. A free plan that cannot do
    // anything teaches nobody anything and converts nobody.
    expect(free.rebuildsPerWeek).toBeGreaterThan(0);
    expect(free.companionMinutesPerDay).toBeGreaterThan(0);
    expect(free.historyDays).toBeGreaterThan(0);
    expect(free.replay).toBe(true);
  });

  test('free history is short enough that calibration can never quietly work', () => {
    const free = entitlementsFor('free');

    // calibration.ts needs 3 closed days and 12 tasks. Seven days of history is
    // deliberately close to that line: the wall has to be reachable to be felt.
    expect(free.historyDays).toBeGreaterThanOrEqual(7);
    expect(free.historyDays).toBeLessThan(14);
  });

  test('paying removes every meter', () => {
    for (const plan of ['pro', 'duo'] as const) {
      const e = entitlementsFor(plan);
      expect(isUnlimited(e.rebuildsPerWeek)).toBe(true);
      expect(isUnlimited(e.companionMinutesPerDay)).toBe(true);
      expect(isUnlimited(e.historyDays)).toBe(true);
    }
  });

  test('duo is Pro plus a seat, never less than Pro', () => {
    const pro = entitlementsFor('pro');
    const duo = entitlementsFor('duo');

    for (const key of Object.keys(pro) as (keyof Entitlements)[]) {
      if (typeof pro[key] === 'boolean') expect(duo[key]).toBe(pro[key]);
    }
    expect(duo.seats).toBeGreaterThan(pro.seats);
  });

  test('every paid plan beats free on something people can name', () => {
    const free = entitlementsFor('free');
    for (const plan of ['pro', 'duo'] as const) {
      const e = entitlementsFor(plan);
      expect(e.calibration && !free.calibration).toBe(true);
      expect(e.rescue && !free.rescue).toBe(true);
    }
  });
});

describe('pricing cards match the contract', () => {
  const ids = PLANS.map((p) => p.id);

  test('every card has entitlements behind it', () => {
    for (const id of ids) {
      expect(entitlementsFor(id as PlanId)).toBeDefined();
    }
  });

  test('no card promises a human being doing work', () => {
    // The tier this replaced promised "a real person sees your week". Anything
    // that needs a human in the loop cannot be honoured by a solo team and does
    // not survive the hundredth customer, so it must never come back.
    const text = PLANS.flatMap((p) => [p.promise, ...p.features])
      .join(' ')
      .toLowerCase();

    expect(text).not.toMatch(/real person|a human|coach reviews|we will review|our team/);
  });

  test('the free card never claims something free does not have', () => {
    const free = entitlementsFor('free');
    const text = PLANS[0].features.join(' ').toLowerCase();

    if (!free.calibration) expect(text).not.toMatch(/learns what you|your real capacity/);
    if (!free.rescue) expect(text).not.toMatch(/rescue/);
    if (!free.rooms) expect(text).not.toMatch(/rooms/);
  });

  test('the free card states its actual numbers', () => {
    /*
     * The two limits a free user actually meets.
     *
     * This asserted rebuilds and history days while the card advertised them,
     * and caught the change the moment the product stopped being metered that
     * way. Whatever the free card meters, the number on it has to be the number
     * in the contract, which is the only claim on the pricing page a test can
     * check for itself.
     */
    const free = entitlementsFor('free');
    const text = PLANS[0].features.join(' ');

    expect(text).toContain(String(free.handoffsPerWeek));
    expect(text).toContain(String(free.sources));
  });

  test('no card sells a capability that is switched off for that plan', () => {
    /*
     * This caught a real one. Pro advertised "Rooms, for working alongside
     * someone" after the panel was taken off the card, so a paying customer had
     * no way to reach a thing they were shown on the pricing page.
     *
     * Prose has nothing checking it, which is exactly why it drifts.
     */
    const gated: [keyof Entitlements, RegExp][] = [
      ['rooms', /\brooms?\b/i],
      ['rescue', /\brescues?\b/i],
      ['calibration', /learns the block sizes|real daily capacity/i],
    ];

    for (const plan of PLANS) {
      const limits = entitlementsFor(plan.id);
      const text = [plan.promise, ...plan.features].join(' ');

      for (const [key, pattern] of gated) {
        if (limits[key] === false) {
          expect(
            pattern.test(text),
            `${plan.name} advertises ${String(key)} but it is off for that plan`,
          ).toBe(false);
        }
      }
    }
  });

  test('exactly one card is featured', () => {
    expect(PLANS.filter((p) => p.featured)).toHaveLength(1);
  });
});
