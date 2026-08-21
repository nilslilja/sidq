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

/** The pill has two sizes: a bar that is always there, and the picker. */
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
   * Shrinks the picker back to the bar.
   *
   * Named for what it used to do. Nothing is hidden any more: the bar stays on
   * screen, because a tool you cannot see is a tool you forget you installed.
   */
  hidePill: () => Promise<void>;
  /** Grows the bar into the picker. What clicking it does. */
  expandPill: () => Promise<void>;
  /**
   * Fires when Rust resizes the window between its two states.
   *
   * The shortcut is global, so Rust hears it first and the frontend has to be
   * told which of the two it is now drawing.
   */
  onPillState: (callback: (state: PillState) => void) => Promise<() => void>;
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
    hidePill: async () => {
      await invoke('hide_pill');
    },
    expandPill: async () => {
      await invoke('expand_pill');
    },
    onPillState: (callback) =>
      event.listen('pill:state', (e) => {
        if (e.payload === 'collapsed' || e.payload === 'expanded') callback(e.payload);
      }),
    finish: async () => {
      await invoke('finish_onboarding');
    },
  };
}
