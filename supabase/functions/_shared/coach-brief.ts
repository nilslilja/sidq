// The coach session brief.
//
// A coach sees a client for one hour and is blind for the other 167. This turns
// two weeks of measured behaviour into the thing they actually need three minutes
// before a session: what happened, what changed, and what to ask.
//
// This is not clonable by copying a prompt. It only works on top of weeks of
// per-task completion data that a new competitor does not have and cannot fake.

export const PROMPT_VERSION = 'coach-brief-2026-08-12.1';

export const COACH_BRIEF_PROMPT = `You write pre-session briefs for coaches who work
with clients on executive function: ADHD coaches, academic coaches, productivity
coaches. Your reader is a professional about to start a session, skimming on their
phone, three minutes out.

You are given behavioural data only: what was planned, what was completed, block
sizes, timing, and how often work rolled over. Depending on what the client agreed
to share you may or may not see task titles. You never see their reflections, their
private notes, or why any task mattered to them.

## What you are for

The coach's problem is that they only have self-report, from a person whose
self-report is unreliable for reasons that are not their fault. You have the record
of what actually happened. Close that gap and nothing else.

## Hard limits

You are NOT a clinician and this is NOT an assessment.

- Never diagnose. Never suggest a diagnosis, a severity, or a change in treatment.
- Never speculate about mental state, mood, motivation, or what is "going on" for
  someone. You observe behaviour. You do not have access to interior life and must
  not pretend otherwise.
- Never characterise the person. "Completion dropped after the 14th" is an
  observation. "They are struggling" or "they seem overwhelmed" is a story you
  invented from a number, and a coach acting on it does real harm.
- Never recommend an intervention. Suggest questions the coach might ask. The coach
  decides what to do; that is their training and their liability, not yours.
- If the data is thin, say so plainly and stop. A confident brief written from four
  data points is worse than no brief, because the coach will act on it.
- If titles were not shared, do not guess at content. Never write "probably work
  related". Describe the shape of the behaviour and leave the content unknown.

## Voice

Written by a careful colleague who has read the file. Specific, quantified, and
short. No clinical register, no coaching-industry vocabulary ("journey", "showing
up", "holding space", "leaning in"), no hedging padding.

Anchor every claim to a number or a date. A coach cannot use "engagement has been
inconsistent". They can use "closed four of the last fourteen days, all four before
the 9th".

## Output

Return ONLY JSON, no prose, no fences:

{
  "headline": "one sentence, the single most important thing to know walking in",
  "whats_changed": ["2 to 4 observations, each anchored to a number or a date"],
  "worth_asking": ["2 to 3 questions the coach could open with, in their words"],
  "going_well": ["0 to 2 things that are genuinely working, only if true"],
  "confidence": "high | medium | low",
  "data_note": "one line on what the data does and does not cover"
}

Rules checked before you answer:
- every entry in whats_changed contains a number, a date, or a percentage
- worth_asking entries are questions, phrased for a person to say out loud
- going_well is empty rather than padded with something generic
- confidence is low whenever there are fewer than 10 closed days
- nothing anywhere reads as a diagnosis or a judgement of character`;

export interface CoachBriefInput {
  /** Whatever the client chose to be called. Never assume a real name. */
  clientLabel: string;
  /** 'signals' or 'signals-and-titles'. Shapes what you may reason about. */
  shareScope: string;
  windowDays: number;
  closedDays: number;
  /** Day-level rollup, newest last. */
  days: {
    date: string;
    planned: number;
    completed: number;
    plannedMinutes: number;
    completedMinutes: number;
  }[];
  /** Rendered by the calibration engine, or empty when evidence is thin. */
  calibration: string;
  /** Present only when the client shared titles. */
  recurringTitles?: { title: string; timesPlanned: number; timesCompleted: number }[];
}

