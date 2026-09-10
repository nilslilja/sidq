# sidq-mcp

An MCP server that gives an assistant the conversations already on your own
machine, and a memory of each project you work on — without any of it leaving
that machine.

Sidq reads what your assistants write to disk (Claude Code, Cursor, Windsurf,
VS Code, Codex) and what you say in a browser (ChatGPT, Claude, Gemini, Grok,
DeepSeek). `sidq-mcp` is the door onto that index for any MCP client.

## What it is for

Every assistant keeps memory inside its own walls. Move to a different one and
you start from nothing: you re-explain the project, the constraints, and the
three approaches you already ruled out. This server is the other direction —
the assistant asks for what you already established, and you type none of it.

## Install

The server ships inside the Sidq desktop app and Sidq writes the client config
for you: **What you're on → Let an AI ask for this itself**, or during setup on
the "Connect your AIs" step. Supported clients today are Claude Desktop, Claude
Code and Cursor.

To wire it by hand, point your client at the binary:

```json
{
  "mcpServers": {
    "sidq": { "command": "/Applications/Sidq.app/Contents/MacOS/sidq-mcp", "args": [] }
  }
}
```

Every MCP client reads its config once at launch, so restart the client
afterwards. A connection that worked looks identical to one that failed until
you do.

## Tools

| Tool | What it does |
|---|---|
| `list_projects` | The projects Sidq has seen, busiest first |
| `get_memory` | What a project is, what was asked first and last, and the rules that kept coming up |
| `how_i_work` | Standing instructions taken from things this person has actually repeated |
| `search_history` | Search every conversation, however far back it goes |
| `get_conversation` | One conversation, word for word |
| `note_decision` | Record a decision against a project, kept separate from what the person said |
| `publish_to_team` | Share a project's memory with the team (Team tier) |

## Resources

Each project's memory is also exposed as a resource, so a client that attaches
resources on its own can have it in context before the first token — with no
tool call and nobody deciding to fetch anything.

```
sidq://memory/<project path>    text/markdown
```

## Privacy

- **Nothing is uploaded.** The server reads a SQLite index on the local disk and
  speaks MCP over stdio. There is no network client compiled into it, and a test
  asserts that by reading its own source for `reqwest`, `ureq`, `TcpStream`,
  `TcpListener` and `hyper`.
- **No sign-in.** It never asks you to log in to an assistant and holds no
  credentials for any of them.
- **It only reads what is already on your disk**, written by the assistants you
  already use.

## Requirements

macOS today. The server itself is portable — it carries no Tauri and no macOS
frameworks, and builds for Linux and Windows with:

```bash
cargo build --release --no-default-features --bin sidq-mcp
```

What is macOS-only is the reading of browser assistants, which uses the
Accessibility API. Disk-based sources port.

## Links

- Product: https://www.sidq.tech
- Privacy: https://www.sidq.tech/privacy
