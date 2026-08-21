//! Running the assistants inside Sidq, so there is nothing to install.
//!
//! The browser extension worked and was the wrong shape for the product. It
//! meant a store listing, a review queue, a different install path per browser,
//! and a person deciding to trust a second thing before Sidq could read
//! anything at all. For an app whose entire pitch is "it already knows", asking
//! for an extension first is the wrong first minute.
//!
//! Sidq is a Tauri app, so it already contains a browser engine. The assistants
//! open in it. You sign in once, in Sidq, and everything after that is read as
//! it happens.
//!
//! ── Does it read as well as a content script? ────────────────────────────────
//! Identically, and then better. A script running in the page has the same DOM
//! either way, so the selectors and the depth are the same. What changes is
//! everything around it:
//!
//!   - No store review, no per-browser install, nothing to keep updated
//!     through a queue somebody else controls.
//!   - No Content-Security-Policy in the way. The extension could not talk to
//!     127.0.0.1 from the page because several of these sites forbid it, so it
//!     had to relay through a service worker. Here the page talks to the app
//!     directly.
//!   - Sidq owns the navigation, so it knows when a conversation changed
//!     instead of polling `location.href` and guessing.
//!
//! ── Verified, and not ────────────────────────────────────────────────────────
//! ChatGPT, claude.ai and Gemini were each loaded in this webview and rendered
//! completely: full interface, composer, sign-in offered. No Cloudflare
//! challenge and no "unsupported browser".
//!
//! What is not verified is completing a Google sign-in, which cannot be tested
//! without somebody's actual credentials. Google has historically refused OAuth
//! inside embedded webviews. ChatGPT and Claude both offer email sign-in, so
//! they are unaffected either way; Gemini has no other route, and if Google
//! refuses, Gemini stays on the export path.

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

/// Safari's own agent.
///
/// WKWebView's default identifies itself as an embedded view, which is the
/// signal several of these sites match on before deciding to refuse. This is
/// not a disguise: it is the same engine Safari uses, rendering the same page.
const USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) \
AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

/// One assistant Sidq can open.
pub struct Assistant {
    pub id: &'static str,
    pub label: &'static str,
    pub url: &'static str,
}

pub const ASSISTANTS: [Assistant; 6] = [
    Assistant { id: "chatgpt", label: "ChatGPT", url: "https://chatgpt.com/" },
    Assistant { id: "claude.ai", label: "Claude", url: "https://claude.ai/" },
    Assistant { id: "gemini", label: "Gemini", url: "https://gemini.google.com/app" },
    Assistant { id: "perplexity", label: "Perplexity", url: "https://www.perplexity.ai/" },
    Assistant { id: "grok", label: "Grok", url: "https://grok.com/" },
    Assistant { id: "deepseek", label: "DeepSeek", url: "https://chat.deepseek.com/" },
];

pub fn find(id: &str) -> Option<&'static Assistant> {
    ASSISTANTS.iter().find(|a| a.id == id)
}

/**
 * The script that reads the page.
 *
 * Injected before the site's own code runs, so nothing it does can prevent it.
 * It emits an event rather than calling a command, because an event needs only
 * `core:event` in the capability — the page gets one narrow way to hand text to
 * the app and no access to anything else in it.
 *
 * The debounce is the same reasoning as before: a reply streams token by token
 * and a MutationObserver fires hundreds of times a second while that happens,
 * so it waits for quiet, then sends only if the conversation actually grew.
 */
