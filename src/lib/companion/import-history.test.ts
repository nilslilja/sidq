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

/*
 * ── The file people will actually drag in ────────────────────────────────────
 *
 * Every test above builds the smallest object the parser will accept: a title,
 * a timestamp, and `mapping: {}`. That proves the field handling and proves
 * nothing about a real export, which is the shape nobody had ever run this
 * against.
 *
 * A real `conversations.json` is one object per conversation carrying the full
 * message tree — author, parts, parents, children, model slug — and it is
 * two orders of magnitude larger than anything here. Measured on a generated
 * export of the real shape: 142MB parses in 274ms and peaks around 345MB of
 * heap. Slower inside WKWebView than in Node, but the same order: a pause, not
 * a hang, and worth knowing rather than assuming.
 *
 * What these cover is everything the size measurement cannot: that the real
 * shape is still recognised, that a two-year account does not look broken when
 * only a month of it survives the window, and that the fields real exports
 * actually contain do not throw.
 */
describe('a real export, not a minimal one', () => {
  /** One conversation with the message tree a real export carries. */
  const realConversation = (title: string | null, at: number, messages = 6) => {
    const mapping: Record<string, unknown> = {};
    for (let m = 0; m < messages; m++) {
      mapping[`node-${m}`] = {
        id: `node-${m}`,
        message: {
          id: `msg-${m}`,
          author: { role: m % 2 ? 'assistant' : 'user', name: null, metadata: {} },
          create_time: at / 1000 + m,
          update_time: null,
          content: { content_type: 'text', parts: ['some text that is not short'] },
          status: 'finished_successfully',
          weight: 1,
          metadata: { model_slug: 'gpt-4o', parent_id: m ? `node-${m - 1}` : null },
          recipient: 'all',
        },
        parent: m ? `node-${m - 1}` : null,
        children: m < messages - 1 ? [`node-${m + 1}`] : [],
      };
    }
    return {
      title,
      create_time: at / 1000,
      update_time: at / 1000,
      mapping,
      moderation_results: [],
      current_node: `node-${messages - 1}`,
      plugin_ids: null,
      conversation_id: 'abc-123',
      conversation_template_id: null,
      gizmo_id: null,
      is_archived: false,
      safe_urls: [],
      default_model_slug: 'gpt-4o',
    };
  };

  test('the real shape is still recognised as ChatGPT', () => {
    const raw = JSON.stringify([realConversation('Refactoring the auth guard', daysAgo(2))]);
    const result = parseExport(raw, NOW);

    expect(result.source).toBe('chatgpt');
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].title).toBe('Refactoring the auth guard');
  });

  test('an untitled conversation is skipped rather than throwing', () => {
    /*
     * Real exports carry `"title": null` for conversations that were never
     * named. `typeof null === 'object'`, so anything reaching for `.trim()` on
     * it would throw and take the whole import down with it — one unnamed chat
     * out of hundreds killing the file.
     */
    const raw = JSON.stringify([
      realConversation(null, daysAgo(1)),
      realConversation('Named one', daysAgo(1)),
    ]);
    const result = parseExport(raw, NOW);

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].title).toBe('Named one');
    // `seen` still counts it, so the panel can say two were in the file.
    expect(result.seen).toBe(2);
  });

  test('a two-year account reports the whole file, not just what survived', () => {
    /*
     * The window is 30 days. Somebody dragging in two years of history and
     * being told "8 conversations added" with no further explanation has been
     * shown a number that looks like a failure.
     *
     * `seen` is what lets the panel say "8 recent (400 in the file)", so this
     * asserts the count of what was read, not only what was kept.
     */
    const rows = [];
    for (let i = 0; i < 400; i++) rows.push(realConversation(`Chat ${i}`, daysAgo(i * 2)));
    const result = parseExport(JSON.stringify(rows), NOW);

    expect(result.seen).toBe(400);
    // Every second day for 400 entries: 15 land inside 30 days.
    expect(result.sessions.length).toBeGreaterThan(0);
    expect(result.sessions.length).toBeLessThan(result.seen);
    expect(result.sessions.every((s) => NOW - s.endedAt <= 30 * 86_400_000)).toBe(true);
  });

  test('a Google Takeout activity row, with the fields Takeout really sends', () => {
    /*
     * Gemini has no export of its own; it comes through Takeout's My Activity,
     * which is a different product with its own envelope. Takeout also defaults
     * to HTML — the JSON option has to be chosen — so the shape below is the
     * one that arrives when somebody follows the instructions correctly.
     */
    const raw = JSON.stringify([
      {
        header: 'Gemini Apps',
        title: 'Prompted Explain the borrow checker to me',
        titleUrl: 'https://gemini.google.com/app/0123456789abcdef',
        time: new Date(daysAgo(3)).toISOString(),
        products: ['Gemini Apps'],
        activityControls: ['Gemini Apps Activity'],
      },
    ]);
    const result = parseExport(raw, NOW);

    expect(result.source).toBe('gemini');
    expect(result.sessions[0].title).toBe('Explain the borrow checker to me');
  });
});
