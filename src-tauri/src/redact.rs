//! Taking credentials out of a handover before it leaves.
//!
//! ── Why this has to exist ────────────────────────────────────────────────────
//!
//! A handover is the whole of a conversation, and people paste keys into
//! conversations. Not carelessly — you paste a token because you are debugging
//! the request that uses it. It then lives in the transcript forever, and Sidq's
//! entire job is to take transcripts somewhere else.
//!
//! Three transcripts on the machine this was written on carry live JWTs. Without
//! this module, handing any of them to another assistant posts a working
//! credential into somebody else's chat history, and sharing one with a
//! teammate posts it into a folder in their Drive.
//!
//! ── Why it is anchored, not statistical ──────────────────────────────────────
//!
//! The tempting approach is entropy: flag any long random looking string. It
//! finds real keys and it also finds commit hashes, UUIDs, minified code,
//! base64 images and checksums — and a handover with its hashes replaced is
//! worse than no handover, because the reader cannot tell what was lost.
//!
//! So every rule here is anchored on something a credential has and a hash does
//! not: an issuer prefix (`sk-ant-`, `ghp_`, `AKIA`), a structure (three
//! base64url segments for a JWT, a PEM header), or a name that says what the
//! value is (`AWS_SECRET_ACCESS_KEY=`). False negatives are possible and
//! acceptable. False positives corrupt the document, so they are not.
//!
//! ── Why the replacement says what it was ─────────────────────────────────────
//!
//! `[redacted: github token]` rather than `****`. The next assistant needs to
//! know a credential stood there, because "use the token from earlier" is a
//! sentence it will otherwise try to satisfy with something it invents.

/// One kind of credential, and how many were taken out.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Hit {
    pub kind: &'static str,
    pub count: usize,
}

/// Names of environment variables whose value is always a credential.
///
/// Matched on the key rather than the value, which is the only way to catch a
/// password: passwords have no prefix and no structure, and the sole thing that
/// marks `hunter2` as a secret is that it sat after `DB_PASSWORD=`.
const SECRET_NAMES: [&str; 14] = [
    "SECRET",
    "PASSWORD",
    "PASSWD",
    "TOKEN",
    "API_KEY",
    "APIKEY",
    "ACCESS_KEY",
    "PRIVATE_KEY",
    "CLIENT_SECRET",
    "AUTH_TOKEN",
    "CREDENTIAL",
    "SESSION_KEY",
    "ENCRYPTION_KEY",
    "SIGNING_KEY",
];

/// Values that look like secrets but are documentation.
///
/// A README saying `API_KEY=your-key-here` is not a leak, and redacting it
/// makes the instruction unreadable for the assistant that has to follow it.
const PLACEHOLDERS: [&str; 12] = [
    "your",
    "xxx",
    "todo",
    "changeme",
    "example",
    "placeholder",
    "redacted",
    "none",
    "null",
    "test",
    "insert",
    "here",
];

fn is_placeholder(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    PLACEHOLDERS.iter().any(|p| lower.contains(p))
        || value
            .chars()
            .all(|c| c == '*' || c == '.' || c == '<' || c == '>')
}

/// What a token's prefix says it is, if anything.
fn issuer(token: &str) -> Option<&'static str> {
    // Longest prefixes first: `sk-ant-` must win over `sk-`.
    const BY_PREFIX: [(&str, &str, usize); 15] = [
        ("sk-ant-", "anthropic key", 30),
        ("github_pat_", "github token", 30),
        ("sk_live_", "stripe live key", 20),
        ("sk_test_", "stripe test key", 20),
        ("rk_live_", "stripe restricted key", 20),
        ("glpat-", "gitlab token", 20),
        ("xoxb-", "slack token", 20),
        ("xoxp-", "slack token", 20),
        ("xoxa-", "slack token", 20),
        ("ghp_", "github token", 30),
        ("gho_", "github token", 30),
        ("ghs_", "github token", 30),
        ("npm_", "npm token", 30),
        ("AIza", "google api key", 35),
        ("sk-", "openai key", 20),
    ];

    for (prefix, kind, min) in BY_PREFIX {
        if token.starts_with(prefix) && token.len() >= min {
            return Some(kind);
        }
    }

    // An AWS access key id is exactly twenty characters of upper case and
    // digits after AKIA, which no English word matches.
    if token.len() == 20
        && token.starts_with("AKIA")
        && token[4..]
            .chars()
            .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit())
    {
        return Some("aws access key");
    }

    if is_jwt(token) {
        return Some("jwt");
    }

    None
}

