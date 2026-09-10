/*
 * The desktop bridge, for onboarding.
 *
 * Returns null in a browser tab, and every caller treats that as "this step is a
 * no-op here" rather than as an error. The flow has to be openable at
 * localhost:5173/welcome or it will never get iterated on.
 */

/** One search result: the matching text plus where it came from. */
export interface SearchHit {
  sessionId: string;
  source: string;
  title: string;
  project: string;
  endedAt: number;
  /** The matching passage, with query terms wrapped in « ». */
  snippet: string;
}

/**
 * What came of asking for a handover.
 *
 * `limited` and a missing path are different failures and have to stay
 * distinguishable: one means the week is used up, the other means the
 * conversation could not be read, and telling somebody the wrong one sends them
 * to the wrong place.
 */
export interface HandoverResult {
  path: string | null;
  limited: boolean;
  used: number;
  cap: number | null;
  /**
   * Words in the file that was just written. Zero when nothing was.
   *
   * Words rather than bytes: nobody has a feel for 640 kB and everybody has one
   * for forty thousand words. It is the number that says what you did not have
   * to retype, which is the entire product in one figure.
   */
  words: number;
}

/** What the plan allows. For describing only; every limit is applied in Rust. */
/**
 * Your invite code and what it has earned.
 *
 * `problem` is a finished sentence to print as-is when the server could not be
 * reached or the account is not signed in. Everything else is zero in that
 * case, so a panel that renders the numbers without checking shows nothing
 * rather than something wrong.
 */
export interface InviteSummary {
  code: string;
  invited: number;
  bonus: number;
  redeemed: boolean;
  problem: string;
  /** What one invite is worth per week, sent by Rust so the offer cannot drift. */
  each: number;
  /** The ceiling on the bonus, for the same reason. */
  most: number;
  /** How many have used the code inside the current week. */
  thisWeek: number;
  /** How many are allowed to, per week. */
  perWeek: number;
  /** ISO time the oldest invite still being paid for lapses. Empty if none is. */
  expires: string;
}

/** A conversation the browser reader has just seen for the first time. */
export interface FoundConversation {
  /** Which assistant it came from, as Sidq records it: `chatgpt`, `gemini`… */
  source: string;
  /** The conversation's own title. */
  title: string;
  /** Always true on the wire today; kept so the meaning is on the type. */
  firstTime: boolean;
}

export interface PlanStatus {
  plan: string;
  handoversUsed: number;
  handoversCap: number | null;
  historyDays: number | null;
}

/**
 * One thing you keep telling assistants, quoted from your own messages.
 *
 * `conversations` is how many separate conversations you said some version of
 * it in. It is shown rather than hidden because it is the evidence: a rule you
 * stated in six conversations is a standing instruction, and one you stated
 * once is a decision you made that day.
 */
/** One conversation you handed to another assistant. */
export interface HandoverRecord {
  sessionId: string;
  /** Seconds since the epoch, which is what Rust records. */
  madeAt: number;
  title: string;
  source: string;
  project: string;
}

/** One thing somebody is working on, and how much of it there is. */
export interface ProjectRow {
  /** Full path, which is the identity. Two folders called Sidq are two things. */
  path: string;
  /** What a person calls it. */
  name: string;
  conversations: number;
  turns: number;
  minutes: number;
  started: number;
  touched: number;
}

/**
 * What Sidq knows about one project, quoted from the person's own words.
 *
 * Nothing here is generated. `decisions` carry the number of conversations they
 * were said in, for the same reason the profile does: the count is the evidence.
 */
export interface ProjectMemory {
  name: string;
  path: string;
  openedWith: string;
  lastOn: string;
  decisions: { text: string; conversations: number }[];
  recentWork: string[];
  assistants: string[];
  conversations: number;
  turns: number;
  minutes: number;
}

export interface ProfileFact {
  text: string;
  conversations: number;
}

/**
 * How this Mac shares standing instructions with the rest of a team.
 *
 * Duo works through a folder rather than a server: Sidq writes one small
 * Markdown file into somewhere that already syncs — iCloud Drive, Dropbox, a
 * git repo — and reads the files its teammates' copies wrote there. Nothing is
 * uploaded by Sidq, which is what keeps the claim on the front page true.
 */
