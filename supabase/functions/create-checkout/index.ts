/*
 * Creates a Stripe Checkout session. Prices are read from the environment, never
 * from the request — a client that could name its own price would be a client that
 * could set it to zero.
 */
import Stripe from 'npm:stripe@18.2.1';
import { createClient } from 'npm:@supabase/supabase-js@2.50.0';
import { json, fail, preflight } from '../_shared/http.ts';

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return fail(req, 405, 'Method not allowed');

  const secret = Deno.env.get('STRIPE_SECRET_KEY');
  if (!secret) return fail(req, 500, 'Billing is not configured');

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
  );

  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return fail(req, 401, 'Sign in first');

  const { plan, interval, returnUrl } = (await req.json().catch(() => ({}))) as {
    plan?: string;
    interval?: string;
    returnUrl?: string;
  };

  /*
   * Plan and interval name a price, they are never a price. An unrecognised pair
   * falls through to undefined and is rejected below rather than silently
   * defaulting to the cheapest plan, which would let anyone buy the top tier at
   * the Pro price by sending a plan string we do not know.
   */
  const priceEnv: Record<string, string | undefined> = {
    'pro:monthly': 'STRIPE_PRICE_MONTHLY',
    'pro:annual': 'STRIPE_PRICE_ANNUAL',
    'duo:monthly': 'STRIPE_PRICE_DUO',
  };

  const envName = priceEnv[`${plan}:${interval}`];
  const priceId = envName ? Deno.env.get(envName) : undefined;
  if (!priceId) return fail(req, 400, 'That plan is not available');

  // Only redirect back to origins we control.
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((o) => o.trim());
  const base = allowed.includes(returnUrl ?? '') ? returnUrl! : allowed[0];
  if (!base) return fail(req, 500, 'No return origin configured');

  const stripe = new Stripe(secret, { apiVersion: '2025-05-28.basil' });

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: profile } = await admin
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .maybeSingle();

    let customerId = profile?.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await admin.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id);
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${base}/today?upgraded=1`,
      cancel_url: `${base}/upgrade`,
      // The webhook trusts this to attribute the subscription.
      client_reference_id: user.id,
      subscription_data: { metadata: { supabase_user_id: user.id } },
      allow_promotion_codes: true,
    });

    return json(req, { url: session.url });
  } catch (err) {
    return fail(req, 502, 'Could not start checkout', err);
  }
});
