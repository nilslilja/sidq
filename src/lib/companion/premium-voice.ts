import { env, isBackendConfigured } from '@/lib/env';
import { getAccessToken } from '@/lib/supabase';
import { createHostedProvider, type SpeechProvider } from './speech-provider';

/*
 * The premium voice, wired.
 *
 * Two rules decide when this is used, and both are about cost and tolerability
 * rather than quality:
 *
 *   1. Rare lines only. The on-device voice handles the thirty small
 *      interruptions in a day. This speaks the two or three that are worth
 *      hearing: the morning line, the switch-cost reading, the evening close.
 *      At three lines a day it is a few pence a month per user.
 *
 *   2. Never the fallback. If the hosted call fails, is rate limited, or the
 *      person is on the free plan, the on-device voice speaks the same words
 *      immediately. Silence is a worse failure than a plainer voice.
 *
 * The voice id is public and the API key is not. The key lives on the edge
 * function; this only ever talks to our own endpoint.
 */

/** Set to enable. Absent means the product simply uses the on-device voice. */
const VOICE_ID = (import.meta.env.VITE_ELEVENLABS_VOICE_ID as string | undefined) ?? '';

export const isPremiumVoiceConfigured = Boolean(isBackendConfigured && VOICE_ID);

/** Null when unconfigured, which every caller treats as "use on-device". */
export function createPremiumVoice(): SpeechProvider | null {
  if (!isPremiumVoiceConfigured) return null;

  return createHostedProvider({
    endpoint: `${env.supabaseUrl}/functions/v1/speak`,
    voiceId: VOICE_ID,
    getAccessToken,
  });
}

/*
 * Which lines are worth the hosted voice.
 *
 * Deliberately a short allowlist rather than a heuristic. Anything not named
 * here goes to the on-device voice, so a new caller cannot accidentally start
 * spending money by writing a longer string.
 */
export type SpokenMoment = 'morning' | 'switch-cost' | 'evening' | 'rescue';

const PREMIUM_MOMENTS: SpokenMoment[] = ['morning', 'switch-cost', 'evening'];

export function isPremiumMoment(moment: SpokenMoment): boolean {
  return PREMIUM_MOMENTS.includes(moment);
}
