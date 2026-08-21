//! What this copy of Sidq is allowed to do, decided here rather than in a page.
//!
//! The limits used to live entirely in the frontend: the page read the tier, the
//! page computed the history window, and the page passed that window down into
//! the search. All three are things a person can change, so the free plan was a
//! suggestion with a payment form next to it.
//!
//! ── Where the truth comes from ───────────────────────────────────────────────
//! The tier is read from the user's own `profiles` row over HTTPS, using their
//! session token. That row is written by the Stripe webhook and a database
//! trigger refuses any other writer, so it cannot be set by the client at all —
//! not from the page, not from here. Sidq only ever reads it.
//!
//! The check is cached, because the app has to work on a plane. A tier that was
//! confirmed inside the grace window is trusted; past that it falls back to
//! free. Falling back downwards is what makes going offline useless as a way of
//! avoiding the check: the fallback is the cheapest plan, never the best one.
//!
//! ── What this is not ─────────────────────────────────────────────────────────
//! It is not unbreakable. The cache and the counter are SQLite on a disk the
//! person owns, and somebody determined enough will edit them. Making that
//! impossible would mean sending a record of every conversation handed over to a
//! server, and the whole claim of this product is that conversations do not
//! leave the machine. This is the strongest limit that claim allows.

use crate::index_store;
use rusqlite::Connection;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

/// How long a confirmed tier is trusted without another check.
const GRACE_SECS: i64 = 7 * 24 * 60 * 60;

/// How often to re-check while online. Cheap, and billing changes are not urgent.
const RECHECK_SECS: i64 = 6 * 60 * 60;

/// A rolling week, matching what the pricing page says.
const WEEK_SECS: i64 = 7 * 24 * 60 * 60;

/// Give up rather than hang the handover behind a slow network.
const HTTP_TIMEOUT_SECS: u32 = 8;

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Plan {
    Free,
    Pro,
    Duo,
}

impl Plan {
    /// Unrecognised tiers cost a feature; they never grant one.
    fn from_tier(tier: &str) -> Self {
        match tier {
            "pro" | "paid" => Plan::Pro,
            "duo" => Plan::Duo,
            _ => Plan::Free,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Plan::Free => "free",
            Plan::Pro => "pro",
            Plan::Duo => "duo",
        }
    }

    /// Handovers per rolling week. `None` means no limit.
    ///
    /// Ten is the number on the pricing page. If one of these two ever changes
    /// without the other, the site is lying, so they are worth checking together.
    pub fn handovers_per_week(self) -> Option<u32> {
        match self {
            Plan::Free => Some(10),
            _ => None,
        }
    }

