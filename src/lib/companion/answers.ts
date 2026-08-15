/*
 * The local answer bank.
 *
 * The point of the companion is that it answers before you could have opened a
 * chat window. A round trip to a model is 2 to 6 seconds; at that latency you have
 * already tabbed away and the moment is gone. So the questions people actually ask
 * an executive-function assistant are answered here, on device, in under a
 * millisecond, offline, for nothing.
 *
 * The model is the fallback, not the mechanism. That inversion is the whole
 * difference between this and a wrapper.
 *
 * Boundaries, which are not negotiable:
 *   - Never diagnose, never mention medication, never reference a condition.
 *   - Never do therapy. This is a practical tool about starting work.
 *   - No praise, no cheerleading, no "you've got this".
 *   - Short. This is read on an overlay while someone is mid-task.
 */

export interface Answer {
  id: string;
  /** Any of these phrasings routes here. Matched loosely. */
  triggers: string[];
  /** Spoken and displayed. One or two sentences, never more. */
  reply: string;
  /** Optional concrete move the companion can perform. */
  action?: 'start-timer' | 'take-break' | 'shrink-task' | 'show-plan';
}

export const ANSWERS: Answer[] = [
  {
    id: 'cant-start',
    triggers: [
      'cant start', "can't start", 'cannot start', 'stuck', 'procrastinating',
      'not starting', 'avoiding', 'keep putting it off', 'wont start',
    ],
    reply:
      'Do the first 90 seconds of it badly. Open the file, write one wrong sentence, then stop if you want. Starting is a separate skill from doing.',
    action: 'start-timer',
  },
  {
    id: 'overwhelmed',
    triggers: ['overwhelmed', 'too much', 'too many things', 'panicking', 'drowning', 'everything at once'],
    reply:
      'Everything except one thing is noise right now. Your top task is the only live item, and the rest is already written down so you cannot lose it.',
    action: 'show-plan',
  },
  {
    id: 'too-big',
    triggers: ['too big', 'too hard', 'huge', 'daunting', 'dont know where to begin', 'where do i start'],
    reply:
      'The task is the wrong size, not you. Name the smallest version you could finish in fifteen minutes and do that instead.',
    action: 'shrink-task',
  },
  {
    id: 'should-i-break',
    triggers: ['should i take a break', 'need a break', 'am i due a break', 'break yet', 'tired'],
    reply:
      'If you have to ask, usually yes. Ten minutes away from the screen, and not on your phone, or the break does not count.',
    action: 'take-break',
  },
  {
    id: 'how-long',
    triggers: ['how long should i work', 'how long', 'work for how long', 'session length'],
    reply:
      'Until the work gets worse, which is earlier than you think. I am watching your stretch and will say when.',
  },
  {
    id: 'switching',
    triggers: ['keep switching', 'cant focus on one', 'jumping between', 'task switching', 'flitting'],
    reply:
      'Switching costs you more than the task does. Pick the one in front of you, set fifteen minutes, and let the others wait that long.',
    action: 'start-timer',
  },
  {
    id: 'forgot',
    triggers: ['what was i doing', 'forgot what i was doing', 'lost track', 'what am i doing'],
    reply: 'You were on your top task. It is still open and nothing moved.',
    action: 'show-plan',
  },
  {
    id: 'bored',
    triggers: ['bored', 'boring', 'this is dull', 'cant be bothered', 'no interest'],
    reply:
      'Boredom on a task usually means it has no visible end. Give it a hard stop at twenty five minutes rather than trying to want it more.',
    action: 'start-timer',
  },
  {
    id: 'easy-or-hard',
    triggers: ['easy first', 'hard first', 'which first', 'what should i do first', 'order'],
    reply:
      'Hard first, but only a small piece of it. Clearing easy things first feels productive and reliably eats the day.',
  },
  {
    id: 'time-blindness',
    triggers: ['lost time', 'where did the time go', 'been hours', 'time disappeared', 'time blindness'],
    reply:
      'That is why the timer runs whether you look at it or not. Check what you actually finished, not how long it felt.',
  },
  {
    id: 'nothing-done',
    triggers: ['got nothing done', 'wasted the day', 'terrible day', 'nothing today', 'unproductive'],
    reply:
      'One finished thing still counts the day. Pick the smallest item left and close it, then stop.',
    action: 'show-plan',
  },
  {
    id: 'perfectionism',
    triggers: ['not good enough', 'keep redoing', 'restarting', 'perfect', 'rewriting it again'],
    reply:
      'You are past the point where more passes improve it. Ship the version you have and let the next one be better.',
  },
  {
    id: 'cant-stop',
    triggers: ['cant stop', 'hyperfocus', 'been going for hours', 'lost in it'],
    reply:
      'Stopping while it is going well is how you get tomorrow for free. Mark where you are so future you can pick it up cold.',
    action: 'take-break',
  },
  {
    id: 'noise',
    triggers: ['distracted by', 'noisy', 'cant concentrate', 'too loud', 'interrupted'],
    reply:
      'Change one input, not five. Headphones or a different room, then straight back to the same task.',
  },
  {
    id: 'what-now',
    triggers: ['what now', 'what next', 'what should i do', 'whats next'],
    reply: 'The top item on your plan. It has not changed and it is still the right one.',
    action: 'show-plan',
  },
];

export interface Match {
  answer: Answer;
  /** 0..1. Below the threshold we hand off to the model rather than guess. */
  score: number;
}

const STOPWORDS = new Set([
  'i', 'im', 'a', 'an', 'the', 'to', 'do', 'is', 'it', 'me', 'my', 'am', 'be',
  'of', 'for', 'and', 'or', 'so', 'on', 'at', 'in', 'you', 'what', 'how',
]);

function normalise(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokens(text: string): string[] {
  return normalise(text).split(' ').filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

/**
 * Find the best local answer.
 *
 * Two passes: an exact phrase containment check, which is precise and catches most
 * real phrasings, then a token overlap score for everything else. Returns null
 * rather than a weak guess, because a confidently wrong answer from an assistant
 * is worse than a two second wait for a right one.
 */
export function matchAnswer(question: string, threshold = 0.34): Match | null {
  const q = normalise(question);
  if (q.length < 2) return null;

  const qTokens = tokens(question);
  if (qTokens.length === 0) return null;

  let best: Match | null = null;

  for (const answer of ANSWERS) {
    let score = 0;

    for (const trigger of answer.triggers) {
      const t = normalise(trigger);

      // Whole trigger present in the question, or vice versa for terse input.
      if (q.includes(t) || (t.length > 6 && t.includes(q))) {
        score = Math.max(score, 1);
        continue;
      }

      const tTokens = tokens(trigger);
      if (tTokens.length === 0) continue;
      const overlap = tTokens.filter((w) => qTokens.includes(w)).length;
      // Normalised against the trigger so short triggers cannot win by default.
      score = Math.max(score, overlap / tTokens.length);
    }

    if (score > (best?.score ?? 0)) best = { answer, score };
  }

  return best && best.score >= threshold ? best : null;
}

/** Shown when nothing matches and the model is unavailable or still thinking. */
export const FALLBACK_REPLY =
  'Not sure. Pick the top item on your plan and give it fifteen minutes, and I will keep the timer.';
