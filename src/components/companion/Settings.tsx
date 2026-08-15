import { useEffect, useState } from 'react';
import { X, Play } from 'lucide-react';
import { cn } from '@/lib/cn';
import { loadVoices, usableVoices, type VoiceSettings } from '@/lib/companion/voice';

/*
 * Settings for the card.
 *
 * Short on purpose. Every toggle here is one someone will actually reach for after
 * being annoyed by something: the voice was wrong, it spoke too often, it launched
 * when they did not want it to. A settings panel that anticipates complaints is
 * useful; one that exposes every internal knob is an admission the defaults are bad.
 */

interface SettingsProps {
  voice: VoiceSettings;
  onVoiceChange: (next: VoiceSettings) => void;
  onPreview: (text: string) => void;
  nudgesEnabled: boolean;
  onNudgesChange: (enabled: boolean) => void;
  autostart: boolean;
  onAutostartChange: (enabled: boolean) => void;
  onClose: () => void;
}

const PREVIEW_LINE =
  'You have been going forty minutes. Ten away from the screen would hold the rest of the day together.';

export function Settings({
  voice,
  onVoiceChange,
  onPreview,
  nudgesEnabled,
  onNudgesChange,
  autostart,
  onAutostartChange,
  onClose,
}: SettingsProps) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    let cancelled = false;
    void loadVoices().then((all) => {
      if (!cancelled) setVoices(usableVoices(all));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mt-3 border-t border-white/10 pt-3">
      <div className="flex items-center justify-between">
        <span className="text-[0.625rem] uppercase tracking-[0.2em] text-white/40">Settings</span>
        <button
          onClick={onClose}
          aria-label="Close settings"
          className="grid size-6 place-items-center rounded text-white/40 transition-colors duration-150 hover:text-white"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <Row label="Voice">
        <div className="flex items-center gap-1.5">
          <select
            value={voice.voiceURI ?? ''}
            onChange={(e) => onVoiceChange({ ...voice, voiceURI: e.target.value || null })}
            className={cn(
              'min-w-0 flex-1 rounded border border-white/10 bg-black/40 px-2 py-1',
              'text-[0.75rem] text-white outline-none focus:border-white/30',
            )}
          >
            <option value="">Best available</option>
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name}
              </option>
            ))}
          </select>
          {/* Hearing it is the only way to choose. A dropdown of names is useless. */}
          <button
            onClick={() => onPreview(PREVIEW_LINE)}
            aria-label="Hear this voice"
            className="grid size-6 shrink-0 place-items-center rounded text-white/50 transition-colors duration-150 hover:bg-white/10 hover:text-white"
          >
            <Play className="size-3" />
          </button>
        </div>
      </Row>

      <Row label="Speed">
        <input
          type="range"
          min={0.7}
          max={1.2}
          step={0.02}
          value={voice.rate}
          onChange={(e) => onVoiceChange({ ...voice, rate: Number(e.target.value) })}
          className="w-full accent-white/70"
          aria-label="Speaking speed"
        />
      </Row>

      <Toggle
        label="Speak up when I drift"
        hint="Waits for sustained drift, never one glance"
        checked={nudgesEnabled}
        onChange={onNudgesChange}
      />

      <Toggle
        label="Open at login"
        hint="A card you have to remember to start is one you stop using"
        checked={autostart}
        onChange={onAutostartChange}
      />

      <p className="mt-3 text-[0.625rem] leading-relaxed text-white/30">
        ⌘⇧S hide · ⌘⇧N capture a thought from anywhere
      </p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <div className="mb-1 text-[0.6875rem] text-white/50">{label}</div>
      {children}
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      className="mt-3 flex w-full items-start gap-3 text-left"
    >
      <span
        className={cn(
          'mt-0.5 flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition-colors duration-150',
          checked ? 'bg-white/70' : 'bg-white/15',
        )}
      >
        <span
          className={cn(
            'size-3 rounded-full bg-[#12121A] transition-transform duration-150',
            checked && 'translate-x-3',
          )}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-[0.75rem] leading-snug text-white/85">{label}</span>
        <span className="block text-[0.6875rem] leading-snug text-white/35">{hint}</span>
      </span>
    </button>
  );
}