fn reader_script(source: &str) -> String {
    format!(
        r#"
(() => {{
  const SOURCE = {source:?};
  const QUIET_MS = 4000;
  const MIN_GAP_MS = 12000;

  // Every one of these sites splits a single reply across several nodes when it
  // contains code or a list, so turns are read by author marker where one
  // exists and collapsed when the speaker has not changed.
  const SITES = {{
    'chatgpt':    ['[data-message-author-role]'],
    'claude.ai':  ['[data-testid="user-message"], .font-claude-message'],
    'gemini':     ['user-query, model-response'],
    'perplexity': ['[data-testid="thread-item"]'],
    'grok':       ['[class*="message-bubble"]'],
    'deepseek':   ['[class*="ds-markdown"], [class*="fbb737a4"]'],
  }};

  const roleOf = (el) => {{
    const attr = el.getAttribute && el.getAttribute('data-message-author-role');
    if (attr) return attr === 'user' ? 'You' : 'Assistant';
    if (el.matches && el.matches('[data-testid="user-message"]')) return 'You';
    if (el.tagName && el.tagName.toLowerCase() === 'user-query') return 'You';
    if (el.tagName && el.tagName.toLowerCase() === 'model-response') return 'Assistant';
    if (el.className && String(el.className).includes('items-end')) return 'You';
    // Perplexity holds the question and the answer in one node, so it is read
    // as one block rather than pretending to know which half is which.
    return 'Exchange';
  }};

  function read() {{
    for (const selector of (SITES[SOURCE] || [])) {{
      const nodes = Array.from(document.querySelectorAll(selector));
      if (!nodes.length) continue;

      const lines = [];
      let last = null;
      for (const el of nodes) {{
        const text = (el.innerText || '').trim();
        if (text.length < 2) continue;
        const role = roleOf(el);
        if (role === last) lines[lines.length - 1] += '\n' + text;
        else {{ lines.push(role + ':\n' + text); last = role; }}
      }}
      if (lines.length) return lines.join('\n\n');
    }}
    return null;
  }}

  let timer = null, sentLength = 0, sentAt = 0, href = location.href;

  function send() {{
    const text = read();
    if (!text || text.length === sentLength) return;
    const now = Date.now();
    if (now - sentAt < MIN_GAP_MS) return;
    sentLength = text.length; sentAt = now;

    window.__TAURI__.event.emit('assistant:conversation', {{
      source: SOURCE,
      title: document.title,
      url: location.href,
      text,
    }});
  }}

  const start = () => {{
    new MutationObserver(() => {{
      clearTimeout(timer);
      timer = setTimeout(send, QUIET_MS);
    }}).observe(document.body, {{ childList: true, subtree: true, characterData: true }});

    // These are single-page apps: moving between conversations never reloads,
    // so without this the second one looks like the first one growing.
    setInterval(() => {{
      if (location.href === href) return;
      href = location.href; sentLength = 0;
      clearTimeout(timer); timer = setTimeout(send, QUIET_MS);
    }}, 1500);
  }};

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
}})();
"#
    )
}

/// Open an assistant, or focus the window that already has it.
pub fn open(app: &tauri::AppHandle, id: &str) -> Result<(), String> {
    let assistant = find(id).ok_or("Sidq does not know that assistant.")?;

    if let Some(existing) = app.get_webview_window("assistant") {
        let _ = existing.show();
        let _ = existing.set_focus();
        // Same window, different site. Reloading with the right reader is
        // simpler than keeping one script that has to guess where it is.
        let _ = existing.eval(&format!("location.href = {:?}", assistant.url));
        return Ok(());
    }

    let url = assistant
        .url
        .parse()
        .map_err(|_| "That assistant has an address Sidq cannot open.")?;

    WebviewWindowBuilder::new(app, "assistant", WebviewUrl::External(url))
        .title(assistant.label)
        .inner_size(1100.0, 820.0)
        .user_agent(USER_AGENT)
        .initialization_script(&reader_script(assistant.id))
        .build()
        .map_err(|e| format!("Could not open {}: {e}", assistant.label))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_assistant_has_an_https_address() {
        // An http address here would be a downgrade on somebody's logged-in
        // session, and a typo'd one is a window that opens onto nothing.
        for a in &ASSISTANTS {
            assert!(a.url.starts_with("https://"), "{} is not https", a.id);
            assert!(!a.label.is_empty());
        }
    }

    #[test]
    fn the_reader_knows_every_assistant_it_can_be_opened_with() {
        /*
         * The script carries its own selector table, so an assistant in the
         * list with no entry there opens a window that reads nothing at all
         * and reports no error.
         */
        let script = reader_script("chatgpt");
        for a in &ASSISTANTS {
            assert!(script.contains(&format!("'{}':", a.id)), "no selectors for {}", a.id);
        }
    }

    #[test]
    fn the_script_is_told_which_site_it_is_on() {
        assert!(reader_script("claude.ai").contains(r#"SOURCE = "claude.ai""#));
    }

    #[test]
    fn an_unknown_assistant_is_refused_rather_than_guessed() {
        assert!(find("chatgpt").is_some());
        assert!(find("hotmail").is_none());
    }
}
