import { createSpeaker, type Speaker, type VoiceSettings } from './voice';

/*
 * The seam for swapping in a hosted voice later.
 *
 * On-device stays the default because it is instant, free and private, and those
 * three properties are what make an always-on companion tolerable. But a hosted
 * neural voice is genuinely better sounding, and the honest answer is that both
 * belong in the product at different moments.
 *
 * The split that makes the economics work:
 *
 *   frequent + reactive  ->  on-device. Nudges, timer callouts, quick answers.
 *                            These must land in under 100ms or the moment is gone,
 *                            and there are dozens a day.
 *   rare + high-value    ->  hosted. The morning line, the end-of-day close.
 *                            Two or three a day, latency does not matter because
 *                            they are not interrupting anything.
 *
 * At two hosted lines a day that is a few cents a month per user rather than a
 * bill that grows with how much someone uses the product.
 */

export type Priority =
  /** Interrupting, must be immediate. Always on-device. */
  | 'immediate'
  /** Not interrupting anything. Worth the latency for a better voice. */
  | 'showpiece';

export interface SpeechProvider {
  readonly id: string;
  /** Resolves once audio has started, or rejects so we can fall back. */
  speak(text: string): Promise<void>;
  stop(): void;
}

/**
 * Hosted provider. Deliberately not implemented yet, and deliberately shaped so
 * that implementing it is one file and no changes anywhere else.
 *
 * Whoever wires this up: the API key must live server side. A speech key shipped
 * in a desktop binary is extractable in about thirty seconds, and the bill is
 * yours. Route through the existing edge function.
 */
export interface HostedConfig {
  /** Our own endpoint, never the vendor's. The key stays on the server. */
  endpoint: string;
  voiceId: string;
  getAccessToken: () => Promise<string | undefined>;
}

export function createHostedProvider(config: HostedConfig): SpeechProvider {
  let current: HTMLAudioElement | null = null;

  return {
    id: 'hosted',
    async speak(text: string) {
      const token = await config.getAccessToken();
      if (!token) throw new Error('not signed in');

      const res = await fetch(config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text, voiceId: config.voiceId }),
      });
      if (!res.ok) throw new Error(`speech failed (${res.status})`);

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      this.stop();
      const audio = new Audio(url);
      current = audio;
      // Release the object URL either way, or a long session leaks every line
      // it ever spoke.
      const release = () => URL.revokeObjectURL(url);
      audio.addEventListener('ended', release, { once: true });
      audio.addEventListener('error', release, { once: true });

      await audio.play();
    },
    stop() {
      current?.pause();
      current = null;
    },
  };
}

export interface VoiceRouter {
  say(text: string, priority?: Priority): void;
  stop(): void;
}

/**
 * Routes each line to the right engine and falls back silently.
 *
 * A failed hosted call must never mean silence: the on-device voice speaks the
 * same line instead, so losing the network degrades the sound quality and nothing
 * else. That is the difference between a nice-to-have and a dependency.
 */
export function createVoiceRouter(args: {
  getSettings: () => VoiceSettings;
  hosted?: SpeechProvider | null;
}): VoiceRouter {
  const local: Speaker = createSpeaker(args.getSettings);

  return {
    say(text: string, priority: Priority = 'immediate') {
      if (!args.getSettings().enabled || !text.trim()) return;

      const hosted = args.hosted;
      if (priority === 'showpiece' && hosted) {
        hosted.speak(text).catch(() => local.speak(text));
        return;
      }
      local.speak(text);
    },
    stop() {
      local.stop();
      args.hosted?.stop();
    },
  };
}
