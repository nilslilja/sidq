import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { startCheckout, type BillingInterval } from '@/lib/billing';
import { PLANS, type Plan, type PlanId } from '@/lib/plans';
import { cn } from '@/lib/cn';

type PaidPlanId = Exclude<PlanId, 'free'>;

/*
 * Pricing, inside the app.
 *
 * Same three tiers as the landing page, read from the same file, because a
 * paywall that says different things in two places is how support tickets and
 * chargebacks start.
 *
 * Reached almost entirely by hitting the free meter, so the free card is not
 * repeated here. Someone who arrived by running out of rebuilds does not need
 * the plan they are already on sold back to them.
 */

const PAID = PLANS.filter((p) => p.id !== 'free');

export function Upgrade() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const go = async (plan: PaidPlanId, interval: BillingInterval) => {
    setBusy(`${plan}:${interval}`);
    setError(null);
    try {
      await startCheckout(plan, interval);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout could not start.');
      setBusy(null);
    }
  };

  return (
    <div className="column min-h-[100dvh] py-10">
      <Link
        to="/today"
        className="inline-flex min-h-11 w-fit items-center gap-2 text-sm text-muted transition-colors duration-(--duration-fast) hover:text-text"
      >
        <ArrowLeft className="size-4" />
        Back
      </Link>

      <h1 className="mt-10 font-display text-[2.75rem] leading-[1.02]">
        Twenty a month.
        <br />
        <span className="text-muted">Cancel in one click.</span>
      </h1>

      <p className="mt-5 max-w-[40ch] text-[1rem] leading-relaxed text-muted">
        Less than one wasted afternoon re-explaining what you were already doing.
      </p>

      <div className="mt-10 grid gap-4">
        {PAID.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            busy={busy === `${plan.id}:monthly`}
            onSubscribe={() => go(plan.id as PaidPlanId, 'monthly')}
          />
        ))}
      </div>

      {/* Annual is an option on the main plan, not a fourth card. Turning the
          billing period into its own tier is what makes pricing pages a puzzle. */}
      <button
        onClick={() => go('pro', 'annual')}
        disabled={busy !== null}
        className="mt-5 w-fit text-sm text-muted underline underline-offset-4 transition-colors duration-(--duration-fast) hover:text-text disabled:opacity-60"
      >
        {busy === 'pro:annual' ? 'Opening checkout…' : 'Or pay yearly, $192, two months free'}
      </button>

      {error && (
        <p role="alert" className="mt-6 text-sm text-muted">
          {error}
        </p>
      )}

      <p className="mt-8 text-xs leading-relaxed text-muted">
        Your free plan keeps working either way. Nothing you have made goes away.
      </p>
    </div>
  );
}

function PlanCard({
  plan,
  busy,
  onSubscribe,
}: {
  plan: Plan;
  busy: boolean;
  onSubscribe: () => void;
}) {
  return (
    <section
      className={cn(
        'rounded-(--radius) p-6',
        plan.featured ? 'glass border-accent' : 'glass-subtle',
      )}
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-[0.9375rem] font-medium">{plan.name}</h2>
        <p className="flex items-baseline gap-1">
          <span className="tabular text-[1.75rem] leading-none">{plan.price}</span>
          <span className="text-xs text-muted">{plan.cadence}</span>
        </p>
      </div>

      <p className="mt-2 text-sm text-muted">{plan.promise}</p>

      {plan.inherits && (
        <p className="mt-5 text-sm">Everything in {plan.inherits}, plus</p>
      )}

      <ul className={cn('space-y-2.5', plan.inherits ? 'mt-3' : 'mt-5')}>
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-3 text-[0.9375rem] leading-snug">
            <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" />
            {feature}
          </li>
        ))}
      </ul>

      <Button
        className="mt-6 w-full"
        variant={plan.featured ? 'accent' : 'outline'}
        onClick={onSubscribe}
        disabled={busy}
      >
        {busy ? 'Opening checkout…' : plan.cta}
      </Button>
    </section>
  );
}
