const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const env = {
  supabaseUrl: url ?? '',
  supabaseAnonKey: anonKey ?? '',
  vapidPublicKey: (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? '',
  stripePriceMonthly: (import.meta.env.VITE_STRIPE_PRICE_MONTHLY as string | undefined) ?? '',
  stripePriceAnnual: (import.meta.env.VITE_STRIPE_PRICE_ANNUAL as string | undefined) ?? '',
};

/**
 * With no backend wired the app still runs end to end against localStorage and a
 * local planner. It is surfaced in the UI rather than hidden. A fallback plan the
 * user mistakes for the real one is worse than no plan.
 */
export const isBackendConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
export const isPushConfigured = Boolean(env.vapidPublicKey);
export const isBillingConfigured = Boolean(env.stripePriceMonthly);
