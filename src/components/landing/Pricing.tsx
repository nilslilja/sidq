import { Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PLANS, type Plan } from '@/lib/plans';
import { usePlatform } from './DownloadButton';
import { artifactFor } from '@/lib/releases';
import { cn } from '@/lib/cn';

/*
 * Pricing, on the landing page.
 *
 * Three cards, the middle one carrying the weight. The structure is lifted from
 * the products that are winning at this: a metered free tier, one unlimited tier,
 * and a third card whose only job is to make the middle one look like the sane
 * choice. That last effect is real and well documented, and it works because the
 * top card is a genuine offer rather than a decoy.
 *
 * The visual language is Sidq's, not theirs. Soft neumorphic cards would fight
 * every hard rule and heavy border on this page.
 */

export function Pricing() {
  return (
    <section className="mx-auto max-w-[76rem] px-6 py-24" aria-labelledby="pricing">
      <h2
        id="pricing"
        className="max-w-[18ch] font-display text-[clamp(2rem,4.2vw,3.25rem)] leading-[0.94] tracking-[-0.04em]"
      >
        Free until it works.
        <br />
        <span className="ink-quiet">Then twenty.</span>
      </h2>

      <div className="mt-14 grid gap-px border border-ink/15 bg-ink/15 lg:grid-cols-3">
        {PLANS.map((plan) => (
          <PlanCard key={plan.id} plan={plan} />
        ))}
      </div>

      <p className="mt-8 max-w-[46ch] text-[0.875rem] leading-relaxed ink-muted">
        Nothing is locked on the free plan, it is metered. You get the whole product
        and run out of it, which is a different feeling from being shown a padlock.
      </p>
    </section>
  );
}

/**
 * The button on a plan card.
 *
 * The free plan downloads the app. It does not scroll to a section or route to a
 * page with another button on it, because "Get for Mac" is a decision already
 * made and every step after it loses people.
 *
 * The paid plans route to checkout, which needs an account, so those stay links.
 */
function PlanCta({ plan }: { plan: Plan }) {
  const info = usePlatform();

  const className = cn(
    'mt-7 inline-flex min-h-[3.25rem] items-center justify-center rounded-[12px] px-6',
    'text-[0.9375rem] font-medium',
    // The featured card already sits on ink, so the lit button is the one that
    // carries it. The others stay flat, or all three compete.
    plan.featured ? 'btn-soft' : 'bg-ink text-paper transition-colors duration-150 hover:bg-accent',
  );

  if (plan.id === 'free') {
    const artifact = artifactFor(info.platform);
    return artifact ? (
      <a href={artifact.url} download={artifact.filename} className={className}>
        {info.label}
      </a>
    ) : (
      // Mac only. No browser fallback to send people to, so the button states
      // the platform instead of promising a product that does not exist.
      <span className={className}>Mac only for now</span>
    );
  }

  return (
    <Link to="/upgrade" className={className}>
      {plan.cta}
    </Link>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  return (
    <div
      className={cn(
        'flex flex-col p-7',
        // The featured card carries the ink fill. Scale and weight do the work
        // here rather than a "most popular" ribbon, which everybody discounts.
        plan.featured ? 'bg-ink text-paper' : 'bg-paper',
      )}
    >
      <h3
        className={cn(
          'text-[0.625rem] uppercase tracking-[0.22em]',
          plan.featured ? 'text-paper/55' : 'ink-muted',
        )}
      >
        {plan.name}
      </h3>

      <p className="mt-5 flex items-baseline gap-1.5">
        <span className="tabular font-display text-[clamp(2.5rem,5vw,3.5rem)] leading-none tracking-[-0.05em]">
          {plan.price}
        </span>
        {plan.cadence && (
          <span className={cn('text-[0.875rem]', plan.featured ? 'text-paper/55' : 'ink-muted')}>
            {plan.cadence}
          </span>
        )}
      </p>

      <PlanCta plan={plan} />

      <p
        className={cn(
          'mt-5 text-[0.9375rem]',
          plan.featured ? 'text-paper/70' : 'ink-muted',
        )}
      >
        {plan.promise}
      </p>

      <hr className={cn('mt-5', plan.featured ? 'border-paper/15' : 'border-ink/12')} />

      {plan.inherits && (
        <p className="mt-5 text-[0.875rem] font-medium">Everything in {plan.inherits}, plus</p>
      )}

      <ul className={cn('space-y-2.5', plan.inherits ? 'mt-3' : 'mt-5')}>
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5 text-[0.9375rem] leading-snug">
            <Check
              aria-hidden="true"
              className={cn('mt-0.5 size-4 shrink-0', plan.featured ? 'text-paper' : 'text-accent')}
            />
            <span className={plan.featured ? 'text-paper/90' : undefined}>{feature}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
