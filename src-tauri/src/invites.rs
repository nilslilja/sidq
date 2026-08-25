//! Invites: your code, who used it, and what that is worth.
//!
//! ── Where the numbers come from ──────────────────────────────────────────────
//! Supabase, over the person's own session token, through two functions defined
//! in `0007_invites.sql`. Nothing here decides what an invite is worth. The
//! database does, in one function, so that the figure this window shows and the
//! figure `entitlement` enforces cannot become two different rules.
//!
//! ── Why it fails out loud ────────────────────────────────────────────────────
//! Every other network call in this app falls back silently, because the thing
//! it is deciding is what Sidq is allowed to do and the safe answer is "less".
//! This one is the opposite: there is no safe local answer to "what is my invite
//! code", and a panel showing a plausible blank instead of saying it could not
//! reach the server is a panel that looks broken with no way to tell why. So the
//! reason comes back with the result and the window prints it.

use crate::index_store;
use rusqlite::Connection;
use std::process::Command;

/// Give up rather than hang a panel behind a slow network.
const HTTP_TIMEOUT_SECS: u32 = 8;

/// Where the cap lives on this side, for the one sentence that states it.
///
/// The database is the authority — `invite_bonus` applies it — and this is only
/// ever used to say the number out loud. If the two drift, the app understates
/// or overstates the offer while the database keeps paying the right amount.
pub const MOST_PER_ACCOUNT: u32 = 25;

/// What one person joining is worth, per week, to each side.
///
/// For a week, not forever. `0008_invites_expire.sql` pays only for referrals
/// inside a rolling seven days: an invite that is not followed by another one
/// lapses, and the account lands back on the plain free allowance. Permanent
/// was the wrong shape — it pays once and keeps paying, so somebody who invites
/// five friends in their first week never has a reason to invite anybody again
/// or to ever pay.
pub const EACH_INVITE: u32 = 5;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    /// The code to hand out. Empty when it could not be read.
    pub code: String,
    /// How many accounts have used it.
    pub invited: u32,
    /// Extra handovers a week this has earned, already capped.
    pub bonus: u32,
    /// Whether this account used somebody else's code.
    pub redeemed: bool,
    /// Empty on success. A sentence to show as-is otherwise.
    pub problem: String,
    /// What one invite is worth. Sent so the window states the offer from the
    /// same numbers the database pays out, rather than a copy that can drift.
    pub each: u32,
    /// The ceiling, for the same reason.
    pub most: u32,
    /// How many have used the code inside the current window.
    pub this_week: u32,
    /// How many are allowed to, per window.
    pub per_week: u32,
    /// When the oldest invite still being paid for stops counting. Empty when
    /// nothing is earning anything, which is not the same as "expires now".
    pub expires: String,
}

impl Default for Summary {
    fn default() -> Self {
        Self {
            code: String::new(),
            invited: 0,
            bonus: 0,
            redeemed: false,
            problem: String::new(),
            each: EACH_INVITE,
            most: MOST_PER_ACCOUNT,
            this_week: 0,
            per_week: 0,
            expires: String::new(),
        }
    }
}

impl Summary {
    fn problem(message: impl Into<String>) -> Self {
        Self {
            problem: message.into(),
            ..Self::default()
        }
    }
}

/**
 * Call one of the invite functions.
 *
 * Through `/usr/bin/curl` for the same reason `entitlement` does: this is a
 * 4.5MB binary and linking a TLS stack for a handful of small POSTs a day would
 * roughly double it.
 *
 * `--fail-with-body` rather than `--fail`, because the body is the whole point
 * on an error here. PostgREST returns the `raise exception` message from the
 * function, which is written to be read by the person who just typed a code in
 * wrong, and `--fail` would throw it away and leave "something went wrong".
 */
