//! Reading assistant windows through macOS Accessibility.
//!
//! This is what makes Sidq work with nothing to install. One permission in
//! System Settings, the same one every dictation app on the machine already
//! asks for, and every assistant becomes readable at once: ChatGPT in Chrome,
//! Claude in Safari, Gemini in Arc, and the ChatGPT and Claude desktop apps
//! too. No extension, no store review, no developer mode, no second sign-in.
//!
//! ── What was tried first ─────────────────────────────────────────────────────
//! A browser extension worked and meant a store listing, a review queue and a
//! developer-mode install per browser. Opening the assistants inside Sidq's own
//! webview removed that and broke sign-in instead: passkeys need WebAuthn,
//! WebAuthn in a webview needs an entitlement only the site owner can grant, and
//! AutoFill and password managers never reach a webview at all.
//!
//! ── What it reads, and what it does not ──────────────────────────────────────
//! Only windows belonging to an assistant, and only the web area or text of
//! those. Anything else in front returns nothing, before any text is touched.
//! Everything stays on this machine.
//!
//! The privacy policy said Sidq does not read your screen. That was true and is
//! not any more, and the policy says so plainly rather than hiding behind the
//! fact that this is an API rather than a screenshot.

#![cfg(target_os = "macos")]

use accessibility_sys::{
    kAXChildrenAttribute, kAXRoleAttribute, kAXValueAttribute, AXError, AXIsProcessTrusted,
    AXUIElementCopyAttributeValue, AXUIElementCreateApplication, AXUIElementRef,
    AXUIElementSetAttributeValue,
};
use core_foundation::array::CFArray;
use core_foundation::base::{CFType, TCFType};
use core_foundation::boolean::CFBoolean;
use core_foundation::string::CFString;

/// Depth beyond which a page is pathological rather than deep.
const MAX_DEPTH: usize = 70;

/// Nodes to visit before giving up. A busy page is tens of thousands.
const MAX_NODES: usize = 250_000;

/// Below this a "conversation" is a loading screen or an empty composer.
const MIN_CONVERSATION_CHARS: usize = 200;

/// Apps whose windows may be read. Nothing else is looked at.
///
/// Browsers plus the assistants that ship their own app. The list is the whole
/// permission boundary: a window belonging to anything not named here is never
/// walked, so a password manager or a mail client in front is not read even
/// momentarily.
pub const READABLE_APPS: [&str; 9] = [
    "Google Chrome",
    "Safari",
    "Arc",
    "Brave Browser",
    "Microsoft Edge",
    "Vivaldi",
    "ChatGPT",
    "Claude",
    "Perplexity",
];

/// Hosts and app names that are assistants, mapped to the source Sidq records.
pub fn source_for(url_or_app: &str) -> Option<&'static str> {
    let it = url_or_app.to_lowercase();
    let table = [
        ("chatgpt.com", "chatgpt"),
        ("chat.openai.com", "chatgpt"),
        ("claude.ai", "claude.ai"),
        ("gemini.google.com", "gemini"),
        ("perplexity.ai", "perplexity"),
        ("grok.com", "grok"),
        ("chat.deepseek.com", "deepseek"),
        ("chat.mistral.ai", "mistral"),
    ];
    if let Some((_, source)) = table.iter().find(|(needle, _)| it.contains(needle)) {
        return Some(source);
    }

    /*
     * The assistants that ship their own app have no address to match on, so
     * the app's name is the identification. Matched exactly rather than by
     * substring: "Claude" as a substring also matches "Claude Code", which
     * writes its own transcripts and is read from disk already.
     */
    match url_or_app {
        "ChatGPT" => Some("chatgpt"),
        "Claude" => Some("claude.ai"),
        "Perplexity" => Some("perplexity"),
        _ => None,
    }
}

/// Has the person granted Accessibility to Sidq?
pub fn is_trusted() -> bool {
    // SAFETY: takes no arguments and returns a Boolean. Nothing is borrowed.
    unsafe { AXIsProcessTrusted() }
}

