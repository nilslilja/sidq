import { describe, test, expect } from 'vitest';
import { matchAnswer, ANSWERS, FALLBACK_REPLY } from './answers';
import { usableVoices, pickVoice } from './voice';

describe('matchAnswer', () => {
  test('answers the questions people actually type, instantly', () => {
    const cases: [string, string][] = [
      ["i can't start", 'cant-start'],
      ['im overwhelmed', 'overwhelmed'],
      ['should i take a break', 'should-i-break'],
      ['what was i doing', 'forgot'],
      ['this is too big', 'too-big'],
      ['i keep switching between things', 'switching'],
      ['what now', 'what-now'],
      ['where did the time go', 'time-blindness'],
    ];

    for (const [question, expected] of cases) {
      const m = matchAnswer(question);
      expect(m?.answer.id, `"${question}" should route to ${expected}`).toBe(expected);
    }
  });

  test('handles terse input, which is how people type mid-task', () => {
    expect(matchAnswer('stuck')?.answer.id).toBe('cant-start');
    expect(matchAnswer('bored')?.answer.id).toBe('bored');
  });

  test('ignores punctuation and case', () => {
    expect(matchAnswer("I CAN'T START!!!")?.answer.id).toBe('cant-start');
  });

  test('returns null rather than guessing at something unrelated', () => {
    // These must fall through to the model, not get a confidently wrong local hit.
    for (const q of ['what is the capital of france', 'write me a sql query', 'book a flight']) {
      expect(matchAnswer(q), `"${q}" should not match locally`).toBeNull();
    }
  });

  test('returns null on empty or junk input', () => {
    for (const q of ['', ' ', '?', 'a']) {
      expect(matchAnswer(q)).toBeNull();
    }
  });

  test('every answer is short enough to read on an overlay', () => {
    for (const a of ANSWERS) {
      expect(a.reply.length, `${a.id} is too long for the card`).toBeLessThan(190);
    }
  });

  test('no answer diagnoses, medicalises, or references a condition', () => {
    const banned = /adhd|diagnos|medicat|symptom|disorder|therapy|clinical|executive dysfunction/i;
    for (const a of [...ANSWERS.map((x) => x.reply), FALLBACK_REPLY]) {
      expect(a, `clinical language in: "${a}"`).not.toMatch(banned);
    }
  });

  test('no answer cheerleads', () => {
    const banned = /you've got this|you got this|great job|well done|amazing|crush it|proud of you/i;
    for (const a of ANSWERS) {
      expect(a.reply, `cheerleading in ${a.id}`).not.toMatch(banned);
    }
  });

  test('every trigger is lowercase and non-empty, so matching stays predictable', () => {
    for (const a of ANSWERS) {
      expect(a.triggers.length).toBeGreaterThan(0);
      for (const t of a.triggers) {
        expect(t).toBe(t.toLowerCase());
        expect(t.trim().length).toBeGreaterThan(1);
      }
    }
  });

  test('answer ids are unique', () => {
    const ids = ANSWERS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('voice selection', () => {
  const voice = (name: string, lang = 'en-US', localService = true) =>
    ({ name, lang, voiceURI: name, localService, default: false }) as SpeechSynthesisVoice;

  test('never auto-selects the novelty voices', () => {
    const list = usableVoices([voice('Bad News'), voice('Bubbles'), voice('Zarvox'), voice('Samantha')]);

    expect(list.map((v) => v.name)).toEqual(['Samantha']);
  });

  test('prefers a premium neural voice over the legacy one', () => {
    const picked = pickVoice([voice('Samantha'), voice('Samantha (Premium)')], null);

    expect(picked?.name).toBe('Samantha (Premium)');
  });

  test('prefers a local voice over a remote one, since remote reintroduces latency', () => {
    const picked = pickVoice([voice('Some Cloud Voice', 'en-US', false), voice('Another Local', 'en-US', true)], null);

    expect(picked?.name).toBe('Another Local');
  });

  test('honours an explicit choice', () => {
    const picked = pickVoice([voice('Samantha (Premium)'), voice('Serena')], 'Serena');

    expect(picked?.name).toBe('Serena');
  });

  test('falls back to the best available when the saved choice is gone', () => {
    const picked = pickVoice([voice('Samantha (Premium)')], 'AVoiceThatWasUninstalled');

    expect(picked?.name).toBe('Samantha (Premium)');
  });

  test('drops non-English voices', () => {
    expect(usableVoices([voice('Amelie', 'fr-FR'), voice('Samantha', 'en-US')]).map((v) => v.name)).toEqual([
      'Samantha',
    ]);
  });

  test('returns null when there is nothing usable, rather than picking junk', () => {
    expect(pickVoice([voice('Bahh'), voice('Boing')], null)).toBeNull();
  });
});
