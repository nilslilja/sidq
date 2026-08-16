/*
 * The desktop bridge, for onboarding.
 *
 * Returns null in a browser tab, and every caller treats that as "this step is a
 * no-op here" rather than as an error. The flow has to be openable at
 * localhost:5173/welcome or it will never get iterated on.
 */

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
  /** Closes the picker. It dismisses itself the moment it has done the job. */
  hidePill: () => Promise<void>;
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
    hidePill: async () => {
      await invoke('hide_pill');
    },
    finish: async () => {
      await invoke('finish_onboarding');
    },
  };
}
