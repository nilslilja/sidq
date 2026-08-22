//! Receiving conversations from the browser extension.
//!
//! ChatGPT, Gemini, claude.ai and Perplexity keep nothing readable on this
//! machine — their desktop stores are encrypted and the web versions write
//! nothing durable to disk. That was checked, not assumed. So the only place
//! those conversations exist in the clear is the browser tab, and the extension
//! reads them from there and posts them here.
//!
//! ── Why a loopback listener and not native messaging ─────────────────────────
//! Native messaging needs a host manifest installed into a per-browser
//! directory, and that path differs for Chrome, Edge, Brave, Arc, Opera, Vivaldi
//! and plain Chromium. "One extension for every Chromium browser" would become
//! seven install locations to get right on a machine nobody can debug remotely.
//! A loopback socket is identical on all of them.
//!
//! ── Why this is still local ──────────────────────────────────────────────────
//! It binds 127.0.0.1 explicitly, never 0.0.0.0. Traffic to the loopback address
//! cannot leave the machine or be reached from the network, and no server of ours
//! is involved at any point, so "every word stays on this Mac" is literally true.
//!
//! Everything that arrives is written to the same place Claude Code and Cursor
//! transcripts are read from, so the picker treats a ChatGPT conversation exactly
//! like any other and nothing downstream needs to know the difference.

use serde::Deserialize;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{Ipv4Addr, SocketAddrV4, TcpListener, TcpStream};
use std::path::PathBuf;

/// Fixed so neither side has to discover the other. Matches the extension.
const PORT: u16 = 17872;

/// A conversation larger than this is not a conversation. Guards the allocation.
const MAX_BODY_BYTES: usize = 8 * 1024 * 1024;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Incoming {
    source: String,
    title: String,
    text: String,
    #[serde(default)]
    captured_at: i64,
}

/// Where captured conversations live, alongside the readers' own sources.
fn capture_dir() -> Option<PathBuf> {
    let home = std::env::var_os("HOME")?;
    let dir = PathBuf::from(home)
        .join("Library")
        .join("Application Support")
        .join("app.sidq.desktop")
        .join("captured");
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir)
}

/**
 * Listen for the extension, forever, on a background thread.
 *
 * Binding failure is not fatal. Another Sidq may already hold the port, or the
 * machine may refuse it; either way the app must still work by shortcut, and the
 * extension already says "Sidq is not running" when nothing answers.
 */
pub fn spawn(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let addr = SocketAddrV4::new(Ipv4Addr::LOCALHOST, PORT);
        let Ok(listener) = TcpListener::bind(addr) else {
            return;
        };

        for stream in listener.incoming().flatten() {
            // One connection at a time, deliberately. These arrive when somebody
            // clicks a button, so there is no concurrency to win and a thread per
            // request would be a way to be surprised later.
            handle(stream, &app);
        }
    });
}

