//! Everything Sidq knows how to do, with nothing about being an app.
//!
//! ── Why there is a library at all ────────────────────────────────────────────
//!
//! All twenty-four modules used to be declared in `main.rs`, which meant they
//! could only ever be reached by the desktop binary. Nothing else could use the
//! index, the memory, or the compiler, because in Rust a `mod` under a binary
//! crate root is unreachable from anywhere outside it.
//!
//! That was fine while the product was one window. It stopped being fine the
//! moment the memory became the thing worth having: a memory an assistant can
//! only receive by a person pressing a key and pasting is a memory with a human
//! in the loop of every single use.
//!
//! So the parts that are genuinely about conversations live here, and the parts
//! that are about being a Tauri application stay in the binary. `sidq-mcp`
//! links this and never links Tauri.
//!
//! ── Where the line is drawn ──────────────────────────────────────────────────
//!
//! A module belongs in the binary if it needs an `AppHandle`, a window, or the
//! event bus. That is four things: `assistants`, `browser_bridge`,
//! `pill_window`, and `background`. Everything else reads files, parses them,
//! or writes to SQLite, and none of that has an opinion about being an app.
//!
//! `indexer::sweep` is here for the same reason; only the timer around it that
//! announces to the UI stayed behind, as `background::spawn`.
//!
//! `screen_reader`, `double_tap` and `quick_grab` are macOS-only and say so at
//! the top of each file: they are absent off this platform rather than stubbed,
//! so a caller has to decide what to do instead of calling something that
//! silently never works. `login_item` is gated internally because it has a real
//! answer on every platform.
//!
//! That is a platform bound rather than an application bound. Everything the
//! product is actually about — reading transcripts off disk, compiling a
//! handover, the project memory, the MCP server — is portable, and is why
//! `cargo check --target x86_64-pc-windows-gnu` passes for this library.

pub mod capture;
pub mod codex_history;
pub mod compiler;
pub mod cursor_history;
pub mod double_tap;
pub mod entitlement;
pub mod imports;
pub mod index_store;
pub mod indexer;
pub mod invites;
pub mod login_item;
pub mod mcp;
pub mod mcp_setup;
pub mod memory;
pub mod profile;
pub mod quick_grab;
pub mod redact;
pub mod screen_reader;
pub mod selection;
pub mod team_context;
pub mod net;
pub mod sharing;
pub mod telemetry;
pub mod thread;
pub mod usage;
pub mod wall;
pub mod work_history;
