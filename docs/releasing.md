# Releasing the desktop app

The download button on the site points at a real installer. This is how that
installer gets made.

## Domains must be set, never guessed

Two values point at hosts, and neither has a production default. An earlier build
defaulted the sign-in origin to `https://sidq.app`, which belongs to an unrelated
company — the app opened a stranger's website and invited people to sign in on
it. A plausible domain is not a domain you own.

| Variable | Used by | Without it |
| --- | --- | --- |
| `SIDQ_WEB_ORIGIN` | desktop sign-in | Sign-in refuses to open and says so; setup continues without an account |
| `VITE_RELEASE_BASE` | download buttons | Buttons offer the web app instead of linking at a 404 |

In a debug build `SIDQ_WEB_ORIGIN` falls back to `http://localhost:5173`, and
`VITE_RELEASE_BASE` to `/downloads`. Both are always correct locally, and neither
can leak into a release.

```bash
SIDQ_WEB_ORIGIN=https://your-real-domain npm run desktop:build
VITE_RELEASE_BASE=https://your-real-domain/downloads npm run build
```

## Build

```bash
npm run desktop:build
```

Output lands in `src-tauri/target/release/bundle/`:

| File | What it is |
| --- | --- |
| `dmg/Sidq_0.1.0_aarch64.dmg` | What people download on Apple Silicon |
| `macos/Sidq.app` | The app itself, for local testing |

`src/lib/releases.ts` is the single source of truth for the URLs and the
filenames people end up with. Bump `RELEASE_VERSION` there when the version in
`src-tauri/tauri.conf.json` changes, or the button will link to a build that
does not exist.

## "Sidq is damaged and can't be opened"

Two separate causes. The first was a real bug and is fixed; the second needs a
certificate.

### 1. The bundle was not signed as a bundle (fixed)

Tauri linker-signed the binary but left the `.app` without a `CodeResources`
file, so its own signature referred to resources that were not there:

```
code has no resources but signature indicates they must be present
```

macOS reports that as "damaged" even before quarantine enters into it. The fix
is `bundle.macOS.signingIdentity: "-"` in `tauri.conf.json`, which makes Tauri
ad-hoc sign the whole bundle. Verify after any build:

```bash
codesign --verify --deep --strict --verbose=2 src-tauri/target/release/bundle/macos/Sidq.app
```

`valid on disk` and `satisfies its Designated Requirement` is what you want.

### 2. Ad-hoc signed plus quarantined is still rejected

Anything downloaded through a browser gets `com.apple.quarantine`. Gatekeeper
refuses a quarantined app that has no Developer ID signature, and no amount of
rebuilding changes that:

```bash
spctl --assess --type execute --verbose src-tauri/target/release/bundle/macos/Sidq.app
# rejected
```

To run your own build locally, clear the flag on the copy you installed:

```bash
xattr -dr com.apple.quarantine /Applications/Sidq.app
```

That is fine for testing a binary you compiled yourself. It is not a fix, and
you must never ask a user to do it — anyone willing to run that command on a
stranger's app is one step from being phished, and telling people to disable
Gatekeeper is teaching them the habit.

The actual fix is below.

## Signing, which is not optional

An unsigned `.dmg` is not a working download. macOS quarantines anything
downloaded from a browser, and for an unsigned app Gatekeeper does not offer
"open anyway" any more — it says the app **is damaged and should be moved to the
Bin**. That is the single most damaging first-run experience possible, and it is
what ships if this step is skipped.

Signing needs the Developer ID certificate, which lives in the account holder's
keychain. It cannot be done from CI or by anyone without that certificate.

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: YOUR NAME (TEAMID)"
export APPLE_ID="you@example.com"
export APPLE_PASSWORD="app-specific-password"   # appleid.apple.com, not the real one
export APPLE_TEAM_ID="TEAMID"

npm run desktop:build
```

With those set, Tauri signs and submits for notarisation as part of the build.
Notarisation is Apple scanning the binary and takes a few minutes.

Verify before publishing anything:

```bash
spctl --assess --type execute --verbose src-tauri/target/release/bundle/macos/Sidq.app
```

`accepted` means it will open on someone else's Mac. Anything else means it will
not, whatever it does on the machine that built it — the build machine trusts
its own binaries, so testing locally proves nothing about signing.

## Windows

Not built for. `bundle.targets` still lists `nsis`, but Windows SmartScreen has
the same problem as Gatekeeper and the certificate for it is a separate annual
purchase from a different vendor. Until that exists, Windows visitors are shown
the web app rather than a download that will scare them.

## Publishing

The site expects artifacts at the URL in `RELEASE_BASE`, which defaults to the
GitHub release for the current tag. For a local end-to-end test without
publishing, point it somewhere else:

```bash
VITE_RELEASE_BASE=http://localhost:8080 npm run dev
```
