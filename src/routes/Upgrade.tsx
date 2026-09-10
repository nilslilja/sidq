import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startCheckout, type BillingInterval } from "@/lib/billing";
import { getAccessToken } from "@/lib/supabase";
import { PLANS, inheritedFeatures, type Plan, type PlanId } from "@/lib/plans";
import { cn } from "@/lib/cn";

type PaidPlanId = Exclude<PlanId, "free">;

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

const PAID = PLANS.filter((p) => p.id !== "free");

export function Upgrade() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /*
   * Say it before the click, not after.
   *
   * Checkout already refused without a session and returned a clear sentence,
   * but only once somebody had pressed Subscribe and waited. Being told the
   * requirement after the attempt reads as a broken payment button, which is
   * the worst thing this page can look like.
   */
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    void getAccessToken().then((token) => {
      if (!cancelled) setSignedIn(Boolean(token));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /*
   * Which card is waiting for an answer.
   *
   * The error used to be one string at the bottom of the page. On a 900px
   * screen the Subscribe button sits at 654 and that paragraph rendered at
   * 2652 — seventeen hundred pixels below the fold, on a page that already
   * scrolls. Pressing the button and being told nothing is how a payment
   * button gets read as broken, which is the worst thing this page can be.
   */
  const [failed, setFailed] = useState<string | null>(null);

  const go = async (plan: PaidPlanId, interval: BillingInterval) => {
    const key = `${plan}:${interval}`;
    setBusy(key);
    setError(null);
    setFailed(null);
    try {
      await startCheckout(plan, interval);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Checkout could not start.",
      );
      setFailed(key);
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
        Less than one wasted afternoon re-explaining what you were already
        doing.
      </p>

      <div className="mt-10 grid gap-4">
        {PAID.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            busy={busy === `${plan.id}:monthly`}
            signedIn={signedIn}
            problem={failed === `${plan.id}:monthly` ? error : null}
            onSubscribe={() => go(plan.id as PaidPlanId, "monthly")}
          />
        ))}
      </div>

      {/* Annual is an option on the main plan, not a fourth card. Turning the
          billing period into its own tier is what makes pricing pages a puzzle. */}
      <button
        onClick={() => go("pro", "annual")}
        disabled={busy !== null}
        className="mt-5 w-fit text-sm text-muted underline underline-offset-4 transition-colors duration-(--duration-fast) hover:text-text disabled:opacity-60"
      >
        {busy === "pro:annual"
          ? "Opening checkout…"
          : "Or pay yearly, $192, two months free"}
      </button>

      {/*
        * Both of these used to live here: a "sign in first" panel and the error
        * line. They were correct and they were at the bottom of a 2,763px page,
        * which on a 900px screen put them 1,750px below the button that caused
        * them. Each now renders inside the card that was pressed, where the
        * person is already looking, and there is exactly one of each so that
        * `role="alert"` names one thing.
        */}

      <p className="mt-8 text-xs leading-relaxed text-muted">
        Your free plan keeps working either way. Nothing you have made goes
        away.
      </p>
    </div>
  );
}

function PlanCard({
  plan,
  busy,
  signedIn,
  problem,
  onSubscribe,
}: {
  plan: Plan;
  busy: boolean;
  /** `null` until the session has been read. See the note on `signedIn`. */
  signedIn: boolean | null;
  /** Why this card's last attempt failed, shown inside the card. */
  problem: string | null;
  onSubscribe: () => void;
}) {
  return (
    <section
      className={cn(
        "rounded-(--radius) p-6",
        plan.featured ? "glass border-accent" : "glass-subtle",
      )}
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-[0.9375rem] font-medium">{plan.name}</h2>
        <p className="flex items-baseline gap-1">
          <span className="tabular text-[1.75rem] leading-none">
            {plan.price}
          </span>
          <span className="text-xs text-muted">{plan.cadence}</span>
        </p>
      </div>

      {/* Duo's headline price reads as the expensive one until it is divided. */}
      {plan.priceNote && (
        <p className="mt-1 text-right text-xs text-muted">{plan.priceNote}</p>
      )}

      <p className="mt-2 text-sm text-muted">{plan.promise}</p>

      {/* New lines bright, carried lines muted below. See Pricing.tsx. */}
      <ul className="mt-5 space-y-2.5">
        {plan.features.map((feature) => (
          <li
            key={feature}
            className="flex items-start gap-3 text-[0.9375rem] leading-snug"
          >
            <Check
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-accent"
            />
            {feature}
          </li>
        ))}
      </ul>

      {plan.inherits && (
        <>
          <p className="mt-5 text-xs font-medium text-muted">
            Everything in {plan.inherits}
          </p>
          <ul className="mt-3 space-y-2.5">
            {inheritedFeatures(plan.id).map((feature) => (
              <li
                key={feature}
                className="flex items-start gap-3 text-[0.9375rem] leading-snug text-muted"
              >
                <Check
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-accent/50"
                />
                {feature}
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Caps marked as caps, not ticked like benefits. See Pricing.tsx. */}
      {plan.limits && (
        <ul className="mt-5 space-y-2.5">
          {plan.limits.map((limit) => (
            <li
              key={limit}
              className="flex items-start gap-3 text-[0.9375rem] leading-snug text-muted"
            >
              <Minus
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 opacity-50"
              />
              {limit}
            </li>
          ))}
        </ul>
      )}

      {/*
       * Team has no Stripe product behind it, so the button opens a
       * conversation rather than a checkout that would fail on a missing price.
       */}
      {plan.ctaHref ? (
        <Button
          className="mt-6 w-full"
          variant="outline"
          onClick={() => {
            window.location.href = plan.ctaHref as string;
          }}
        >
          {plan.cta}
        </Button>
      ) : (
        /*
         * Signed out, the button says what it will actually do.
         *
         * It used to say Subscribe, attempt checkout, fail, and put the reason
         * at the bottom of a page nobody had scrolled. Naming the next step on
         * the button removes the dead press entirely rather than explaining it
         * afterwards, and it is still one click to the same place.
         *
         * Only once the session has been read. `null` means unknown, and a
         * button that reads "Sign in to subscribe" at somebody who is already
         * signed in is its own small insult.
         */
        <>
          {signedIn === false ? (
            <Button
              className="mt-6 w-full"
              variant={plan.featured ? "accent" : "outline"}
              onClick={() => {
                window.location.href = "/signin";
              }}
            >
              Sign in to subscribe
            </Button>
          ) : (
            <Button
              className="mt-6 w-full"
              variant={plan.featured ? "accent" : "outline"}
              onClick={onSubscribe}
              disabled={busy}
            >
              {busy ? "Opening checkout…" : plan.cta}
            </Button>
          )}

          {signedIn === false && (
            <p className="mt-2 text-center text-xs text-muted">
              A subscription has to land on an account.
            </p>
          )}

          {problem && (
            <p role="alert" className="mt-3 text-center text-sm text-muted">
              {problem}
            </p>
          )}
        </>
      )}
    </section>
  );
}
