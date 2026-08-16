import { Check, Lock, Eye, Mic, Camera, Bell, Power, KeyRound, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/cn';

/*
 * Permissions.
 *
 * The products this flow is modelled on ask for accessibility, microphone and
 * screen recording on one screen, with a toggle each. Sidq asks for one thing,
 * and then spends the rest of the screen on what it will never ask for.
 *
 * That inversion is the point. Everything else in this category reads your screen;
 * refusing to is the reason someone leaves this installed. Saying it at the exact
 * moment the OS is about to show a scary lock dialog is worth more than saying it
 * anywhere else in the product.
 */

export interface PermissionState {
  accessibility: boolean;
  notifications: boolean;
  autostart: boolean;
}

const GRANTS = [
  {
    key: 'accessibility' as const,
    icon: KeyRound,
    title: 'Accessibility',
    detail:
      'Reads the name of the window in front of you, and lets ⌘⇧N work from inside other apps. This is the one that makes it work.',
    required: true,
  },
  {
    key: 'notifications' as const,
    icon: Bell,
    title: 'Notifications',
    detail: 'One in the morning when the plan is ready. One at night to close the day.',
    required: false,
  },
  {
    key: 'autostart' as const,
    icon: Power,
    title: 'Open at login',
    detail: 'A planner you have to remember to open is a planner you stop opening.',
    required: false,
  },
];

/** Named explicitly, because a list of what is not taken is only credible if it is specific. */
const NEVER = [
  { icon: Eye, label: 'Your screen' },
  { icon: Camera, label: 'Your camera' },
  { icon: Mic, label: 'Your microphone' },
];

export function Permissions({
  state,
  onToggle,
}: {
  state: PermissionState;
  onToggle: (key: keyof PermissionState, value: boolean) => void;
}) {
  return (
    <div className="space-y-2.5">
      {GRANTS.map(({ key, icon: Icon, title, detail, required }) => {
        const on = state[key];
        return (
          <div
            key={key}
            className={cn(
              'rounded-[14px] border p-4 transition-colors duration-300',
              on ? 'border-[#B8A6FF]/35 bg-[#B8A6FF]/[0.07]' : 'border-white/[0.07] bg-white/[0.02]',
            )}
          >
            <div className="flex items-start gap-3">
              <Icon
                className={cn('mt-0.5 size-4 shrink-0', on ? 'text-[#A9B0FF]' : 'text-white/40')}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[0.9375rem] font-medium text-white">{title}</p>
                <p className="mt-1 text-[0.8125rem] leading-relaxed text-white/45">{detail}</p>
              </div>

              {/*
               * Accessibility cannot be toggled from here. macOS grants it in
               * System Settings and nowhere else, so a switch that appears to
               * control it would be a lie; it reports state instead.
               */}
              {required ? (
                <span
                  className={cn(
                    'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full',
                    on ? 'bg-[#B8A6FF]' : 'border border-white/15',
                  )}
                >
                  {on && <Check className="size-3 text-white" />}
                </span>
              ) : (
                <Switch checked={on} onChange={(v) => onToggle(key, v)} label={title} />
              )}
            </div>
          </div>
        );
      })}

      <div className="rounded-[14px] border border-white/[0.07] bg-white/[0.02] p-4">
        <p className="text-[0.6875rem] uppercase tracking-[0.18em] text-white/35">
          Never, on any plan
        </p>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
          {NEVER.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-2 text-[0.8125rem] text-white/55">
              <span className="relative">
                <Icon className="size-3.5" />
                {/* Struck through, so the list reads as refusal at a glance rather
                    than as another set of things being requested. */}
                <span className="absolute inset-x-[-2px] top-1/2 h-px rotate-[-20deg] bg-white/45" />
              </span>
              {label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'mt-0.5 h-[1.375rem] w-[2.375rem] shrink-0 rounded-full p-0.5 transition-colors duration-200',
        checked ? 'bg-[#34C77B]' : 'bg-white/15',
      )}
    >
      <span
        className={cn(
          'block size-[1.125rem] rounded-full bg-white transition-transform duration-200 ease-(--ease-out-expo)',
          checked && 'translate-x-4',
        )}
      />
    </button>
  );
}

/**
 * What to expect from macOS, in our own voice.
 *
 * The first version of this was a pixel copy of the real system dialog, lock icon
 * and all, with dead "Open System Settings" and "Deny" buttons. That is
 * impersonating the operating system: it teaches people that a window which looks
 * exactly like a macOS security prompt might be drawn by an app, which is the
 * habit every credential phishing attack depends on.
 *
 * So this describes the real dialog instead of imitating it, in Sidq's own dark
 * surface, and the only button here opens the genuine System Settings pane.
 */
export function SystemDialogPreview({
  granted,
  onOpenSettings,
}: {
  granted: boolean;
  onOpenSettings?: () => void;
}) {
  if (granted) {
    return (
      <div className="flex flex-col items-center">
        <div className="grid size-20 place-items-center rounded-full bg-[#34C77B] shadow-[0_0_0_10px_rgba(52,199,123,0.12),0_20px_50px_-12px_rgba(52,199,123,0.5)]">
          <Check className="size-10 text-white" strokeWidth={2.5} />
        </div>
        <p className="mt-6 text-[1.125rem] text-white/90">All set</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[28rem]">
      <div className="rounded-[18px] border border-white/[0.09] bg-white/[0.035] p-6">
        <div className="flex items-center gap-2.5 text-[0.625rem] uppercase tracking-[0.18em] text-white/40">
          <Lock className="size-3.5" />
          What macOS will ask
        </div>

        <p className="mt-4 text-[1rem] leading-relaxed text-white/85">
          macOS will show its own security prompt asking whether Sidq may use
          accessibility features. That prompt is from the system, not from us, and it is
          the only place this can be granted.
        </p>

        <ol className="mt-6 space-y-3">
          {[
            'Open System Settings, on the prompt or with the button here.',
            'Privacy & Security, then Accessibility.',
            'Switch Sidq on.',
          ].map((line, i) => (
            <li key={line} className="flex items-start gap-3 text-[0.875rem] text-white/70">
              <span className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-white/[0.08] text-[0.6875rem] text-white/60">
                {i + 1}
              </span>
              {line}
            </li>
          ))}
        </ol>

        {/* The real thing. Opens Apple's own Accessibility pane. */}
        <button
          onClick={onOpenSettings}
          className="btn-soft mt-6 flex min-h-[3rem] w-full items-center justify-center gap-2 rounded-[12px] px-5 text-[0.9375rem] font-medium"
        >
          Open System Settings
          <ExternalLink className="size-4" />
        </button>
      </div>

      <p className="mt-5 text-center text-[0.8125rem] leading-relaxed text-white/35">
        Come back when it is on. This window notices by itself.
      </p>
    </div>
  );
}
