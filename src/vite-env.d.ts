/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_VAPID_PUBLIC_KEY?: string;
  readonly VITE_STRIPE_PRICE_MONTHLY?: string;
  readonly VITE_STRIPE_PRICE_ANNUAL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
