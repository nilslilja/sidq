import {
  ALLOWED_MINUTES,
  MAX_TASKS,
  MIN_TASKS,
  MAX_TOTAL_MINUTES,
  MIN_TOTAL_MINUTES,
  type Plan,
} from '@shared/plan';
import type { PlanInput } from '@shared/prompt';

/*
 * Offline stand-in for the model, used when no backend is configured so the whole
 * loop can be demoed and tested without keys or network.
 *
 * It is a heuristic, not a planner. It is deliberately labelled in the UI wherever
 * it runs. It exists so the app is never a dead screen. It is not the product, and
 * nothing about the real plan quality should be inferred from it.
 */

interface Rule {
  id: string;
  match: RegExp;
  title: string;
  minutes: number;
  why: string;
}

/*
 * Titles are fixed phrases rather than templates that splice the goal text in.
 * Interpolating raw goal text produces exactly the garbage this fallback is
 * supposed to avoid: "List the 3 things still blocking ship sidq to a first
 * paying", clipped mid-phrase and case-mangled. The goal goes in the `why` line
 * verbatim instead, where it is quoted rather than rewritten.
 */
const RULES: Rule[] = [
  {
    id: 'ship',
    match: /\b(ship|launch|release|deploy|publish)\b/i,
    title: "Fix the one thing you know is broken",
    minutes: 25,
    why: 'Nothing ships until this one is closed.',
  },
  {
    id: 'study',
    match: /\b(stud(y|ying)|exam|revis|learn|course|class)\b/i,
    title: 'Do 45 minutes with the phone in another room',
    minutes: 45,
    why: 'Contact time beats planning time.',
  },
  {
    id: 'move',
    match: /\b(gym|lift|run|walk|shape|fit|train|exercise)\b/i,
    title: 'Put your shoes on and move for 15 minutes',
    minutes: 15,
    why: 'The shoes are the whole decision.',
  },
  {
    id: 'inbox',
    match: /\b(email|reply|respond|inbox|message|call|text)\b/i,
    title: 'Answer the oldest message in two sentences',
    minutes: 15,
    why: 'Oldest first, shortest possible. Then close it.',
  },
  {
    id: 'write',
    match: /\b(write|post|draft|blog|newsletter|article|content)\b/i,
    title: 'Draft five rough openers and keep the worst one',
    minutes: 25,
    why: 'Five bad ones beat waiting for one good one.',
  },
  {
    id: 'money',
    match: /\b(client|invoice|freelance|contract|money|paid|revenue|customer)\b/i,
    title: 'Send the one message you have been putting off',
    minutes: 15,
    why: 'This is the one that touches your runway.',
  },
  {
    id: 'tidy',
    match: /\b(clean|tidy|organi[sz]e|laundry|dishes|admin|paperwork)\b/i,
    title: 'Set a timer and tidy one surface',
    minutes: 15,
    why: 'One surface, not the room.',
  },
];

const GENERIC: Omit<Rule, 'id' | 'match'>[] = [
  { title: 'Do 25 focused minutes on it', minutes: 25, why: 'Starting is the hard part, so start small.' },
  { title: 'Do the smallest version of it that counts', minutes: 25, why: 'Small and done beats big and pending.' },
  { title: 'Give this one uninterrupted block', minutes: 45, why: 'It has waited long enough for a real sitting.' },
];

/** Quotes the goal without rewriting it. Cuts on a word boundary, never mid-word. */
function quoteGoal(goal: string, maxWords = 8): string {
  const words = goal.trim().split(/\s+/).filter(Boolean);
  return words.length > maxWords ? `${words.slice(0, maxWords).join(' ')}…` : words.join(' ');
}

export function mockPlan(input: PlanInput): Plan {
  const tasks: Plan['tasks'] = [];
  const seen = new Set<string>();

  const push = (title: string, minutes: number, why: string) => {
    const key = title.toLowerCase();
    if (seen.has(key) || tasks.length >= MAX_TASKS) return;
    seen.add(key);
    tasks.push({ title, est_minutes: minutes, why });
  };

  // Carried work leads, shrunk once it has been sitting too long, following the same rule the
  // real prompt follows, so the demo does not teach a different behaviour.
  const rotten: string[] = [];
  for (const carried of input.carriedOver) {
    if (carried.carryCount >= 2) {
      rotten.push(carried.title);
      push(`Spend 15 minutes on the smallest piece of "${carried.title}"`, 15, 'Shrunk on purpose.');
    } else {
      push(carried.title, 25, 'Left over from yesterday and still worth doing.');
    }
  }

  // Each rule fires at most once. Without this, two goals that both look like
  // shipping produce two tasks with an identical stem, which reads as a bug.
  const usedRules = new Set<string>();
  let genericIndex = 0;

  for (const goal of input.goals) {
    const rule = RULES.find((r) => r.match.test(goal) && !usedRules.has(r.id));
    if (rule) {
      usedRules.add(rule.id);
      push(rule.title, rule.minutes, `Toward "${quoteGoal(goal)}".`);
      continue;
    }
    const generic = GENERIC[genericIndex % GENERIC.length];
    genericIndex++;
    push(generic.title, generic.minutes, `Toward "${quoteGoal(goal)}".`);
  }

  const FILLER = [
    { title: 'Step outside for 15 minutes', m: 15, w: 'You think better after moving.' },
    { title: 'Clear your desk before you start', m: 15, w: 'Cheap win, real effect.' },
    { title: 'Take a real break away from the screen', m: 15, w: 'Not optional at this pace.' },
    { title: 'Put tomorrow\u2019s first task on your desk', m: 15, w: 'Tomorrow-you starts warm.' },
  ];
  let fillerIndex = 0;
  const total = () => tasks.reduce((s, t) => s + t.est_minutes, 0);

  while (tasks.length < MIN_TASKS && fillerIndex < FILLER.length) {
    const filler = FILLER[fillerIndex];
    fillerIndex++;
    push(filler.title, filler.m, filler.w);
  }

  // Hold the same 240-minute ceiling the prompt enforces.
  while (total() > MAX_TOTAL_MINUTES && tasks.length > MIN_TASKS) {
    const removed = tasks.pop()!;
    seen.delete(removed.title.toLowerCase());
  }

  // And the same 90-minute floor. A day this thin is not worth opening, and the
  // grader rejects it, the fallback has to clear the identical bar the model does.
  while (total() < MIN_TOTAL_MINUTES && tasks.length < MAX_TASKS && fillerIndex < FILLER.length) {
    const filler = FILLER[fillerIndex];
    fillerIndex++;
    push(filler.title, filler.m, filler.w);
  }

  // Out of tasks to add but still short: grow existing blocks up the allowed
  // ladder instead, largest first so the shape stays plausible.
  for (const task of tasks) {
    if (total() >= MIN_TOTAL_MINUTES) break;
    const nextUp = ALLOWED_MINUTES.find((m) => m > task.est_minutes);
    if (nextUp) task.est_minutes = nextUp;
  }

  const noteParts: string[] = [];
  if (rotten.length > 0) {
    noteParts.push(`"${rotten[0]}" has been sitting a while, so today it is only the first slice.`);
  }
  if (input.goals.length > tasks.length) {
    noteParts.push(`The rest of the list is still there. It keeps.`);
  }
  if (noteParts.length === 0) {
    noteParts.push('Short day on purpose. Finishing it is the point.');
  }

  return {
    top_priority: tasks[0].title,
    tasks,
    note: noteParts.join(' '),
  };
}