export function buildCoachBriefMessage(input: CoachBriefInput): string {
  const lines: string[] = [];
  lines.push(`client: ${input.clientLabel}`);
  lines.push(
    `sharing: ${input.shareScope === 'signals-and-titles' ? 'completion data and task titles' : 'completion data only, NO task titles'}`,
  );
  lines.push(`window: last ${input.windowDays} days, ${input.closedDays} of them closed`);
  lines.push('');

  lines.push('daily record (date, completed/planned, minutes done/planned):');
  if (input.days.length === 0) {
    lines.push('- none');
  } else {
    for (const d of input.days) {
      lines.push(
        `- ${d.date}  ${d.completed}/${d.planned}  ${d.completedMinutes}/${d.plannedMinutes} min`,
      );
    }
  }
  lines.push('');

  if (input.calibration.trim()) {
    lines.push('measured profile:');
    lines.push(input.calibration.trim());
    lines.push('');
  }

  if (input.recurringTitles && input.recurringTitles.length > 0) {
    lines.push('tasks that keep reappearing:');
    for (const t of input.recurringTitles) {
      lines.push(`- "${t.title}" planned ${t.timesPlanned}x, completed ${t.timesCompleted}x`);
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}

export interface CoachBrief {
  headline: string;
  whats_changed: string[];
  worth_asking: string[];
  going_well: string[];
  confidence: 'high' | 'medium' | 'low';
  data_note: string;
}

const CLINICAL_TERMS = [
  'diagnos',
  'symptom',
  'disorder',
  'comorbid',
  'medicat',
  'treatment',
  'therapy',
  'clinical',
  'patholog',
  'executive dysfunction',
];

const CHARACTER_JUDGEMENTS = [
  'lazy',
  'unmotivated',
  'struggling with',
  'seems overwhelmed',
  'clearly',
  'obviously',
  'refuses',
  'unwilling',
  'poor discipline',
  'lacks',
];

export interface BriefViolation {
  rule: string;
  detail: string;
}

/**
 * Guardrail on the brief. This output goes to a professional who may act on it, so
 * a model drifting into clinical or characterological language is a real-world
 * harm rather than a style problem. Enforced, not merely logged.
 */
export function gradeCoachBrief(brief: CoachBrief, closedDays: number): BriefViolation[] {
  const v: BriefViolation[] = [];
  const all = [
    brief.headline,
    ...brief.whats_changed,
    ...brief.worth_asking,
    ...brief.going_well,
    brief.data_note,
  ]
    .join(' ')
    .toLowerCase();

  for (const term of CLINICAL_TERMS) {
    if (all.includes(term)) v.push({ rule: 'clinical-language', detail: `contains "${term}"` });
  }
  for (const term of CHARACTER_JUDGEMENTS) {
    if (all.includes(term)) v.push({ rule: 'character-judgement', detail: `contains "${term}"` });
  }

  if (closedDays < 10 && brief.confidence === 'high') {
    v.push({
      rule: 'overconfident',
      detail: `confidence high on only ${closedDays} closed days`,
    });
  }

  const unanchored = brief.whats_changed.filter((s) => !/\d/.test(s));
  if (unanchored.length > 0) {
    v.push({
      rule: 'unanchored-claim',
      detail: `not tied to a number: "${unanchored[0]}"`,
    });
  }

  const notQuestions = brief.worth_asking.filter((s) => !s.trim().endsWith('?'));
  if (notQuestions.length > 0) {
    v.push({ rule: 'not-a-question', detail: `"${notQuestions[0]}"` });
  }

  return v;
}

/** Shown when there is genuinely not enough to say. Better than an invented brief. */
export function thinDataBrief(closedDays: number): CoachBrief {
  return {
    headline:
      closedDays === 0
        ? 'No closed days yet, so there is nothing measured to report.'
        : `Only ${closedDays} closed day${closedDays === 1 ? '' : 's'} so far. Too little to read a pattern.`,
    whats_changed: [],
    worth_asking:
      closedDays === 0
        ? ['Did the setup work on your end, and does the morning plan actually arrive?']
        : ['How did the days you did close compare to a normal week for you?'],
    going_well: [],
    confidence: 'low',
    data_note: 'Based on completion data only. Nothing here reflects what the work was.',
  };
}
