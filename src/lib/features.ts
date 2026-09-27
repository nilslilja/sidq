/**
 * What the product is showing this week.
 *
 * ── Why these are flags and not deletions ───────────────────────────────────
 * Every one of these works. None of them is broken, and none of them is being
 * removed from git or from the database. They are switched off because the
 * pitch has to be one sentence, and each of them is a second sentence somebody
 * has to be told before the first one lands.
 *
 * The test is not "is this good", it is "does explaining this cost more than
 * the number of people using it is worth". For a team folder nobody has bought
 * and a share link nobody has sent, that arithmetic is not close.
 *
 * ── Why a module and not a constant ────────────────────────────────────────
 * Because `Home.test.tsx` opens every one of these panels, and a panel that no
 * longer renders is a test that no longer passes. Deleting those tests would
 * make "reversible in an afternoon" a thing we say rather than a thing that is
 * true: the panels would come back untested.
 *
 * So the tests mock this module to `true` and keep exercising the panels
 * exactly as before, while the shipped app renders none of them. Turning one
 * back on is one word here.
 */
export const FEATURES = {
  /**
   * The team folder, seats and everything around them.
   *
   * ── Why this is back on ────────────────────────────────────────────────
   *
   * It went off because nobody had bought one. That reasoning had a hole in
   * it: nobody could. The tier is filtered out of `PLANS` by this flag, so the
   * card never rendered, and the only two unprompted feature requests this
   * product has ever received were both for team context.
   *
   * Direct outreach since then pointed at the same place from the other side:
   * an individual with no personal stake in their own speed does not convert,
   * and the people who do are organisations buying for the developers they
   * employ. That is this tier.
   *
   * It is still the largest block of concepts on the screen. The difference is
   * that it is now the block the identified buyer came asking for.
   */
  team: true,

  /**
   * Invites.
   *
   * Invites grant extra weekly handovers. This was written when
   * `handovers_per_week` returned `None` for everybody, which made the reward
   * a prize for beating a limit that did not exist.
   *
   * That is no longer the state: Free is capped at five a week again. So the
   * reasoning here is stale rather than wrong-headed, and this flag is now an
   * open question instead of a settled one. Left off deliberately until the
   * team tier has been sold to somebody, because a referral loop for a product
   * with no customers refers nobody.
   */
  invites: false,

  /**
   * Share links.
   *
   * The only feature where a conversation leaves the Mac. The pitch is now
   * "every word stays on this machine", and one exception in a settings panel
   * is the exception somebody screenshots.
   */
  sharing: false,

  /**
   * Project memory as a *product surface*: the "What you're on" tab.
   *
   * It went dark when the pitch was handovers and "AI memory" was a category
   * with funded incumbents in it that Sidq was not picking a fight with. The
   * pitch is now "one memory for every AI you use", on the front page, so a
   * window that hides the memory is the product disagreeing with its own
   * website. It is back on, as the page that shows what the memory holds.
   */
  projectMemory: true,
} as const;
