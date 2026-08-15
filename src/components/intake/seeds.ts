/*
 * Intake content.
 *
 * The old first screen was an empty textarea asking "what are you trying to get
 * done?", which is the blank page this entire product exists to remove. Asking
 * someone with an activation problem to freetype their life before they have seen
 * any value is the worst possible first screen.
 *
 * So the whole of intake is tapping. You pick what your life looks like, then tap
 * the goals that are actually true. Typing exists but is never required.
 */

export interface LifeShape {
  id: string;
  label: string;
  hint: string;
  /** Concrete, specific, and in the product's voice. Never "improve productivity". */
  goals: string[];
}

export const LIFE_SHAPES: LifeShape[] = [
  {
    id: 'building',
    label: 'Building something',
    hint: 'A product, an app, a business',
    goals: [
      'Ship the thing I keep not shipping',
      'Get my first paying user',
      'Finish the feature that is half built',
      'Put it in front of actual people',
      'Stop rebuilding what already works',
    ],
  },
  {
    id: 'studying',
    label: 'Studying',
    hint: 'School, uni, exams, a course',
    goals: [
      'Pass the exam that is coming',
      'Finish the assignment I am avoiding',
      'Stop cramming everything the night before',
      'Actually keep up with the reading',
      'Start the dissertation',
    ],
  },
  {
    id: 'job',
    label: 'A job',
    hint: 'Employed, with a manager and meetings',
    goals: [
      'Finish the project that is already late',
      'Stop drowning in my inbox',
      'Walk into meetings prepared',
      'Leave work at a normal time',
      'Get the thing off my plate that everyone is waiting on',
    ],
  },
  {
    id: 'freelance',
    label: 'Clients',
    hint: 'Freelance, contract, self-employed',
    goals: [
      'Deliver the work I am behind on',
      'Send the invoices I keep forgetting',
      'Land the next client',
      'Reply to the client I have been dodging',
      'Stop working weekends',
    ],
  },
  {
    id: 'creative',
    label: 'Creative work',
    hint: 'Writing, music, art, video',
    goals: [
      'Finish the thing I started',
      'Make something every week',
      'Stop restarting from scratch',
      'Put my work somewhere public',
      'Get back to it after months away',
    ],
  },
  {
    id: 'reset',
    label: 'Getting back on track',
    hint: 'After a rough stretch',
    goals: [
      'Do one real thing a day',
      'Stop the day disappearing on me',
      'Get up at a normal time',
      'Rebuild some kind of routine',
      'Open the letters I have been ignoring',
    ],
  },
  {
    id: 'body',
    label: 'Health',
    hint: 'Movement, food, sleep',
    goals: [
      'Move my body regularly',
      'Get back to the gym',
      'Sleep at a normal hour',
      'Eat like an adult',
      'Book the appointment I keep putting off',
    ],
  },
  {
    id: 'admin',
    label: 'Life admin',
    hint: 'The pile that never shrinks',
    goals: [
      'Deal with the paperwork pile',
      'Sort out my money',
      'Reply to the people I have ghosted',
      'Clean the flat properly',
      'Cancel the things I am still paying for',
    ],
  },
];

export type RhythmId = 'morning' | 'afternoon' | 'night' | 'chaos';

export interface RhythmOption {
  id: RhythmId;
  label: string;
  hint: string;
}

export const RHYTHMS: RhythmOption[] = [
  { id: 'morning', label: 'Mornings', hint: 'Sharp early, fading by 3' },
  { id: 'afternoon', label: 'Afternoons', hint: 'Slow start, good later' },
  { id: 'night', label: 'Late at night', hint: 'Everything happens after 9' },
  { id: 'chaos', label: 'No pattern', hint: 'Different every day' },
];

export const DERAILERS: string[] = [
  'My phone',
  'I do not know where to start',
  'I start over instead of finishing',
  'Everything feels equally urgent',
  'Other people interrupt me',
  'I get lost in one thing for hours',
  'I forget what I was doing',
];

/** Goals for the picked shapes, de-duplicated, order preserved. */
export function goalsFor(shapeIds: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of shapeIds) {
    const shape = LIFE_SHAPES.find((s) => s.id === id);
    if (!shape) continue;
    for (const goal of shape.goals) {
      if (seen.has(goal)) continue;
      seen.add(goal);
      out.push(goal);
    }
  }
  return out;
}
