import { env, isBackendConfigured } from './env';
import { getAccessToken } from './supabase';

import type { PlanId } from './plans';

export type BillingInterval = 'monthly' | 'annual';

/**
 * Checkout is created server side. The client never holds a secret key and never
 * decides what a plan costs. It names a plan and an interval, and the function
 * maps that pair to a price id it holds in its own environment.
 */
export async function startCheckout(
  plan: Exclude<PlanId, 'free'>,
  interval: BillingInterval,
): Promise<void> {
  if (!isBackendConfigured) {
    throw new Error('Billing is not configured in this environment.');
  }

  const token = await getAccessToken();
  if (!token) {
    throw new Error('Sign in first so the subscription lands on your account.');
  }

  const res = await fetch(`${env.supabaseUrl}/functions/v1/create-checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.supabaseAnonKey,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ plan, interval, returnUrl: window.location.origin }),
  });

  if (!res.ok) {
    throw new Error(`Could not start checkout (${res.status}).`);
  }

  const { url } = (await res.json()) as { url: string };
  window.location.href = url;
}
