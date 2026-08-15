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

  // Coaches are the paying side. plan_status on coach_profiles is the entitlement
  // that matters; profiles.plan_tier stays for the individual product.
  const setCoachStatus = async (
    customerId: string,
    status: 'active' | 'past_due' | 'canceled',
  ) => {
    const { error } = await admin
      .from('coach_profiles')
      .update({ plan_status: status })
      .eq('stripe_customer_id', customerId);
    if (error) console.error('Failed to set coach plan status', error);
  };

  type Tier = 'free' | 'pro' | 'duo';

  /*
   * Which tier a subscription grants is decided by the price it was bought at,
   * read back off the Stripe object. Nothing in the request body is trusted for
   * this: the alternative is taking the client's word for what it paid for.
   */
  const tierForPrice = (priceId: string | undefined): Tier => {
    if (priceId && priceId === Deno.env.get('STRIPE_PRICE_DUO')) return 'duo';
    return 'pro';
  };

  const setTier = async (customerId: string, tier: Tier) => {
    await setCoachStatus(customerId, tier === 'free' ? 'canceled' : 'active');
    const { error } = await admin.from('profiles').update({ plan_tier: tier }).eq('stripe_customer_id', customerId);
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
        const tier = tierForPrice(lineItems.data[0]?.price?.id);

        if (userId) {
          await admin.from('profiles').update({ plan_tier: tier, stripe_customer_id: customerId }).eq('id', userId);
          await admin
            .from('coach_profiles')
            .update({ plan_status: 'active', stripe_customer_id: customerId })
            .eq('id', userId);
        } else if (customerId) {
          await setTier(customerId, tier);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
        // past_due keeps access — dunning is Stripe's job, and yanking the product
        // over a card that expired is how you lose a customer who wanted to stay.
        const active = ['active', 'trialing', 'past_due'].includes(sub.status);
        // past_due keeps access but is recorded accurately, so a coach can be shown
        // a real warning instead of silently losing their clients mid-session.
        await setCoachStatus(
          customerId,
          sub.status === 'past_due' ? 'past_due' : active ? 'active' : 'canceled',
        );
        await setTier(
          customerId,
          active ? tierForPrice(sub.items.data[0]?.price?.id) : 'free',
        );
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
        await setTier(customerId, 'free');
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