fn attribute(element: AXUIElementRef, name: &str) -> Option<CFType> {
    let key = CFString::new(name);
    let mut value: core_foundation::base::CFTypeRef = std::ptr::null();

    // SAFETY: `element` is a live AXUIElementRef from the caller, `key` outlives
    // the call, and the out-pointer is only read when the call reports success.
    // The returned value is a Copy, so we own it and wrap it accordingly.
    let err: AXError =
        unsafe { AXUIElementCopyAttributeValue(element, key.as_concrete_TypeRef(), &mut value) };

    if err != 0 || value.is_null() {
        return None;
    }
    Some(unsafe { CFType::wrap_under_create_rule(value) })
}

fn string_attribute(element: AXUIElementRef, name: &str) -> Option<String> {
    attribute(element, name)?
        .downcast::<CFString>()
        .map(|s| s.to_string())
}

/**
 * An accessibility element we own.
 *
 * The reason this exists rather than passing `AXUIElementRef` around: children
 * arrive inside a CFArray that owns them, so pulling the raw pointers out and
 * letting the array drop frees every one of them. The walk then reads freed
 * memory, and it does not fail cleanly — it took the whole test binary down.
 *
 * Retained on the way out, released on drop. The comment at the top of this
 * file says CoreFoundation ownership is the thing to get wrong once and never
 * notice, and this is that mistake, caught by a crash rather than by review.
 */
pub struct Element(AXUIElementRef);

impl Element {
    /// Take ownership of a reference that is already ours (a Copy/Create call).
    fn owned(raw: AXUIElementRef) -> Self {
        Element(raw)
    }

    /// Retain a reference belonging to somebody else (a Get call).
    fn retained(raw: AXUIElementRef) -> Self {
        // SAFETY: `raw` is a live CFType for the duration of this call, which
        // is what makes retaining it valid.
        unsafe { core_foundation::base::CFRetain(raw as _) };
        Element(raw)
    }

    fn as_raw(&self) -> AXUIElementRef {
        self.0
    }
}

impl Drop for Element {
    fn drop(&mut self) {
        // SAFETY: every Element holds exactly one retain, taken in one of the
        // two constructors above.
        unsafe { core_foundation::base::CFRelease(self.0 as _) };
    }
}

fn children(element: AXUIElementRef) -> Vec<Element> {
    let Some(value) = attribute(element, kAXChildrenAttribute) else {
        return Vec::new();
    };
    let Some(array) = value.downcast_into::<CFArray>() else {
        return Vec::new();
    };

    // Retained individually: the array releases its contents when it drops at
    // the end of this function, and without this every child would dangle.
    (0..array.len())
        .filter_map(|i| array.get(i).map(|p| Element::retained(*p as AXUIElementRef)))
        .collect()
}

/// One block of text, with whatever the DOM called it.
#[derive(Debug, Clone, PartialEq)]
pub struct Node {
    pub text: String,
    /// CSS classes, which is how a turn is told from the page around it.
    pub classes: String,
}

/**
 * Walk a web area and collect the text nodes under it.
 *
 * Depth-first so the result is in reading order, which is the order the
 * conversation happened in. Classes travel with each block because that is the
 * only thing distinguishing a person's turn from a reply: the Accessibility
 * tree has no author attribute, but Chrome exposes `AXDOMClassList`, so the
 * same identification the extension does is available here.
 */
pub fn collect(root: AXUIElementRef) -> Vec<Node> {
    let mut out = Vec::new();
    let mut budget = MAX_NODES;
    walk(root, 0, &mut budget, &mut out, &String::new());
    out
}

