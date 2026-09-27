/*
 * First run, in four screens.
 *
 * The rule is the one the whole product runs on: every press is a chance not to
 * use it. Setup had eight screens: a page of reading before anything started, a
 * screen to press a shortcut, a screen to press it again, a notification test,
 * a browser page and a survey. Each one was defensible alone and together they
 * were the reason people quit before they had seen Sidq do anything.
 *
 * Now there are four, and each one shows rather than tells. The right half of
 * every screen is a short looping film of the thing the left half asks for,
 * drawn in HTML so it is the product's own type and colour rather than a
 * recording of it.
 *
 *   signin    Sign in. The headline is the promise, the film is the promise
 *             happening, and what Sidq does with your conversations is three
 *             lines under the button instead of a page before it.
 *   sources   What was found, counted from the disk, and one switch for the
 *             assistants that live in a browser.
 *   handover  Do it once, for real. It advances on its own the moment a grab
 *             or a handover happens; there is no Next button to press instead.
 *   discover  What now runs without you, and one optional tap.
 *
 * The ids are the old ones on purpose. Rust reads the step on screen to decide
 * whether ⌘⇧K opens the picker (`STEPS_WANTING_THE_PICKER` wants "handover")
 * and counts setup by these names, so renaming them would break the one step
 * that has to work with the real shortcut.
 */

export type StepId = "signin" | "sources" | "handover" | "discover";

export interface Step {
  id: StepId;
  /** Short name for the progress line at the top. */
  label: string;
}

export const STEPS: Step[] = [
  { id: "signin", label: "Sign in" },
  { id: "sources", label: "Connect" },
  { id: "handover", label: "Try it" },
  { id: "discover", label: "Done" },
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
 * text field is a place to quit. So this is chips only.
 */
export interface IntakeOption {
  id: string;
  label: string;
}

/*
 * Where people heard about it.
 *
 * One tap, skippable, and the only question in setup whose value is entirely
 * ours rather than theirs, which is why it is last and why it is never a gate.
 */
export const DISCOVERY: IntakeOption[] = [
  { id: "x", label: "X / Twitter" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "reddit", label: "Reddit" },
  { id: "hn", label: "Hacker News" },
  { id: "friend", label: "A friend told me" },
  { id: "search", label: "Search" },
  { id: "youtube", label: "YouTube" },
  { id: "elsewhere", label: "Somewhere else" },
];
