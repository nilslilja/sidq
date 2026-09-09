//! Sidq as something an assistant can ask, rather than something you paste into it.
//!
//! ── What this changes ────────────────────────────────────────────────────────
//!
//! Until now the memory reached an AI exactly one way: a person pressed a key,
//! Sidq put Markdown on the clipboard, and the person pasted it. That works and
//! it puts a human in the loop of every single use.
//!
//! Model Context Protocol is how an assistant calls a tool. A client — Claude
//! Desktop, Claude Code, Cursor — starts `sidq-mcp` itself and talks JSON-RPC to
//! it over stdin and stdout. So "what was I working on" is answered by the
//! assistant fetching the memory, with nobody carrying anything.
//!
//! ── Why this does not break the one promise ──────────────────────────────────
//!
//! stdio. No port, no socket, no HTTP client, nothing listening. The client
//! spawns a child process on the same machine and speaks to it down a pipe. The
//! conversations are read from the same SQLite file the app already keeps, which
//! `index_store` opens in WAL mode — that is what lets a second process read it
//! safely while the app is writing.
//!
//! Nothing is uploaded, and nothing can be: this crate has no HTTP client and
//! the library it links has no network code at all.
//!
//! ── Why the dispatch lives in the library ────────────────────────────────────
//!
//! The binary is a loop over stdin. Everything that decides anything is here, so
//! it can be tested by handing it a `Value` instead of spawning a process and
//! parsing what comes back. A protocol bug that only reproduces under a real
//! client is a bug nobody writes a test for.

use crate::index_store;
use serde_json::{json, Value};

/// The MCP revision this speaks. Sent back on `initialize` for negotiation.
pub const PROTOCOL: &str = "2025-06-18";

pub const SERVER_NAME: &str = "sidq";

/// How many results a search returns before it stops being a search.
const SEARCH_LIMIT: usize = 20;

/// Projects listed. Past this it is a file browser, not an answer.
const PROJECT_LIMIT: usize = 25;

/**
 * Every tool, with the schema a client needs to call it.
 *
 * The descriptions are written for a model choosing between tools, not for a
 * person reading docs: each one says when to reach for it, because the failure
 * mode is an assistant calling `search_history` for a question `get_memory`
 * answers in one call.
 */
pub fn tools() -> Value {
    json!([
        {
            "name": "list_projects",
            "description": "List the things this person is working on, busiest first, with how \
                             many conversations and how much time each has. Call this first when \
                             you do not know which project they mean.",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "get_memory",
            "description": "The full memory of one project: what it started as, where it got to, \
                             what was decided, and which assistants it was built in. Every line is \
                             quoted from the person's own words. Call this at the start of any \
                             conversation about work they have done before. Omit project_path to \
                             get the project they are most active in.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "project_path": {
                        "type": "string",
                        "description": "Absolute path, from list_projects. Optional."
                    }
                }
            }
        },
        {
            "name": "search_history",
            "description": "Full-text search across every AI conversation on this Mac, including \
                             ones with other assistants. Use it for 'have I asked this before', \
                             'what did I decide about X', or to find a conversation to open.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": { "type": "string", "description": "Words to look for." }
                },
                "required": ["query"]
            }
        },
        {
            "name": "get_conversation",
            "description": "One whole conversation, word for word, compiled the same way a Sidq \
                             handover is. Use after search_history when a result looks like the \
                             one that matters.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "session_id": { "type": "string", "description": "From search_history." }
                },
                "required": ["session_id"]
            }
        },
        {
            "name": "how_i_work",
            "description": "This person's standing instructions, taken from sentences they have \
                             typed to assistants more than once. Conventions, stack, and how they \
                             want things done. Call it before writing code or prose for them.",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "note_decision",
            "description": "Record something decided about a project so a later conversation, in \
                             any assistant, has it. Use for conclusions the person agreed to, not \
                             for your own suggestions. Stored separately from their own words and \
                             always shown as recorded by an assistant, never as something they \
                             said.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "project_path": { "type": "string" },
                    "text": {
                        "type": "string",
                        "description": "One sentence. What was decided, not why."
                    }
                },
                "required": ["project_path", "text"]
            }
        },
        {
            "name": "publish_to_team",
            "description": "Put a project's memory in the team's shared folder so colleagues \
                             inherit what was decided. Only works on a plan with team sharing and \
                             once a folder has been chosen in Sidq.",
            "inputSchema": {
                "type": "object",
                "properties": { "project_path": { "type": "string" } },
                "required": ["project_path"]
            }
        }
    ])
}

