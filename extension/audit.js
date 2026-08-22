/*
 * Check whether Sidq's selectors still match this page.
 *
 * Paste into the browser console on an assistant site with a conversation
 * open. It prints how many elements each selector finds and nothing else: no
 * message text, no titles, no URLs beyond the hostname. What comes back is a
 * table of numbers you can hand to anybody without handing over a conversation.
 *
 * Run it because these sites redesign without warning and the failure is
 * silent: a stale selector matches nothing, the extension reads nothing, and
 * the product looks like it is working.
 */
(() => {
  const SITES = {
    'chatgpt.com': ['[data-message-author-role]', 'article[data-testid^="conversation-turn"]'],
    'chat.openai.com': ['[data-message-author-role]', 'article[data-testid^="conversation-turn"]'],
    'claude.ai': ['[data-testid="user-message"], .font-claude-message', '[data-test-render-count]'],
    'gemini.google.com': ['user-query, model-response', '.query-text, .model-response-text'],
    'grok.com': ['[class*="message-bubble"]', '.items-end, .items-start'],
    'x.com': ['[class*="message-bubble"]', '.items-end, .items-start'],
    'chat.deepseek.com': ['[class*="_4f9bf79"], [class*="ds-markdown"]', '.fbb737a4'],
    'chat.mistral.ai': ['[data-message-author-role]', '[class*="message"]'],
    'github.com': ['[data-testid="chat-message"]', '[class*="ChatMessage"]'],
    'www.perplexity.ai': ['[data-testid="thread-item"]', '.prose'],
  };

  const host = location.hostname;
  const selectors = SITES[host];
  if (!selectors) {
    console.log(`Sidq audit: ${host} is not a site Sidq reads.`);
    return;
  }

  const rows = selectors.map((selector) => {
    const found = document.querySelectorAll(selector);
    // Length only. Enough to know the selector is alive, and it carries none
    // of what the elements contain.
    const withText = Array.from(found).filter((el) => (el.innerText || '').trim().length > 2);
    return { selector, matched: found.length, withText: withText.length };
  });

  const working = rows.some((r) => r.withText > 0);
  console.log(`\nSidq selector audit — ${host}`);
  console.table(rows);
  console.log(working ? 'OK: at least one selector still finds turns.' : 'BROKEN: nothing matched. This site has moved.');
  console.log('Copy the table above. It contains no conversation text.');

  return { host, rows, working };
})();
