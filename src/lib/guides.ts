/*
 * The "move a conversation from X into Y" pages.
 *
 * ── Why there are four of these and not ninety ───────────────────────────────
 *
 * Sidq supports ten assistants, which is ninety ordered pairs. Generating all
 * ninety from one template is the textbook doorway page: many URLs, near
 * identical text, differing by a swapped noun. Google names that pattern in its
 * spam policies and the penalty lands on the domain rather than on the thin
 * pages.
 *
 * `Guide.tsx` already argued this and chose one hand-written page over twenty
 * generated ones. That decision stands. What changed is only which pairs are
 * worth their own URL: the original reasoning covered five browser assistants,
 * where the answer genuinely is the same page five times. Editors are a
 * different article, because the conversation is already on the disk and the
 * whole "export it first" half of the advice disappears.
 *
 * So: four pages, each covering one real transition, each with content written
 * for that transition rather than filled into a template. Layout is shared.
 * Words are not.
 *
 * ── What the facts come from ────────────────────────────────────────────────
 *
 * The disk/browser split is the one the FAQ already makes and the code already
 * makes — `work_history`, `cursor_history` and `codex_history` read transcripts
 * off disk; `assistants.rs` lists the ones that keep nothing readable. Nothing
 * here asserts a context window size or a per-product menu path, because those
 * change without warning and every claim on this site has to survive somebody
 * checking it.
 */

/** Where an assistant keeps what you said to it. */
export type Kind =
  /** Writes transcripts to disk. Readable immediately, including before install. */
  | "disk"
  /** Keeps nothing readable locally. Read as you use it; older history by export. */
  | "browser";

export interface Assistant {
  /** URL segment. Stable: these are indexed. */
  slug: string;
  name: string;
  kind: Kind;
}

const CHATGPT: Assistant = { slug: "chatgpt", name: "ChatGPT", kind: "browser" };
const CLAUDE: Assistant = { slug: "claude", name: "Claude", kind: "browser" };
const CURSOR: Assistant = { slug: "cursor", name: "Cursor", kind: "disk" };
const CLAUDE_CODE: Assistant = {
  slug: "claude-code",
  name: "Claude Code",
  kind: "disk",
};

/** One numbered step on a guide page. */
export interface Step {
  title: string;
  body: string[];
}

export interface Guide {
  route: string;
  from: Assistant;
  to: Assistant;
  title: string;
  description: string;
  /** The opening, written for this pair. Never a template. */
  intro: string;
  /** Worst to best, so the page is worth reading even by somebody who leaves. */
  steps: Step[];
}

/*
 * Every page puts the three routes that do not involve Sidq first, and means
 * it. A page that exists to sell something and pretends the free options are
 * bad is transparently that, and the person leaves before the part that is
 * true. The honest ordering is what makes it worth linking to.
 */
