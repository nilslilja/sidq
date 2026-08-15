import { useState } from 'react';
import { Check, Infinity as InfinityIcon } from 'lucide-react';
import { startCheckout } from '@/lib/billing';
import { PLANS } from '@/lib/plans';
import { cn } from '@/lib/cn';

/*
 * The paywall, at the end of first run.
 *
 * Drops the two pane layout. Every other screen has been a lesson; this one is a
 * decision, and putting a feature preview beside it reads as another lesson.
 *
 * Annual is preselected and the saving is stated as a struck-through monthly
 * price, which is the standard shape here and works because it is true: the
 * annual price really is lower per month. What is deliberately not copied is a
 * countdown, a fake discount clock, or a "-45%" that never expires. Those convert
 * and then churn, and churn is the entire problem this product is trying to solve
 * for its own business.
 */

type Interval = 'monthly' | 'annual';

/** Annual is billed at $192, which is $16 a month. */
const ANNUAL_MONTHLY = '$16';
const ANNUAL_SAVING = '20%';

const PRO = PLANS[1];
const TOP = PLANS[2];

export function UpgradeStep({ onSkip }: { onSkip: () => void }) {
  const [interval, setInterval] = useState<Interval>('annual');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const go = async (plan: 'pro' | 'duo') => {
    setBusy(plan);
    setError(null);
    try {
      // Only Pro has an annual price. The top tier is monthly, so it is never sent
      // an interval it has no price for.
      await startCheckout(plan, plan === 'pro' ? interval : 'monthly');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout could not start.');
      setBusy(null);
    }
  };

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[#0B0B10] text-white">
      <div
        aria-hidden="true"
        className="bloom-breathe pointer-events-none absolute left-1/2 top-0 size-[40rem] -translate-x-1/2 rounded-full bg-[#6366F1] opacity-[0.12] blur-[120px]"
      />

      <div className="relative mx-auto flex min-h-[100dvh] max-w-[54rem] flex-col justify-center px-8 py-16">
        <h1 className="text-center font-display text-[clamp(1.75rem,3.4vw,2.75rem)] leading-[1.04] tracking-[-0.035em]">
          Keep the days that work
        </h1>
        <p className="mx-auto mt-4 max-w-[38ch] text-center text-[0.9375rem] leading-relaxed text-white/45">
          Free keeps working forever. Pro takes the meters off and turns on the part
          that learns what you actually finish.
        </p>

        <div className="mt-9 flex justify-center">
          <IntervalToggle value={interval} onChange={setInterval} />
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Card
            name={PRO.name}
            price={interval === 'annual' ? ANNUAL_MONTHLY : PRO.price}
            was={interval === 'annual' ? PRO.price : undefined}
            featured
            features={PRO.features}
            cta={busy === 'pro' ? 'Opening checkout…' : 'Upgrade'}
            onClick={() => go('pro')}
            disabled={busy !== null}
          />
          <Card
            name={TOP.name}
            price={TOP.price}
            features={TOP.features}
            cta={busy === 'duo' ? 'Opening checkout…' : 'Upgrade'}
            onClick={() => go('duo')}
            disabled={busy !== null}
          />
        </div>

        {error && (
          <p role="alert" className="mt-6 text-center text-[0.8125rem] text-[#FFB4A2]">
            {error}
          </p>
        )}

        <button
          onClick={onSkip}
          className="mx-auto mt-10 text-[0.875rem] text-white/40 transition-colors duration-150 hover:text-white"
        >
          Start with free ›
        </button>
      </div>
    </div>
  );
}

function IntervalToggle({
  value,
  onChange,
}: {
  value: Interval;
  onChange: (next: Interval) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-full bg-white/[0.06] p-1">
      {(['monthly', 'annual'] as const).map((option) => (
        <button
          key={option}
          onClick={() => onChange(option)}
          aria-pressed={value === option}
          className={cn(
            'flex items-center gap-2 rounded-full px-4 py-2 text-[0.8125rem] capitalize transition-colors duration-150',
            value === option ? 'bg-white/[0.14] text-white' : 'text-white/50 hover:text-white/80',
          )}
        >
          {option}
          {option === 'annual' && (
            <span className="rounded-full bg-[#6366F1] px-2 py-0.5 text-[0.6875rem] text-white">
              Save {ANNUAL_SAVING}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function Card({
  name,
  price,
  was,
  features,
  detail,
  cta,
  onClick,
  disabled,
  featured,
}: {
  name: string;
  price: string;
  was?: string;
  features: string[];
  detail?: string;
  cta: string;
  onClick: () => void;
  disabled: boolean;
  featured?: boolean;
}) {
  return (
    <section
      className={cn(
        'flex flex-col rounded-[18px] p-6',
        featured
          ? 'bg-[linear-gradient(165deg,#6366F1_0%,#4F46E5_58%,#4338CA_100%)] shadow-[0_1px_0_0_rgba(255,255,255,0.25)_inset,0_30px_60px_-20px_rgba(79,70,229,0.65)]'
          : 'border border-white/[0.09] bg-white/[0.035]',
      )}
    >
      <h2 className={cn('text-[0.9375rem]', featured ? 'text-white/85' : 'text-white/65')}>
        {name}
      </h2>

      <p className="mt-3 flex items-baseline gap-2">
        {was && (
          <span className="text-[1.125rem] text-white/45 line-through">{was}</span>
        )}
        <span className="tabular font-display text-[2.25rem] leading-none tracking-[-0.04em]">
          {price}
        </span>
        <span className={cn('text-[0.875rem]', featured ? 'text-white/70' : 'text-white/45')}>
          /month
        </span>
      </p>

      <ul className="mt-6 flex-1 space-y-2.5">
        {features.map((feature, i) => (
          <li key={feature} className="flex items-start gap-2.5 text-[0.875rem] leading-snug">
            {/* The infinity mark on the "unlimited" lines, a tick on the rest. It
                reads faster than four identical ticks and is the one flourish here. */}
            {feature.toLowerCase().startsWith('unlimited') ? (
              <InfinityIcon className="mt-0.5 size-4 shrink-0 opacity-80" />
            ) : (
              <Check className="mt-0.5 size-4 shrink-0 opacity-80" />
            )}
            <span className={featured || i === 0 ? 'text-white/95' : 'text-white/70'}>
              {feature}
            </span>
          </li>
        ))}
      </ul>

      {detail && <p className="mt-4 text-[0.8125rem] leading-relaxed text-white/45">{detail}</p>}

      <button
        onClick={onClick}
        disabled={disabled}
        className={cn(
          'mt-6 min-h-[3rem] rounded-[12px] px-5 text-[0.9375rem] font-medium transition-all duration-150',
          'disabled:pointer-events-none disabled:opacity-60',
          featured
            ? 'bg-white text-ink hover:bg-white/90'
            : 'btn-soft',
        )}
      >
        {cta}
      </button>
    </section>
  );
}
