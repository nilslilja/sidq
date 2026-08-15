import { describe, test, expect, beforeEach } from 'vitest';
import {
  parseExport,
  loadImported,
  saveImported,
  clearImported,
  UnknownExportError,
} from './import-history';

const NOW = new Date(2026, 7, 15, 12, 0, 0).getTime();
const daysAgo = (d: number) => NOW - d * 86_400_000;

/** ChatGPT stores seconds, not milliseconds. That distinction is the point. */
const chatgpt = (title: string, at: number) =>
  JSON.stringify([{ title, update_time: at / 1000, mapping: {} }]);

const gemini = (title: string, at: number) =>
  JSON.stringify([{ header: 'Gemini Apps', title, time: new Date(at).toISOString() }]);

beforeEach(() => {
  clearImported();
});

describe('parseExport', () => {
  test('rejects something that is not an export at all', () => {
    expect(() => parseExport('hello', NOW)).toThrow(UnknownExportError);
    expect(() => parseExport('{"nope":1}', NOW)).toThrow(UnknownExportError);
    expect(() => parseExport('[{"unrelated":true}]', NOW)).toThrow(UnknownExportError);
  });

  test('reads a ChatGPT export and gets the time right', () => {
    // Seconds read as milliseconds would land in 1970 and be silently dropped
    // by the age filter, which is the failure this asserts against.
    const result = parseExport(chatgpt('Fixing Stripe webhooks', daysAgo(1)), NOW);

    expect(result.source).toBe('chatgpt');
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].title).toBe('Fixing Stripe webhooks');
    expect(result.sessions[0].projectName).toBe('ChatGPT');
    expect(Math.round(result.sessions[0].endedAt)).toBe(daysAgo(1));
  });

  test('reads a Gemini export', () => {
    const result = parseExport(gemini('Prompted How do I debounce a resize handler', daysAgo(2)), NOW);

    expect(result.source).toBe('gemini');
    expect(result.sessions[0].projectName).toBe('Gemini');
  });

  test('strips the noise prefix Google puts on every Gemini title', () => {
    const result = parseExport(gemini('Prompted Fix the retry logic', daysAgo(1)), NOW);

    expect(result.sessions[0].title).toBe('Fix the retry logic');
  });

  test('drops entries too old to be worth resuming', () => {
    const result = parseExport(chatgpt('Ancient history', daysAgo(90)), NOW);

    expect(result.sessions).toHaveLength(0);
    // Still reports what was in the file, so the UI can say "0 of 1 recent".
    expect(result.seen).toBe(1);
  });

  test('drops entries dated in the future rather than trusting a broken clock', () => {
    const result = parseExport(chatgpt('Tomorrow', NOW + 86_400_000), NOW);

    expect(result.sessions).toHaveLength(0);
  });

  test('skips untitled conversations instead of emitting blanks', () => {
    const raw = JSON.stringify([
      { title: '', update_time: daysAgo(1) / 1000, mapping: {} },
      { title: '   ', update_time: daysAgo(1) / 1000, mapping: {} },
      { title: 'Real one', update_time: daysAgo(1) / 1000, mapping: {} },
    ]);

    expect(parseExport(raw, NOW).sessions).toHaveLength(1);
  });

  test('handles an empty export without throwing', () => {
    expect(parseExport('[]', NOW).sessions).toEqual([]);
  });

  test('never emits a runaway title', () => {
    const result = parseExport(chatgpt('x'.repeat(400), daysAgo(1)), NOW);

    expect(result.sessions[0].title.length).toBeLessThanOrEqual(120);
  });
});

describe('stored imports', () => {
  test('survive a restart, or the drag has to be repeated every launch', () => {
    const { sessions } = parseExport(chatgpt('Kept', daysAgo(1)), NOW);
    saveImported(sessions, NOW);

    expect(loadImported(NOW)).toHaveLength(1);
  });

  test('dropping the same export twice does not double anything', () => {
    const { sessions } = parseExport(chatgpt('Same thing', daysAgo(1)), NOW);

    saveImported(sessions, NOW);
    const merged = saveImported(sessions, NOW);

    expect(merged).toHaveLength(1);
  });

  test('a second export from another assistant adds to the first', () => {
    saveImported(parseExport(chatgpt('From ChatGPT', daysAgo(1)), NOW).sessions, NOW);
    const merged = saveImported(parseExport(gemini('From Gemini', daysAgo(1)), NOW).sessions, NOW);

    expect(merged.map((s) => s.projectName).sort()).toEqual(['ChatGPT', 'Gemini']);
  });

  test('newest first, so the resume logic sees the right one', () => {
    saveImported(parseExport(chatgpt('Older', daysAgo(5)), NOW).sessions, NOW);
    const merged = saveImported(parseExport(chatgpt('Newer', daysAgo(1)), NOW).sessions, NOW);

    expect(merged[0].title).toBe('Newer');
  });

  test('ages out on read, so a stale store cannot resurface', () => {
    saveImported(parseExport(chatgpt('Fresh today', daysAgo(1)), NOW).sessions, NOW);

    const muchLater = NOW + 60 * 86_400_000;

    expect(loadImported(muchLater)).toHaveLength(0);
  });

  test('returns nothing rather than throwing on a corrupt store', () => {
    localStorage.setItem('sidq.imported.sessions', 'not json');

    expect(loadImported(NOW)).toEqual([]);
  });
});
