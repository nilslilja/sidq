#!/usr/bin/env bash
#
# Is the thing on the internet the thing we built?
#
# This exists because "the download works" was true and useless for three
# builds. The URL returned 200 the whole time while serving a binary that
# panicked on launch and opened no window at all. A reachable file is not a
# working file, and nothing was comparing the two.
#
# So this compares bytes. If the SHA-256 of what Supabase serves does not match
# the SHA-256 of what is on this machine, the release is stale and it says so.
#
# Usage: bash scripts/verify-release.sh
set -uo pipefail

BASE="https://ubpehrfmhyqkotbimbfn.supabase.co/storage/v1/object/public/downloads"
NAME="Sidq_0.1.0_aarch64.dmg"
LOCAL="$HOME/Desktop/sidq-release/$NAME"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

fail() { printf '  \033[31m✗\033[0m %s\n' "$1"; FAILED=1; }
pass() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
FAILED=0

echo "── Local build"
if [ ! -f "$LOCAL" ]; then
  fail "no local DMG at $LOCAL — run: npx tauri build"
  exit 1
fi
LOCAL_SUM=$(shasum -a 256 "$LOCAL" | cut -d' ' -f1)
LOCAL_SIZE=$(stat -f%z "$LOCAL")
pass "$(printf '%.1f MB  %s' "$(echo "$LOCAL_SIZE/1048576" | bc -l)" "${LOCAL_SUM:0:16}…")"

# Notarised and stapled, checked on the file that will actually be uploaded
# rather than on the .app it was built from. A stapled ticket is what lets it
# open with no warning on a machine that has never seen it.
if xcrun stapler validate "$LOCAL" >/dev/null 2>&1; then
  pass "stapled — opens with no security warning, even offline"
else
  fail "NOT stapled — Gatekeeper will warn on first open"
fi

echo "── Served file"
CODE=$(curl -s -L -o "$TMP/$NAME" -w '%{http_code}' "$BASE/$NAME")
if [ "$CODE" != "200" ]; then
  fail "HTTP $CODE — nothing is being served"
  exit 1
fi
SERVED_SUM=$(shasum -a 256 "$TMP/$NAME" | cut -d' ' -f1)
SERVED_SIZE=$(stat -f%z "$TMP/$NAME")
pass "$(printf '%.1f MB  %s' "$(echo "$SERVED_SIZE/1048576" | bc -l)" "${SERVED_SUM:0:16}…")"

echo "── Match"
if [ "$LOCAL_SUM" = "$SERVED_SUM" ]; then
  pass "identical — the internet has the current build"
else
  fail "STALE — users are downloading a different build than the one here"
  echo "      upload $LOCAL to the downloads bucket"
fi

# Mount what was actually downloaded and look inside it. A DMG can match and
# still hold a binary that will not start, which is the failure that shipped.
echo "── Inside the served image"
MNT="$TMP/mnt"
mkdir -p "$MNT"
if hdiutil attach "$TMP/$NAME" -mountpoint "$MNT" -nobrowse -quiet 2>/dev/null; then
  APP="$MNT/Sidq.app"
  if [ -d "$APP" ]; then
    pass "Sidq.app present"
    if spctl --assess --type execute "$APP" >/dev/null 2>&1; then
      pass "Gatekeeper accepts it"
    else
      fail "Gatekeeper REJECTS it — it will not open on someone else's Mac"
    fi
    # The window the app used to .expect() on startup. Its absence from the
    # config while present in the binary is exactly what caused the panic.
    if grep -qa '"pill"' "$APP/Contents/MacOS/sidq" 2>/dev/null; then
      pass "pill window is in this build"
    else
      fail "no pill window — this is an old build"
    fi
  else
    fail "no Sidq.app inside the image"
  fi
  hdiutil detach "$MNT" -quiet 2>/dev/null
else
  fail "image will not mount"
fi

echo
if [ "$FAILED" = "0" ]; then
  printf '\033[32mRelease is live and current.\033[0m\n'
else
  printf '\033[31mRelease is not shippable. Fix the above.\033[0m\n'
  exit 1
fi
