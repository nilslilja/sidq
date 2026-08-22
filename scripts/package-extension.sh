#!/bin/zsh
# The zip the Chrome Web Store wants: the extension directory and nothing else.
#
# audit.js is excluded deliberately. It is a console tool for checking whether a
# site has moved, it is not part of what runs, and shipping unreferenced code in
# a submission invites a reviewer to ask what it is for.
set -e
cd "$(dirname "$0")/.."

OUT="dist-extension/sidq-extension.zip"
mkdir -p dist-extension
rm -f "$OUT"

cd extension
zip -q -r "../$OUT" . -x 'audit.js' -x '.*' -x '__MACOSX*'
cd ..

# The site serves this too, so people can install unpacked while the store
# review runs. A stale copy was being served: 5KB from some earlier build,
# which would have handed early users a broken extension.
cp "$OUT" public/sidq-extension.zip

echo "$OUT"
unzip -l "$OUT" | awk 'NR>3 && $4 != "" && $4 !~ /^-+$/ { printf "  %-8s %s\n", $1, $4 }'