fn call(conn: &Connection, function: &str, body: &str) -> Result<serde_json::Value, String> {
    let (Some(url), Some(anon_key)) = (
        option_env!("VITE_SUPABASE_URL"),
        option_env!("VITE_SUPABASE_ANON_KEY"),
    ) else {
        return Err("This build has no server configured, so invites are unavailable.".into());
    };

    let Some(token) = index_store::setting(conn, "access_token") else {
        return Err("Sign in to get your invite code.".into());
    };

    let out = Command::new("/usr/bin/curl")
        .args([
            "--silent",
            "--fail-with-body",
            "--max-time",
            &HTTP_TIMEOUT_SECS.to_string(),
            "-X",
            "POST",
            &format!("{url}/rest/v1/rpc/{function}"),
            "-H",
            &format!("apikey: {anon_key}"),
            "-H",
            &format!("Authorization: Bearer {token}"),
            "-H",
            "Content-Type: application/json",
            "-d",
            body,
        ])
        .output()
        .map_err(|e| format!("Could not reach the server: {e}"))?;

    let text = String::from_utf8_lossy(&out.stdout);

    if !out.status.success() {
        return Err(server_message(&text));
    }

    serde_json::from_str(&text).map_err(|_| "The server sent something unreadable.".to_string())
}

/**
 * Pull the human sentence out of a PostgREST error.
 *
 * The shape is `{"code":"P0001","message":"That code does not exist.", ...}` and
 * the message is the text `raise exception` was given, which the migration
 * writes as a finished sentence. Anything else — an HTML error page from a
 * proxy, an empty body from a dropped connection — must not be printed at
 * somebody, so it becomes a generic line instead.
 */
fn server_message(body: &str) -> String {
    let raw = serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|v| v.get("message")?.as_str().map(str::to_string))
        .filter(|m| !m.is_empty() && m.len() < 200);

    let Some(raw) = raw else {
        return "Could not reach the server. Try again in a moment.".into();
    };

    /*
     * ── Not every message from the server was written for a person ───────────
     *
     * Passing the server's sentence through is right for the ones this product
     * wrote: "That code does not exist", "That is your own code". Those are
     * finished sentences aimed at whoever typed a code in wrong, and replacing
     * them with something generic throws away the only useful part.
     *
     * It is wrong for the ones PostgREST and the auth gateway write for
     * developers. A panel reading "JWT expired" — which is what this actually
     * showed — tells somebody nothing, blames them for nothing they did, and
     * offers a Try again button that will fail exactly the same way, because
     * the token does not renew by being asked for twice.
     *
     * The token is refreshed by the window, not by Rust, which holds no refresh
     * token on purpose. So the honest thing to say is what will fix it.
     */
    if is_a_stale_session(&raw) {
        return "Your sign-in needs refreshing. Give it a moment, or reopen Sidq.".into();
    }

    raw
}

/// Does this error mean the token lapsed, rather than anything the person did?
///
/// Matched on the words because there is no code to match on: the gateway
/// answers `UNAUTHORIZED_ASYMMETRIC_JWT`, PostgREST answers `PGRST303`, and both
/// put the useful part in prose.
fn is_a_stale_session(message: &str) -> bool {
    let m = message.to_lowercase();
    m.contains("jwt") || m.contains("token is expired") || m.contains("unauthorized")
}

/// Your code and what it has earned.
pub fn summary(conn: &Connection) -> Summary {
    let value = match call(conn, "invite_summary", "{}") {
        Ok(value) => value,
        Err(problem) => return Summary::problem(problem),
    };

    // A signed-in account with no profile row yet answers `null`, which is a
    // real state rather than a failure: the row is created by a trigger on
    // signup and this is the gap before it lands.
    if value.is_null() {
        return Summary::problem("Your account is still being set up. Try again in a moment.");
    }

    let bonus = value.get("bonus").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
    let found = Summary {
        code: value
            .get("code")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string(),
        invited: value.get("invited").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
        bonus,
        redeemed: value
            .get("redeemed")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        this_week: value.get("thisWeek").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
        per_week: value.get("perWeek").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
        expires: value
            .get("expires")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string(),
        ..Summary::default()
    };

    remember_bonus(conn, bonus);
    found
}

