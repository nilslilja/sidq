#!/usr/bin/env bash
#
# Sidq setup. Takes a fresh clone to a deployed backend.
#
# Everything here is idempotent: run it again after fixing something and it picks
# up where it left off rather than duplicating resources.
#
#   ./scripts/setup.sh
#
set -euo pipefail

BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GREEN=$'\033[32m'
YELLOW=$'\033[33m'; BLUE=$'\033[36m'; OFF=$'\033[0m'

say()  { printf '%s\n' "$*"; }
step() { printf '\n%s▸ %s%s\n' "$BOLD" "$*" "$OFF"; }
ok()   { printf '  %s✓%s %s\n' "$GREEN" "$OFF" "$*"; }
warn() { printf '  %s!%s %s\n' "$YELLOW" "$OFF" "$*"; }
die()  { printf '  %s✗%s %s\n' "$RED" "$OFF" "$*"; exit 1; }
note() { printf '  %s%s%s\n' "$DIM" "$*" "$OFF"; }

ENV_FILE=".env.local"

say "${BOLD}Sidq setup${OFF}"
note "Takes a fresh clone to a working, deployed app."

# ---------------------------------------------------------------------------
step "Checking prerequisites"
# ---------------------------------------------------------------------------
command -v node >/dev/null || die "node is not installed. Get it from nodejs.org"
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
[ "$NODE_MAJOR" -ge 20 ] || die "node 20+ required, found $(node -v)"
ok "node $(node -v)"

command -v npm >/dev/null || die "npm is not installed"
ok "npm $(npm -v)"

if command -v supabase >/dev/null; then
  ok "supabase cli $(supabase --version 2>/dev/null | head -1)"
  HAVE_SUPABASE=1
else
  warn "supabase cli not found. Backend steps will be skipped."
  note "install: brew install supabase/tap/supabase"
  HAVE_SUPABASE=0
fi

[ -d node_modules ] || { step "Installing dependencies"; npm install; }

# ---------------------------------------------------------------------------
step "Anthropic API key"
# ---------------------------------------------------------------------------
# This is the one secret the product cannot run without. It lives server side
# only: never in .env.local with a VITE_ prefix, never in a bundle.
if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  ok "found in environment"
else
  say ""
  say "  Get one at ${BLUE}https://console.anthropic.com/settings/keys${OFF}"
  printf '  Paste your Anthropic API key (input hidden): '
  read -rs ANTHROPIC_API_KEY
  say ""
  [ -n "$ANTHROPIC_API_KEY" ] || die "no key entered"
  export ANTHROPIC_API_KEY
  ok "captured for this session"
  note "add it to your shell profile to skip this next time"
fi

# ---------------------------------------------------------------------------
step "Running the quality gate"
# ---------------------------------------------------------------------------
# Deliberately before any deployment. If the planner is not good there is nothing
# worth deploying, and this is the cheapest possible place to find that out.
say ""
if npm run --silent eval; then
  ok "gate passed"
else
  say ""
  warn "The gate failed. That means the plans are not good enough yet."
  note "Fix supabase/functions/_shared/prompt.ts, then run this again."
  printf '  Continue with deployment anyway? [y/N] '
  read -r CONTINUE
  [[ "$CONTINUE" =~ ^[Yy]$ ]] || exit 1
fi

# ---------------------------------------------------------------------------
step "Web push keys (VAPID)"
# ---------------------------------------------------------------------------
if [ -f "$ENV_FILE" ] && grep -q '^VITE_VAPID_PUBLIC_KEY=.\+' "$ENV_FILE"; then
  ok "already generated"
  VAPID_PUBLIC=$(grep '^VITE_VAPID_PUBLIC_KEY=' "$ENV_FILE" | cut -d= -f2-)
  VAPID_PRIVATE=$(grep '^VAPID_PRIVATE_KEY=' "$ENV_FILE" | cut -d= -f2- || echo "")
else
  VAPID_JSON=$(npx --yes web-push generate-vapid-keys --json 2>/dev/null)
  VAPID_PUBLIC=$(node -p "JSON.parse(process.argv[1]).publicKey" "$VAPID_JSON")
  VAPID_PRIVATE=$(node -p "JSON.parse(process.argv[1]).privateKey" "$VAPID_JSON")
  ok "generated"
