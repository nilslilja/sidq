/*
 * Reading the conversation on the page you are already looking at.
 *
 * This exists because ChatGPT, Gemini, claude.ai and Perplexity keep nothing
 * readable on the machine. Their desktop stores are encrypted and the web
 * versions write nothing durable to disk, which was checked rather than assumed.
 * The only place those conversations exist in the clear is the tab in front of
 * you, so that is where they get read from.
 *
 * ── Why per-site selectors and not one clever heuristic ──────────────────────
 * A generic "find the chat bubbles" pass looks elegant for an afternoon and then
 * silently returns a navigation sidebar as somebody's conversation. Each site
 * gets an explicit list of selectors, tried in order, and if none of them match
 * the answer is "I could not read this" rather than a guess. A wrong transcript
 * is far worse than no transcript: it would be handed to another model as fact.
 *
 * Selectors do rot. These sites ship redesigns without warning, which is why
 * every site has several candidates and why failure is loud.
 */

/** Anything shorter than this is a label, a timestamp or a button, not a turn. */
const MIN_TURN_CHARS = 2;

/*
 * Site definitions.
 *
 * `turns` returns elements in document order. `role` decides who said it. Where
 * a site marks the author on an attribute that is the cheapest correct signal;
 * where it does not, position in an alternating list is the fallback, and that
 * is noted per site because it is the part most likely to be wrong.
 */
const SITES = [
  {
    match: /^(chatgpt\.com|chat\.openai\.com)$/,
    name: 'ChatGPT',
    turnSelectors: ['[data-message-author-role]', 'article[data-testid^="conversation-turn"]'],
    role: (el) => {
      const attr = el.getAttribute?.('data-message-author-role');
      if (attr) return attr === 'user' ? 'You' : 'Assistant';
      // Fallback for the article shape, which puts the role in a nested node.
      const nested = el.querySelector?.('[data-message-author-role]');
      const role = nested?.getAttribute('data-message-author-role');
      return role === 'user' ? 'You' : 'Assistant';
    },
  },
  {
    match: /^claude\.ai$/,
    name: 'Claude',
    turnSelectors: ['[data-testid="user-message"], .font-claude-message', '[data-test-render-count]'],
    role: (el) =>
      el.matches?.('[data-testid="user-message"]') || el.querySelector?.('[data-testid="user-message"]')
        ? 'You'
        : 'Assistant',
  },
  {
    match: /^gemini\.google\.com$/,
    name: 'Gemini',
    turnSelectors: ['user-query, model-response', '.query-text, .model-response-text'],
    role: (el) =>
      el.tagName?.toLowerCase() === 'user-query' || el.classList?.contains('query-text')
        ? 'You'
        : 'Assistant',
  },
  {
    match: /^(grok\.com|x\.com)$/,
    name: 'Grok',
    turnSelectors: ['[class*="message-bubble"]', '.items-end, .items-start'],
    // Grok marks the person's turn by alignment rather than an attribute, which
    // is fragile and the honest best available.
    role: (el) =>
      el.className?.includes?.('items-end') || el.closest?.('.items-end') ? 'You' : 'Assistant',
  },
  {
    match: /^chat\.deepseek\.com$/,
    name: 'DeepSeek',
    turnSelectors: ['[class*="_4f9bf79"], [class*="ds-markdown"]', '.fbb737a4'],
    role: (el) => (el.className?.includes?.('fbb737a4') ? 'You' : 'Assistant'),
  },
  {
    match: /^chat\.mistral\.ai$/,
    name: 'Mistral',
    turnSelectors: ['[data-message-author-role]', '[class*="message"]'],
    role: (el) => {
      const attr = el.getAttribute?.('data-message-author-role');
      return attr === 'user' ? 'You' : 'Assistant';
    },
  },
  {
    match: /^github\.com$/,
    name: 'Copilot',
    // Only the Copilot chat path, not every page on github.com.
    pathMatch: /^\/copilot/,
    turnSelectors: ['[data-testid="chat-message"]', '[class*="ChatMessage"]'],
    role: (el) =>
      el.querySelector?.('[data-testid="user-avatar"]') || el.className?.includes?.('user')
        ? 'You'
        : 'Assistant',
  },
  {
    match: /^www\.perplexity\.ai$/,
    name: 'Perplexity',
    turnSelectors: ['[data-testid="thread-item"]', '.prose'],
    // Perplexity does not mark authorship on the node, and a thread item holds
    // the question and the answer together, so this reads as one block per
    // exchange rather than pretending to know which half is which.
    role: () => 'Exchange',
  },
];

