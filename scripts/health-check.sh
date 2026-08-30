#!/usr/bin/env bash
#
# Is Sidq downloadable right now?
#
# Written to be run unattended and to say nothing when everything is fine. A
# check that reports success every morning is one nobody reads by the second
# week, and the failure it eventually catches scrolls past with the rest.
#
# Prints one line per problem, exits non-zero if there were any.
set -uo pipefail
cd "$(dirname "$0")/.."

SITE="https://www.sidq.tech"
problems=()
note() { problems+=("$1"); }

# `curl -f` is deliberately absent everywhere below. It makes curl fail on a
# 404, which is the exact case being measured, and the shell then runs the
# fallback and concatenates two answers into one unparseable string.
status() { curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$1" 2>/dev/null || echo 000; }

# ── What each side believes is released ──────────────────────────────────────
#
# The repo's constant is written by the release script, so a mismatch means a
# build that was cut and never deployed. That has happened: 0.1.61 sat
# notarised on disk for an hour while the site served 0.1.60, and nothing said
# so.
repo_version=$(grep -oE "RELEASE_VERSION = '[0-9.]+'" src/lib/releases.ts 2>/dev/null | grep -oE '[0-9.]+')

# Without this the version is empty, every download URL is malformed, and the
# report reads as "the site is broken" when the truth is that the check cannot
# see the repo. A monitor that cries wolf gets muted, and then it is worthless.
if [ -z "$repo_version" ]; then
  echo "Sidq health check could not run:"
  echo "  - no RELEASE_VERSION in src/lib/releases.ts (run this from the repo)"
  exit 2
fi

html=$(curl -s --max-time 30 "$SITE" 2>/dev/null)
if [ -z "$html" ]; then
  note "the site did not respond at all"
else
  # ── No bundle parsing ──────────────────────────────────────────────────────
  #
  # The first version of this read the version out of the minified JavaScript
  # and matched React's 19.2.8, then a library's 0.514.0 before that. The
  # variable holding the real one is renamed on every build, so there is nothing
  # stable to anchor to.
  #
  # Asking for the file the repo says should be there answers the same question
  # better. A 404 means either the release never deployed or the site is serving
  # something older, and both are the same problem: the download is broken.
  #
  # The one that actually costs money: the page offers a build and the file
  # behind it is missing, so everybody who clicks Download gets nothing.
  for arch in aarch64 x64; do
    url="$SITE/downloads/Sidq_${repo_version}_${arch}.dmg"
    code=$(status "$url")
    if [ "$code" != "200" ]; then
      note "the $arch download for $repo_version returns $code, so the current release is not live"
      continue
    fi
    size=$(curl -s -o /dev/null -w '%{size_download}' --max-time 120 "$url" 2>/dev/null || echo 0)
    [ "${size:-0}" -gt 1000000 ] || note "the $arch download is only ${size:-0} bytes"
  done

  # A pricing page nobody can reach is worse than no pricing page.
  for path in / /pricing /faq /downloading; do
    code=$(status "$SITE$path")
    [ "$code" = "200" ] || note "$path returns $code"
  done

  # Certificates expire quietly and take the whole site with them.
  ends=$(echo | openssl s_client -connect www.sidq.tech:443 -servername www.sidq.tech 2>/dev/null \
    | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
  if [ -n "$ends" ]; then
    when=$(date -j -f "%b %e %T %Y %Z" "$ends" +%s 2>/dev/null || echo 0)
    if [ "$when" -gt 0 ]; then
      left=$(( (when - $(date +%s)) / 86400 ))
      [ "$left" -gt 14 ] || note "the TLS certificate expires in $left days"
    fi
  fi
fi

if [ ${#problems[@]} -eq 0 ]; then
  exit 0
fi

echo "Sidq is not fully working:"
printf '  - %s\n' "${problems[@]}"

# ── Say it where it will be seen ─────────────────────────────────────────────
#
# Run from launchd, stdout goes to a log file nobody opens. The whole point of
# checking every morning is being told, so a failure raises the same kind of
# notification the app itself does. Only ever on failure: see the note at the
# top about checks that speak when nothing is wrong.
if [ "${1:-}" = "--notify" ]; then
  first=${problems[0]}
  count=${#problems[@]}
  body=$first
  [ "$count" -gt 1 ] && body="$first (and $((count - 1)) more)"
  osascript -e "display notification \"$body\" with title \"Sidq is not fully working\"" >/dev/null 2>&1
fi

exit 1