    /// How far back search reaches, in days. `None` means everything.
    pub fn history_days(self) -> Option<i64> {
        match self {
            Plan::Free => Some(7),
            _ => None,
        }
    }
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/**
 * Ask Supabase what this account is on.
 *
 * Through `/usr/bin/curl` rather than an HTTP crate. Sidq is a 4.5MB binary and
 * linking a TLS stack to make one small GET a few times a day would roughly
 * double it. curl is part of macOS, uses the system's own certificate store, and
 * this app does not run anywhere it is missing.
 *
 * Returns `None` for every kind of failure — no network, a rejected token, a
 * shape that does not parse — and the caller treats all of them the same way,
 * which is to fall back rather than to assume the best.
 */
fn fetch_tier(url: &str, anon_key: &str, token: &str) -> Option<String> {
    let out = Command::new("/usr/bin/curl")
        .args([
            "--silent",
            "--fail",
            "--max-time",
            &HTTP_TIMEOUT_SECS.to_string(),
            &format!("{url}/rest/v1/profiles?select=plan_tier&limit=1"),
            "-H",
            &format!("apikey: {anon_key}"),
            "-H",
            &format!("Authorization: Bearer {token}"),
        ])
        .output()
        .ok()?;

    if !out.status.success() {
        return None;
    }

    parse_tier(&String::from_utf8_lossy(&out.stdout))
}

/**
 * Pull `plan_tier` out of the PostgREST response.
 *
 * By hand, because pulling in a JSON parser for one string from one field of a
 * response we control the shape of is not a trade worth making. An empty array
 * is a real answer — a signed-in account with no profile row yet — and it has to
 * read as "no tier", not as a parse failure.
 */
fn parse_tier(body: &str) -> Option<String> {
    let key = "\"plan_tier\"";
    let after = body.split_once(key)?.1;
    let after = after.trim_start().strip_prefix(':')?.trim_start();
    let value = after.strip_prefix('"')?;
    let end = value.find('"')?;
    Some(value[..end].to_string())
}

/**
 * The plan in force right now.
 *
 * Re-checks with the server when the cached answer is stale and a token exists;
 * otherwise trusts the cache until the grace window runs out. Everything about
 * this function is designed so that the failure path lands on `Free`.
 */
pub fn current(conn: &Connection) -> Plan {
    let Some(token) = index_store::setting(conn, "access_token") else {
        return Plan::Free;
    };

    let checked_at = index_store::setting(conn, "tier_checked_at")
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(0);
    let age = now() - checked_at;

    if age > RECHECK_SECS {
        if let (Some(url), Some(key)) = (
            option_env!("VITE_SUPABASE_URL"),
            option_env!("VITE_SUPABASE_ANON_KEY"),
        ) {
            if let Some(tier) = fetch_tier(url, key, &token) {
                let plan = Plan::from_tier(&tier);
                let _ = index_store::put_setting(conn, "tier", plan.as_str());
                let _ = index_store::put_setting(conn, "tier_checked_at", &now().to_string());
                return plan;
            }
        }
    }

    // Could not confirm. Trust what was last confirmed, but only for a while.
    if age > GRACE_SECS {
        return Plan::Free;
    }

    index_store::setting(conn, "tier")
        .map(|t| Plan::from_tier(&t))
        .unwrap_or(Plan::Free)
}

/// The earliest `ended_at` search may return, from the plan rather than the page.
pub fn history_floor(plan: Plan) -> i64 {
    match plan.history_days() {
        // Milliseconds: what the index stores, and what the readers write.
        Some(days) => (now() - days * 24 * 60 * 60) * 1000,
        None => 0,
    }
}

/// Handovers made in the last rolling week, and the cap, if there is one.
pub fn handover_allowance(conn: &Connection, plan: Plan) -> (u32, Option<u32>) {
    let used = index_store::handovers_since(conn, now() - WEEK_SECS);
    (used, plan.handovers_per_week())
}

/// Whether one more handover is allowed right now.
pub fn may_hand_over(conn: &Connection, plan: Plan) -> bool {
    let (used, cap) = handover_allowance(conn, plan);
    cap.is_none_or(|limit| used < limit)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_unknown_tier_lands_on_free() {
        // The direction of this failure is the whole point: a value nobody
        // recognises must cost a feature, never hand one out.
        assert_eq!(Plan::from_tier("enterprise"), Plan::Free);
        assert_eq!(Plan::from_tier(""), Plan::Free);
        assert_eq!(Plan::from_tier("PRO"), Plan::Free);
    }

    #[test]
    fn paid_is_pro_because_the_database_still_says_paid() {
        // The column was written before the plans were named, and renaming it
        // would need a migration on live billing data to gain nothing.
        assert_eq!(Plan::from_tier("paid"), Plan::Pro);
        assert_eq!(Plan::from_tier("pro"), Plan::Pro);
        assert_eq!(Plan::from_tier("duo"), Plan::Duo);
    }

    #[test]
    fn the_free_limits_match_what_the_pricing_page_promises() {
        // src/lib/entitlements.ts: handoffsPerWeek 10, historyDays 7.
        assert_eq!(Plan::Free.handovers_per_week(), Some(10));
        assert_eq!(Plan::Free.history_days(), Some(7));
        assert_eq!(Plan::Pro.handovers_per_week(), None);
        assert_eq!(Plan::Duo.history_days(), None);
    }

    #[test]
    fn reads_the_tier_out_of_a_postgrest_response() {
        assert_eq!(
            parse_tier(r#"[{"plan_tier":"paid"}]"#).as_deref(),
            Some("paid")
        );
        assert_eq!(
            parse_tier("[ { \"plan_tier\" : \"free\" } ]").as_deref(),
            Some("free")
        );
    }

    #[test]
    fn treats_an_account_with_no_profile_row_as_no_answer() {
        // Signed in, row not created yet. Falls through to the cache and then
        // to free, rather than being mistaken for a successful read.
        assert_eq!(parse_tier("[]"), None);
        assert_eq!(parse_tier(""), None);
        assert_eq!(parse_tier(r#"{"message":"JWT expired"}"#), None);
    }

    #[test]
    fn a_truncated_response_does_not_produce_a_tier() {
        // A connection cut mid-body must not parse as anything.
        assert_eq!(parse_tier(r#"[{"plan_tier":"pr"#), None);
        assert_eq!(parse_tier(r#"[{"plan_tier":"#), None);
    }

    #[test]
    fn the_eleventh_handover_in_a_week_is_refused() {
        /*
         * The whole point of moving this out of the page.
         *
         * Ten is what the pricing page promises; the eleventh has to be stopped
         * by the app, and it has to be stopped before anything is read from
         * disk, not after a file has already been written.
         */
        let conn = index_store::tests::memory();
        let now = now();

        for i in 0..10 {
            index_store::record_handover(&conn, &format!("session-{i}"), now - 60).unwrap();
        }

        assert!(!may_hand_over(&conn, Plan::Free), "ten is the cap");
        assert!(may_hand_over(&conn, Plan::Pro), "and paid plans have none");

        let (used, cap) = handover_allowance(&conn, Plan::Free);
        assert_eq!((used, cap), (10, Some(10)));
    }

    #[test]
    fn nine_this_week_still_leaves_one() {
        let conn = index_store::tests::memory();
        let now = now();
        for i in 0..9 {
            index_store::record_handover(&conn, &format!("s{i}"), now - 60).unwrap();
        }

        assert!(may_hand_over(&conn, Plan::Free));
    }

    #[test]
    fn the_week_rolls_rather_than_resetting() {
        /*
         * A calendar week would mean everybody's allowance refills at midnight
         * on the same day, and somebody who used theirs on Sunday waits hours
         * while somebody who used theirs on Monday waits six days.
         */
        let conn = index_store::tests::memory();
        let now = now();

        for i in 0..10 {
            // Eight days ago: outside the window, so they no longer count.
            index_store::record_handover(&conn, &format!("old-{i}"), now - 8 * 24 * 60 * 60)
                .unwrap();
        }

        assert_eq!(handover_allowance(&conn, Plan::Free).0, 0);
        assert!(may_hand_over(&conn, Plan::Free));
    }

    #[test]
    fn with_no_token_the_plan_is_free_whatever_the_cache_says() {
        /*
         * Somebody who signs out, or who edits `tier` in the database by hand
         * without a session to back it up, gets the free plan. The cached tier
         * is only ever trusted as a record of a check that actually happened.
         */
        let conn = index_store::tests::memory();
        index_store::put_setting(&conn, "tier", "pro").unwrap();
        index_store::put_setting(&conn, "tier_checked_at", &now().to_string()).unwrap();

        assert_eq!(current(&conn), Plan::Free);
    }

    #[test]
    fn a_confirmed_tier_survives_going_offline_but_not_forever() {
        let conn = index_store::tests::memory();
        index_store::put_setting(&conn, "access_token", "not-a-real-token").unwrap();
        index_store::put_setting(&conn, "tier", "pro").unwrap();

        // Confirmed an hour ago: inside both the recheck interval and the grace
        // window, so no network call happens and the answer stands.
        index_store::put_setting(&conn, "tier_checked_at", &(now() - 3600).to_string()).unwrap();
        assert_eq!(current(&conn), Plan::Pro, "a plane must not downgrade you");

        // Confirmed a fortnight ago. The token will not verify here, so this
        // exercises the fallback, and the fallback goes down rather than up.
        index_store::put_setting(&conn, "tier_checked_at", &(now() - 14 * 24 * 60 * 60).to_string())
            .unwrap();
        assert_eq!(current(&conn), Plan::Free, "grace has to end somewhere");
    }

    #[test]
    fn the_history_floor_is_a_real_cutoff_for_free_and_none_for_paid() {
        let free = history_floor(Plan::Free);
        let pro = history_floor(Plan::Pro);

        assert_eq!(pro, 0, "paid plans reach everything");
        assert!(free > 0);
        // Milliseconds, because that is what the index stores. Seconds here
        // would put the cutoff in 1970 and quietly unlock all of history.
        assert!(free > 1_600_000_000_000, "must be milliseconds, not seconds");
    }
}