/*
 * ── Selectors that can be fixed without a store review ───────────────────────
 * Every one of these sites redesigns without warning, and some of the hooks
 * below are hashed build classes that change on the next deploy. Shipping the
 * table only inside the extension means every breakage costs a resubmission and
 * a week of review while the product is silently reading nothing.
 *
 * So an override is fetched from Sidq's own site and cached. A breakage becomes
 * a file we edit; the extension picks it up within the day. If the fetch fails,
 * or the site is unreachable, or the payload is nonsense, the table compiled in
 * above stands.
 */
const OVERRIDE_URL = 'https://www.sidq.tech/extension/sources.json';
const OVERRIDE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

async function applyOverrides() {
  try {
    const cached = await chrome.storage.local.get(['sources', 'sourcesAt']);
    const fresh = cached.sourcesAt && Date.now() - cached.sourcesAt < OVERRIDE_MAX_AGE_MS;

    let table = fresh ? cached.sources : null;
    if (!table) {
      const res = await fetch(OVERRIDE_URL, { cache: 'no-cache' });
      if (!res.ok) return;
      table = await res.json();
      await chrome.storage.local.set({ sources: table, sourcesAt: Date.now() });
    }

    for (const def of SITES) {
      const patch = table?.[def.name];
      // Only the selectors. Nothing fetched is allowed to become code: `role`
      // stays a function compiled into the extension, because a remote file
      // that can define behaviour is a remote file that can do anything.
      if (Array.isArray(patch?.turnSelectors) && patch.turnSelectors.every((x) => typeof x === 'string')) {
        def.turnSelectors = patch.turnSelectors;
      }
    }
  } catch {
    // Offline, blocked, or malformed. The compiled table is already correct
    // for every site that has not moved, so there is nothing to report.
  }
}

function site() {
  return (
    SITES.find(
      (s) =>
        s.match.test(location.hostname) &&
        // github.com is mostly not a chat, so Copilot narrows by path too.
        (!s.pathMatch || s.pathMatch.test(location.pathname)),
    ) ?? null
  );
}

/** The first selector that actually finds something. */
function findTurns(def) {
  for (const selector of def.turnSelectors) {
    const found = Array.from(document.querySelectorAll(selector));
    if (found.length > 0) return found;
  }
  return [];
}

/**
 * The conversation as plain text, in order.
 *
 * Returns null rather than an empty string when nothing matched, so the caller
 * can tell "this page has no conversation" from "the selectors are stale".
 */
function readConversation() {
  const def = site();
  if (!def) return null;

  const turns = findTurns(def);
  if (turns.length === 0) return null;

  const lines = [];
  let lastRole = null;

  for (const el of turns) {
    // innerText, not textContent: it respects what is visually hidden and it
    // keeps the line breaks a person actually sees, which matters for code.
    const text = (el.innerText ?? '').trim();
    if (text.length < MIN_TURN_CHARS) continue;

    const role = def.role(el) ?? 'Exchange';

    /*
     * Collapse consecutive turns from the same speaker.
     *
     * Every one of these sites splits a single reply across several nodes when
     * it contains code or a list. Left alone that produces "Assistant:" a dozen
     * times inside one answer, which reads as a dozen separate replies to the
     * model receiving it.
     */
    if (role === lastRole) {
      lines[lines.length - 1] += `\n${text}`;
    } else {
      lines.push(`${role}:\n${text}`);
      lastRole = role;
    }
  }

  return lines.length > 0 ? lines.join('\n\n') : null;
}

/** Best available name for this conversation. */
function readTitle() {
  const fromTab = document.title
    .replace(/\s*[|\-–]\s*(ChatGPT|Claude|Gemini|Perplexity|Grok|DeepSeek|Mistral|Le Chat|Copilot|GitHub).*$/i, '')
    .trim();
  return fromTab || `${site()?.name ?? 'Conversation'} chat`;
}

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message?.type !== 'sidq:read') return false;

  const def = site();
  const text = readConversation();

  respond({
    ok: Boolean(text),
    source: def?.name ?? null,
    title: readTitle(),
    url: location.href,
    text,
    // Said plainly so the failure is diagnosable rather than mysterious. These
    // sites redesign without notice and this is the message that will explain
    // it when they do.
    error: text ? null : 'Could not find a conversation on this page. Sidq may need updating for a site redesign.',
  });

  // Keeps the message channel open for the async respond above.
  return true;
});

