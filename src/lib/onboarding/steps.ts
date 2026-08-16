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
 * No Permissions phase.
 *
 * Setup used to ask for macOS Accessibility. Nothing needs it any more: that
 * permission existed for the window watcher, which is gone, and copying a
 * conversation to the clipboard needs no permission at all. Asking for the
 * scariest thing macOS can grant, for a capability the app does not use, is the
 * most expensive sentence in an install.
 */
export const PHASES = ['Get started', 'Connect', 'Set up', 'Learn'] as const;
export type Phase = (typeof PHASES)[number];

export type StepId =
  | 'welcome'
  | 'discover'
  | 'signin'
  | 'sources'
  | 'intake'
  | 'pill';

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
    subtitle: 'Picks up where you stopped, and holds you to one thing.',
    gate: { kind: 'button', label: 'Continue' },
  },
  {
    id: 'discover',
    phase: 'Get started',
    title: 'How did you find Sidq?',
    subtitle: 'One tap. It tells us which of these is worth doing more of.',
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
    title: 'Connect your assistants',
    subtitle: 'The ones on this Mac are already done. The rest take one click.',
    gate: { kind: 'button', label: 'Continue' },
  },
  {
    id: 'intake',
    phase: 'Set up',
    title: 'What are you actually trying to do?',
    subtitle: 'Pick what fits. You can change all of it later.',
    gate: { kind: 'button', label: 'Continue' },
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
export const INTENTS: IntakeOption[] = [
  { id: 'resume', label: 'Remember where I stopped' },
  { id: 'decide', label: 'Decide my day for me' },
  { id: 'drift', label: 'Catch me when I drift' },
  { id: 'measure', label: 'Show me where my time goes' },
  { id: 'finish', label: 'Help me finish what I start' },
  { id: 'rescue', label: 'Save days that go wrong' },
];

export const FOCUS_AREAS: IntakeOption[] = [
  { id: 'ship', label: 'Ship a product' },
  { id: 'study', label: 'Study or coursework' },
  { id: 'clients', label: 'Client work' },
  { id: 'writing', label: 'Writing' },
  { id: 'jobhunt', label: 'Job hunting' },
  { id: 'admin', label: 'Dig out of admin' },
  { id: 'fitness', label: 'Training' },
  { id: 'side', label: 'A side project' },
];

export const BLOCKERS: IntakeOption[] = [
  { id: 'start', label: 'Starting is the hard part' },
  { id: 'switch', label: 'I switch tabs constantly' },
  { id: 'overplan', label: 'I plan more than I do' },
  { id: 'finish', label: 'I start things and drop them' },
  { id: 'toomuch', label: 'Everything feels urgent' },
  { id: 'evenings', label: 'I lose the afternoon' },
];

export const RHYTHMS: IntakeOption[] = [
  { id: 'morning', label: 'Mornings' },
  { id: 'afternoon', label: 'Afternoons' },
  { id: 'night', label: 'Late night' },
  { id: 'chaos', label: 'No pattern at all' },
];
