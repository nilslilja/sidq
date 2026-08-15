/*
 * The voice.
 *
 * On-device speech synthesis, not an API. This matters for three reasons and only
 * one of them is money:
 *
 *   1. Latency. A hosted voice is 800ms to 2s before the first syllable. An
 *      assistant that interjects has to speak in under 100ms or the moment has
 *      passed and you have already tabbed away.
 *   2. Privacy. Nothing said to you leaves the machine. There is no transcript on
 *      anyone's server, which for a tool that watches what you work on is the
 *      difference between usable and creepy.
 *   3. Cost. Per-character billing on an always-on companion is a bill that scales
 *      with how useful the product is, which is a bad shape for a $20 product.
 *
 * macOS and Windows both ship neural voices now. They are good, they are free, and
 * they work with the wifi off.
 */

export interface VoiceSettings {
  enabled: boolean;
  /** Chosen voice URI, or null to auto-pick. */
  voiceURI: string | null;
  /** 0.5 to 1.5. Calm sits slightly under natural pace. */
  rate: number;
  volume: number;
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  enabled: true,
  voiceURI: null,
  rate: 0.96,
  volume: 0.85,
};

/**
 * Voices we prefer, best first.
 *
 * Ordered by how they actually sound rather than by name: the premium and
 * enhanced macOS voices are neural and genuinely calm, the legacy ones are the
 * robotic 2005 samples people associate with screen readers. Getting this order
 * wrong is the difference between "assistant" and "novelty".
 */
const PREFERRED = [
  // macOS strips the "(Premium)" suffix in the Web Speech API, so a downloaded
  // neural Ava reports simply as "Ava". These names are therefore ranked above
  // Samantha: Samantha ships by default as a compact legacy voice, while Ava,
  // Zoe and Serena only exist on a machine because someone deliberately
  // downloaded the neural version.
  'ava (premium)',
  'zoe (premium)',
  'serena (premium)',
  'allison (premium)',
  'ava (enhanced)',
  'zoe (enhanced)',
  'serena (enhanced)',
  'ava',
  'zoe',
  'serena',
  'allison',
  'samantha (premium)',
  'samantha (enhanced)',
  'samantha',
  'kate',
  'stephanie',
  // Windows
  'microsoft aria',
  'microsoft jenny',
  'microsoft michelle',
  'microsoft zira',
  // Chromium fallbacks
  'google uk english female',
  'google us english',
];

/** Voices that sound like a 2005 screen reader. Never auto-selected. */
const BLOCKED = ['albert', 'bad news', 'bahh', 'bells', 'boing', 'bubbles', 'cellos', 'wobble', 'organ', 'trinoids', 'whisper', 'zarvox', 'jester', 'superstar'];

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * Voices load asynchronously in most browsers and are an empty array on the first
 * call. Resolves once they actually arrive, with a timeout so a browser that never
 * fires the event cannot hang the caller forever.
 */
export function loadVoices(timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  if (!speechSupported()) return Promise.resolve([]);

  const existing = window.speechSynthesis.getVoices();
  if (existing.length > 0) return Promise.resolve(existing);

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.speechSynthesis.onvoiceschanged = null;
      resolve(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.onvoiceschanged = finish;
    window.setTimeout(finish, timeoutMs);
  });
}

/** English voices worth offering, best first, junk removed. */
export function usableVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  const english = voices.filter(
    (v) => v.lang.toLowerCase().startsWith('en') && !BLOCKED.some((b) => v.name.toLowerCase().includes(b)),
  );

  return english.sort((a, b) => rank(a) - rank(b));
}

function rank(voice: SpeechSynthesisVoice): number {
  const name = voice.name.toLowerCase();
  const index = PREFERRED.findIndex((p) => name.includes(p));
  if (index >= 0) return index;
  // Unknown voices sort after every known-good one, local ahead of remote since
  // remote voices reintroduce the latency this whole approach exists to avoid.
  return PREFERRED.length + (voice.localService ? 0 : 50);
}

export function pickVoice(
  voices: SpeechSynthesisVoice[],
  preferredURI: string | null,
): SpeechSynthesisVoice | null {
  const usable = usableVoices(voices);
  if (usable.length === 0) return null;
  if (preferredURI) {
    const exact = usable.find((v) => v.voiceURI === preferredURI);
    if (exact) return exact;
  }
  return usable[0];
}

export interface Speaker {
  speak: (text: string) => void;
  stop: () => void;
}

/**
 * Speak, cancelling anything already in progress.
 *
 * Cancelling is deliberate: two overlapping lines from an assistant is worse than
 * missing one, and the newest thing it has to say is always the relevant one.
 */
export function createSpeaker(getSettings: () => VoiceSettings): Speaker {
  let cached: SpeechSynthesisVoice | null = null;
  let loading = false;

  const ensureVoice = async (uri: string | null) => {
    if (cached && (!uri || cached.voiceURI === uri)) return cached;
    if (loading) return cached;
    loading = true;
    try {
      cached = pickVoice(await loadVoices(), uri);
    } finally {
      loading = false;
    }
    return cached;
  };

  return {
    speak(text: string) {
      const settings = getSettings();
      if (!settings.enabled || !speechSupported() || !text.trim()) return;

      void ensureVoice(settings.voiceURI).then((voice) => {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        if (voice) utterance.voice = voice;
        utterance.rate = settings.rate;
        utterance.volume = settings.volume;
        // Pitch left at 1. Lowering it to sound "calmer" reliably reads as gloomy.
        utterance.pitch = 1;
        window.speechSynthesis.speak(utterance);
      });
    },
    stop() {
      if (speechSupported()) window.speechSynthesis.cancel();
    },
  };
}