/// Use somebody else's code. Returns the new bonus, or a sentence to show.
pub fn redeem(conn: &Connection, code: &str) -> Result<u32, String> {
    let body = serde_json::json!({ "code": code }).to_string();
    let value = call(conn, "redeem_invite", &body)?;
    let bonus = value.get("bonus").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
    remember_bonus(conn, bonus);
    Ok(bonus)
}

/**
 * Keep the bonus where the limit check can find it.
 *
 * `entitlement` runs on every handover, including on a plane, and it cannot
 * make an HTTP call to find out whether somebody's invites still count. The
 * last confirmed figure is cached next to the last confirmed tier and ages out
 * with it, so the failure direction is the same: back to the plain free plan,
 * never up.
 */
fn remember_bonus(conn: &Connection, bonus: u32) {
    let _ = index_store::put_setting(conn, "invite_bonus", &bonus.to_string());
}

/// The cached figure, for the limit check. Zero unless one was confirmed.
pub fn cached_bonus(conn: &Connection) -> u32 {
    index_store::setting(conn, "invite_bonus")
        .and_then(|v| v.parse::<u32>().ok())
        .unwrap_or(0)
        .min(MOST_PER_ACCOUNT)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_servers_own_sentence_is_what_gets_shown() {
        let body = r#"{"code":"P0001","message":"That is your own code.","hint":null}"#;
        assert_eq!(server_message(body), "That is your own code.");
    }

    #[test]
    fn an_unreadable_error_does_not_get_printed_at_anybody() {
        // A proxy returning HTML, a dropped connection returning nothing. Neither
        // is a sentence and neither belongs in front of a person.
        assert!(server_message("<html>502 Bad Gateway</html>").starts_with("Could not reach"));
        assert!(server_message("").starts_with("Could not reach"));
    }

    #[test]
    fn a_lapsed_session_does_not_print_the_gateways_words_at_anybody() {
        /*
         * This panel showed "JWT expired" as its entire explanation, over a Try
         * again button that would fail identically — a token is not renewed by
         * being asked for twice.
         *
         * Rust cannot renew one; it holds no refresh token on purpose. The
         * window does, in passing, whenever it reads the session. So the
         * sentence says the thing that actually fixes it, and the panel now
         * refreshes and retries before showing it at all.
         */
        for body in [
            r#"{"message":"JWT expired"}"#,
            r#"{"code":"PGRST303","message":"JWT expired"}"#,
            r#"{"code":"UNAUTHORIZED_ASYMMETRIC_JWT","message":"Invalid JWT"}"#,
        ] {
            let out = server_message(body);
            assert!(!out.contains("JWT"), "developer wording reached a person: {out}");
            assert!(out.contains("sign-in needs refreshing"), "{out}");
        }
    }

    #[test]
    fn the_sentences_this_product_wrote_still_come_through() {
        // The whole reason errors are passed through: these were written for
        // whoever typed a code in wrong, and a generic line loses the point.
        for message in [
            "That code does not exist.",
            "That is your own code.",
            "You have already used an invite code.",
        ] {
            let body = format!(r#"{{"code":"P0001","message":"{message}"}}"#);
            assert_eq!(server_message(&body), message);
        }
    }

    #[test]
    fn a_wall_of_text_is_not_treated_as_a_message() {
        let long = format!(r#"{{"message":"{}"}}"#, "x".repeat(400));
        assert!(server_message(&long).starts_with("Could not reach"));
    }

    #[test]
    fn a_summary_that_failed_carries_the_reason_and_no_numbers() {
        let s = Summary::problem("Sign in to get your invite code.");
        assert_eq!(s.problem, "Sign in to get your invite code.");
        assert_eq!(s.code, "");
        assert_eq!(s.invited, 0);
        assert_eq!(s.bonus, 0);
        assert!(!s.redeemed);
    }
}
