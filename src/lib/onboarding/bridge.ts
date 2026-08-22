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
}

/** What the plan allows. For describing only; every limit is applied in Rust. */
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
/** One thing an assistant thought about your work and did not say. */
export interface Withheld {
  sessionId: string;
  title: string;
  source: string;
  /** The reasoning, verbatim. Never paraphrased, never generated. */
  text: string;
  chars: number;
}

/** The gap between what was written about your work and what you were shown. */
export interface WithheldReport {
  shown: number;
  hidden: number;
  thoughts: number;
  conversations: number;
  excerpts: Withheld[];
  /** Share never shown, 0 to 1. */
  share: number;
}

/** One conversation you handed to another assistant. */
export interface HandoverRecord {
  sessionId: string;
  /** Seconds since the epoch, which is what Rust records. */
  madeAt: number;
  title: string;
  source: string;
  project: string;
}

export interface ProfileFact {
  text: string;
  conversations: number;
}

/**
 * The pill has two sizes: a bar that is always there, and the picker.
 *
 * Nothing announces which one is in force. The pill measures its own window,
 * because an announcement is a thing that can fail to arrive and a width is
 * not — see the note in Pill.tsx for the two ways it did fail.
 */
export type PillState = 'collapsed' | 'expanded';

export interface OnboardingBridge {
  setAutostart: (enabled: boolean) => Promise<void>;
  openSignIn: () => Promise<void>;
  /**
   * Opens the browser at the page that connects the web assistants.
   *
   * ChatGPT, Gemini and Perplexity keep nothing readable on this Mac, so the
   * only honest way in is the browser itself.
   */
  openConnectPage: () => Promise<void>;
  /** Fires when the browser hands the session back through sidq://. */
  onSignedIn: (callback: (urls: string[]) => void) => Promise<() => void>;
  /**
   * Fires when a global shortcut is pressed while setup is open.
   *
   * The shortcut steps cannot use a keydown listener: these are global
   * shortcuts, so Rust receives them instead of the focused window.
   */
  onShortcut: (event: 'shortcut-pill', callback: () => void) => Promise<() => void>;
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
   * The whole conversation for one session, to hand to another assistant.
   *
   * Verbatim, not summarised: a summary is what any assistant can already
   * produce on request, and it drops the corrections and reversals that are the
   * reason a handover works at all. Null when the transcript cannot be read.
   */
  sessionTranscript: (sessionId: string) => Promise<string | null>;
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
  searchConversations: (query: string, limit: number) => Promise<[SearchHit[], number]>;
  /**
   * What you keep telling assistants, and the same list ready to paste.
   *
   * Assembled on this machine out of sentences you typed. No model is involved,
   * so it costs nothing to run and cannot say anything you did not.
   */
  memoryProfile: () => Promise<[ProfileFact[], string]>;
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
  withheldReport: () => Promise<WithheldReport>;
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
  /** Closes first run and brings the card up. */
  finish: () => Promise<void>;
}

interface TauriCore {
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
}

interface TauriEvent {
  listen: (event: string, cb: (e: { payload: unknown }) => void) => Promise<() => void>;
}

export function desktopBridge(): OnboardingBridge | null {
  const tauri = (window as unknown as {
    __TAURI__?: { core?: TauriCore; event?: TauriEvent };
  }).__TAURI__;
  const core = tauri?.core;
  const event = tauri?.event;
  if (!core || !event) return null;

  const invoke = core.invoke;

  return {
    setAutostart: async (enabled) => {
      await invoke('set_autostart', { enabled });
    },
    openSignIn: async () => {
      await invoke('open_sign_in');
    },
    openConnectPage: async () => {
      await invoke('open_connect_page');
    },
    onSignedIn: (callback) =>
      event.listen('deep-link', (e) => {
        // Rust forwards the raw URLs. Anything that is not our auth callback is
        // ignored rather than treated as a successful sign-in.
        const urls = Array.isArray(e.payload) ? (e.payload as string[]) : [];
        const authUrls = urls.filter((u) => u.startsWith('sidq://auth'));
        if (authUrls.length > 0) callback(authUrls);
      }),
    onShortcut: (name, callback) => event.listen(name, () => callback()),
    recentWork: async (limit) => {
      const rows = await invoke('recent_work', { limit });
      return Array.isArray(rows) ? rows : [];
    },
    handoverText: async (args) => {
      const text = await invoke('handover_text', args);
      return typeof text === 'string' ? text : null;
    },
    sessionTranscript: async (sessionId) => {
      const text = await invoke('session_transcript', { sessionId });
      return typeof text === 'string' ? text : null;
    },
    saveTranscript: async (args) => {
      const out = (await invoke('save_transcript', args)) as HandoverResult | null;
      return out ?? { path: null, limited: false, used: 0, cap: null };
    },
    searchConversations: async (query, limit) => {
      const out = await invoke('search_conversations', { query, limit });
      return Array.isArray(out) ? (out as [SearchHit[], number]) : [[], 0];
    },
    memoryProfile: async () => {
      const out = await invoke('memory_profile');
      return Array.isArray(out) ? (out as [ProfileFact[], string]) : [[], ''];
    },
    recentHandovers: async () => {
      const out = await invoke('recent_handovers');
      return Array.isArray(out) ? (out as HandoverRecord[]) : [];
    },
    importExport: async (json) => {
      const count = await invoke('import_export', { json });
      return typeof count === 'number' ? count : 0;
    },
    withheldReport: async () => {
      const out = (await invoke('withheld_report')) as WithheldReport | null;
      return (
        out ?? { shown: 0, hidden: 0, thoughts: 0, conversations: 0, excerpts: [], share: 0 }
      );
    },
    assistantList: async () => {
      const rows = await invoke('assistant_list');
      return Array.isArray(rows) ? (rows as { id: string; label: string }[]) : [];
    },
    openAssistantInBrowser: async (id) => {
      await invoke('open_assistant_in_browser', { id });
    },
    openAssistant: async (id) => {
      await invoke('open_assistant', { id });
    },
    planStatus: async () => {
      const out = (await invoke('plan_status')) as PlanStatus | null;
      return out ?? { plan: 'free', handoversUsed: 0, handoversCap: null, historyDays: null };
    },
    setDesktopSession: async (accessToken) => {
      await invoke('set_desktop_session', { accessToken });
    },
    indexStats: async () => {
      const out = await invoke('index_stats');
      return Array.isArray(out) ? (out as [number, number]) : [0, 0];
    },
    openHome: async () => {
      await invoke('open_home');
    },
    openUpgrade: async () => {
      await invoke('open_upgrade');
    },
    hidePill: async () => {
      await invoke('hide_pill');
    },
    expandPill: async () => {
      await invoke('expand_pill');
    },
    finish: async () => {
      await invoke('finish_onboarding');
    },
  };
}
