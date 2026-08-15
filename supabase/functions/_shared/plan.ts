// Parsing + grading for generated plans.
//
// Two tiers, on purpose:
//   parsePlan: lenient, never throws, recovers whatever it can. Used in production.
//                A user must never see an error because the model wrote 30 instead of 25.
//   gradePlan: strict, returns every violation. Used by the eval harness as the
//                quality gate, and logged (not enforced) in production so prompt drift
//                is visible before it is a support ticket.

export const ALLOWED_MINUTES = [15, 25, 45, 50, 90] as const;
export const MIN_TASKS = 3;
export const MAX_TASKS = 6;
export const MIN_TOTAL_MINUTES = 90;
export const MAX_TOTAL_MINUTES = 240;
export const MAX_TITLE_LENGTH = 80;

export interface PlanTask {
  title: string;
  est_minutes: number;
  why: string;
}

export interface Plan {
  top_priority: string;
  tasks: PlanTask[];
  note: string;
}

export interface ParseResult {
  plan: Plan;
  /** true when the model's output was not clean JSON and we had to recover. */
  recovered: boolean;
  /** what we had to do to make it usable. Log these; they predict prompt rot. */
  repairs: string[];
}

/**
 * Pull the first balanced JSON object out of arbitrary model output.
 * Handles fences, leading prose, trailing prose, and braces inside strings.
 */
function extractJsonObject(raw: string): string | null {
  const text = raw.replace(/^﻿/, '').trim();

  // Strip a fenced block if the whole thing is one.
  const fenced = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  const body = fenced ? fenced[1].trim() : text;

  const start = body.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < body.length; i++) {
    const ch = body[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      if (inString) escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return body.slice(start, i + 1);
    }
  }
  return null;
}

function coerceMinutes(value: unknown): number {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n) || n <= 0) return 25;
  // Snap to the nearest allowed size, ties going up. Time blindness cuts one way.
  let best: number = ALLOWED_MINUTES[0];
  let bestDist = Number.POSITIVE_INFINITY;
  for (const m of ALLOWED_MINUTES) {
    const d = Math.abs(m - n);
    if (d < bestDist || (d === bestDist && m > best)) {
      best = m;
      bestDist = d;
    }
  }
  return best;
}

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Last resort when there is no usable JSON at all: read the model's prose as an
 * ordered list. Better a plain plan than an error screen. The user still gets a day.
 */
function planFromProse(raw: string): Plan | null {
  const lines = raw
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim())
    .filter((l) => l.length > 2 && l.length < 200 && !l.startsWith('{') && !l.startsWith('}'));

  if (lines.length === 0) return null;

  const tasks = lines.slice(0, MAX_TASKS).map((title) => ({
    title: title.slice(0, MAX_TITLE_LENGTH),
    est_minutes: 25,
    why: '',
  }));

  while (tasks.length < MIN_TASKS) {
    tasks.push({ title: 'Pick one thing and start it', est_minutes: 25, why: '' });
  }

  return {
    top_priority: tasks[0].title,
    tasks,
    note: '',
  };
}

/** Never throws. Always returns something a user can act on. */
export function parsePlan(raw: string): ParseResult {
  const repairs: string[] = [];
  let recovered = false;

  const json = extractJsonObject(raw);
  if (json === null) {
    repairs.push('no-json-found');
    const prose = planFromProse(raw);
    if (prose) return { plan: prose, recovered: true, repairs: [...repairs, 'prose-fallback'] };
    return {
      plan: emptyDayPlan(),
      recovered: true,
      repairs: [...repairs, 'empty-fallback'],
    };
  }

  if (json !== raw.trim()) {
    repairs.push('stripped-wrapper');
    recovered = true;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    repairs.push('json-parse-failed');
    const prose = planFromProse(raw);
    if (prose) return { plan: prose, recovered: true, repairs: [...repairs, 'prose-fallback'] };
    return { plan: emptyDayPlan(), recovered: true, repairs: [...repairs, 'empty-fallback'] };
  }

  const obj = (parsed ?? {}) as Record<string, unknown>;
  const rawTasks = Array.isArray(obj.tasks) ? obj.tasks : [];

  let tasks: PlanTask[] = rawTasks
    .map((t) => {
      const item = (t ?? {}) as Record<string, unknown>;
      return {
        title: cleanString(item.title).slice(0, MAX_TITLE_LENGTH),
        est_minutes: coerceMinutes(item.est_minutes),
        why: cleanString(item.why),
      };
    })
    .filter((t) => t.title.length > 0);

  if (tasks.length === 0) {
    repairs.push('no-tasks');
    const prose = planFromProse(raw);
    if (prose) return { plan: prose, recovered: true, repairs: [...repairs, 'prose-fallback'] };
    return { plan: emptyDayPlan(), recovered: true, repairs: [...repairs, 'empty-fallback'] };
  }

  if (tasks.length > MAX_TASKS) {
    tasks = tasks.slice(0, MAX_TASKS);
    repairs.push('truncated-tasks');
    recovered = true;
  }

  let topPriority = cleanString(obj.top_priority);
  if (topPriority.length === 0) {
    topPriority = tasks[0].title;
    repairs.push('derived-top-priority');
    recovered = true;
  } else if (topPriority !== tasks[0].title) {
    // The named priority must be the first row on the board. Reorder rather than
    // rewrite, so we keep the model's intent instead of overriding it.
    const idx = tasks.findIndex((t) => t.title === topPriority);
    if (idx > 0) {
      tasks = [tasks[idx], ...tasks.slice(0, idx), ...tasks.slice(idx + 1)];
      repairs.push('reordered-top-priority');
    } else {
      topPriority = tasks[0].title;
      repairs.push('realigned-top-priority');
    }
    recovered = true;
  }

  return {
    plan: { top_priority: topPriority, tasks, note: cleanString(obj.note) },
    recovered,
    repairs,
  };
}