/// Three base64url segments, the first of which decodes to a JSON header.
///
/// Checked structurally rather than by decoding: every JWT header begins with
/// `{"` and therefore every JWT begins with `eyJ`, and requiring all three
/// segments keeps ordinary dotted identifiers out.
fn is_jwt(token: &str) -> bool {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        return false;
    }
    if !parts[0].starts_with("eyJ") || parts[0].len() < 8 {
        return false;
    }
    parts[1].len() >= 8
        && parts.iter().all(|p| {
            !p.is_empty()
                && p.chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '=')
        })
}

/// Punctuation that surrounds a token in prose and code but is not part of it.
fn unwrap_token(raw: &str) -> &str {
    raw.trim_matches(|c: char| {
        matches!(
            c,
            '"' | '\'' | '`' | ',' | ';' | ')' | '(' | '[' | ']' | '{' | '}' | '<' | '>'
        ) || c == '\\'
    })
}

/// Take every credential out of `text`, and say what was taken.
pub fn scrub(text: &str) -> (String, Vec<Hit>) {
    let mut counts: Vec<(&'static str, usize)> = Vec::new();
    let mut note = |kind: &'static str| match counts.iter_mut().find(|(k, _)| *k == kind) {
        Some((_, n)) => *n += 1,
        None => counts.push((kind, 1)),
    };

    let mut out = String::with_capacity(text.len());
    let mut in_pem = false;

    for line in text.lines() {
        /*
         * A private key is a block, not a token. Everything between the header
         * and the footer goes, because the body is the secret and its lines
         * carry no marker of their own.
         */
        if in_pem {
            if line.contains("-----END") {
                in_pem = false;
            }
            continue;
        }
        if line.contains("-----BEGIN") && line.contains("PRIVATE KEY") {
            in_pem = true;
            note("private key");
            out.push_str("[redacted: private key]\n");
            continue;
        }

        out.push_str(&scrub_line(line, &mut note));
        out.push('\n');
    }

    // `lines()` drops the distinction between a trailing newline and none, and
    // a handover ends with one either way.
    if !text.ends_with('\n') && out.ends_with('\n') {
        out.pop();
    }

    let hits = counts
        .into_iter()
        .map(|(kind, count)| Hit { kind, count })
        .collect();
    (out, hits)
}

