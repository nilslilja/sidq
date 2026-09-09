//! A project memory, on a link, because somebody chose to put it there.
//!
//! ── Why this exists in an app whose claim is that nothing leaves ─────────────
//!
//! Everything Sidq does happens on one Mac, which is the reason to install it
//! and also the reason nobody hears about it. A person who finds it useful has
//! no way to show anybody what it produced short of a screenshot, and a product
//! that cannot be shown does not spread.
//!
//! So: one memory, one project, one press, and a link. Nothing is published
//! that a person did not pick out and send, and the window says in plain words
//! that it leaves the Mac before it does.
//!
//! ── What is and is not sent ─────────────────────────────────────────────────
//!
//! A memory, which is the short document Sidq derives *about* a project: what
//! it is called, what was asked first and last, the rules that kept coming up.
//! Never a conversation, and never the project's path — a path is
//! `/Users/<name>/...` and would put somebody's name and disk layout on a
//! public page. The name goes; the path stays here.
//!
//! ── Why unpublishing works without an account lookup ────────────────────────
//!
//! Publishing returns a secret which is kept in `settings` on this Mac and
//! nowhere else the product reads. Taking a link down needs it, so a link that
//! has been forwarded, posted or indexed cannot cost its author control. Losing
//! the Mac loses the ability to unpublish, which is the correct trade: the
//! alternative is a server that can take down anybody's link on request.

use crate::{index_store, memory};
use std::process::Command;

/// Nothing waits on any of this. A share is a thing you asked for, not a step.
const TIMEOUT_SECS: &str = "10";

/// Where a published id and its secret live, per project.
fn keys(project_path: &str) -> (String, String) {
    (format!("share.id.{project_path}"), format!("share.secret.{project_path}"))
}

/// The id this project is published under, if it is published at all.
pub fn published(conn: &rusqlite::Connection, project_path: &str) -> Option<String> {
    index_store::setting(conn, &keys(project_path).0)
}

/**
 * Publish a project's memory and return the id it now lives under.
 *
 * Through `/usr/bin/curl` for the same reason `entitlement` and `telemetry`
 * are: linking a TLS stack to make an occasional POST would roughly double a
 * 4.5MB binary, and this app never runs anywhere curl is missing.
 *
 * `None` for every kind of failure, including not being signed in. The window
 * says so; there is nothing here worth distinguishing for the caller, because
 * the answer to all of them is the same and it is "it did not publish".
 */
pub fn publish(
    conn: &rusqlite::Connection,
    url: &str,
    anon_key: &str,
    project_path: &str,
) -> Option<String> {
    let token = index_store::setting(conn, "access_token")?;
    let built = memory::build(conn, project_path)?;

    let body = serde_json::json!({
        "project": built.name,
        "markdown": built.as_markdown(),
    })
    .to_string();

    let out = Command::new("/usr/bin/curl")
        .args([
            "--silent",
            "--fail",
            "--max-time",
            TIMEOUT_SECS,
            "-X",
            "POST",
            &format!("{url}/functions/v1/share-memory"),
            "-H",
            &format!("apikey: {anon_key}"),
            "-H",
            &format!("Authorization: Bearer {token}"),
            "-H",
            "Content-Type: application/json",
            "-d",
            &body,
        ])
        .output()
        .ok()?;

    if !out.status.success() {
        return None;
    }

    let answer: serde_json::Value = serde_json::from_slice(&out.stdout).ok()?;
    let id = answer.get("id")?.as_str()?.to_string();
    let secret = answer.get("secret")?.as_str()?.to_string();

    let (id_key, secret_key) = keys(project_path);
    index_store::put_setting(conn, &id_key, &id)?;
    index_store::put_setting(conn, &secret_key, &secret)?;

    Some(id)
}

/**
 * Take a published memory down.
 *
 * Forgets the id locally whatever the server says. A row that will not delete
 * is a worse outcome than a stale key, and leaving the window showing "shared"
 * after somebody pressed unpublish is the one behaviour this must not have.
 */
pub fn unpublish(
    conn: &rusqlite::Connection,
    url: &str,
    anon_key: &str,
    project_path: &str,
) -> bool {
    let (id_key, secret_key) = keys(project_path);
    let id = index_store::setting(conn, &id_key);
    let secret = index_store::setting(conn, &secret_key);
    let token = index_store::setting(conn, "access_token");

    let sent = match (&id, &secret, &token) {
        (Some(id), Some(secret), Some(token)) => {
            let body = serde_json::json!({ "action": "unpublish", "id": id, "secret": secret })
                .to_string();

            Command::new("/usr/bin/curl")
                .args([
                    "--silent",
                    "--fail",
                    "--output",
                    "/dev/null",
                    "--max-time",
                    TIMEOUT_SECS,
                    "-X",
                    "POST",
                    &format!("{url}/functions/v1/share-memory"),
                    "-H",
                    &format!("apikey: {anon_key}"),
                    "-H",
                    &format!("Authorization: Bearer {token}"),
                    "-H",
                    "Content-Type: application/json",
                    "-d",
                    &body,
                ])
                .status()
                .map(|s| s.success())
                .unwrap_or(false)
        }
        _ => false,
    };

    let _ = index_store::forget_setting(conn, &id_key);
    let _ = index_store::forget_setting(conn, &secret_key);
    sent
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);",
        )
        .unwrap();
        conn
    }

    #[test]
    fn a_project_is_not_published_until_it_is() {
        assert_eq!(published(&db(), "/Users/nils/Sidq"), None);
    }

    #[test]
    fn two_projects_do_not_share_a_link() {
        // The keys are per path. One key for all of them would mean publishing
        // a second project silently replaced the first one's link.
        let conn = db();
        index_store::put_setting(&conn, "share.id./a", "aaa").unwrap();
        index_store::put_setting(&conn, "share.id./b", "bbb").unwrap();

        assert_eq!(published(&conn, "/a").as_deref(), Some("aaa"));
        assert_eq!(published(&conn, "/b").as_deref(), Some("bbb"));
    }

    #[test]
    fn unpublishing_forgets_the_link_even_when_the_server_cannot_be_reached() {
        /*
         * The one behaviour this must not have: pressing unpublish, the request
         * failing, and the window still saying "shared". The local key goes
         * either way, so the app never claims something is published when the
         * person has told it to stop.
         */
        let conn = db();
        index_store::put_setting(&conn, "share.id./a", "aaa").unwrap();
        index_store::put_setting(&conn, "share.secret./a", "sss").unwrap();

        // No access_token, so nothing is even attempted.
        assert!(!unpublish(&conn, "http://127.0.0.1:1", "k", "/a"));
        assert_eq!(published(&conn, "/a"), None);
    }

    #[test]
    fn nothing_is_published_without_an_account() {
        // Publishing is signed-in only, and the check is here as well as in the
        // function so that a signed-out press costs no request at all.
        let conn = db();
        assert_eq!(publish(&conn, "http://127.0.0.1:1", "k", "/a"), None);
    }
}
