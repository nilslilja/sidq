#!/bin/zsh
#
# Ship a build. One command, because the alternative is a checklist and the
# checklist is how the site spent days serving 0.1.0 while 0.1.1 sat on a disk.
#
#   ./scripts/release.sh 0.1.2
#
# Builds both Macs, signs, notarises, staples, verifies with Gatekeeper, wires
# the real file sizes into the site, deploys, and then checks the live URLs
# actually serve the files it just made. Every step refuses to continue if the
# one before it failed.
set -e
cd "$(dirname "$0")/.."

VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
  echo "usage: ./scripts/release.sh <version>   e.g. ./scripts/release.sh 0.1.2"
  exit 1
fi

if [[ ! -f .env.signing ]]; then
  echo "No .env.signing. Signing credentials are required to ship." >&2
  exit 1
fi
set -a; . ./.env.signing; set +a

echo "── version → $VERSION"
python3 - "$VERSION" <<'PY'
import json, pathlib, sys
version = sys.argv[1]
for f in ('src-tauri/tauri.conf.json', 'package.json'):
    p = pathlib.Path(f); d = json.loads(p.read_text())
    d['version'] = version
    p.write_text(json.dumps(d, indent=2) + '\n')
p = pathlib.Path('src/lib/releases.ts'); s = p.read_text()
import re
p.write_text(re.sub(r"RELEASE_VERSION = '[^']+'", f"RELEASE_VERSION = '{version}'", s))
PY

echo "── building both Macs"
npm run tauri build -- --bundles app >/dev/null
npm run tauri build -- --bundles app --target x86_64-apple-darwin >/dev/null

mkdir -p release
rm -f release/*.dmg

# Apple Silicon first, then Intel. Each is notarised as an app, stapled, and
# only then wrapped in a disk image.
build_one() {
  local APP="$1" ARCH="$2"
  local DMG="release/Sidq_${VERSION}_${ARCH}.dmg"
  local WORK; WORK="$(mktemp -d)"

  #
  # ── The app is notarised before the DMG exists ────────────────────────────
  #
  # This used to notarise the DMG only. The DMG then passed every check and the
  # app inside it had no ticket of its own, so the moment somebody dragged Sidq
  # to Applications and opened it, macOS said: "Apple could not verify Sidq is
  # free of malware that may harm your Mac", with Move to Trash as the default
  # button. Every single download hit that. The DMG being notarised is not the
  # thing Gatekeeper checks when you launch the app.
  #
  echo "── notarising $ARCH app"
  ditto -c -k --keepParent "$APP" "$WORK/app.zip"
  xcrun notarytool submit "$WORK/app.zip" \
    --apple-id "$APPLE_ID" --team-id "$APPLE_TEAM_ID" --password "$APPLE_PASSWORD" \
    --wait 2>&1 | grep -E "  status:" | tail -1
  xcrun stapler staple "$APP" >/dev/null

  # The check that matters, on the thing the user actually double-clicks.
  local ASSESS; ASSESS="$(spctl --assess --type execute -vv "$APP" 2>&1 | grep source= | tail -1)"
  echo "   app: ${ASSESS:-rejected}"
  case "$ASSESS" in
    *"Notarized Developer ID"*) ;;
    *) echo "   REFUSING: the $ARCH app is not notarised" >&2; exit 1 ;;
  esac

  echo "── packaging $ARCH"
  mkdir -p "$WORK/vol"
  cp -R "$APP" "$WORK/vol/"
  ln -s /Applications "$WORK/vol/Applications"
  hdiutil create -quiet -volname "Sidq" -srcfolder "$WORK/vol" -ov -format UDZO "$DMG"
  codesign --sign "$APPLE_SIGNING_IDENTITY" --timestamp "$DMG"

  echo "── notarising $ARCH disk image"
  xcrun notarytool submit "$DMG" \
    --apple-id "$APPLE_ID" --team-id "$APPLE_TEAM_ID" --password "$APPLE_PASSWORD" \
    --wait 2>&1 | grep -E "  status:" | tail -1
  xcrun stapler staple "$DMG" >/dev/null

  ASSESS="$(spctl --assess --type open --context context:primary-signature -v "$DMG" 2>&1 | tail -1)"
  echo "   dmg: $ASSESS"
  case "$ASSESS" in
    *"Notarized Developer ID"*) ;;
    *) echo "   REFUSING: the $ARCH disk image is not notarised" >&2; exit 1 ;;
  esac

  rm -rf "$WORK"
}

build_one "src-tauri/target/release/bundle/macos/Sidq.app" "aarch64"
build_one "src-tauri/target/x86_64-apple-darwin/release/bundle/macos/Sidq.app" "x64"

echo "── measuring"
python3 - <<'PY'
import os, pathlib, re, glob
sizes = {}
for f in glob.glob('release/*.dmg'):
    key = 'macos-arm' if 'aarch64' in f else 'macos-intel'
    sizes[key] = os.path.getsize(f) / 1048576

p = pathlib.Path('src/lib/releases.ts'); s = p.read_text()
# Sizes on the buttons are measured from the files, never typed by hand. Both
# once said "11 MB" and neither was.
for key, mb in sizes.items():
    s = re.sub(
        rf"('{key}': \{{[^}}]*?size: ')[^']+(')",
        lambda m: f"{m.group(1)}{mb:.1f} MB{m.group(2)}",
        s, flags=re.S,
    )
p.write_text(s)
for k, v in sizes.items():
    print(f"   {k}: {v:.1f} MB")
PY

echo "── deploying"
npm run build:web >/dev/null
npx vercel deploy --prod --yes 2>&1 | grep -E "Aliased|Error"

echo "── verifying the live site"
sleep 12
FAILED=0
for FILE in "downloads/Sidq_${VERSION}_aarch64.dmg" "downloads/Sidq_${VERSION}_x64.dmg"; do
  CODE="$(curl -sI "https://www.sidq.tech/$FILE" | head -1 | awk '{print $2}')"
  SIZE="$(curl -sI "https://www.sidq.tech/$FILE" | grep -i content-length | tr -d '\r' | awk '{print $2}')"
  echo "   $CODE  ${SIZE:-0} bytes  $FILE"
  [[ "$CODE" == "200" ]] || FAILED=1
done

if [[ $FAILED -eq 1 ]]; then
  echo "── the site is NOT serving this build" >&2
  exit 1
fi

echo "── $VERSION is live. Commit and push release/ so a build from GitHub has it too."