fi

# ---------------------------------------------------------------------------
step "Supabase"
# ---------------------------------------------------------------------------
if [ "$HAVE_SUPABASE" -eq 0 ]; then
  warn "skipped, cli missing"
  SUPABASE_URL=""; SUPABASE_ANON=""
else
  say ""
  say "  Create a project at ${BLUE}https://supabase.com/dashboard${OFF} if you have not."
  say "  Then from Project Settings > API, copy these two values."
  say ""
  printf '  Project URL (https://xxxx.supabase.co): '
  read -r SUPABASE_URL
  printf '  anon public key: '
  read -r SUPABASE_ANON
  printf '  service_role key (input hidden): '
  read -rs SUPABASE_SERVICE
  say ""

  PROJECT_REF=$(printf '%s' "$SUPABASE_URL" | sed -E 's#https://([^.]+)\..*#\1#')
  [ -n "$PROJECT_REF" ] || die "could not read the project ref from that URL"
  ok "project ref: $PROJECT_REF"

  say ""
  note "linking (this opens a browser login if you are not signed in)"
  supabase link --project-ref "$PROJECT_REF" || die "link failed"
  ok "linked"

  note "applying the schema and row level security"
  supabase db push || die "migration failed"
  ok "schema applied"

  note "setting edge function secrets"
  supabase secrets set \
    ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
    SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE" \
    ALLOWED_ORIGINS="http://localhost:5173" \
    VAPID_PUBLIC_KEY="$VAPID_PUBLIC" \
    VAPID_PRIVATE_KEY="$VAPID_PRIVATE" \
    VAPID_SUBJECT="mailto:hello@sidq.app" \
    CRON_SECRET="$(openssl rand -hex 24)" >/dev/null || die "setting secrets failed"
  ok "secrets set (the Anthropic key is server side only)"

  note "deploying edge functions"
  for fn in generate-day register-push send-ritual-push; do
    supabase functions deploy "$fn" --no-verify-jwt >/dev/null 2>&1 \
      && ok "deployed $fn" \
      || warn "failed to deploy $fn"
  done
fi

# ---------------------------------------------------------------------------
step "Writing $ENV_FILE"
# ---------------------------------------------------------------------------
cat > "$ENV_FILE" <<EOF
# Generated by scripts/setup.sh
# Anything prefixed VITE_ is compiled into the bundle and is PUBLIC.

VITE_SUPABASE_URL=$SUPABASE_URL
VITE_SUPABASE_ANON_KEY=$SUPABASE_ANON
VITE_VAPID_PUBLIC_KEY=$VAPID_PUBLIC

# Stripe. Fill these in after creating the products, then rerun this script.
VITE_STRIPE_PRICE_MONTHLY=
VITE_STRIPE_PRICE_ANNUAL=

# Local only, for npm run eval. Never shipped to the browser.
ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY
VAPID_PRIVATE_KEY=$VAPID_PRIVATE
EOF
chmod 600 "$ENV_FILE"
ok "written and locked to your user only"

grep -q "^$ENV_FILE\$\|^\.env\.\*\.local\$\|^\*\.local\$" .gitignore 2>/dev/null \
  && ok "already gitignored" \
  || warn "check that $ENV_FILE is gitignored before committing"

# ---------------------------------------------------------------------------
step "Done"
# ---------------------------------------------------------------------------
say ""
say "  ${GREEN}Backend is live.${OFF} Start the app with:"
say "    ${BOLD}npm run dev${OFF}"
say ""
say "  ${DIM}Still manual, because they need decisions rather than commands:${OFF}"
say "  ${DIM}1. Auth providers: Supabase dashboard > Authentication > Providers.${OFF}"
say "  ${DIM}   Enable Google, Apple, GitHub. Redirect: ${SUPABASE_URL}/auth/v1/callback${OFF}"
say "  ${DIM}2. Stripe: create a monthly and an annual price, put the price IDs in${OFF}"
say "  ${DIM}   $ENV_FILE, then: supabase secrets set STRIPE_SECRET_KEY=... etc${OFF}"
say "  ${DIM}3. Morning push: schedule send-ritual-push hourly (Supabase cron),${OFF}"
say "  ${DIM}   with header x-cron-secret matching the CRON_SECRET that was set.${OFF}"
say ""