fn handle(mut stream: TcpStream, app: &tauri::AppHandle) {
    let Some(request) = read_request(&mut stream) else {
        respond(&mut stream, 400, "bad request");
        return;
    };
    let Request { method, path, body, origin_ok } = request;

    /*
     * Only the extension may post here.
     *
     * A loopback port is reachable by anything else running on this Mac,
     * including a web page in a browser, so the Origin is checked rather than
     * trusted. A page on the open internet cannot forge chrome-extension://.
     */
    if !origin_ok {
        respond(&mut stream, 403, "forbidden");
        return;
    }

    /*
     * The extension asking what the app knows.
     *
     * It needs real numbers to put on the page — how many conversations, how
     * many rules — and it cannot see the index itself. Counts only: no titles,
     * no text, nothing that would put a conversation into a web page before
     * somebody has asked for it.
     */
    if method == Method::Get && path.starts_with("/status") {
        respond_json(&mut stream, &status_json());
        return;
    }

    /*
     * An assistant was opened.
     *
     * Fires the notification from the app rather than the extension, because a
     * browser notification asks for its own permission prompt and is silenced
     * per-site, while this one comes from an app the person deliberately
     * installed.
     */
    /*
     * The chip was clicked. Show the picker.
     *
     * The picking happens in the app, not in the page. Rebuilding the whole
     * list inside somebody else's document would mean shipping their users a
     * second copy of the picker, kept in step by hand, and putting every
     * conversation title into a page belonging to OpenAI or Google to do it.
     */
    if method == Method::Post && path.starts_with("/open") && !path.starts_with("/opened") {
        if let Some(w) = tauri::Manager::get_webview_window(app, "pill") {
            let _ = crate::pill_window::expand(&w);
        }
        respond(&mut stream, 200, "ok");
        return;
    }

    /*
     * The recording backdrop, driven from a script.
     *
     * Shooting footage means putting the pill through its states while nothing
     * else is on screen, and driving that by synthesising clicks at guessed
     * coordinates is how the last attempt ended up filming a permission dialog.
     */
    if method == Method::Post && path.starts_with("/launch") {
        let id = body
            .split_once(r#""id":""#)
            .and_then(|(_, rest)| rest.split_once('"'))
            .map(|(id, _)| id.to_string())
            .unwrap_or_default();

        match crate::assistants::find(&id) {
            Some(a) => {
                use tauri_plugin_opener::OpenerExt;
                let _ = app.opener().open_url(a.url, None::<&str>);
                respond(&mut stream, 200, "ok");
            }
            None => respond(&mut stream, 400, "unknown assistant"),
        }
        return;
    }

    if method == Method::Post && path.starts_with("/backdrop") {
        if let Some(w) = tauri::Manager::get_webview_window(app, "backdrop") {
            if body.contains("\"shown\":true") {
                let _ = w.show();
            } else {
                let _ = w.hide();
            }
        }
        respond(&mut stream, 200, "ok");
        return;
    }

    if method == Method::Post && path.starts_with("/opened") {
        announce_assistant(app, &body);
        respond(&mut stream, 200, "ok");
        return;
    }

    let Ok(incoming) = serde_json::from_str::<Incoming>(&body) else {
        respond(&mut stream, 400, "unparseable");
        return;
    };

    if save(&incoming).is_some() {
        // The picker reloads its list when this fires, so a conversation captured
        // while the pill is open appears without anybody pressing anything.
        use tauri::Emitter;
        let _ = app.emit("captured", &incoming.title);
        respond(&mut stream, 200, "ok");
    } else {
        respond(&mut stream, 500, "could not save");
    }
}

#[derive(Debug, PartialEq, Eq)]
enum Method {
    Get,
    Post,
    Options,
}

/// One parsed request: enough to route it and decide whether to trust it.
struct Request {
    method: Method,
    path: String,
    body: String,
    /// Whether the Origin header names a browser extension.
    origin_ok: bool,
}

fn read_request(stream: &mut TcpStream) -> Option<Request> {
    let mut reader = BufReader::new(stream.try_clone().ok()?);
    let mut line = String::new();

    reader.read_line(&mut line).ok()?;
    let mut parts = line.split_whitespace();
    let method = match parts.next()? {
        "GET" => Method::Get,
        "POST" => Method::Post,
        "OPTIONS" => Method::Options,
        _ => return None,
    };
    let path = parts.next()?.to_string();

    let mut length = 0usize;
    let mut origin_ok = false;

    loop {
        let mut header = String::new();
        if reader.read_line(&mut header).ok()? == 0 {
            return None;
        }
        let header = header.trim_end();
        if header.is_empty() {
            break;
        }

        let lower = header.to_ascii_lowercase();
        if let Some(value) = lower.strip_prefix("content-length:") {
            length = value.trim().parse().ok()?;
        } else if lower.starts_with("origin:") {
            origin_ok = lower.contains("chrome-extension://")
                || lower.contains("moz-extension://")
                || lower.contains("safari-web-extension://");
        }
    }

    if length > MAX_BODY_BYTES {
        return None;
    }

    // A GET carries no body, and requiring one used to be how this rejected
    // every request that was not a conversation.
    let body = if length == 0 {
        String::new()
    } else {
        let mut raw = vec![0u8; length];
        reader.read_exact(&mut raw).ok()?;
        String::from_utf8(raw).ok()?
    };

    Some(Request { method, path, body, origin_ok })
}

/**
 * What the app can offer, as numbers.
 *
 * Deliberately not a list. The extension puts this on a page belonging to
 * OpenAI or Google, and a count says "there is something here" without putting
 * a single word of anybody's conversation into someone else's document.
 */
fn status_json() -> String {
    let Some(conn) = crate::index_store::open() else {
        return String::from(r#"{"running":true,"conversations":0,"rules":0}"#);
    };

    let (conversations, _) = crate::index_store::counts(&conn);
    let turns = crate::index_store::own_turns(&conn, crate::profile::TURN_BUDGET);
    let rules = crate::profile::build(&turns, 25).len();

    format!(r#"{{"running":true,"conversations":{conversations},"rules":{rules}}}"#)
}

/**
 * Say something when an assistant opens, at most once a day per assistant.
 *
 * Without the limit this fires on every tab, every reload and every navigation
 * inside a single-page app, which is the behaviour that gets an app uninstalled
 * in its first week.
 */
fn announce_assistant(app: &tauri::AppHandle, body: &str) {
    use tauri_plugin_notification::NotificationExt;

    let name = body
        .split_once(r#""source":""#)
        .and_then(|(_, rest)| rest.split_once('"'))
        .map(|(name, _)| name.to_string())
        .filter(|n| !n.is_empty() && n.len() < 40)
        .unwrap_or_else(|| "your assistant".into());

    let Some(conn) = crate::index_store::open() else { return };
    let (conversations, _) = crate::index_store::counts(&conn);
    if conversations == 0 {
        // Nothing to offer. A notification here would be an advertisement.
        return;
    }

    let key = format!("announced:{}", name.to_lowercase());
    let today = (std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
        / 86_400)
        .to_string();

    if crate::index_store::setting(&conn, &key).as_deref() == Some(today.as_str()) {
        return;
    }
    let _ = crate::index_store::put_setting(&conn, &key, &today);

    let _ = app
        .notification()
        .builder()
        .title(format!("{conversations} conversations Sidq can hand {name}"))
        .body("Press ⌘⇧K to pick one.")
        .show();
}

/// A JSON reply, with the same CORS headers the POST path needs.
fn respond_json(stream: &mut TcpStream, body: &str) {
    let response = format!(
        "HTTP/1.1 200\r\n\
         Content-Type: application/json\r\n\
         Content-Length: {}\r\n\
         Access-Control-Allow-Origin: *\r\n\
         Access-Control-Allow-Headers: Content-Type\r\n\
         Connection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

/**
 * Write the conversation where the picker will find it.
 *
 * Same shape the transcript reader already produces, so nothing downstream has
 * to care that this one came from a browser rather than a file on disk.
 */
fn save(incoming: &Incoming) -> Option<()> {
    let dir = capture_dir()?;

    // The title becomes a filename, so anything not plainly safe in one is
    // replaced rather than escaped.
    let stem: String = incoming
        .title
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' { c } else { '-' })
        .collect();
    let stem = stem.trim_matches('-');
    let stem = if stem.is_empty() { "conversation" } else { stem };

    let stamp = if incoming.captured_at > 0 {
        incoming.captured_at
    } else {
        0
    };

    let name = format!(
        "{}-{}-{}.md",
        incoming.source.to_lowercase(),
        &stem[..stem.len().min(50)],
        stamp
    );

    std::fs::write(dir.join(name), &incoming.text).ok()?;
    Some(())
}

fn respond(stream: &mut TcpStream, code: u16, body: &str) {
    // The CORS header is required: the extension's fetch is a cross-origin POST
    // with a JSON content type, so the browser preflights and then checks this.
    let response = format!(
        "HTTP/1.1 {code}\r\n\
         Content-Type: text/plain\r\n\
         Content-Length: {}\r\n\
         Access-Control-Allow-Origin: *\r\n\
         Access-Control-Allow-Headers: Content-Type\r\n\
         Connection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_title_cannot_escape_the_capture_directory() {
        // The title arrives from a web page, so it is untrusted and it becomes a
        // filename. Slashes and dots must not survive into the path.
        let incoming = Incoming {
            source: "ChatGPT".into(),
            title: "../../../etc/passwd".into(),
            text: "hello".into(),
            captured_at: 1,
        };
        let stem: String = incoming
            .title
            .chars()
            .map(|c| if c.is_alphanumeric() || c == '-' { c } else { '-' })
            .collect();

        assert!(!stem.contains('/'));
        assert!(!stem.contains(".."));
    }

    #[test]
    fn parses_the_payload_the_extension_sends() {
        let json = r#"{"source":"ChatGPT","title":"A chat","text":"You:\nhi","capturedAt":1700000000000}"#;
        let parsed: Incoming = serde_json::from_str(json).unwrap();

        assert_eq!(parsed.source, "ChatGPT");
        assert_eq!(parsed.captured_at, 1_700_000_000_000);
        assert!(parsed.text.contains("hi"));
    }

    #[test]
    fn tolerates_a_missing_timestamp() {
        // Older extension builds may not send it. Losing the stamp is fine;
        // refusing the whole conversation over it is not.
        let parsed: Incoming =
            serde_json::from_str(r#"{"source":"Claude","title":"t","text":"x"}"#).unwrap();
        assert_eq!(parsed.captured_at, 0);
    }
}
