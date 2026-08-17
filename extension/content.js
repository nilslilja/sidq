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
