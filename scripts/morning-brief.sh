#!/usr/bin/env bash
#
# What happened overnight.
#
# The companion to health-check.sh, and the opposite kind of report. That one
# says nothing unless something is broken, which is right for an alarm and
# useless as a habit. This one always speaks, because the questions it answers
# get asked every morning anyway: is it up, did anything ship, is anyone
# downloading it.
#
# Every line is read from something that already exists. Nothing is estimated
# and nothing is inferred from a number that was never measured, so a quiet
# morning reads as quiet rather than as zero.
set -uo pipefail
cd "$(dirname "$0")/.."

SITE="https://www.sidq.tech"
say() { printf '%s\n' "$1"; }
status() { curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$1" 2>/dev/null || echo 000; }

version=$(grep -oE "RELEASE_VERSION = '[^']+'" src/lib/releases.ts | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
broken=0

# ── Is it up, and is what it advertises actually downloadable ────────────────
#
# A 200 on the homepage is not the same as a working product. The page can
# render perfectly while pointing at a .dmg that was never uploaded, which is
# the failure that has actually happened here more than once.
home=$(status "$SITE/")
arm=$(status "$SITE/downloads/Sidq_${version}_aarch64.dmg")
intel=$(status "$SITE/downloads/Sidq_${version}_x64.dmg")

if [ "$home" = "200" ] && [ "$arm" = "200" ] && [ "$intel" = "200" ]; then
  say "Site up. ${version} downloadable on both architectures."
else
  broken=1
  say "BROKEN  home:${home}  arm:${arm}  intel:${intel}  (expected ${version})"
fi

# ── What shipped ─────────────────────────────────────────────────────────────
shipped=$(python3 scripts/lib/overnight-deploys.py 2>/dev/null || echo "Deploys: could not read.")
say "$shipped"
case "$shipped" in *FAILED*) broken=1 ;; esac

# ── Downloads ────────────────────────────────────────────────────────────────
#
# Counted at /downloading, the one route every download passes through, and
# recorded as a Vercel Web Analytics custom event carrying the architecture and
# the version. Reading the count back needs a dashboard session rather than the
# CLI token, so this points at it instead of pretending to a number.
say "Downloads: vercel.com/nilsliljas-projects/sidq/analytics (event: download)"

# ── Say it where it will be seen ─────────────────────────────────────────────
#
# Run from launchd, stdout lands in a log file nobody opens. Unlike the health
# check this notifies every morning, including on a good one, because "up, all
# green" is the answer to a question that gets asked either way.
#
# The notification carries the short version. The full brief stays in the log
# for the mornings where a line prompts a second look.
if [ "${1:-}" = "--notify" ]; then
  if [ "$broken" -eq 0 ]; then
    title="Sidq is up"
  else
    title="Sidq needs a look"
  fi
  osascript -e "display notification \"${version} · ${shipped}\" with title \"$title\"" >/dev/null 2>&1
fi

exit $broken
