#!/bin/zsh
#
# Builds the Sidq disk image: the app, a link to Applications, and the window
# around them.
#
#   scripts/dmg/build-dmg.sh path/to/Sidq.app out.dmg
#
# ── Why Finder sets the background ───────────────────────────────────────────
#
# dmgbuild writes the whole window layout itself, background included, and on
# macOS 26 Finder shows everything it wrote except the background: the window
# opens at the right size with the icons in place, on plain grey. 0.9.16 and
# 0.9.17 shipped like that. A background Finder sets itself is shown, so
# dmgbuild lays out a writable image, Finder is asked to set the picture, and
# the result is checked before it is compressed. A release does not continue on
# an image whose background did not take.
#
set -euo pipefail

APP="$1"
OUT="$2"
HERE="${0:A:h}"
ROOT="${HERE:h:h}"
VOLUME="Sidq"
PY="$ROOT/.venv-dmg/bin/python"

# Mounted somewhere of its own and handed to Finder by path, never by name:
# anybody who has opened a Sidq installer has a "Sidq" in /Volumes already.
WORK="$(mktemp -d)"
RW="$WORK/rw.dmg"
MOUNT="$WORK/mnt"
trap 'hdiutil detach "$MOUNT" -quiet -force 2>/dev/null || true; rm -rf "$WORK"' EXIT

"$ROOT/.venv-dmg/bin/dmgbuild" -s "$HERE/settings.py" \
  -D app="$APP" -D format=UDRW \
  "$VOLUME" "$RW" >/dev/null

mkdir "$MOUNT"
hdiutil attach "$RW" -quiet -noautoopen -mountpoint "$MOUNT"
mkdir "$MOUNT/.background"
cp "$HERE/background.tiff" "$MOUNT/.background/background.tiff"

osascript - "$MOUNT" <<'APPLESCRIPT' >/dev/null
on run argv
  set mountPath to item 1 of argv
  set bgFile to POSIX file (mountPath & "/.background/background.tiff") as alias
  tell application "Finder"
    set theDisk to item (POSIX file mountPath as alias)
    open theDisk
    delay 1
    set background picture of icon view options of container window of theDisk to bgFile
    delay 1
    close container window of theDisk
    open theDisk
    delay 2
    close container window of theDisk
  end tell
end run
APPLESCRIPT

# Finder keeps the view settings to itself until the volume goes away, so it is
# ejected, mounted again out of Finder's sight, and checked: the picture, and the
# icons where settings.py put them.
sleep 2
sync
hdiutil detach "$MOUNT" -quiet
hdiutil attach "$RW" -quiet -noautoopen -nobrowse -mountpoint "$MOUNT"
if ! "$PY" - "$MOUNT/.DS_Store" <<'CHECK'
import sys
import ds_store.store
from ds_store import DSStore
# Finder on macOS 26 writes a bookmark (pBBk) this library cannot parse, and
# that is fine: the alias beside it is what gets checked. Read it raw.
ds_store.store.codecs.pop(b"pBBk", None)
with DSStore.open(sys.argv[1], "r") as d:
    entries = {(e.filename, e.code): e.value for e in d}
view = entries.get((".", b"icvp"), {})
ok = (
    view.get("backgroundType") == 2
    and b"background.tiff" in view.get("backgroundImageAlias", b"")
    and entries.get(("Sidq.app", b"Iloc")) == (150, 205)
    and entries.get(("Applications", b"Iloc")) == (410, 205)
)
sys.exit(0 if ok else 1)
CHECK
then
  echo "FATAL: Finder did not record the installer background." >&2
  exit 1
fi

rm -rf "$MOUNT/.fseventsd"
sync
hdiutil detach "$MOUNT" -quiet
rm -f "$OUT"
hdiutil convert "$RW" -quiet -format UDZO -imagekey zlib-level=9 -o "$OUT"
echo "   disk image: $OUT (background set by Finder, checked)"
