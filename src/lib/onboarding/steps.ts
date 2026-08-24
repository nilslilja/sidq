/*
 * First run.
 *
 * The structure is taken from the onboarding that is currently doing this best:
 * a two pane window, instruction on the left, a live preview of the real product
 * on the right, and one action per screen.
 *
 * The part worth stealing is not the layout, it is the gating. Several steps do
 * not advance on a button. They advance when you actually press the shortcut. You
 * cannot finish setup without having used the product, which is why people who
 * finish it still know the shortcuts a week later. A "Next" button teaches nothing.
 *
 * Where Sidq deliberately differs:
 *
 *   - Permissions. They ask for accessibility, microphone and screen recording.
 *     Sidq asks for one thing and spends a whole screen saying what it will never
 *     take. For a product that sits on your screen all day, that is the single
 *     most valuable minute in the flow.
 *
 *   - There is an intake step. Their product needs to know nothing about you.
 *     Ours is useless until it knows what you are trying to do, so the flow ends
 *     with a real plan on screen rather than with a feature tour.
 */

/*
 * Phases, for the progress rail.
 *
 * Twelve steps shown as twelve dots reads as a chore. Five named phases reads as
 * a short process with a visible end, which is the same information framed as
 * something finishable.
 */
/*
 * Accessibility is asked for again, and this time it is load-bearing.
 *
 * It was removed when the window watcher went, on the reasoning that asking for
 * the scariest thing macOS can grant for a capability the app does not use is
 * the most expensive sentence in an install. That was right then and it is
 * wrong now: assistants that run in a browser write nothing readable to disk,
 * and this is what reads them.
 *
 * The alternatives were both worse. A store extension means a review queue and
 * a developer-mode install per browser; opening the assistants inside Sidq's
 * own window breaks passkeys and every password manager. One switch beats both.
 */
export const PHASES = ['Get started', 'Connect', 'Set up', 'Learn', 'Start'] as const;
export type Phase = (typeof PHASES)[number];

export type StepId =
  | 'welcome'
  | 'discover'
  | 'signin'
  | 'sources'
  | 'reading'
  | 'intake'
  | 'name'
  | 'pill'
  | 'handover'
  | 'notifications'
  | 'browse'
  | 'walkthrough';

/** How a step is allowed to advance. */
export type Gate =
  | { kind: 'button'; label: string }
  /** Advances only when the shortcut is actually pressed. */
  | { kind: 'shortcut'; hint: string; skippable: boolean }
  /** Advances when some external condition flips, e.g. a permission is granted. */
  | { kind: 'condition'; waiting: string };

export interface Step {
  id: StepId;
  /** Which segment of the rail lights up on this step. */
  phase: Phase;
  title: string;
  /** One line under the title. Never two. */
  subtitle?: string;
  gate: Gate;
  /** Steps the person can leave and come back to without losing anything. */
  optional?: boolean;
}