export const GUIDES: Guide[] = [
  {
    route: "/claude-to-chatgpt",
    from: CLAUDE,
    to: CHATGPT,
    title: "How to move a Claude conversation into ChatGPT",
    description:
      "Four ways to carry a Claude conversation into ChatGPT, worst to best. Claude keeps nothing readable on your computer, so the fast routes all cost something.",
    intro:
      "Both of these live in a browser and neither will hand the other anything. Claude keeps no readable copy on your machine, so every option below is really a question of how much of the conversation survives the trip.",
    steps: [
      {
        title: "Ask Claude to summarise it, then paste the summary",
        body: [
          "Fastest, and the one most people try first. It also throws away the thing that made the conversation worth moving: the wrong turns, the corrections, the constraint you mentioned once in the middle.",
          "A summary is Claude's account of the conversation, not the conversation. ChatGPT then works from a description of your work rather than your work.",
        ],
      },
      {
        title: "Select all, copy, paste",
        body: [
          "Keeps every word, which is the right instinct. The cost is that a browser conversation is a scrolling list of rendered messages, so you get the interface along with the text — the names, the button labels, the copy-code affordances — and the paste arrives without any of the structure that told you who said what.",
          "It also stops working exactly when it matters. A conversation long enough to be worth moving is usually long enough that pasting it fills most of what the next model can hold.",
        ],
      },
      {
        title: "Export your Claude data and find the conversation in the file",
        body: [
          "Claude will email you an archive of everything you have ever said to it. That is a complete and faithful copy, and it is the slowest possible way to move one conversation: you wait for an email, download an archive of your entire history, then go looking for the one thread you wanted.",
          "Worth doing once as a backup. Not worth doing when you are mid-problem and want to keep going.",
        ],
      },
      {
        title: "Hand it over in one keystroke",
        body: [
          "Sidq reads Claude in your own browser, as you use it, already signed in. Press the shortcut, pick the conversation, and it writes a file you attach in ChatGPT — the whole exchange, word for word, never summarised.",
          "Attaching rather than pasting is the part that matters at length: the file goes to retrieval instead of into the context window of every following turn.",
        ],
      },
    ],
  },
  {
    route: "/chatgpt-to-cursor",
    from: CHATGPT,
    to: CURSOR,
    title: "How to move a ChatGPT conversation into Cursor",
    description:
      "Carry a ChatGPT conversation into Cursor without re-explaining the problem. Why pasting into an editor behaves differently, and what to do instead.",
    intro:
      "This is the most common move there is: you reasoned something out in ChatGPT and now you want to build it where the code lives. The direction matters, because Cursor is reading a repository and ChatGPT was not.",
    steps: [
      {
        title: "Re-explain it in the Cursor chat",
        body: [
          "What almost everybody does, and it is worse than it feels. You retype the conclusion and lose the reasoning that produced it, so the first thing Cursor does is re-litigate a decision you already made.",
        ],
      },
      {
        title: "Copy the conversation and paste it into the chat",
        body: [
          "Better, and it runs into the editor's own budget. Cursor is already spending context on your files, so a pasted transcript competes with the code it is supposed to be editing — and the transcript wins, which is not what you wanted.",
        ],
      },
      {
        title: "Paste it into a file in the repository",
        body: [
          "A genuinely good trick, and the closest of the three to right. Drop the conversation into a markdown file and let the editor read it as part of the project.",
          "The catch is that it is now in your repository. It gets committed, or it gets gitignored and forgotten, and either way the conversation you carried across is sitting in the codebase as a document nobody will maintain.",
        ],
      },
      {
        title: "Hand it over as an attachment",
        body: [
          "Sidq writes the conversation to a file outside the project and puts it on your clipboard. Cursor takes it as an attachment, so it reaches retrieval rather than the context window, and your repository stays a repository.",
          "ChatGPT keeps nothing readable on your Mac, so Sidq reads it in your own browser as you use it. Nothing is uploaded and you never sign in to an assistant through Sidq.",
        ],
      },
    ],
  },
  {
    route: "/cursor-to-claude",
    from: CURSOR,
    to: CLAUDE,
    title: "How to move a Cursor conversation into Claude",
    description:
      "Take a Cursor chat into Claude when the reasoning gets hard. Cursor keeps its history on your own disk, so nothing has to be exported first.",
    intro:
      "The direction people take when an editor has stopped being the right tool: the problem turned out to be a design question rather than an edit, and you want a model with room to think about it. The good news is that Cursor already wrote the conversation to your disk.",
    steps: [
      {
        title: "Describe the problem again in Claude",
        body: [
          "Starting clean is sometimes right — a fresh framing can be worth more than the history. It is not right when the useful part is everything you already ruled out, which is exactly the case when you have been going back and forth in an editor.",
        ],
      },
      {
        title: "Copy the chat out of the sidebar",
        body: [
          "Workable for a short exchange. Cursor's chat panel is narrow and long, so selecting a real conversation means scrolling through it while holding a selection, and code blocks come across with the interface attached.",
        ],
      },
      {
        title: "Find the transcript on disk yourself",
        body: [
          "It is genuinely there. Cursor keeps its chat history in a local database, so unlike a browser assistant nothing needs exporting and nothing needs waiting for.",
          "Reading it by hand means locating the right file, understanding a schema nobody documented for you, and pulling one conversation out of it — for a conversation you wanted to move two minutes ago.",
        ],
      },
      {
        title: "Hand it over in one keystroke",
        body: [
          "This is the case Sidq is easiest about, because the work is already done. Cursor writes to your disk, so Sidq has read it already — including everything from before you installed Sidq.",
          "Press the shortcut, pick the conversation, paste into Claude. Nothing is uploaded: the reading happens between two programs on your own machine.",
        ],
      },
    ],
  },
  {
    route: "/claude-code-to-cursor",
    from: CLAUDE_CODE,
    to: CURSOR,
    title: "How to move a Claude Code conversation into Cursor",
    description:
      "Move a Claude Code session into Cursor with the reasoning intact. Both keep transcripts on your own disk, so neither needs an export.",
    intro:
      "Between two editors, which is what happens when you switch tools mid-project or when a team standardises on one. Both of these write their transcripts to your own disk, so this is the one move where nothing has to be exported, waited for, or reconstructed.",
    steps: [
      {
        title: "Start again and re-establish the context",
        body: [
          "The default, and the most expensive one. A Claude Code session that was worth continuing usually contains a long chain of decisions about a specific codebase, and re-establishing that by hand is most of an afternoon.",
        ],
      },
      {
        title: "Scroll back and copy what looks important",
        body: [
          "Sound in principle. In practice you are deciding what mattered while looking for it, and the thing that turns out to matter is usually a constraint mentioned once, early, which is exactly what scrolling misses.",
        ],
      },
      {
        title: "Point Cursor at the transcript files",
        body: [
          "Claude Code keeps its sessions as plain files on your disk, so you can genuinely open one and hand it over. This works and it is the reason the last option is possible at all.",
          "What it costs is that a raw session file is a machine's record rather than a conversation: tool calls, results, and internal blocks nobody typed, interleaved with what you actually said.",
        ],
      },
      {
        title: "Hand it over compiled",
        body: [
          "Sidq reads the same files and compiles them before they go anywhere: the harness blocks stripped, the exchange kept word for word, and where a session is longer than the destination can hold it carries what matters and names what it left, in the file, where the next assistant reads it.",
          "Nothing is summarised and nothing is uploaded. Both of these assistants are on your disk already, so the whole move happens on your machine.",
        ],
      },
    ],
  },
];

export const guideFor = (route: string): Guide | undefined =>
  GUIDES.find((g) => g.route === route);
