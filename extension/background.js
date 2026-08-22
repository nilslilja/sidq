/*
 * Getting the conversation from the tab to the Sidq app.
 *
 * ── Why localhost and not native messaging ───────────────────────────────────
 * Native messaging is the textbook answer and it is worse here. It needs a host
 * manifest installed into a per-browser directory, and that path differs for
 * Chrome, Edge, Brave, Arc, Opera, Vivaldi and Chromium — so "one extension for
 * every Chromium browser" would become seven install locations to get right, on
 * a machine nobody can debug remotely.
 *
 * A loopback POST to 127.0.0.1 does the same job in one line and is identical on
 * every browser. It is equally local: 127.0.0.1 never leaves the machine, cannot
 * be routed off it, and no server of ours is involved at any point. So "every
 * word stays on this Mac" remains literally true.
 *
 * The app only listens while it is running, so a handover with Sidq closed fails
 * with a message that says to open it rather than silently doing nothing.
 */

/** Where the Sidq app listens. Fixed so neither side has to discover the other. */
const SIDQ_ENDPOINT = 'http://127.0.0.1:17872/conversation';

/** Long enough for a slow machine, short enough not to look frozen. */
const TIMEOUT_MS = 4000;

async function readActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab.');

  // The content script is already injected by the manifest on supported sites;
  // this only asks it for what it can see.
  return chrome.tabs.sendMessage(tab.id, { type: 'sidq:read' }).catch(() => {
    throw new Error('This page is not a supported assistant, or needs a reload.');
  });
}

async function sendToSidq(payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(SIDQ_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Sidq refused it (${res.status}).`);
  } catch (err) {
    // An aborted or refused connection means the app is not running. That is the
    // common case and deserves the plain explanation rather than a network error.
    if (err instanceof Error && (err.name === 'AbortError' || err.message.includes('Failed to fetch'))) {
      throw new Error('Sidq is not running. Open it and try again.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function badge(text, colour) {
  void chrome.action.setBadgeText({ text });
  void chrome.action.setBadgeBackgroundColor({ color: colour });
  setTimeout(() => void chrome.action.setBadgeText({ text: '' }), 2500);
}

chrome.action.onClicked.addListener(async () => {
  try {
    const read = await readActiveTab();
    if (!read?.ok) throw new Error(read?.error ?? 'Nothing to read on this page.');

    await sendToSidq({
      source: read.source,
      title: read.title,
      url: read.url,
      text: read.text,
      capturedAt: Date.now(),
    });

    badge('✓', '#4F46E5');
  } catch (err) {
    badge('!', '#C2410C');
    // The only place this can be surfaced without a popup. Kept because the
    // messages above are the difference between "broken" and "open the app".
    console.error('[Sidq]', err instanceof Error ? err.message : err);
  }
});

/* ────────────────────────────────────────────────────────────────────────────
 * Messages from the chip on the page.
 *
 * The content script cannot reach 127.0.0.1 itself on every one of these sites:
 * a page's own connect-src is set by its Content-Security-Policy, and several
 * of these assistants set one strict enough to block it. The service worker has
 * no page CSP, so every call to the app goes through here.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Where the app answers when asked to show itself. */
const SIDQ_OPEN = 'http://127.0.0.1:17872/open';

/** And where it is told an assistant was opened. */
const SIDQ_OPENED = 'http://127.0.0.1:17872/opened';

/** Where a site that has redesigned out from under us is reported. */
const SIDQ_STALE = 'http://127.0.0.1:17872/stale';

async function tell(url, payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload ?? {}),
      signal: controller.signal,
    });
  } catch {
    // Sidq is closed. Nothing to do and nothing worth saying on somebody
    // else's page — the chip only ever appears when the app answered.
  } finally {
    clearTimeout(timer);
  }
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === 'sidq:capture' && message.payload) {
    /*
     * A conversation that grew, sent without anybody asking.
     *
     * Silent on both success and failure. This fires while somebody is in the
     * middle of working, so a badge on every exchange would be a flashing
     * toolbar all day, and a failure means Sidq is closed — which is not
     * something worth interrupting them about.
     */
    void tell(SIDQ_ENDPOINT, message.payload);
  }
  if (message?.type === 'sidq:stale' && message.source) {
    // Reported at most once a day per site: the watcher fires on a timer and
    // a site that has moved has moved for everybody, all day.
    const key = `stale:${message.source}`;
    void chrome.storage.local.get(key).then((seen) => {
      const today = new Date().toISOString().slice(0, 10);
      if (seen[key] === today) return;
      void chrome.storage.local.set({ [key]: today });
      void tell(SIDQ_STALE, { source: message.source });
    });
  }
  if (message?.type === 'sidq:open') {
    void tell(SIDQ_OPEN, { source: message.source ?? null });
  }
  if (message?.type === 'sidq:opened') {
    void tell(SIDQ_OPENED, { source: message.source ?? null });
  }
  // Nothing here answers asynchronously, so the channel closes immediately.
  void sender;
  return false;
});
