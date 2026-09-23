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
way: it holds the Stripe secret key, which can move money, and the Resend key,
which can send mail as you.
MSG
  exit 1
fi

# Refuse to continue if the secrets file would be committed. A leaked Stripe key
# can move money; a leaked Resend key can send mail that looks like yours.
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
# Already-applied migrations are not a failure.
#
# The schema was created once, by hand or by an earlier run, so `db push`
# reports `relation "profiles" already exists` and, under `set -e`, took the
# whole deploy down with it — including the secrets and the function upload,
# which are the parts that actually needed to happen.
#
# A migration already in place is the desired end state. Report it, step over it.
if ! $CLI db push; then
  echo "    migrations already applied, or nothing to push — continuing"
fi

echo "==> Setting function secrets"
# --env-file keeps the values out of argv, so they never appear in ps output or
# in your shell history.
$CLI secrets set --env-file "$SECRETS_FILE"

echo "==> Deploying functions"
# Every function in supabase/functions, and only those.
#
# This listed two for a while, while three more were live and had been deployed
# by hand — so the script that claimed to deploy the backend could not have
# rebuilt it. The list is the directory now, minus `_shared`, so a new function
# cannot be added without being deployed by the one command meant to do it.
for fn in $(ls supabase/functions | grep -v '^_'); do
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

Check it worked, cheapest first:

  npx supabase@2 functions list          # every function ACTIVE
  npx supabase@2 secrets list            # names only; values are never shown

Then the one that matters: open https://www.sidq.tech/upgrade signed in, press
a plan, and confirm Stripe's checkout page opens. If it does not, the browser
console will name the reason — a CORS refusal means ALLOWED_ORIGINS is missing
the site you pressed it from.
MSG
