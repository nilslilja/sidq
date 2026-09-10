/*
 * Stripe webhook. The only writer of profiles.plan_tier — a database trigger
 * rejects the change from anyone but the service role, so this function is the
 * entire path from payment to entitlement.
 *
 * The signature is verified before the body is trusted. Without that check the
 * endpoint is a public "make me a paying customer" button.
 */
import Stripe from 'npm:stripe@18.2.1';
import { createClient } from 'npm:@supabase/supabase-js@2.50.0';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const secret = Deno.env.get('STRIPE_SECRET_KEY');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!secret || !webhookSecret) return new Response('Not configured', { status: 500 });

  const signature = req.headers.get('stripe-signature');
  if (!signature) return new Response('Missing signature', { status: 400 });

  const stripe = new Stripe(secret, { apiVersion: '2025-05-28.basil' });
  const payload = await req.text();

  let event: Stripe.Event;
  try {
    // Async variant: the sync one uses Node crypto and does not run on Deno.
    event = await stripe.webhooks.constructEventAsync(payload, signature, webhookSecret);
  } catch (err) {
    console.error('Signature verification failed', err);
    return new Response('Invalid signature', { status: 400 });
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  /*
   * ── profiles.plan_tier is the entitlement. There is no second one ──────────
   *
   * The comment that used to sit here said the opposite: that plan_status on
   * coach_profiles was "the entitlement that matters" and profiles.plan_tier
   * was the lesser one. That was true of the coaching product this codebase
   * used to be. It is exactly inverted for Sidq.
   *
   * `entitlement.rs` fetches `/rest/v1/profiles?select=plan_tier` and reads
   * nothing else, anywhere. coach_profiles is not consulted by the app, the
   * pill, or the limit check.
   *
   * It is called out at this length because of where the wrong version was
   * sitting: in the one function standing between a payment and access. A
   * future reader trusting it would have "fixed" billing by writing to a table
   * nothing reads, and every paying customer would have stayed on free.
   *
   * The coach_profiles writes are gone with it. They updated rows for a product
   * that no longer exists and their errors were logged and swallowed, so they
   * were invisible either way.
   */

  type Tier = 'free' | 'pro' | 'duo' | 'team';

  /*
   * Which tier a subscription grants is decided by the price it was bought at,
   * read back off the Stripe object. Nothing in the request body is trusted for
   * this: the alternative is taking the client's word for what it paid for.
   */
  const tierForPrice = (priceId: string | undefined): Tier => {
    if (!priceId) return 'pro';
    if (priceId === Deno.env.get('STRIPE_PRICE_DUO')) return 'duo';
    if (
      priceId === Deno.env.get('STRIPE_PRICE_TEAM_SEAT') ||
      priceId === Deno.env.get('STRIPE_PRICE_TEAM_SEAT_ANNUAL')
    ) {
      return 'team';
    }
    return 'pro';
  };

  /*
   * Team is priced per seat, so the quantity is the seat count and it is read
   * off the Stripe object rather than taken from the request. Everything else
   * is one seat by definition, and writing 1 rather than leaving the column
   * alone is what makes a downgrade from Team actually reduce the seats.
   */
  const seatsFor = (tier: Tier, quantity: number | null | undefined): number =>
    tier === 'team' ? Math.max(1, quantity ?? 1) : tier === 'free' ? 0 : 1;

  const setTier = async (customerId: string, tier: Tier, seats: number) => {
    const { error } = await admin
      .from('profiles')
      .update({ plan_tier: tier, team_seats: seats })
      .eq('stripe_customer_id', customerId);
    if (error) console.error('Failed to set plan tier', error);
  };

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id;
        const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;

        // Attribute by user id when Stripe gave us one, since it is the strongest
        // link; fall back to the customer id.
        // The session does not carry the price, so it is fetched rather than
        // assumed. Guessing here is how someone gets the top tier for $19.99.
        const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 });
        const line = lineItems.data[0];
        const tier = tierForPrice(line?.price?.id);
        const seats = seatsFor(tier, line?.quantity);

        if (userId) {
          await admin
            .from('profiles')
            .update({ plan_tier: tier, team_seats: seats, stripe_customer_id: customerId })
            .eq('id', userId);
        } else if (customerId) {
          await setTier(customerId, tier, seats);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
        // past_due keeps access — dunning is Stripe's job, and yanking the product
        // over a card that expired is how you lose a customer who wanted to stay.
        const active = ['active', 'trialing', 'past_due'].includes(sub.status);
        const item = sub.items.data[0];
        const tier = active ? tierForPrice(item?.price?.id) : 'free';
        // Seat count moves with the subscription, so adding or removing seats
        // in Stripe changes how many codes the buyer can mint. Cancelling takes
        // it to zero, which makes every unredeemed code useless without any
        // membership list to go and tidy.
        await setTier(customerId, tier, seatsFor(tier, item?.quantity));
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
        await setTier(customerId, 'free', 0);
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error('Webhook handling failed', err);
    // 500 so Stripe retries rather than dropping a paid upgrade on the floor.
    return new Response('Handler error', { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
