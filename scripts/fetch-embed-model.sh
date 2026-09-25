#!/bin/zsh
#
# Fetch the on-device embedding model Sidq ships inside the app.
#
#   ./scripts/fetch-embed-model.sh
#
# all-MiniLM-L6-v2, int8-quantised ONNX (23MB), pinned to one revision and
# checked against its SHA-256, so a changed file upstream can never change what
# Sidq ships without someone deciding to. It is a build input, not source, so it
# is gitignored and fetched here instead of committed.
#
# The model reads text and returns numbers. It runs inside Sidq, on the Mac,
# and nothing is ever sent anywhere by it.
set -e
cd "$(dirname "$0")/.."

REVISION="751bff37182d3f1213fa05d7196b954e230abad9"
SHA256="afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1"
URL="https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/${REVISION}/onnx/model_quantized.onnx"
OUT="src-tauri/resources/embed/minilm-l6-q8.onnx"

if [[ -f "$OUT" ]] && [[ "$(shasum -a 256 "$OUT" | cut -d' ' -f1)" == "$SHA256" ]]; then
  echo "embedding model already present and verified: $OUT"
  exit 0
fi

mkdir -p "$(dirname "$OUT")"
curl -fL --retry 3 -o "$OUT.part" "$URL"
GOT="$(shasum -a 256 "$OUT.part" | cut -d' ' -f1)"
if [[ "$GOT" != "$SHA256" ]]; then
  rm -f "$OUT.part"
  echo "REFUSING: embedding model checksum mismatch (got $GOT)" >&2
  exit 1
fi
mv "$OUT.part" "$OUT"
echo "embedding model fetched and verified: $OUT"
