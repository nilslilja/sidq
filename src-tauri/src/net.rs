//! Where the small outbound requests go through, and what runs them.
//!
//! ── Why curl and not a Rust HTTP client ─────────────────────────────────────
//!
//! Every request this app makes is small, occasional and not on any path a
//! person waits on: which plan you are on, an invite, a queued count, a memory
//! somebody pressed publish on. Linking a TLS stack to make those would roughly
//! double a 4.5MB binary, and the platforms this runs on all ship curl.
//!
//! ── Why this module exists rather than the literal in five files ────────────
//!
//! `/usr/bin/curl` was written out at seven call sites. That absolute path is
//! right on macOS and wrong everywhere else: Windows ships `curl.exe` in
//! System32 and Linux distributions disagree about the directory. Seven copies
//! of a platform assumption is seven places to miss when the port happens, so
//! there is one.

/**
 * The curl to run.
 *
 * Absolute on macOS deliberately. It is always exactly there, and naming it in
 * full means the request cannot be pointed at something else by a PATH the app
 * inherited from whatever launched it.
 *
 * Elsewhere it is looked up on PATH, because there is no single right answer:
 * Windows has it in System32 but only since 1803, and Linux puts it in /usr/bin
 * or /bin depending on the distribution. A name that resolves is worth more
 * than a path that is right on one machine.
 */
pub const CURL: &str = if cfg!(target_os = "macos") { "/usr/bin/curl" } else { "curl" };

/**
 * Sixteen bytes of randomness, from whatever this platform has.
 *
 * Not `fs::read` on a device, ever again: `/dev/urandom` never reaches EOF, so
 * reading it to the end does not finish and the buffer grows until the kernel
 * intervenes. It took this machine down three times. `read_exact` states the
 * size, which is the whole fix.
 *
 * `None` when there is no source — Windows has no `/dev/urandom` — and callers
 * decide what a missing answer costs them rather than being handed a weak
 * value that looks like a strong one.
 */
pub fn random_bytes() -> Option<[u8; 16]> {
    use std::io::Read;

    let mut bytes = [0u8; 16];
    std::fs::File::open("/dev/urandom")
        .and_then(|mut source| source.read_exact(&mut bytes))
        .ok()
        .map(|()| bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_curl_path_is_absolute_only_where_it_is_certain() {
        // On macOS an absolute path is a small hardening: the binary cannot be
        // swapped by an inherited PATH. Anywhere else the same string would
        // simply not exist.
        if cfg!(target_os = "macos") {
            assert_eq!(CURL, "/usr/bin/curl");
        } else {
            assert!(!CURL.contains('/'), "a bare name is what survives a port");
        }
    }

    #[test]
    fn nothing_in_here_reads_a_device_to_the_end() {
        /*
         * The regression that matters most in this file. `/dev/urandom` has no
         * EOF, so any read-to-end against it is an out-of-memory crash wearing
         * the costume of an id generator.
         *
         * Checked against the source rather than by doing it: a test that
         * reproduces this takes the machine down and reports nothing at all.
         */
        let whole = include_str!("net.rs");
        let code = whole.split("#[cfg(test)]").next().unwrap_or(whole);

        for (n, line) in code.lines().enumerate() {
            let trimmed = line.trim_start();
            if trimmed.starts_with("//") || trimmed.starts_with('*') || trimmed.starts_with("/*") {
                continue;
            }
            let to_eof = line.contains("fs::read(")
                || line.contains("read_to_end")
                || line.contains("read_to_string");
            assert!(!(to_eof && line.contains("/dev/")), "line {} reads a device to EOF", n + 1);
        }

        assert!(code.contains("read_exact"), "the random source no longer states a size");
    }

    #[test]
    fn the_sidecar_can_still_be_built_without_the_app() {
        /*
         * The crate was split so something other than the app could use these
         * modules, and for a while that was not actually true: `tauri` was an
         * unconditional dependency, so building the MCP sidecar for Linux
         * pulled GTK and glib and stopped there. 1,260 crates to produce a
         * binary that needs 34.
         *
         * Checked against the manifest, because nothing else would notice.
         * Dropping `optional` builds perfectly well on this Mac and quietly
         * makes the sidecar unshippable everywhere else.
         */
        let manifest = include_str!("../Cargo.toml");

        assert!(manifest.contains("default = [\"app\"]"), "the app feature is gone");
        for line in manifest.lines() {
            let is_tauri_dep = line.starts_with("tauri = ")
                || line.starts_with("tauri-build = ")
                || line.starts_with("tauri-plugin-");
            if is_tauri_dep {
                assert!(
                    line.contains("optional = true"),
                    "{} is unconditional, which makes the sidecar need Tauri again",
                    line.split_whitespace().next().unwrap_or(line)
                );
            }
        }
    }

    #[test]
    fn two_reads_do_not_return_the_same_bytes() {
        // Only where there is a source to read. On a platform without one the
        // right answer is None, and a test asserting otherwise would be
        // asserting that the port silently invented entropy.
        if let (Some(a), Some(b)) = (random_bytes(), random_bytes()) {
            assert_ne!(a, b, "the random source repeated itself");
        }
    }
}
