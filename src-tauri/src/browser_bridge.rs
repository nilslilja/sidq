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
    let Some((body, origin_ok)) = read_request(&mut stream) else {
        respond(&mut stream, 400, "bad request");
        return;
    };

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

/// Body plus whether the Origin header names a browser extension.
fn read_request(stream: &mut TcpStream) -> Option<(String, bool)> {
    let mut reader = BufReader::new(stream.try_clone().ok()?);
    let mut line = String::new();

    reader.read_line(&mut line).ok()?;
    if !line.starts_with("POST") {
        return None;
    }

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

    if length == 0 || length > MAX_BODY_BYTES {
        return None;
    }

    let mut body = vec![0u8; length];
    reader.read_exact(&mut body).ok()?;
    Some((String::from_utf8(body).ok()?, origin_ok))
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