export const STEPS: Step[] = [
  {
    id: 'welcome',
    phase: 'Get started',
    title: 'Welcome to Sidq',
    /*
     * The pitch, because this is the first sentence anyone reads inside the
     * product and the one they are most likely to repeat to somebody else.
     * It is the same line that sits over the download button on the site, so
     * the sentence that got them here is the sentence that greets them.
     */
    subtitle: 'Stop introducing yourself to robots. This takes about a minute.',
    gate: { kind: 'button', label: 'Continue' },
  },
  {
    id: 'discover',
    phase: 'Get started',
    title: 'How did you find Sidq?',
    subtitle: 'One tap, and it tells us where to show up more.',
    gate: { kind: 'button', label: 'Continue' },
  },
  {
    id: 'signin',
    phase: 'Get started',
    title: 'Sign in to keep your history',
    subtitle: 'Opens in your browser, then comes straight back here.',
    gate: { kind: 'condition', waiting: 'Waiting for the browser' },
  },
  {
    id: 'sources',
    phase: 'Connect',
    title: 'Connect your AIs',
    subtitle: 'The ones on this Mac are already done. The rest take one click.',
    gate: { kind: 'button', label: 'Continue' },
  },
  /*
   * The one thing about Sidq that surprises people, said before it can.
   *
   * "It worked for ChatGPT, but only that one chat. That's wrong." It is not
   * wrong, it is the whole shape of the product, and it was left to be
   * discovered after setup by somebody who then thought it was broken.
   *
   * Its own step rather than a paragraph inside another one. It was a paragraph
   * on the last screen, under a permission card, a row of chips and a live
   * status panel — which is where prose goes to not be read.
   */
  {
    id: 'reading',
    phase: 'Connect',
    title: 'How Sidq reads your AIs',
    subtitle: 'Two kinds, and only one of them needs anything from you.',
    gate: { kind: 'button', label: 'Got it' },
  },
  {
    id: 'intake',
    phase: 'Set up',
    title: 'Which do you use most?',
    /*
     * This said "it tells us which to support next", which was a way of saying
     * the answer went nowhere. It ordered nothing and changed nothing; it was
     * written to localStorage and read by no code in the app.
     *
     * It now orders the Sources panel, so the AIs somebody actually uses are at
     * the top of the list they will look at most.
     */
    subtitle: 'They go to the top of your Sources list.',
    gate: { kind: 'button', label: 'Continue' },
  },
  {
    id: 'name',
    phase: 'Set up',
    title: 'What should Sidq call you?',
    subtitle: 'Only used to greet you. It never leaves this Mac.',
    gate: { kind: 'button', label: 'Continue' },
    optional: true,
  },
  /*
   * The only thing anybody has to learn.
   *
   * This replaces four screens that each taught a feature the product no longer
   * has: quick capture, hiding the card, dragging the card, and a day the
   * planner used to build. One of them could not be completed at all, because
   * the window it told you to drag is deliberately fixed.
   *
   * Gated on the shortcut genuinely firing rather than on a Continue button.
   * Sidq is one keystroke, and somebody who has not pressed it once has not
   * seen the product. Skippable so a keyboard conflict cannot trap anyone.
   */
  {
    id: 'pill',
    phase: 'Learn',
    title: 'Press ⌘⇧K',
    subtitle: 'From inside anything. Everything you were working on, ranked.',
    gate: { kind: 'shortcut', hint: 'Press ⌘⇧K to continue', skippable: true },
  },
  /*
   * Setup used to stop here, on a keyboard shortcut.
   *
   * Which meant the last thing that happened in somebody's first minute was
   * being taught a key, and then a window closing. Nothing had been handed
   * over, nothing had been searched, and the assistants they actually use all
   * day were still not connected to anything.
   *
   * So the final screen does the thing. It opens an assistant in their own
   * browser and points at the extension, and the first minute ends with the
   * product working rather than with a settings panel.
   */
  /*
   * The one step that makes somebody do the thing the product is for.
   *
   * Setup taught the shortcut and then ended, so the first handover happened
   * later, alone, with nothing to fall back on if it went wrong. Doing it once
   * here means the file has been made, seen, and understood before anybody is
   * left on their own with it.
   */
  {
    id: 'handover',
    phase: 'Learn',
    title: 'Carry one into another AI',
    subtitle: 'Pick any conversation and press Enter. It writes a file.',
    gate: { kind: 'condition', waiting: 'Waiting for the first one' },
  },
  /*
   * ── Notifications, placed after the first handover ───────────────────────
   *
   * Not with the Accessibility ask, which is the other permission in this flow
   * and the tempting place to put it. Two system prompts back to back reads as
   * an app helping itself to things, and the important one loses: somebody who
   * has just been asked for Accessibility is at their least willing to grant
   * anything else, and Accessibility is what the browser half of the product
   * depends on.
   *
   * Here it follows the person having actually seen a handover work, so the
   * offer is about something they now understand rather than a permission
   * requested up front for reasons they cannot yet judge.
   */
  {
    id: 'notifications',
    phase: 'Learn',
    title: 'Know when it finds something',
    subtitle: 'Sidq reads while you are in another app, so it should say so.',
    gate: { kind: 'button', label: 'Continue' },
    optional: true,
  },
  {
    id: 'browse',
    phase: 'Start',
    title: 'Open one and carry on',
    subtitle: 'Anything you open from now on is read as you use it.',
    gate: { kind: 'button', label: 'Continue' },
  },
  /*
   * ── The whole loop, last, before the window opens ────────────────────────
   *
   * "We know for sure what to do at this point. But new users won't have a
   * clue." Every step before this teaches one thing in isolation — the
   * permission, the shortcut, one handover — and none of them shows the shape
   * of the thing: open a specific conversation, wait, get told, press the
   * shortcut, filter, choose, drop the file somewhere else.
   *
   * It is last on purpose. Shown first it is a diagram of things that have not
   * happened yet; shown here, every part of it is something they have now
   * done once, and this is the join.
   */
  {
    id: 'walkthrough',
    phase: 'Start',
    title: 'That is the whole thing',
    subtitle: 'Five steps, every time. Watch it once and you have the product.',
    gate: { kind: 'button', label: 'Start using Sidq' },
  },
];

export function stepIndex(id: StepId): number {
  return STEPS.findIndex((s) => s.id === id);
}

export function nextStep(id: StepId): StepId | null {
  const i = stepIndex(id);
  return i >= 0 && i < STEPS.length - 1 ? STEPS[i + 1].id : null;
}

/*
 * Intake, reduced to taps.
 *
 * The web intake asks people to type. At first run, before any trust exists, every
 * text field is a place to quit. So this is chips only, and the whole step can be
 * completed in four taps.
 */
export interface IntakeOption {
  id: string;
  label: string;
}

/*
 * Where people heard about it.
 *
 * Asked first because the answer decays: two screens later somebody is thinking
 * about their day, not about the tweet. One tap, skippable, and the only
 * question here whose value is entirely ours rather than theirs.
 */
export const DISCOVERY: IntakeOption[] = [
  { id: 'x', label: 'X / Twitter' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'reddit', label: 'Reddit' },
  { id: 'hn', label: 'Hacker News' },
  { id: 'friend', label: 'A friend told me' },
  { id: 'search', label: 'Search' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'elsewhere', label: 'Somewhere else' },
];

/*
 * What they want Sidq to do.
 *
 * Deliberately inside Sidq's actual competence: every option maps to something
 * the product does today. An option nobody can deliver is a promise made during
 * setup and broken on day one.
 */
/*
 * Which assistants they actually use.
 *
 * This asked what someone wanted Sidq to do for them, and four of the six
 * answers were features that no longer exist: decide my day, catch me when I
 * drift, show me where my time goes, save days that go wrong. Someone reading
 * that in setup is being told about a different product in the same breath as
 * installing this one.
 *
 * The replacement is the one question whose answer changes what gets built
 * next. It also teaches, in the moment they answer it, what Sidq is actually
 * for: these are the things it moves work between.
 */
export const INTENTS: IntakeOption[] = [
  { id: 'claude-code', label: 'Claude Code' },
  { id: 'claude', label: 'Claude' },
  { id: 'chatgpt', label: 'ChatGPT' },
  { id: 'cursor', label: 'Cursor' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'copilot', label: 'GitHub Copilot' },
  { id: 'other', label: 'Something else' },
];