/* ────────────────────────────────────────────────────────────────────────────
 * The chip.
 *
 * Everything above this line is pull-only: it waits to be asked, and until
 * somebody clicks the toolbar button it does nothing at all. Which means the
 * one moment Sidq exists for — a blank composer, with two hundred conversations
 * sitting on the same machine that this assistant cannot see — passed in
 * silence every single time.
 *
 * So on an empty conversation the chip appears and says what is available. Not
 * a nag: it goes away when dismissed, per site, and it never shows up in the
 * middle of a conversation you are already having.
 *
 * ── Why a shadow root ────────────────────────────────────────────────────────
 * This is somebody else's document. A plain div inherits their CSS, gets caught
 * by their global selectors, and can be restyled into nonsense by a deploy we
 * do not control — and our styles can do the same to them. A closed shadow root
 * means neither side can reach the other.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Where the app answers. Same port as the POST path. */
const SIDQ_STATUS = 'http://127.0.0.1:17872/status';

/** How long to wait for the app before giving up and staying quiet. */
const STATUS_TIMEOUT_MS = 1500;

/** Poll for a while: these are single-page apps and the composer arrives late. */
const SETTLE_MS = 1200;

const HOST_ID = 'sidq-chip-host';

/** Is this a fresh conversation, or one already under way? */
function isBlankConversation() {
  const def = site();
  if (!def) return false;
  return findTurns(def).length === 0;
}

async function askApp() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STATUS_TIMEOUT_MS);
  try {
    const res = await fetch(SIDQ_STATUS, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    // Sidq is not running. Say nothing at all: an assistant's page is not the
    // place to advertise that another app of ours is closed.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Dismissal is per site and sticks, so "no" means no on this one. */
async function isDismissed() {
  const key = `dismissed:${location.hostname}`;
  const stored = await chrome.storage.local.get(key);
  return Boolean(stored[key]);
}

function dismiss() {
  void chrome.storage.local.set({ [`dismissed:${location.hostname}`]: true });
  document.getElementById(HOST_ID)?.remove();
}

/**
 * Put the text where the person was about to type.
 *
 * This is the whole trick, and it is why a copy button would not do. Every one
 * of these sites uses either a textarea or a contenteditable, and both need to
 * be told the value changed in the way their own framework listens for, or the
 * send button stays disabled over text that is visibly in the box.
 */
function writeToComposer(text) {
  const box =
    document.querySelector('textarea:not([readonly])') ||
    document.querySelector('[contenteditable="true"]');
  if (!box) return false;

  box.focus();

  if (box.tagName === 'TEXTAREA') {
    // Through the native setter, so React's onChange sees it. Assigning
    // `box.value` directly updates the DOM and React overwrites it on the next
    // render, which looks like the paste silently failing.
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value',
    )?.set;
    setter ? setter.call(box, text) : (box.value = text);
    box.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    box.textContent = text;
    box.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
  }

  return true;
}

function render(status) {
  if (document.getElementById(HOST_ID)) return;

  const host = document.createElement('div');
  host.id = HOST_ID;
  // The host itself carries no visual style, only position, so the page's CSS
  // has nothing of ours to fight over.
  host.style.cssText = 'position:fixed;right:20px;bottom:96px;z-index:2147483647;';
  const root = host.attachShadow({ mode: 'closed' });

  const rules = status.rules > 0 ? `, ${status.rules} rule${status.rules === 1 ? '' : 's'} you set` : '';

  root.innerHTML = `
    <style>
      :host { all: initial; }
      .chip {
        display: flex; align-items: center; gap: 10px;
        font: 500 13px/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: rgba(255,255,255,.92);
        background: #0d0d12; border: 1px solid rgba(255,255,255,.12);
        border-radius: 999px; padding: 9px 14px; cursor: pointer;
        box-shadow: 0 8px 28px -10px rgba(0,0,0,.7);
        /* Compositor-friendly only: this sits on someone else's page and must
           never cause a reflow in it. */
        transition: transform .15s, background-color .15s;
      }
      .chip:hover { transform: translateY(-1px); background: #16161d; }
      .dot { width: 6px; height: 6px; border-radius: 999px; background: #B8A6FF; flex: none; }
      .x {
        all: unset; cursor: pointer; padding: 0 2px; margin-left: 2px;
        color: rgba(255,255,255,.35); font-size: 15px; line-height: 1;
      }
      .x:hover { color: rgba(255,255,255,.8); }
      @media (prefers-reduced-motion: reduce) { .chip { transition: none; } }
    </style>
    <div class="chip" role="button" tabindex="0"
         aria-label="Bring a previous conversation into this one with Sidq">
      <span class="dot"></span>
      <span class="label">${status.conversations} conversation${status.conversations === 1 ? '' : 's'}${rules}</span>
      <button class="x" aria-label="Dismiss Sidq here">×</button>
    </div>
  `;

  root.querySelector('.x').addEventListener('click', (e) => {
    e.stopPropagation();
    dismiss();
  });

  const open = () => {
    // The app owns the picking. Opening its window is one message and avoids
    // rebuilding the whole picker inside somebody else's document.
    chrome.runtime.sendMessage({ type: 'sidq:open' });
  };
  root.querySelector('.chip').addEventListener('click', open);
  root.querySelector('.chip').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  });

  document.body.appendChild(host);
}

