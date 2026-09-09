# Sidecar binaries

`sidq-mcp` is built from this same crate (`src/bin/sidq-mcp.rs`) and copied here
under a target-triple name, which is the filename Tauri's `externalBin` requires.
`scripts/release.sh` does the copy for both architectures before the app build,
so the bundle carries the right one and Tauri signs it along with everything else.

The files themselves are not committed — they are build output, and a signed
binary in git is a signed binary that goes stale.
