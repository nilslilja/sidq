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
npm run tauri build -- --bundles dmg >/dev/null
npm run tauri build -- --bundles dmg --target x86_64-apple-darwin >/dev/null

ARM="src-tauri/target/release/bundle/dmg/Sidq_${VERSION}_aarch64.dmg"
X64="src-tauri/target/x86_64-apple-darwin/release/bundle/dmg/Sidq_${VERSION}_x64.dmg"

mkdir -p release
rm -f release/*.dmg

for DMG in "$ARM" "$X64"; do
  NAME="$(basename "$DMG")"
  echo "── notarising $NAME"
  # Tauri signs but does not notarise, and an unnotarised build reaches the
  # user as a warning telling them not to open it.
  xcrun notarytool submit "$DMG" \
    --apple-id "$APPLE_ID" --team-id "$APPLE_TEAM_ID" --password "$APPLE_PASSWORD" \
    --wait 2>&1 | grep -E "  status:" | tail -1
  xcrun stapler staple "$DMG" >/dev/null

  # The check that matters. Anything other than Notarized Developer ID means
  # Gatekeeper will stop the person who downloads it.
  ASSESS="$(spctl --assess --type open --context context:primary-signature -v "$DMG" 2>&1 | tail -1)"
  echo "   $ASSESS"
  case "$ASSESS" in
    *"Notarized Developer ID"*) ;;
    *) echo "   REFUSING: $NAME is not notarised" >&2; exit 1 ;;
  esac

  cp "$DMG" release/
done

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