export interface TeamSettings {
  /** The chosen folder, absent until one is picked. */
  folder: string | null;
  /** What teammates see this person called. */
  name: string;
  /** Everyone else in the folder, as [name, how many rules they share]. */
  members: [string, number][];
  /** How many of this person's own rules are published. */
  sharing: number;
  /** The one file this Mac writes. Named so it is obvious what leaves. */
  file: string;
  /** Whether the plan allows it. Rust decides this, not the window. */
  allowed: boolean;
}

/** A team somebody has already set up, in a folder this Mac can see. */
export interface FoundTeam {
  /** Full path, ready to hand straight to setTeamFolder. */
  folder: string;
  /** Where it is, as a person would say it. "Dropbox", "iCloud Drive". */
  inside: string;
  /** Who is already publishing there. */
  members: string[];
}

/** A project somebody on the team put in the shared folder. */
export interface SharedProject {
  who: string;
  name: string;
  when: number;
  path: string;
  mine: boolean;
}

/** A conversation somebody on the team put in the shared folder. */
export interface SharedHandover {
  /** Who shared it. */
  who: string;
  /** What the conversation was called. */
  title: string;
  /** Unix milliseconds. */
  when: number;
  /** Full path, which is what reads it back. */
  path: string;
  /** Whether this Mac is the one that shared it. */
  mine: boolean;
}

/** What the panel shows when the desktop app is not there to ask. */
export const NO_TEAM: TeamSettings = {
  folder: null,
  name: "Me",
  members: [],
  sharing: 0,
  file: "",
  allowed: false,
};

/**
 * The pill has two sizes: a bar that is always there, and the picker.
 *
 * Nothing announces which one is in force. The pill measures its own window,
 * because an announcement is a thing that can fail to arrive and a width is
 * not — see the note in Pill.tsx for the two ways it did fail.
 */
export type PillState = "collapsed" | "expanded";