fn walk(
    element: AXUIElementRef,
    depth: usize,
    budget: &mut usize,
    out: &mut Vec<Node>,
    inherited: &str,
) {
    if depth > MAX_DEPTH || *budget == 0 {
        return;
    }
    *budget -= 1;

    // Classes are set on the container, not on the text node inside it, so they
    // are carried down rather than read at the leaf.
    let own = class_list(element);
    let classes = if own.is_empty() { inherited.to_string() } else { own };

    if string_attribute(element, kAXRoleAttribute).as_deref() == Some("AXStaticText") {
        if let Some(text) = string_attribute(element, kAXValueAttribute) {
            if !text.trim().is_empty() {
                out.push(Node { text, classes: classes.clone() });
            }
        }
    }

    for child in children(element) {
        walk(child.as_raw(), depth + 1, budget, out, &classes);
    }
}

fn class_list(element: AXUIElementRef) -> String {
    let Some(value) = attribute(element, "AXDOMClassList") else {
        return String::new();
    };
    let Some(array) = value.downcast_into::<CFArray>() else {
        return String::new();
    };

    (0..array.len())
        .filter_map(|i| {
            array.get(i).map(|p| {
                // SAFETY: AXDOMClassList is an array of CFStrings by contract.
                unsafe { CFString::wrap_under_get_rule(*p as _) }.to_string()
            })
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/**
 * Ask Chrome to expose its web content.
 *
 * Chromium keeps the render tree out of the Accessibility tree until something
 * asks, because building it is not free. Without this the walk finds tabs,
 * bookmarks and menus and nothing inside the page — measured: 408 nodes of
 * browser chrome and zero web areas.
 */
pub fn enable_web_content(pid: i32) {
    // SAFETY: creates an application element for a live pid and sets one
    // boolean attribute on it. Both arguments outlive the call.
    unsafe {
        let app = AXUIElementCreateApplication(pid);
        let key = CFString::new("AXManualAccessibility");
        let yes = CFBoolean::true_value();
        AXUIElementSetAttributeValue(app, key.as_concrete_TypeRef(), yes.as_CFTypeRef());
    }
}

/// Turn collected nodes into speaker turns.
///
/// Consecutive blocks sharing a class signature are one turn: every one of
/// these sites splits a single reply across many nodes when it contains code or
/// a list, and left alone that reads as a dozen separate replies.
pub fn into_turns(nodes: &[Node], is_person: fn(&str) -> bool) -> Vec<(String, String)> {
    let mut turns: Vec<(String, String)> = Vec::new();

    for node in nodes {
        let role = if is_person(&node.classes) { "You" } else { "Assistant" };
        match turns.last_mut() {
            Some(last) if last.0 == role => {
                last.1.push('\n');
                last.1.push_str(&node.text);
            }
            _ => turns.push((role.to_string(), node.text.clone())),
        }
    }

    turns.retain(|(_, body)| !body.trim().is_empty());
    turns
}

/// Is this block one the person typed, judged by the classes around it?
///
/// Kept separate and dumb so it can be replaced by the same `sources.json`
/// override the extension uses when a site renames its classes.
pub fn person_by_class(classes: &str) -> bool {
    let c = classes.to_lowercase();
    c.contains("user-message")
        || c.contains("user-query")
        || c.contains("whitespace-pre-wrap")
        || c.contains("human")
}

/// Is there enough here to be a conversation rather than an empty composer?
pub fn is_substantial(turns: &[(String, String)]) -> bool {
    turns.iter().map(|(_, b)| b.chars().count()).sum::<usize>() >= MIN_CONVERSATION_CHARS
}

/**
 * Find the assistant conversation on screen, if there is one.
 *
 * Returns the source and its turns. `None` for every other case: no
 * permission, an app that is not on the list, a tab that is not an assistant,
 * or a page too thin to be a conversation. Nothing is read before those checks.
 */
pub fn read_open_assistants() -> Vec<(String, Vec<(String, String)>)> {
    if !is_trusted() {
        return Vec::new();
    }

    let mut found = Vec::new();

    for (pid, app_name) in readable_processes() {
        enable_web_content(pid);
        // SAFETY: a live pid taken from the process list a moment ago. Create
        // returns a reference we own.
        let app = Element::owned(unsafe { AXUIElementCreateApplication(pid) });

        let mut areas = Vec::new();
        let mut budget = MAX_NODES;
        find_web_areas(app.as_raw(), 0, &mut areas, &mut budget);

        // A browser: the address decides, before any text is touched.
        for area in &areas {
            let url = string_attribute(area.as_raw(), "AXURL").unwrap_or_default();
            let Some(source) = source_for(&url) else { continue };

            let turns = into_turns(&collect(area.as_raw()), person_by_class);
            if is_substantial(&turns) {
                found.push((source.to_string(), turns));
            }
        }

        // An assistant's own app has no web area and no address, so its name is
        // the identification.
        if let Some(source) = source_for(&app_name) {
            let turns = into_turns(&collect(app.as_raw()), person_by_class);
            if is_substantial(&turns) {
                found.push((source.to_string(), turns));
            }
        }
    }

    found
}

/**
 * The running applications Sidq is allowed to look at.
 *
 * Every assistant that is open is read, rather than only whichever window
 * happens to be in front. Somebody who asks ChatGPT something and switches to
 * their editor while it answers should not lose the answer, and requiring the
 * window to be frontmost is exactly how that would happen.
 *
 * Resolved from the process list rather than through AXFocusedApplication,
 * which returned nothing on this machine and made every read report an empty
 * screen while the tree underneath was perfectly readable.
 */
fn readable_processes() -> Vec<(i32, String)> {
    let Ok(out) = std::process::Command::new("/bin/ps").args(["-Ao", "pid=,comm="]).output() else {
        return Vec::new();
    };

    String::from_utf8_lossy(&out.stdout)
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            let (pid, path) = line.split_once(char::is_whitespace)?;
            let pid: i32 = pid.trim().parse().ok()?;

            // The bundle name, not the executable: the binary inside a bundle
            // can be called anything.
            let name = path
                .trim()
                .split(".app/")
                .next()?
                .rsplit('/')
                .next()?
                .to_string();

            // Helper processes share the bundle name, so the same app appears
            // several times; only the one with a window has a tree to walk and
            // the rest cost one failed lookup each.
            READABLE_APPS.contains(&name.as_str()).then_some((pid, name))
        })
        .collect()
}

fn find_web_areas(element: AXUIElementRef, depth: usize, out: &mut Vec<Element>, budget: &mut usize) {
    if depth > MAX_DEPTH || *budget == 0 || out.len() > 8 {
        return;
    }
    *budget -= 1;

    if string_attribute(element, kAXRoleAttribute).as_deref() == Some("AXWebArea") {
        // Retained, because it outlives the walk that found it.
        out.push(Element::retained(element));
        return;
    }
    for child in children(element) {
        find_web_areas(child.as_raw(), depth + 1, out, budget);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /**
     * Read whatever assistant is actually in front, on this machine.
     *
     * cargo test --bin sidq real_read -- --ignored --nocapture
     */
    #[test]
    #[ignore]
    fn real_read() {
        // Long enough for whatever was brought to the front to settle, and for
        // Chrome to build its accessibility tree after being asked.
        std::thread::sleep(std::time::Duration::from_secs(4));
        println!("\n  trusted: {}", is_trusted());
        let procs = readable_processes();
        println!("  readable apps running: {:?}", procs.iter().map(|(_, n)| n).collect::<Vec<_>>());

        let found = read_open_assistants();
        if found.is_empty() {
            println!("  no assistant conversation open");
        }
        for (source, turns) in &found {
            let chars: usize = turns.iter().map(|(_, b)| b.chars().count()).sum();
            println!("  {source}: {} turns, {chars} characters", turns.len());
            for (role, body) in turns.iter().take(2) {
                println!("      {role}: {} chars", body.chars().count());
            }
        }
        println!();
    }

    fn node(text: &str, classes: &str) -> Node {
        Node { text: text.into(), classes: classes.into() }
    }

    #[test]
    fn an_app_is_named_by_its_bundle_not_its_binary() {
        // The executable inside a bundle can be named anything; the bundle is
        // what the app is called and what READABLE_APPS is written against.
        assert_eq!(
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
                .split(".app/")
                .next()
                .and_then(|b| b.rsplit('/').next()),
            Some("Google Chrome")
        );
    }

    #[test]
    fn a_desktop_assistant_is_identified_by_its_app_name() {
        // These ship their own app and have no address to match on.
        assert_eq!(source_for("ChatGPT"), Some("chatgpt"));
        assert_eq!(source_for("Claude"), Some("claude.ai"));
        // Exact, not substring: Claude Code writes its own transcripts and is
        // already read from disk, so reading its window would double it.
        assert_eq!(source_for("Claude Code"), None);
    }

    #[test]
    fn only_named_apps_are_ever_looked_at() {
        /*
         * The list is the whole permission boundary. Accessibility grants Sidq
         * the ability to read any window on the machine, and the only thing
         * stopping it reading a password manager is that the app is not here.
         */
        assert!(READABLE_APPS.contains(&"Google Chrome"));
        assert!(READABLE_APPS.contains(&"Safari"));
        assert!(!READABLE_APPS.contains(&"1Password"));
        assert!(!READABLE_APPS.contains(&"Messages"));
        assert!(!READABLE_APPS.contains(&"Mail"));
    }

    #[test]
    fn a_url_is_matched_to_the_assistant_it_belongs_to() {
        assert_eq!(source_for("https://chatgpt.com/c/abc"), Some("chatgpt"));
        assert_eq!(source_for("https://claude.ai/chat/x"), Some("claude.ai"));
        assert_eq!(source_for("https://gemini.google.com/app"), Some("gemini"));
    }

    #[test]
    fn a_page_that_is_not_an_assistant_is_not_read() {
        // The second half of the boundary: the right app, the wrong tab.
        assert_eq!(source_for("https://mail.google.com/"), None);
        assert_eq!(source_for("https://bank.example.com/accounts"), None);
        assert_eq!(source_for(""), None);
    }

    #[test]
    fn consecutive_blocks_from_one_speaker_become_one_turn() {
        /*
         * Every one of these sites splits a reply across many nodes when it
         * contains code or a list. Left alone that arrives at the next model as
         * a dozen separate replies to a question nobody asked twice.
         */
        let nodes = vec![
            node("how should the tiers read", "user-message"),
            node("Three of them.", "markdown"),
            node("fn main() {}", "markdown"),
            node("and name them plainly", "user-message"),
        ];

        let turns = into_turns(&nodes, person_by_class);
        assert_eq!(turns.len(), 3);
        assert_eq!(turns[0].0, "You");
        assert_eq!(turns[1], ("Assistant".into(), "Three of them.\nfn main() {}".into()));
        assert_eq!(turns[2].0, "You");
    }

    #[test]
    fn an_empty_composer_is_not_a_conversation() {
        // A freshly opened assistant has a placeholder and some buttons. Sending
        // that as a captured conversation fills the index with nothing.
        let thin = into_turns(&[node("Ask anything", "placeholder")], person_by_class);
        assert!(!is_substantial(&thin));

        let real = into_turns(&[node(&"a".repeat(300), "user-message")], person_by_class);
        assert!(is_substantial(&real));
    }

    #[test]
    fn classes_are_inherited_by_the_text_inside_a_turn() {
        // The author marker sits on the container; the text is a leaf several
        // levels down with no classes of its own. Reading only the leaf loses
        // every author attribution on the page.
        let nodes = vec![node("typed by a person", "")];
        let turns = into_turns(&nodes, |_| false);
        assert_eq!(turns[0].0, "Assistant", "no classes means it is not a person's");
    }
}