/**
 * Answer one JSON-RPC message.
 *
 * `None` means nothing goes back, which is correct and required for
 * notifications: a client that sends `notifications/initialized` and receives a
 * response for it is talking to a broken server.
 */
pub fn handle(conn: Option<&rusqlite::Connection>, request: &Value) -> Option<Value> {
    let method = request.get("method")?.as_str()?;
    let id = request.get("id").cloned();

    // No id means a notification. Acknowledge by doing the work and saying
    // nothing, never by inventing an id to reply to.
    if id.is_none() {
        return None;
    }
    let id = id.unwrap_or(Value::Null);

    let result = match method {
        "initialize" => Ok(json!({
            "protocolVersion": PROTOCOL,
            "capabilities": { "tools": { "listChanged": false } },
            "serverInfo": { "name": SERVER_NAME, "version": env!("CARGO_PKG_VERSION") },
            "instructions": "Sidq holds this person's AI conversations and a memory of each \
                             project, on their own machine. Call get_memory before working on \
                             something they have worked on before, and how_i_work before writing \
                             anything in their voice or their codebase."
        })),
        "tools/list" => Ok(json!({ "tools": tools() })),
        "tools/call" => call(conn, request.get("params")),
        // ping is in the spec and clients use it as a liveness check.
        "ping" => Ok(json!({})),
        other => Err(format!("unknown method: {other}")),
    };

    Some(match result {
        Ok(value) => json!({ "jsonrpc": "2.0", "id": id, "result": value }),
        Err(message) => json!({
            "jsonrpc": "2.0",
            "id": id,
            "error": { "code": -32601, "message": message }
        }),
    })
}

/// Wrap text the way MCP expects a tool result to look.
fn text(body: impl Into<String>) -> Value {
    json!({ "content": [{ "type": "text", "text": body.into() }] })
}

/**
 * A tool that could not do the thing, reported as a result rather than as a
 * protocol error.
 *
 * The distinction matters: a JSON-RPC error means the call was malformed and
 * some clients stop retrying the server. `isError` means the model asked for
 * something reasonable and it did not work, which is information the model can
 * act on — so the message is written to be read by one.
 */
fn failed(body: impl Into<String>) -> Value {
    json!({ "content": [{ "type": "text", "text": body.into() }], "isError": true })
}

fn call(conn: Option<&rusqlite::Connection>, params: Option<&Value>) -> Result<Value, String> {
    let params = params.ok_or("tools/call needs params")?;
    let name = params.get("name").and_then(Value::as_str).ok_or("no tool named")?;
    let args = params.get("arguments").cloned().unwrap_or_else(|| json!({}));

    let Some(conn) = conn else {
        return Ok(failed(
            "Sidq has not indexed anything on this machine yet. Open the Sidq app once and it \
             will read the conversations already on disk.",
        ));
    };

    let arg = |key: &str| -> Option<String> {
        args.get(key).and_then(Value::as_str).map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
    };

    Ok(match name {
        "list_projects" => list_projects(conn),
        "get_memory" => {
            // The other half of memory_taken. An assistant asking for it is a
            // different act from a person copying it, and the whole point of
            // the MCP server is to find out which one people actually use.
            crate::telemetry::record(
                conn,
                crate::telemetry::Event::MemoryTaken { by_assistant: true },
            );
            get_memory(conn, arg("project_path"))
        }
        "search_history" => match arg("query") {
            Some(q) => search(conn, &q),
            None => failed("search_history needs a query."),
        },
        "get_conversation" => match arg("session_id") {
            Some(id) => conversation(conn, &id),
            None => failed("get_conversation needs a session_id."),
        },
        "how_i_work" => how_i_work(conn),
        "note_decision" => match (arg("project_path"), arg("text")) {
            (Some(p), Some(t)) => note(conn, &p, &t),
            _ => failed("note_decision needs both project_path and text."),
        },
        "publish_to_team" => match arg("project_path") {
            Some(p) => publish(conn, &p),
            None => failed("publish_to_team needs a project_path."),
        },
        other => return Err(format!("unknown tool: {other}")),
    })
}