/** The floor. Used only when the model gave us nothing usable at all. */
export function emptyDayPlan(): Plan {
  return {
    // Concrete even here. A fallback that says "decide what matters" is the exact
    // failure this product exists to prevent, and it would be shown at the worst
    // possible moment.
    top_priority: 'Start the thing you were already avoiding',
    tasks: [
      {
        title: 'Start the thing you were already avoiding',
        est_minutes: 25,
        why: 'You already know which one it is.',
      },
      { title: 'Take a real break away from the screen', est_minutes: 15, why: '' },
      { title: 'Do one more 45 minute block on it', est_minutes: 45, why: '' },
    ],
    note: "Plan generation had a hiccup, so this is a manual day. Regenerate when you're ready.",
  };
}

export interface Violation {
  rule: string;
  detail: string;
  severity: 'error' | 'warn';
}

const BANNED_PHRASES = [
  "let's",
  'crush',
  'smash',
  'dominate',
  'grind',
  'hustle',
  'level up',
  'unlock',
  'productivity',
  'journey',
  'gentle reminder',
  'be kind to yourself',
  'make sure to',
  'you got this',
  "you've got this",
];

/*
 * Tasks that hand the planning back to the user. This is the product's core failure
 * mode: Sidq exists to decide, so a task like "Write down the 3 things blocking
 * launch" is the app admitting it did not do its job. Graded as an error, not a warn.
 */
const META_TASK_PATTERNS = [
  /\bdecide\b/i,
  /\bfigure out\b/i,
  /\bwork out (what|which|how)\b/i,
  /\bthink about\b/i,
  /\breview your\b/i,
  /\bplan (your|out|the day)\b/i,
  /\bwrite down (what|the things|everything|your)\b/i,
  /\blist (the things|out what|what)\b/i,
  /\bidentify (the|what|which)\b/i,
  /\bmap out\b/i,
  /\bbrainstorm\b/i,
  /\bprioriti[sz]e your\b/i,
  /\bmake a (list|plan) of\b/i,
];

export function isMetaTask(title: string): boolean {
  return META_TASK_PATTERNS.some((p) => p.test(title));
}

/** Strict. This is the gate. Every violation here is the prompt failing, not the user. */
export function gradePlan(plan: Plan): Violation[] {
  const v: Violation[] = [];
  const err = (rule: string, detail: string) => v.push({ rule, detail, severity: 'error' });
  const warn = (rule: string, detail: string) => v.push({ rule, detail, severity: 'warn' });

  if (plan.tasks.length < MIN_TASKS || plan.tasks.length > MAX_TASKS) {
    err('task-count', `${plan.tasks.length} tasks, expected ${MIN_TASKS}-${MAX_TASKS}`);
  }

  if (plan.top_priority !== plan.tasks[0]?.title) {
    err('top-priority-first', `top_priority "${plan.top_priority}" is not tasks[0]`);
  }

  const total = plan.tasks.reduce((sum, t) => sum + t.est_minutes, 0);
  if (total < MIN_TOTAL_MINUTES || total > MAX_TOTAL_MINUTES) {
    err('total-budget', `${total} min, expected ${MIN_TOTAL_MINUTES}-${MAX_TOTAL_MINUTES}`);
  }

  for (const [i, t] of plan.tasks.entries()) {
    if (!(ALLOWED_MINUTES as readonly number[]).includes(t.est_minutes)) {
      err('minute-shape', `task ${i} is ${t.est_minutes}, expected one of ${ALLOWED_MINUTES}`);
    }
    if (t.title.length > MAX_TITLE_LENGTH) {
      err('title-length', `task ${i} title is ${t.title.length} chars`);
    }
    if (isMetaTask(t.title)) {
      err('meta-task', `task ${i} tells the user to plan instead of planning: "${t.title}"`);
    }
    if (t.title.includes(':') || t.title.includes('/')) {
      warn('title-punctuation', `task ${i} title contains a colon or slash: "${t.title}"`);
    }
    if (/^(the|a|an|my|your)\b/i.test(t.title)) {
      warn('title-verb-first', `task ${i} does not start with a verb: "${t.title}"`);
    }
    if (t.why.trim().length === 0) {
      warn('why-missing', `task ${i} has no why line`);
    }
    if (t.why.length > 140) {
      warn('why-length', `task ${i} why is ${t.why.length} chars, keep it to one line`);
    }
  }

  const prose = [plan.note, ...plan.tasks.map((t) => t.why)].join(' ').toLowerCase();
  for (const phrase of BANNED_PHRASES) {
    if (prose.includes(phrase)) warn('voice', `banned phrase: "${phrase}"`);
  }
  if (plan.note.includes('!') || plan.tasks.some((t) => t.why.includes('!'))) {
    warn('voice', 'exclamation mark');
  }
  if (plan.note.trim().length === 0) {
    warn('note-missing', 'note is empty');
  }

  const titles = plan.tasks.map((t) => t.title.toLowerCase());
  if (new Set(titles).size !== titles.length) {
    err('duplicate-tasks', 'two tasks have the same title');
  }

  return v;
}

export function totalMinutes(plan: Plan): number {
  return plan.tasks.reduce((sum, t) => sum + t.est_minutes, 0);
}
