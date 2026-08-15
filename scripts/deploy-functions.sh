#!/usr/bin/env bash
#
# Deploy the edge functions.
#
# Everything except the secrets themselves. Secrets are read from a gitignored
# file you write, and are never echoed, never passed as shell arguments (which
# would land in your shell history), and never committed.
#
#   1. cp supabase/.env.functions.example supabase/.env.functions
#   2. fill it in
#   3. ./scripts/deploy-functions.sh
#
set -euo pipefail

cd "$(dirname "$0")/.."

SECRETS_FILE="supabase/.env.functions"
CLI="npx --yes supabase@2"

if [ ! -f "$SECRETS_FILE" ]; then
  cat <<'MSG'
Missing supabase/.env.functions

  cp supabase/.env.functions.example supabase/.env.functions

Then fill it in and run this again. That file is gitignored and must stay that
way: it holds the Anthropic key, which is billed per token, and the Stripe
secret key, which can move money.
MSG
  exit 1
fi

# Refuse to continue if the secrets file would be committed. A leaked Anthropic
# key is somebody else's bill; a leaked Stripe key is worse.
if git check-ignore -q "$SECRETS_FILE"; then
  :
else
  echo "REFUSING: $SECRETS_FILE is not gitignored. Add it to .gitignore first."
  exit 1
fi

echo "==> Linking the project"
# Interactive on purpose. The access token belongs in the CLI's own keychain
# entry, not in this repository and not in this script.
$CLI link || {
  echo "Link failed. Run '$CLI login' first, then try again."
  exit 1
}

echo "==> Pushing database migrations"
$CLI db push

echo "==> Setting function secrets"
# --env-file keeps the values out of argv, so they never appear in ps output or
# in your shell history.
$CLI secrets set --env-file "$SECRETS_FILE"

echo "==> Deploying functions"
# generate-day is the one that matters: without it the app silently falls back
# to the local planner and every plan is generic.
for fn in generate-day create-checkout stripe-webhook register-push send-ritual-push coach-brief speak; do
  echo "    $fn"
  # The webhook is called by Stripe, which cannot present a user JWT.
  if [ "$fn" = "stripe-webhook" ]; then
    $CLI functions deploy "$fn" --no-verify-jwt
  else
    $CLI functions deploy "$fn"
  fi
done

cat <<'MSG'

Done.

Check it worked: open the app, click "Build today's plan", and confirm the tasks
are about your actual goals rather than the generic fallback set. If they are
still generic, the function is deployed but ANTHROPIC_API_KEY is missing or
wrong, and the function is falling back rather than erroring.

  npx supabase@2 functions logs generate-day
MSG