/** Fill the composer when the app sends a conversation back. */
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'sidq:insert' && typeof message.text === 'string') {
    writeToComposer(message.text);
  }
  return false;
});

async function considerChip() {
  if (!site() || await isDismissed()) return;
  if (!isBlankConversation()) return;

  const status = await askApp();
  if (!status?.running || !status.conversations) return;

  render(status);

  // Tell the app an assistant is open, so it can say so once a day. Rate
  // limiting lives there, not here: a content script cannot see the other tabs.
  chrome.runtime.sendMessage({ type: 'sidq:opened', source: site()?.name ?? 'your assistant' });
}

// These are single-page apps: the composer is not there at document_idle, and
// navigating between chats never reloads the page.
// Overrides first, so a site that moved is read correctly on the first pass
// rather than on the second.
setTimeout(() => void applyOverrides().then(considerChip), SETTLE_MS);

/* ────────────────────────────────────────────────────────────────────────────
 * Keeping up, without being asked.
 *
 * Connecting an assistant was a one-time act that captured nothing: you clicked
 * the toolbar button once per conversation, forever. Which means the history
 * Sidq had of a browser assistant was whatever you remembered to click, and the
 * conversation you most want tomorrow is the one you were too absorbed in to
 * think about clicking.
 *
 * So the page is watched instead. Connect an assistant once and everything you
 * do in it from then on is read as it happens.
 *
 * ── What stops this being a firehose ─────────────────────────────────────────
 * A reply streams token by token, and a MutationObserver on a chat page fires
 * hundreds of times a second while that happens. Sending on every mutation
 * would post a hundred half-written copies of one answer.
 *
 * So: wait for the page to go quiet, then compare against what was sent last
 * and stay silent unless it actually changed. A conversation you are reading
 * rather than adding to sends nothing at all.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Long enough that a streaming reply has finished before anything is sent. */
const QUIET_MS = 4000;

/** Never more often than this, however busy the page is. */
const MIN_GAP_MS = 15_000;

let quietTimer = null;
let lastSentLength = 0;
let lastSentAt = 0;

/**
 * Length, not a hash.
 *
 * A conversation only ever grows, so its length is a sufficient and far cheaper
 * test than hashing tens of thousands of characters every four seconds on a
 * page that is already busy rendering a reply.
 */
function captureIfChanged() {
  const text = readConversation();
  if (!text || text.length === lastSentLength) return;

  const now = Date.now();
  if (now - lastSentAt < MIN_GAP_MS) return;

  lastSentLength = text.length;
  lastSentAt = now;

  chrome.runtime.sendMessage({
    type: 'sidq:capture',
    payload: {
      source: site()?.name ?? null,
      title: readTitle(),
      url: location.href,
      text,
      capturedAt: now,
    },
  });
}

function watch() {
  if (!site()) return;

  const observer = new MutationObserver(() => {
    clearTimeout(quietTimer);
    quietTimer = setTimeout(captureIfChanged, QUIET_MS);
  });

  observer.observe(document.body, { childList: true, subtree: true, characterData: true });

  /*
   * Navigating between conversations does not reload the page.
   *
   * Every one of these sites is a single-page app, so the URL changes under a
   * conversation that is already loaded. Without this, switching to another
   * chat looks like the first one growing, and the second is never captured at
   * its own length.
   */
  let href = location.href;
  setInterval(() => {
    if (location.href === href) return;
    href = location.href;
    lastSentLength = 0;
    clearTimeout(quietTimer);
    quietTimer = setTimeout(captureIfChanged, QUIET_MS);
  }, 1500);
}

setTimeout(() => void applyOverrides().then(watch), SETTLE_MS);