fn scrub_line(line: &str, note: &mut impl FnMut(&'static str)) -> String {
    /*
     * An assignment is handled before the token scan, because the value of
     * `DB_PASSWORD=` has no prefix and no structure and would survive it.
     */
    if let Some(cut) = assignment_split(line) {
        let (name, value) = line.split_at(cut);
        let raw = value.trim_start_matches(['=', ':']).trim();
        let bare = unwrap_token(raw);
        if !bare.is_empty() && bare.len() >= 8 && !is_placeholder(bare) {
            /*
             * Prefer what the value says it is over what its name says. A
             * `"token": "ghp_…"` is a github token, and saying so tells the
             * next assistant which credential to ask for; "credential" is only
             * the answer when the value has nothing to identify it, which is
             * exactly the password case this branch exists for.
             */
            let kind = issuer(bare).unwrap_or("credential");
            note(kind);
            /*
             * Only the value is swapped, in place.
             *
             * Rebuilding the line as `name=[redacted]` looked fine for a shell
             * export and destroyed everything else: `{"token": "ghp_…"}` came
             * back as `{"token"=[redacted: credential]`, with the quotes and
             * the closing brace gone. Replacing the token where it sits keeps
             * whatever syntax it was written in intact.
             */
            return format!(
                "{name}{}",
                value.replacen(bare, &format!("[redacted: {kind}]"), 1)
            );
        }
    }

    let mut out = String::with_capacity(line.len());
    for (i, word) in line.split(' ').enumerate() {
        if i > 0 {
            out.push(' ');
        }
        let bare = unwrap_token(word);
        match issuer(bare) {
            Some(kind) => {
                note(kind);
                // Replace only the token, so surrounding quotes and brackets
                // still balance in whatever code or JSON it came from.
                out.push_str(&word.replace(bare, &format!("[redacted: {kind}]")));
            }
            None => out.push_str(word),
        }
    }
    out
}

/// Where the name ends in `NAME=value` or `NAME: value`, if the name is one.
fn assignment_split(line: &str) -> Option<usize> {
    let at = line.find(['=', ':'])?;
    let name = line[..at].trim();
    // A name is a single identifier. Prose containing a colon is not one.
    if name.is_empty() || name.len() > 64 || name.contains(' ') {
        return None;
    }
    let upper = name.to_ascii_uppercase();
    SECRET_NAMES.iter().any(|n| upper.contains(n)).then_some(at)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn kinds(text: &str) -> Vec<&'static str> {
        let (_, hits) = scrub(text);
        let mut k: Vec<&'static str> = hits.into_iter().map(|h| h.kind).collect();
        k.sort_unstable();
        k
    }

    #[test]
    fn a_live_jwt_never_reaches_the_next_assistant() {
        let text = "the header is Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk";
        let (out, hits) = scrub(text);
        assert!(
            !out.contains("eyJzdWIiOiIxMjM0"),
            "the payload survived: {out}"
        );
        assert!(out.contains("[redacted: jwt]"));
        assert_eq!(
            hits,
            vec![Hit {
                kind: "jwt",
                count: 1
            }]
        );
    }

    #[test]
    fn each_issuer_is_recognised_by_its_prefix() {
        assert_eq!(
            kinds("sk-ant-api03-aaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
            ["anthropic key"]
        );
        assert_eq!(
            kinds("ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
            ["github token"]
        );
        assert_eq!(
            kinds("sk_live_aaaaaaaaaaaaaaaaaaaaaaaa"),
            ["stripe live key"]
        );
        assert_eq!(kinds("AKIAIOSFODNN7EXAMPLE"), ["aws access key"]);
        assert_eq!(kinds("xoxb-1234-5678-abcdefghijklmno"), ["slack token"]);
    }

    /*
     * The rule this module lives or dies by.
     *
     * A handover with its commit hashes and UUIDs replaced is worse than no
     * handover, because the reader cannot tell what was lost. Everything here
     * is long and random and none of it is a credential.
     */
    #[test]
    fn ordinary_long_random_strings_are_left_alone() {
        let text = "commit 9f2c1a4e8b7d6350f1e2a3b4c5d6e7f8a9b0c1d2 \
                    id 550e8400-e29b-41d4-a716-446655440000 \
                    sha256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
        let (out, hits) = scrub(text);
        assert_eq!(out.trim(), text, "a hash was mangled");
        assert!(hits.is_empty(), "false positives: {hits:?}");
    }

    #[test]
    fn a_password_is_caught_by_its_name_because_it_has_no_shape() {
        let (out, hits) = scrub("DB_PASSWORD=hunter2000");
        assert!(!out.contains("hunter2000"));
        assert_eq!(
            hits,
            vec![Hit {
                kind: "credential",
                count: 1
            }]
        );
    }

    #[test]
    fn documentation_placeholders_stay_readable() {
        for line in [
            "API_KEY=your-key-here",
            "export SECRET=<insert-token>",
            "PASSWORD=changeme",
        ] {
            let (out, hits) = scrub(line);
            assert_eq!(out.trim(), line, "a placeholder was redacted");
            assert!(hits.is_empty());
        }
    }

    #[test]
    fn a_private_key_block_goes_whole() {
        let text =
            "-----BEGIN RSA PRIVATE KEY-----\nMIIEow==\nabc\n-----END RSA PRIVATE KEY-----\nafter";
        let (out, hits) = scrub(text);
        assert!(!out.contains("MIIEow"), "the key body survived");
        assert!(out.contains("after"), "content after the block was eaten");
        assert_eq!(
            hits,
            vec![Hit {
                kind: "private key",
                count: 1
            }]
        );
    }

    #[test]
    fn quotes_and_brackets_survive_the_replacement() {
        let (out, _) = scrub("{\"token\": \"ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"}");
        assert!(
            out.contains("{\"token\": \"[redacted: github token]\"}"),
            "{out}"
        );
    }

    #[test]
    fn prose_with_a_colon_is_not_an_assignment() {
        let line = "the fix: read the file before writing it";
        let (out, hits) = scrub(line);
        assert_eq!(out.trim(), line);
        assert!(hits.is_empty());
    }
}
