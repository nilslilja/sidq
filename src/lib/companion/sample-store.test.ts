import { describe, test, expect, beforeEach } from 'vitest';
import {
  loadSamples,
  saveSamples,
  clearSamples,
  createSampleWriter,
} from './sample-store';
import type { ActivitySample } from '@/lib/focus-engine';

const NOW = new Date(2026, 7, 15, 12, 0, 0).getTime();
const daysAgo = (d: number) => NOW - d * 86_400_000;

const sample = (app: string, at: number): ActivitySample => ({
  app,
  windowTitle: `${app} — a document`,
  at,
});

beforeEach(() => {
  clearSamples();
});

describe('sample store', () => {
  test('survives a restart, which is the whole point', () => {
    saveSamples([sample('Code', NOW - 60_000), sample('Slack', NOW - 30_000)], NOW);

    const loaded = loadSamples(NOW);

    expect(loaded).toHaveLength(2);
    expect(loaded[0]).toMatchObject({ app: 'Code', windowTitle: 'Code — a document' });
  });

  test('drops anything older than the retention window', () => {
    saveSamples([sample('Old', daysAgo(9)), sample('Recent', daysAgo(1))], NOW);

    const loaded = loadSamples(NOW);

    expect(loaded.map((s) => s.app)).toEqual(['Recent']);
  });

  test('prunes on read as well as on write, so a stale file cannot leak through', () => {
    // Written a week ago when everything was fresh; read today.
    saveSamples([sample('Code', NOW)], NOW);

    const muchLater = NOW + 30 * 86_400_000;

    expect(loadSamples(muchLater)).toHaveLength(0);
  });

  test('keeps the newest when the cap is hit, not the oldest', () => {
    const many = Array.from({ length: 45_000 }, (_, i) => sample(`App${i}`, NOW - (45_000 - i)));

    saveSamples(many, NOW);
    const loaded = loadSamples(NOW);

    expect(loaded.length).toBeLessThanOrEqual(40_000);
    // The most recent sample must always survive.
    expect(loaded[loaded.length - 1].app).toBe('App44999');
  });

  test('returns nothing rather than throwing on a corrupt store', () => {
    localStorage.setItem('sidq.attention.samples', '{not json at all');

    expect(loadSamples(NOW)).toEqual([]);
  });

  test('ignores malformed entries instead of rendering undefined', () => {
    localStorage.setItem(
      'sidq.attention.samples',
      JSON.stringify([{ a: 'Code', at: NOW }, null, { nope: true }, { a: 'Slack', at: 'soon' }]),
    );

    const loaded = loadSamples(NOW);

    expect(loaded).toHaveLength(1);
    expect(loaded[0].app).toBe('Code');
    expect(loaded[0].windowTitle).toBe('');
  });
});

describe('throttled writer', () => {
  test('writes once, then holds off', () => {
    const writer = createSampleWriter(60_000);
    const samples = [sample('Code', NOW)];

    expect(writer.maybeWrite(samples, NOW)).toBe(true);
    expect(writer.maybeWrite(samples, NOW + 5_000)).toBe(false);
    expect(writer.maybeWrite(samples, NOW + 30_000)).toBe(false);
  });

  test('writes again once the interval has passed', () => {
    const writer = createSampleWriter(60_000);
    const samples = [sample('Code', NOW)];

    writer.maybeWrite(samples, NOW);

    expect(writer.maybeWrite(samples, NOW + 61_000)).toBe(true);
  });

  test('flush writes regardless of the interval', () => {
    const writer = createSampleWriter(60_000);
    writer.maybeWrite([sample('Code', NOW)], NOW);

    // Shutdown must not lose the last minute of the day.
    writer.flush([sample('Code', NOW), sample('Slack', NOW + 1_000)], NOW + 1_000);

    expect(loadSamples(NOW + 1_000)).toHaveLength(2);
  });
});
