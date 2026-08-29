#!/usr/bin/env bash
#
# Regenerate public/fonts/*.woff2 from the `geist` package.
#
# Run this after bumping `geist`, and commit the result. The output is checked
# in deliberately: it ships inside the desktop app as well as on the site, and a
# build should not depend on a Python toolchain being present.
#
# Two variable files rather than six static weights, subset to Latin and Latin
# Extended. Anything outside that range falls through to the system stack one
# glyph at a time, which is the correct behaviour for an app that displays
# whatever the person happened to be talking to an AI about.
set -euo pipefail
cd "$(dirname "$0")/.."

SRC=node_modules/geist/dist/fonts
[ -d "$SRC" ] || { echo "geist not installed: npm i"; exit 1; }

# Latin, Latin Extended-A and -B, punctuation, currency, arrows and box drawing.
RANGES="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC"
RANGES="$RANGES,U+0100-012F,U+0132-0151,U+0154-017F,U+0180-024F"
RANGES="$RANGES,U+2000-206F,U+2070-209F,U+20A0-20CF,U+2122,U+2190-21BB"
RANGES="$RANGES,U+2212,U+2215,U+2500-25FF,U+FEFF,U+FFFD"

VENV=$(mktemp -d)/venv
python3 -m venv "$VENV"
"$VENV/bin/pip" install --quiet "fonttools[woff]" brotli

subset() {
  "$VENV/bin/pyftsubset" "$1" --output-file="$2" --flavor=woff2 \
    --layout-features='kern,liga,calt,tnum,frac,ccmp,locl,mark,mkmk' \
    --unicodes="$RANGES"
  echo "  $(basename "$2")  $(du -h "$2" | cut -f1)"
}

mkdir -p public/fonts
subset "$SRC/geist-sans/Geist-Variable.woff2" public/fonts/geist-sans.woff2
subset "$SRC/geist-mono/GeistMono-Variable.woff2" public/fonts/geist-mono.woff2