export interface OnboardingBridge {
  openSignIn: () => Promise<void>;
  /** Fires when the browser hands the session back through sidq://. */
  onSignedIn: (callback: (urls: string[]) => void) => Promise<() => void>;
  /**
   * Fires when a global shortcut is pressed while setup is open.
   *
   * The shortcut steps cannot use a keydown listener: these are global
   * shortcuts, so Rust receives them instead of the focused window.
   */
  onShortcut: (
    event: "shortcut-pill",
    callback: () => void,
  ) => Promise<() => void>;
  /**
   * Rust saying something a window is showing has changed.
   *
   * Fired after a handover is recorded and after a sweep writes a conversation.
   * Named rather than a generic `listen`, for the same reason `onSignedIn` is:
   * a window should subscribe to a thing that happened, not to a string.
   */
  onChanged: (callback: () => void) => Promise<() => void>;
  /**
   * A conversation Sidq had never seen before, just read out of a browser.
   *
   * Separate from `onChanged` because it means something different. `onChanged`
   * says a number moved and a window should refetch; this says something
   * arrived, and it is the one event worth making a sound about.
   *
   * Only ever fired the first time a conversation is recorded. It grows every
   * few seconds while somebody types in it, and announcing that would be the
   * most irritating thing the product does.
   */
  onFound: (
    callback: (found: FoundConversation) => void,
  ) => Promise<() => void>;
  /**
   * Claude Code sessions found on disk.
   *
   * Used on the sources step to show a real count rather than claiming Sidq can
   * read something and leaving the person to take it on faith.
   */
  recentWork: (limit: number) => Promise<unknown[]>;
  /**
   * The compiled handover, for the clipboard.
   *
   * The same bytes the file contains. Copying used to send the raw transcript
   * with no framing, so a paste arrived at a fresh assistant as a wall of
   * dialogue out of nowhere.
   */
  handoverText: (args: {
    sessionId: string;
    source: string;
    resumePoint: string;
    when: string;
    project: string;
  }) => Promise<string | null>;
  /**
   * Write the conversation to a file in Downloads and return its path.
   *
   * Attaching that file costs far less than pasting, because it goes to
   * retrieval rather than into the context window of every following turn.
   */
  saveTranscript: (args: {
    sessionId: string;
    title: string;
    source: string;
    resumePoint: string;
    when: string;
    project: string;
  }) => Promise<HandoverResult>;
  /**
   * Search every indexed conversation.
   *
   * There is deliberately no way to say how far back to look. The history
   * window belongs to the plan, Rust works it out, and Rust applies it in SQL.
   * The second element is how many older matches were withheld — a real count
   * with none of their text, which is what the upgrade prompt shows.
   */
  searchConversations: (
    query: string,
    limit: number,
  ) => Promise<[SearchHit[], number]>;
  /**
   * What you keep telling assistants, and the same list ready to paste.
   *
   * Assembled on this machine out of sentences you typed. No model is involved,
   * so it costs nothing to run and cannot say anything you did not.
   */
  memoryProfile: () => Promise<[ProfileFact[], string]>;
  /** How this Mac is set up to share standing instructions with a team. */
  teamSettings: () => Promise<TeamSettings>;
  /**
   * Teams already set up in a folder this Mac can see.
   *
   * The second person to join should not have to be told which folder: the
   * first person's file is already sitting in one they can see, because that is
   * what shared means.
   */
  teamNearby: () => Promise<FoundTeam[]>;
  /** Show the team folder in Finder, so it can be shared with somebody. */
  revealTeamFolder: () => Promise<boolean>;
  /** Folders on this Mac that already sync somewhere, as [label, path]. */
  teamFolderOptions: () => Promise<[string, string][]>;
  /** Point Sidq at a folder, or pass null to stop sharing and withdraw the file. */
  setTeamFolder: (path: string | null) => Promise<boolean>;
  /** What teammates see this person called. */
  setTeamName: (name: string) => Promise<boolean>;
  /**
   * The two modifiers currently bound, as [grab, drop], ready to print.
   *
   * Asked rather than written down: which key does what is a setting, and copy
   * that names a key by hand starts teaching the wrong one the moment somebody
   * changes it.
   */
  tapKeys: () => Promise<[string, string]>;
  /**
   * Put one conversation in the team folder.
   *
   * Its own call rather than a flag on `saveTranscript`: sharing a whole
   * conversation with a colleague is a decision about that conversation, and it
   * should not be possible to make it by accident while doing something else.
   */
  shareHandover: (args: {
    sessionId: string;
    title: string;
    source: string;
    resumePoint: string;
    when: string;
    project: string;
  }) => Promise<boolean>;
  /** Everything anybody on the team has shared, newest first. */
  teamHandovers: () => Promise<SharedHandover[]>;
  /** Read one back, to put on the clipboard. */
  readTeamHandover: (path: string) => Promise<string | null>;
  /** What you have handed over, newest first. Read from the index, not invented. */
  recentHandovers: () => Promise<HandoverRecord[]>;
  /**
   * Import a conversation export from any assistant that publishes one.
   *
   * Claude, ChatGPT and Google Takeout, told apart by what is inside the file.
   * Resolves with how many conversations landed, and rejects with the reason it
   * could not be read — worth surfacing verbatim, because "that has no
   * conversations in it" is actionable and "something went wrong" is not.
   */
  importExport: (json: string) => Promise<number>;
  /**
   * What your assistants thought and did not say.
   *
   * Read out of transcripts already on this disk, so every character can be
   * checked against a file the person owns.
   */
  /**
   * Sites whose selectors have stopped matching, reported by the extension.
   *
   * A source stuck at zero because the site redesigned looks exactly like one
   * that has never been used, and only one of those is fixable.
   */
  staleSources: () => Promise<string[]>;
  /** May Sidq read assistant windows? Polled so the UI can turn green itself. */
  accessibilityGranted: () => Promise<boolean>;
  /** Show the macOS permission prompt. Returns immediately; the answer comes later. */
  requestAccessibility: () => Promise<void>;
  /** Open the pane, for anybody who dismissed the prompt. */
  openAccessibilitySettings: () => Promise<void>;
  /**
   * Post one notification, which is what makes macOS ask.
   *
   * There is deliberately no `notificationsGranted()` beside this. The plugin's
   * permission check is a stub on desktop that always answers granted, so a
   * screen built on it would tell somebody notifications work while they are
   * switched off. macOS only prompts on the first notification an app posts, so
   * sending one is both the ask and the only honest test: the person sees the
   * result on their own screen.
   */
  notifySample: () => Promise<boolean>;
  /**
   * The picker shortcut that actually registered with macOS.
   *
   * Global shortcuts are first-come, so the combination the product asks for is
   * not always the one it gets. Setup has to teach the key that works rather
   * than the key that was wanted, and `null` means every candidate was taken —
   * which the screen says outright instead of waiting on a key that will never
   * arrive.
   */
  pickerShortcut: () => Promise<string | null>;
  /**
   * Open the picker directly.
   *
   * The handover step needs a route that cannot fail the way a global shortcut
   * or an ungranted Accessibility permission can.
   */
  openPicker: () => Promise<void>;
  /** The Notifications pane, for anyone who declined and changed their mind. */
  openNotificationSettings: () => Promise<void>;
  /**
   * Whether the extension has reached the app, and how recently.
   *
   * Polled by the setup screen so it can turn green by itself. What makes
   * people abandon an install is finishing it and not knowing whether it
   * worked.
   */
  extensionStatus: () => Promise<{
    connected: boolean;
    secondsAgo: number | null;
  }>;
  /** Download it, unzip it, and reveal the folder Chrome asks for. */
  downloadExtension: () => Promise<string | null>;
  /** Assistants Sidq can open in its own window. Nothing to install. */
  assistantList: () => Promise<{ id: string; label: string }[]>;
  /**
   * Open one in the browser this Mac already uses.
   *
   * The default, because it is the only route where signing in works. Passkeys
   * need WebAuthn, WebAuthn in a webview needs an entitlement only the site
   * owner can grant, and AutoFill and password managers never reach a webview
   * at all.
   */
  openAssistantInBrowser: (id: string) => Promise<void>;
  /** Open one inside Sidq instead. Fine for email and password accounts. */
  openAssistant: (id: string) => Promise<void>;
  /** The plan, as Rust understands it. Read for wording, never for gating. */
  planStatus: () => Promise<PlanStatus>;
  /** Your invite code, how many used it, and the handovers that earned. */
  inviteSummary: () => Promise<InviteSummary>;
  /**
   * Use somebody else's code. Rejects with the server's own sentence, which is
   * written to be shown to the person who typed the code.
   */
  redeemInvite: (code: string) => Promise<number>;
  /**
   * Hand the signed-in session to Rust so it can confirm the plan itself.
   *
   * Without this the app would have to believe whatever tier the page claimed,
   * and the page is the one thing on this machine a person can rewrite.
   */
  setDesktopSession: (accessToken: string) => Promise<void>;
  /** Conversations and messages indexed. Real numbers, never placeholders. */
  indexStats: () => Promise<[number, number]>;
  /** Opens the window behind the pill. */
  openHome: () => Promise<void>;
  /**
   * Opens the plans, in a browser.
   *
   * Where somebody goes when the weekly limit refuses them. It used to open the
   * app window, which has no pricing in it, so the one moment there is a reason
   * to pay led to a search box.
   */
  openUpgrade: () => Promise<void>;
  /**
   * Shrinks the picker back to the bar.
   *
   * Named for what it used to do. Nothing is hidden any more: the bar stays on
   * screen, because a tool you cannot see is a tool you forget you installed.
   */
  hidePill: () => Promise<void>;
  /** Grows the bar into the picker. What clicking it does. */
  expandPill: () => Promise<void>;
  /**
   * Move the bar one step, in whole steps of a fixed size.
   *
   * `dx` and `dy` are directions, not distances: -1, 0 or 1. How far a step is
   * belongs to the window, not to the key that asked.
   */
  movePill: (dx: number, dy: number) => Promise<void>;
  /**
   * Which conversation the picker is pointing at, or null when it closes.
   *
   * The grab gesture reads it: with the picker open the row under the pointer
   * is what somebody means, and the newest conversation is only the right
   * answer when there is no window to aim with.
   */
  aimAt: (sessionId: string | null) => Promise<void>;
  /**
   * Tell the app which step is on screen.
   *
   * The picker shortcut has to behave differently depending on it: the step
   * that teaches the key swallows it and lights up, and the step that says
   * "press it, then pick a conversation" needs the picker to actually open.
   */
  setStep: (step: string | null) => Promise<void>;
  /**
   * Compile a conversation and leave it in an assistant's composer.
   *
   * Opens the assistant in Sidq's own window and puts the handover where it was
   * going anyway, so the last four steps — switch app, find the box, click it,
   * paste — stop existing. It does not press send: that message is the person's
   * to spend, and they may want a sentence in front of it.
   */
  handOverInto: (args: {
    sessionId: string;
    source: string;
    resumePoint: string;
    when: string;
    project: string;
    assistant: string;
  }) => Promise<void>;
  /** Everything Sidq can see being worked on, busiest first. */
  projects: () => Promise<ProjectRow[]>;
  /** What it knows about one of them. */
  projectMemory: (path: string) => Promise<ProjectMemory | null>;
  /**
   * Put a project's memory in front of an assistant.
   *
   * The difference from every handover before it: nothing had to be picked.
   */
  memoryInto: (path: string, assistant: string) => Promise<void>;
  /**
   * Put a project's memory in the team folder.
   *
   * What one person knows about a piece of work stops living only on their
   * laptop. Somebody joining reads what it started as and what was decided,
   * without having to ask them.
   */
  shareProject: (path: string) => Promise<boolean>;
  /** A project's memory as text, for the clipboard. */
  memoryText: (path: string) => Promise<string | null>;
  /*
   * Connecting Sidq to an assistant's MCP config.
   *
   * The difference this makes: every other way the memory reaches an AI needs
   * somebody to press a key and paste. Once a client is connected it asks for
   * the memory itself, so "what was I working on" is answered without anybody
   * carrying anything.
   */
  /*
   * Counting how the app is used. Off unless somebody ticks the box, and the
   * list is readable in Settings so the promise can be checked rather than
   * taken on trust.
   */
  counting: () => Promise<boolean>;
  setCounting: (on: boolean) => Promise<void>;
  /** Each event's name on the wire, and what it means, from Rust. */
  countedEvents: () => Promise<[string, string][]>;
  /**
   * Say a setup step was reached, by name.
   *
   * Rust looks the name up against its own list and drops anything it does not
   * recognise, so this cannot be used to write free text into the queue.
   */
  countSetupStep: (step: string) => Promise<void>;
  countReady: () => Promise<void>;
  /**
   * Publish one project's memory and get the link back.
   *
   * The only call in this interface that sends anything anywhere. Null when
   * the build has no backend, when nobody is signed in, or when it failed —
   * the window says the same thing for all three, because the answer is.
   */
  shareMemory: (path: string) => Promise<string | null>;
  unshareMemory: (path: string) => Promise<boolean>;
  /** The link this project is already published under, if any. */
  memoryLink: (path: string) => Promise<string | null>;
  /**
   * Start a team and get the code people join with.
   *
   * The team folder's name is the code, so joining never involves reading a
   * path down a phone. `null` when this Mac syncs no drive at all, which is the
   * one case the window has to explain rather than retry.
   */
  startTeam: () => Promise<string | null>;
  /**
   * Join by code.
   *
   * `understood` separates a mistyped code from a drive that has not synced
   * here yet. They need opposite advice, so they are not one boolean.
   */
  joinTeam: (code: string) => Promise<{ joined: boolean; understood: boolean }>;
  /** The code for the team this Mac is in, if any. */
  teamCode: () => Promise<string | null>;
  /**
   * The seats this account has paid for, minting any not yet created.
   *
   * Empty when the account has none, which is a state to render rather than a
   * failure to report.
   */
  teamSeats: () => Promise<{ code: string; taken: boolean }[]>;
  /**
   * Use a seat somebody sent. Resolves to the reason it failed, or null.
   *
   * The reason is the sentence the database raised, written for whoever just
   * typed the code in: "already used" and "does not exist" need different next
   * moves.
   */
  redeemTeamSeat: (code: string) => Promise<string | null>;
  mcpClients: () => Promise<[string, string, boolean][]>;
  connectMcp: (client: string) => Promise<string | null>;
  mcpConfigBlock: () => Promise<string | null>;
  /** Every project anybody on the team has shared. */
  teamProjects: () => Promise<SharedProject[]>;
  /** Read one back, to put in front of an assistant. */
  readTeamProject: (path: string) => Promise<string | null>;
  /** Closes first run and brings the card up. */
  finish: () => Promise<void>;
}