fn list_projects(conn: &rusqlite::Connection) -> Value {
    let rows = index_store::projects(conn, PROJECT_LIMIT);
    if rows.is_empty() {
        return text(
            "No projects yet. Sidq groups conversations by the folder they happened in, so this \
             fills up as work is done in an assistant that keeps transcripts on disk.",
        );
    }

    let mut out = String::from("Projects, busiest first:\n\n");
    for p in &rows {
        out.push_str(&format!(
            "- {} ({} conversations, {} exchanges, about {}h)\n  {}\n",
            p.name,
            p.conversations,
            p.turns,
            p.minutes / 60,
            p.path
        ));
    }
    text(out)
}

fn get_memory(conn: &rusqlite::Connection, path: Option<String>) -> Value {
    /*
     * No path means the busiest project, because that is almost always the one
     * being asked about and making the model call list_projects first to find
     * out costs a round trip for a question with one likely answer.
     */
    let path = match path {
        Some(p) => p,
        None => match index_store::projects(conn, 1).first() {
            Some(p) => p.path.clone(),
            None => return text("Nothing indexed yet, so there is no memory to read."),
        },
    };

    match crate::memory::build(conn, &path) {
        Some(m) => text(m.as_markdown()),
        None => failed(format!(
            "No project at {path}. Call list_projects for the paths Sidq actually knows about."
        )),
    }
}

fn search(conn: &rusqlite::Connection, query: &str) -> Value {
    // Everything, rather than a window. An assistant asking "have I discussed
    // this" means ever, and a silent seven-day cutoff answers a question it was
    // not asked. The app's own limit is a plan boundary, not a search one.
    let (hits, total) = index_store::search(conn, query, 0, SEARCH_LIMIT);
    if hits.is_empty() {
        return text(format!("Nothing in any conversation matches \"{query}\"."));
    }

    let mut out = format!("{total} conversations match \"{query}\". Showing {}:\n\n", hits.len());
    for h in &hits {
        out.push_str(&format!(
            "- [{}] {}\n  {}\n  session_id: {}\n",
            h.source,
            if h.title.is_empty() { "(untitled)" } else { &h.title },
            h.snippet.replace('\n', " "),
            h.session_id
        ));
    }
    text(out)
}

fn conversation(conn: &rusqlite::Connection, session_id: &str) -> Value {
    match index_store::session_transcript(conn, session_id) {
        Some(body) if !body.trim().is_empty() => text(body),
        _ => failed(format!(
            "No conversation with id {session_id}. Ids come from search_history."
        )),
    }
}

fn how_i_work(conn: &rusqlite::Connection) -> Value {
    let facts = crate::profile::build(&index_store::own_turns_by_project(conn, 4_000), 12);
    if facts.is_empty() {
        return text(
            "Nothing stated often enough yet. Sidq only reports an instruction once it has been \
             typed in more than one project, so that a one-off task never becomes a standing rule.",
        );
    }

    let mut out = String::from(
        "How this person works. Each line is a sentence they typed, with the number of separate \
         projects they said it in. Nothing here was written by a model.\n\n",
    );
    for f in &facts {
        out.push_str(&format!("- {} ({}x)\n", f.text, f.conversations));
    }
    text(out)
}

fn note(conn: &rusqlite::Connection, path: &str, body: &str) -> Value {
    if index_store::projects(conn, 200).iter().all(|p| p.path != path) {
        return failed(format!(
            "No project at {path}, so there is nowhere to record that. Call list_projects first."
        ));
    }

    match index_store::note(conn, path, body, "an assistant") {
        Some(()) => text(
            "Recorded. It will appear in this project's memory under \"Recorded by an \
             assistant\", kept separate from the person's own words.",
        ),
        None => failed("Could not record that."),
    }
}

