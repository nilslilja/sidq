//! Sidq as an MCP server: one loop over stdin, and nothing else.
//!
//! Every decision this makes is in `sidq::mcp`, which is testable without a
//! process. What is here is the transport and the two rules that go with it.
//!
//! ── Rule one: stdout carries the protocol and nothing else ───────────────────
//!
//! An MCP client parses stdout as a stream of JSON-RPC messages. One stray
//! `println!` — a debug line, a warning, a panic message — is a parse error, and
//! the client's report of it is "the server crashed". So diagnostics go to
//! stderr, which clients log and ignore.
//!
//! ── Rule two: never exit on a bad message ────────────────────────────────────
//!
//! A malformed line gets an error response, not a shutdown. The process ends
//! when stdin closes, because that is the client saying it is done. Anything
//! else and a single unlucky message takes the server down for the session.

use std::io::{BufRead, Write};

fn main() {
    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout();

    /*
     * One connection for the process lifetime, opened lazily.
     *
     * `index_store::open` runs the migrations, so opening it here means a
     * client started before the app has ever run still gets a usable database
     * rather than an error. If it cannot be opened at all — no disk access, no
     * home directory — every tool reports that in words the model can relay,
     * which is what `mcp::handle` does with `None`.
     */
    let conn = sidq::index_store::open();
    if conn.is_none() {
        eprintln!("sidq-mcp: no index available; tools will say so rather than fail");
    }

    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let reply = match serde_json::from_str::<serde_json::Value>(line) {
            Ok(request) => sidq::mcp::handle(conn.as_ref(), &request),
            Err(e) => {
                eprintln!("sidq-mcp: unparseable message: {e}");
                // -32700 is JSON-RPC's parse error. A client that sent
                // rubbish gets told so and stays connected.
                Some(serde_json::json!({
                    "jsonrpc": "2.0",
                    "id": serde_json::Value::Null,
                    "error": { "code": -32700, "message": "invalid JSON" }
                }))
            }
        };

        // A notification produced no reply, and writing anything for one is the
        // protocol violation this whole file is arranged to avoid.
        let Some(reply) = reply else { continue };

        if writeln!(stdout, "{reply}").is_err() || stdout.flush().is_err() {
            // The client hung up mid-write. Nothing to report it to.
            break;
        }
    }
}