interface TauriCore {
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
}

interface TauriEvent {
  listen: (
    event: string,
    cb: (e: { payload: unknown }) => void,
  ) => Promise<() => void>;
}

export function desktopBridge(): OnboardingBridge | null {
  const tauri = (
    window as unknown as {
      __TAURI__?: { core?: TauriCore; event?: TauriEvent };
    }
  ).__TAURI__;
  const core = tauri?.core;
  const event = tauri?.event;
  if (!core || !event) return null;

  const invoke = core.invoke;

  return {
    openSignIn: async () => {
      await invoke("open_sign_in");
    },
    onSignedIn: (callback) =>
      event.listen("deep-link", (e) => {
        // Rust forwards the raw URLs. Anything that is not our auth callback is
        // ignored rather than treated as a successful sign-in.
        const urls = Array.isArray(e.payload) ? (e.payload as string[]) : [];
        const authUrls = urls.filter((u) => u.startsWith("sidq://auth"));
        if (authUrls.length > 0) callback(authUrls);
      }),
    onShortcut: (name, callback) => event.listen(name, () => callback()),
    onChanged: (callback) => event.listen("sidq:changed", () => callback()),
    onFound: (callback) =>
      event.listen("sidq:found", (e) => {
        // Rust's own struct, but it arrives as JSON over an event channel like
        // anything else, so it is checked rather than asserted.
        const payload = e.payload as Partial<FoundConversation> | null;
        if (payload && typeof payload.title === "string") {
          callback({
            source: String(payload.source ?? ""),
            title: payload.title,
            firstTime: payload.firstTime === true,
          });
        }
      }),
    recentWork: async (limit) => {
      const rows = await invoke("recent_work", { limit });
      return Array.isArray(rows) ? rows : [];
    },
    handoverText: async (args) => {
      const text = await invoke("handover_text", args);
      return typeof text === "string" ? text : null;
    },
    saveTranscript: async (args) => {
      const out = (await invoke(
        "save_transcript",
        args,
      )) as HandoverResult | null;
      return out ?? { path: null, limited: false, used: 0, cap: null, words: 0 };
    },
    searchConversations: async (query, limit) => {
      const out = await invoke("search_conversations", { query, limit });
      return Array.isArray(out) ? (out as [SearchHit[], number]) : [[], 0];
    },
    memoryProfile: async () => {
      const out = await invoke("memory_profile");
      return Array.isArray(out) ? (out as [ProfileFact[], string]) : [[], ""];
    },
    teamSettings: async () => {
      const out = (await invoke("team_settings")) as TeamSettings | null;
      return out ?? NO_TEAM;
    },
    teamNearby: async () => {
      const out = await invoke("team_nearby");
      return Array.isArray(out) ? (out as FoundTeam[]) : [];
    },
    revealTeamFolder: async () => (await invoke("reveal_team_folder")) === true,
    teamFolderOptions: async () => {
      const out = await invoke("team_folder_options");
      return Array.isArray(out) ? (out as [string, string][]) : [];
    },
    setTeamFolder: async (path) =>
      (await invoke("set_team_folder", { path })) === true,
    setTeamName: async (name) =>
      (await invoke("set_team_name", { name })) === true,
    tapKeys: async () => {
      const out = await invoke("tap_keys");
      return Array.isArray(out)
        ? (out as [string, string])
        : ["right ⌘", "left ⌃"];
    },
    shareHandover: async (args) =>
      (await invoke("share_handover", args)) === true,
    teamHandovers: async () => {
      const out = await invoke("team_handovers");
      return Array.isArray(out) ? (out as SharedHandover[]) : [];
    },
    readTeamHandover: async (path) => {
      const text = await invoke("read_team_handover", { path });
      return typeof text === "string" ? text : null;
    },
    recentHandovers: async () => {
      const out = await invoke("recent_handovers");
      return Array.isArray(out) ? (out as HandoverRecord[]) : [];
    },
    importExport: async (json) => {
      const count = await invoke("import_export", { json });
      return typeof count === "number" ? count : 0;
    },
    inviteSummary: async () => {
      const out = (await invoke("invite_summary")) as InviteSummary | null;
      return (
        out ?? {
          code: "",
          invited: 0,
          bonus: 0,
          redeemed: false,
          problem: "Sidq could not read your invites.",
          each: 0,
          most: 0,
          thisWeek: 0,
          perWeek: 0,
          expires: "",
        }
      );
    },
    redeemInvite: async (code) => {
      const bonus = await invoke("redeem_invite", { code });
      return typeof bonus === "number" ? bonus : 0;
    },
    accessibilityGranted: async () => {
      return (await invoke("accessibility_granted")) === true;
    },
    requestAccessibility: async () => {
      await invoke("request_accessibility");
    },
    openAccessibilitySettings: async () => {
      await invoke("open_accessibility_settings");
    },
    notifySample: async () => {
      return (await invoke("notify_sample")) as boolean;
    },
    pickerShortcut: async () => {
      return ((await invoke("picker_shortcut")) as string | null) ?? null;
    },
    openPicker: async () => {
      await invoke("open_picker");
    },
    openNotificationSettings: async () => {
      await invoke("open_notification_settings");
    },
    extensionStatus: async () => {
      const out = (await invoke("extension_status")) as {
        connected: boolean;
        secondsAgo: number | null;
      } | null;
      return out ?? { connected: false, secondsAgo: null };
    },
    downloadExtension: async () => {
      const path = await invoke("download_extension");
      return typeof path === "string" ? path : null;
    },
    staleSources: async () => {
      const rows = await invoke("stale_sources");
      return Array.isArray(rows) ? (rows as string[]) : [];
    },
    assistantList: async () => {
      const rows = await invoke("assistant_list");
      return Array.isArray(rows)
        ? (rows as { id: string; label: string }[])
        : [];
    },
    openAssistantInBrowser: async (id) => {
      await invoke("open_assistant_in_browser", { id });
    },
    openAssistant: async (id) => {
      await invoke("open_assistant", { id });
    },
    planStatus: async () => {
      const out = (await invoke("plan_status")) as PlanStatus | null;
      return (
        out ?? {
          plan: "free",
          handoversUsed: 0,
          handoversCap: null,
          historyDays: null,
        }
      );
    },
    setDesktopSession: async (accessToken) => {
      await invoke("set_desktop_session", { accessToken });
    },
    indexStats: async () => {
      const out = await invoke("index_stats");
      return Array.isArray(out) ? (out as [number, number]) : [0, 0];
    },
    openHome: async () => {
      await invoke("open_home");
    },
    openUpgrade: async () => {
      await invoke("open_upgrade");
    },
    hidePill: async () => {
      await invoke("hide_pill");
    },
    expandPill: async () => {
      await invoke("expand_pill");
    },
    movePill: async (dx: number, dy: number) => {
      await invoke("move_pill", { dx, dy });
    },
    aimAt: async (sessionId: string | null) => {
      await invoke("aim_at", { sessionId });
    },
    setStep: async (step: string | null) => {
      await invoke("set_onboarding_step", { step });
    },
    handOverInto: async (args) => {
      await invoke("hand_over_into", { ...args });
    },
    projects: async () => ((await invoke("projects")) as ProjectRow[]) ?? [],
    projectMemory: async (path: string) =>
      ((await invoke("project_memory", { path })) as ProjectMemory | null) ?? null,
    memoryInto: async (path: string, assistant: string) => {
      await invoke("memory_into", { path, assistant });
    },
    counting: async () => ((await invoke("counting")) as boolean) ?? false,
    setCounting: async (on: boolean) => {
      await invoke("set_counting", { on });
    },
    countedEvents: async () =>
      ((await invoke("counted_events")) as [string, string][]) ?? [],
    countSetupStep: async (step: string) => {
      await invoke("count_setup_step", { step });
    },
    countReady: async () => {
      await invoke("count_ready");
    },
    shareMemory: async (path: string) =>
      ((await invoke("share_memory", { path })) as string | null) ?? null,
    unshareMemory: async (path: string) =>
      ((await invoke("unshare_memory", { path })) as boolean) ?? false,
    memoryLink: async (path: string) =>
      ((await invoke("memory_link", { path })) as string | null) ?? null,
    startTeam: async () => ((await invoke("start_team")) as string | null) ?? null,
    joinTeam: async (code: string) =>
      (await invoke("join_team", { code })) as {
        joined: boolean;
        understood: boolean;
      },
    teamCode: async () => ((await invoke("team_code")) as string | null) ?? null,
    teamSeats: async () =>
      ((await invoke("team_seats")) as { code: string; taken: boolean }[]) ?? [],
    redeemTeamSeat: async (code: string) =>
      ((await invoke("redeem_team_seat", { code })) as string | null) ?? null,
    mcpClients: async () =>
      ((await invoke("mcp_clients")) as [string, string, boolean][]) ?? [],
    connectMcp: async (client: string) =>
      ((await invoke("connect_mcp", { client })) as string | null) ?? null,
    mcpConfigBlock: async () =>
      ((await invoke("mcp_config_block")) as string | null) ?? null,
    memoryText: async (path: string) =>
      ((await invoke("memory_text", { path })) as string | null) ?? null,
    shareProject: async (path: string) =>
      ((await invoke("share_project", { path })) as boolean) ?? false,
    teamProjects: async () =>
      ((await invoke("team_projects")) as SharedProject[]) ?? [],
    readTeamProject: async (path: string) =>
      ((await invoke("read_team_project", { path })) as string | null) ?? null,
    finish: async () => {
      await invoke("finish_onboarding");
    },
  };
}