fn publish(conn: &rusqlite::Connection, path: &str) -> Value {
    /*
     * Both gates the app applies, applied again here.
     *
     * A tool an assistant can call is a new way to reach an old command, and a
     * capability check that lives only in the window is not a capability check.
     */
    if !crate::entitlement::current(conn).may_share_with_team() {
        return failed(
            "Sharing with a team is on the Duo and Team plans. Nothing was published.",
        );
    }

    let Some(folder) = index_store::setting(conn, crate::team_context::FOLDER_KEY)
        .map(std::path::PathBuf::from)
        .filter(|p| p.is_dir())
    else {
        return failed(
            "No shared folder has been chosen. Pick one in Sidq under How you work, then try \
             again. Nothing was published.",
        );
    };

    let who = index_store::setting(conn, "team.name")
        .map(|n| n.trim().to_string())
        .filter(|n| !n.is_empty())
        .unwrap_or_else(|| "Me".to_string());

    let Some(built) = crate::memory::build(conn, path) else {
        return failed(format!("No project at {path}. Nothing was published."));
    };

    match crate::team_context::share_project(&folder, &who, &built.name, &built.as_markdown()) {
        Some(file) => text(format!(
            "Published {} to the team folder as {}. Teammates read it from their own Sidq.",
            built.name,
            file.file_name().unwrap_or_default().to_string_lossy()
        )),
        None => failed("Could not write to the team folder. Nothing was published."),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(method: &str, params: Value) -> Value {
        json!({ "jsonrpc": "2.0", "id": 1, "method": method, "params": params })
    }

    #[test]
    fn initialize_answers_with_the_protocol_it_speaks() {
        let out = handle(None, &request("initialize", json!({}))).expect("a reply");
        assert_eq!(out["result"]["protocolVersion"], PROTOCOL);
        assert_eq!(out["result"]["serverInfo"]["name"], SERVER_NAME);
        assert_eq!(out["jsonrpc"], "2.0");
    }

    #[test]
    fn a_notification_is_never_answered() {
        /*
         * A message with no id is a notification, and replying to one is a
         * protocol violation that some clients treat as a fatal handshake
         * error. `notifications/initialized` arrives on every single startup,
         * so getting this wrong breaks the server for everybody, always.
         */
        let note = json!({ "jsonrpc": "2.0", "method": "notifications/initialized" });
        assert!(handle(None, &note).is_none());
    }

    #[test]
    fn every_tool_has_a_schema_a_client_can_call() {
        let tools = tools();
        let list = tools.as_array().expect("an array");
        assert!(!list.is_empty());

        for tool in list {
            assert!(tool["name"].as_str().is_some_and(|n| !n.is_empty()));
            // A description is what a model picks between tools on. An empty one
            // makes the tool unreachable however well it works.
            assert!(tool["description"].as_str().is_some_and(|d| d.len() > 40));
            assert_eq!(tool["inputSchema"]["type"], "object");
        }
    }

    #[test]
    fn required_arguments_are_declared_as_required() {
        // A model reads the schema, not the description. A required argument
        // that is not marked required is a tool that gets called without it.
        let tools = tools();
        for name in ["search_history", "get_conversation", "note_decision"] {
            let tool = tools
                .as_array()
                .unwrap()
                .iter()
                .find(|t| t["name"] == name)
                .unwrap_or_else(|| panic!("{name} is missing"));
            assert!(
                tool["inputSchema"]["required"].as_array().is_some_and(|r| !r.is_empty()),
                "{name} declares no required arguments"
            );
        }
    }

    #[test]
    fn an_unknown_method_is_an_error_rather_than_a_silence() {
        let out = handle(None, &request("nonsense/method", json!({}))).expect("a reply");
        assert_eq!(out["error"]["code"], -32601);
        assert!(out.get("result").is_none());
    }

    #[test]
    fn with_no_index_a_tool_call_explains_itself_instead_of_failing() {
        /*
         * Somebody can connect this to Claude Desktop before ever opening the
         * Sidq app. A protocol error there reads as a broken server; a result
         * saying what to do reads as an answer, and the model can relay it.
         */
        let out = handle(None, &request("tools/call", json!({ "name": "list_projects" })))
            .expect("a reply");
        assert_eq!(out["result"]["isError"], true);
        let body = out["result"]["content"][0]["text"].as_str().unwrap();
        assert!(body.contains("Open the Sidq app"));
    }

    #[test]
    fn a_ping_is_answered_because_clients_use_it_to_check_we_are_alive() {
        let out = handle(None, &request("ping", json!({}))).expect("a reply");
        assert!(out.get("result").is_some());
    }

    #[test]
    fn nothing_here_can_reach_the_network() {
        /*
         * The product's whole claim. This file is where that would break first,
         * because a tool server is exactly the shape of thing somebody later
         * adds a fetch to.
         */
        let whole = include_str!("mcp.rs");
        /*
         * Only the code, not this module. `include_str!` reads the file it is
         * written in, so the first version of this test failed on its own list
         * of banned words — which is funny once and a false alarm forever.
         */
        let code = whole.split("#[cfg(test)]").next().unwrap_or(whole);
        for banned in ["reqwest", "ureq", "TcpStream", "TcpListener", "hyper::"] {
            assert!(!code.contains(banned), "{banned} appeared in the MCP server");
        }
    }
}
