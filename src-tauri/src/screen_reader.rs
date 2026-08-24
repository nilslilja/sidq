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
use core_foundation::url::CFURL;

/// Depth beyond which a page is pathological rather than deep.
const MAX_DEPTH: usize = 70;

/// Nodes to visit before giving up. A busy page is tens of thousands.
const MAX_NODES: usize = 250_000;

/// How long to give a browser to build its accessibility tree once asked.
///
/// Two seconds is what Chrome took on this machine, measured rather than
/// guessed. Under it the walk finds an empty window and reports nothing open.
const TREE_BUILD_WAIT: std::time::Duration = std::time::Duration::from_millis(2000);

/**
 * A second chance for a page that was still building.
 *
 * Only ever waited on an address that is already known to be an assistant and
 * whose first read produced nothing substantial, so it never slows down a sweep
 * that is working.
 */
const TREE_SETTLE_WAIT: std::time::Duration = std::time::Duration::from_millis(2500);

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

/**
 * Ask for the permission, showing the system prompt.
 *
 * `AXIsProcessTrustedWithOptions` with the prompt option is the only call that
 * makes macOS offer the dialog; checking alone never does. It returns
 * immediately and the answer arrives later, whenever the person gets to System
 * Settings, so nothing here waits on it — the setup screen polls `is_trusted`
 * and turns green by itself.
 */
pub fn request_trust() {
    use core_foundation::dictionary::CFDictionary;

    let key = unsafe { CFString::wrap_under_get_rule(accessibility_sys::kAXTrustedCheckOptionPrompt) };
    let options = CFDictionary::from_CFType_pairs(&[(key, CFBoolean::true_value())]);

    // SAFETY: the dictionary outlives the call and the function takes a
    // CFDictionaryRef of exactly this shape.
    unsafe {
        accessibility_sys::AXIsProcessTrustedWithOptions(options.as_concrete_TypeRef());
    }
}

/// Open the pane where the permission is granted.
///
/// The prompt has a button for this, and people dismiss prompts. Without a way
/// back, somebody who clicked the wrong thing once has no route to the switch
/// short of being told where it lives.
pub fn open_settings() {
    let _ = std::process::Command::new("/usr/bin/open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
        .status();
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
 * A page address, whatever type the browser chose to hand it over as.
 *
 * This is the single most important line in the file and it was one cast wrong.
 *
 * `AXURL` on a Chrome web area is a **CFURL**, not a CFString. Reading it as a
 * string returned `None`, so the address was empty, so `source_for("")` matched
 * nothing, so every browser tab was skipped on every sweep — silently, because
 * an empty address is indistinguishable from a window that is not an AI and
 * both are supposed to be ignored.
 *
 * The effect was that the entire browser half of the product did nothing. The
 * only conversations that ever reached the index were from assistants with
 * their own app, which are matched on the app's name and need no address at
 * all. Measured against a live Chrome: web area found, tree readable, 5000
 * characters of conversation sitting there, address `None`, nothing written.
 *
 * Safari and the others are not guaranteed to make the same choice, so both
 * types are accepted rather than swapping one hard-coded assumption for
 * another.
 */
fn url_attribute(element: AXUIElementRef, name: &str) -> Option<String> {
    let value = attribute(element, name)?;

    if let Some(url) = value.downcast::<CFURL>() {
        return Some(url.get_string().to_string());
    }
    value.downcast::<CFString>().map(|s| s.to_string())
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

    // Whole subtree, not just this node: the marker sits on the container and
    // the text is a couple of levels below it.
    if hidden_from_sight(&classes) {
        return;
    }

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

    /*
     * ── Everything before the person speaks is the page, not the conversation ─
     *
     * Anything not recognised as a person's turn is filed as the assistant, so
     * the sidebar, the header and every button in the chrome arrive as one
     * enormous reply before the conversation has started.
     *
     * That was not a tidiness problem. Measured on a real handover: 159 of 418
     * lines were Gemini's sidebar, which is the titles of every other
     * conversation on the account — "Villa Exit Cost Analysis", "Mouth
     * Widening Surgery: Risks and Realities", "Var det en civilpolis?" — and
     * the whole point of a handover is that you give the file to a different
     * AI. Sidq was quietly attaching a person's entire chat history, including
     * medical and personal titles, to a file about fixing a motocross bike.
     *
     * The rule is the one thing true of every chat product there is: a
     * conversation starts with the person. Whatever precedes their first turn
     * is furniture, whichever site it came from and whatever it is called.
     *
     * Deliberately not a list of things to strip. A blocklist of sidebar class
     * names is wrong the first time a site renames one, and it fails open — it
     * leaks and says nothing. This fails closed.
     */
    if let Some(first_person) = turns.iter().position(|(who, _)| who == "You") {
        turns.drain(..first_person);
    } else {
        /*
         * No recognised person turn anywhere. Either the page is not a
         * conversation, or this site's markers are unknown to `person_by_class`
         * — which is the state Grok and DeepSeek are in. Both cases must
         * produce nothing rather than a transcript of the page furniture.
         */
        turns.clear();
    }

    turns
}

/// Is this block one the person typed, judged by the classes around it?
///
/// Kept separate and dumb so it can be replaced by the same `sources.json`
/// override the extension uses when a site renames its classes.
pub fn person_by_class(classes: &str) -> bool {
    let c = classes.to_lowercase();
    /*
     * Each of these is a class one of the sites actually puts on the person's
     * own turn, read off a live page rather than guessed.
     *
     * `query-text` is Gemini, and its absence is what made a real read come
     * back as a single 24,100 character turn with the whole conversation
     * attributed to the assistant and not one word attributed to the person —
     * which is a useless handover, because the next model never sees what was
     * asked.
     */
    c.contains("user-message")
        || c.contains("user-query")
        || c.contains("query-text")
        || c.contains("whitespace-pre-wrap")
        || c.contains("human")
        /*
         * ── Grok and DeepSeek ────────────────────────────────────────────────
         *
         * Both were listed as sources and neither had a marker here, so every
         * block came back as the assistant, `is_substantial` found no question,
         * and the conversation was dropped without a word. Reported as "grok
         * didn't work", and it could not have.
         *
         * These two are not guesses. They are the same markers the extension
         * reader already uses in `assistants.rs`, which were taken off live
         * pages: Grok puts the person's bubble in a flex column ending with
         * `items-end`, and DeepSeek's build hashes the class on a person's
         * message to `fbb737a4`.
         *
         * `items-end` is a plain Tailwind alignment class and could in
         * principle appear elsewhere, which used to be a real risk when an
         * unmatched block still became assistant prose. It is much smaller now:
         * a false match can only pull the page furniture *after* it into the
         * transcript, and `is_substantial` still has to find a reply as well.
         */
        || c.contains("items-end")
        || c.contains("fbb737a4")
}

/**
 * Scaffolding that exists only for screen readers, and does not belong in a
 * transcript.
 *
 * Gemini narrates its own page: "Konversation med Gemini", "Gemini sa", "Du
 * sa", every one of them a real text node inside the conversation. Read
 * straight through, they end up interleaved with the actual words as though
 * somebody had typed them.
 *
 * These three class names are the common conventions for it rather than any
 * one site's, so this keeps working when a site renames its own classes.
 */
/*
 * ── The caption that is not worth what removing it costs ─────────────────────
 *
 * Gemini writes a "You said" caption above each of your turns — localised, so
 * "Du sa" here — and it is not marked hidden, so it lands in the transcript at
 * the head of every user turn.
 *
 * Filtering it by class was tried and reverted. The caption is `query-text`
 * without `query-text-line`, so that is the rule, and applying it took six of
 * ten user turns with it: some of the real questions render under the caption's
 * class too. Measured before and after — 435 characters of user text became
 * 155, and "is acquire.com a good site for doing an exit" was simply gone.
 *
 * Five characters of noise at the top of a turn costs a handover nothing. A
 * missing question costs it the thing the next model most needs. So the caption
 * stays until there is a rule that removes it and nothing else.
 */

pub fn hidden_from_sight(classes: &str) -> bool {
    let c = classes.to_lowercase();
    c.contains("visually-hidden") || c.contains("sr-only") || c.contains("screen-reader")
}

/**
 * Is there enough here to be a conversation rather than a page?
 *
 * ── Why both sides are required ──────────────────────────────────────────────
 * A character count alone is not a test. Grok's empty landing page cleared two
 * hundred characters on its own furniture — sidebar labels, the signed-in
 * account's name and email address, and a paragraph advertising Build Mode —
 * and went into the index as a conversation you could hand to another AI.
 *
 * A real conversation has somebody asking and somebody answering. Page
 * furniture has no user turn, because none of it is inside anything the
 * classifier recognises as something a person typed.
 *
 * ── What this also catches ───────────────────────────────────────────────────
 * A site whose markup the classifier does not know yet. Everything lands as
 * assistant prose, there is no user turn, and nothing is written — which is the
 * right way to fail. Indexing one giant misattributed block would produce a
 * handover missing every question, and it would look like it had worked.
 */
pub fn is_substantial(turns: &[(String, String)]) -> bool {
    let long_enough =
        turns.iter().map(|(_, b)| b.chars().count()).sum::<usize>() >= MIN_CONVERSATION_CHARS;
    let asked = turns.iter().any(|(who, _)| who == "You");
    let answered = turns.iter().any(|(who, _)| who == "Assistant");

    long_enough && asked && answered
}

/**
 * Find the assistant conversation on screen, if there is one.
 *
 * Returns the source and its turns. `None` for every other case: no
 * permission, an app that is not on the list, a tab that is not an assistant,
 * or a page too thin to be a conversation. Nothing is read before those checks.
 */
pub fn read_open_assistants() -> Vec<(&'static str, String, String, Vec<(String, String)>)> {
    if !is_trusted() {
        return Vec::new();
    }

    let mut found = Vec::new();
    let apps = readable_processes();

    /*
     * ── Ask first, then wait, then read ──────────────────────────────────────
     *
     * Chrome does not keep an accessibility tree for web content standing. It
     * builds one when a client sets `AXManualAccessibility`, and it tears it
     * down again once nothing is asking. Building it is asynchronous.
     *
     * So enabling and immediately walking finds an empty tree, every time. That
     * is what was happening: the walk ran microseconds after the request, saw
     * nothing under the window, and reported no conversation open — while the
     * page sat there perfectly readable to anything that waited. Measured: walk
     * at once, zero web areas; wait two seconds, the web area and five thousand
     * characters of conversation.
     *
     * The wait is once per sweep rather than once per application, and this
     * runs on the indexer's own thread ninety seconds apart, so it costs
     * nothing anybody can feel.
     */
    for (pid, _) in &apps {
        enable_web_content(*pid);
    }
    if !apps.is_empty() {
        std::thread::sleep(TREE_BUILD_WAIT);
    }

    for (pid, app_name) in apps {
        // SAFETY: a live pid taken from the process list a moment ago. Create
        // returns a reference we own.
        let app = Element::owned(unsafe { AXUIElementCreateApplication(pid) });

        let mut areas = Vec::new();
        let mut budget = MAX_NODES;
        find_web_areas(app.as_raw(), 0, &mut areas, &mut budget);

        // A browser: the address decides, before any text is touched.
        for area in &areas {
            let url = url_attribute(area.as_raw(), "AXURL").unwrap_or_default();
            let Some(source) = source_for(&url) else { continue };

            /*
             * ── Ask twice before believing a thin read ───────────────────────
             *
             * Chrome builds the accessibility tree for web content on demand
             * and tears it down when nothing is asking. `TREE_BUILD_WAIT` is
             * one flat two-second pause for every application at once, which is
             * ample for a short page and not always enough for a long one.
             *
             * When it is not enough the read comes back partial, or empty, and
             * `is_substantial` correctly refuses it — then nothing happens for
             * another fifteen seconds and the whole thing is tried again. That
             * is what "sometimes it works and sometimes it doesn't" was, and
             * why a big ChatGPT conversation could sit there for a minute while
             * a short Gemini one appeared straight away.
             *
             * The retry costs nothing in the normal case, because it only runs
             * where the address already says this is an assistant and the first
             * attempt still produced nothing worth keeping.
             */
            let mut turns = into_turns(&collect(area.as_raw()), person_by_class);
            if !is_substantial(&turns) {
                std::thread::sleep(TREE_SETTLE_WAIT);
                turns = into_turns(&collect(area.as_raw()), person_by_class);
            }

            if is_substantial(&turns) {
                let title = string_attribute(area.as_raw(), "AXTitle").unwrap_or_default();
                found.push((source, url, title, turns));
            }
        }

        // An assistant's own app has no web area and no address, so its name is
        // the identification.
        if let Some(source) = source_for(&app_name) {
            let turns = into_turns(&collect(app.as_raw()), person_by_class);
            if is_substantial(&turns) {
                // No address in a desktop app, so the window title is the only
                // stable identifier it offers.
                let title = string_attribute(app.as_raw(), "AXTitle").unwrap_or(app_name.clone());
                found.push((source, String::new(), title, turns));
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

            READABLE_APPS.contains(&name.as_str()).then_some((pid, name))
        })
        .collect::<Vec<_>>()
        .into_iter()
        /*
         * One process per application, and it has to be the right one.
         *
         * A browser is a few dozen processes sharing its bundle name: measured
         * here, Chrome was twenty-five of the thirty-six that came back. Only
         * one of them owns an accessibility tree; the rest each cost an
         * element, an `AXManualAccessibility` write and a failed walk on every
         * sweep for as long as the browser is running.
         *
         * Picking by pid does not work. The obvious rule — the main process is
         * the oldest, since it spawns the helpers — is wrong in practice:
         * Chrome's lowest pid on this machine was 183, a helper left over from
         * a previous launch, while the window-owning process was 40098. Reading
         * that one found nothing and reported no conversation open.
         *
         * So the process is asked instead of guessed. Only the main one has
         * windows, and one attribute read is far cheaper than the tree walk it
         * saves.
         */
        .fold(Vec::<(i32, String)>::new(), |mut kept, (pid, name)| {
            if kept.iter().any(|(_, seen)| *seen == name) {
                return kept;
            }
            if owns_windows(pid) {
                kept.push((pid, name));
            }
            kept
        })
}

/// Whether this process is the one with the windows, rather than a helper.
fn owns_windows(pid: i32) -> bool {
    // SAFETY: a live pid from the process list. Create returns a reference we
    // own, and `Element` releases it.
    let app = Element::owned(unsafe { AXUIElementCreateApplication(pid) });
    !children(app.as_raw()).is_empty()
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

/**
 * Read every open assistant and put it in the index.
 *
 * The counterpart to the disk sweep in `indexer`, for the assistants that write
 * nothing to disk. Returns how many conversations were written.
 *
 * ── Identity, and why it is the address ──────────────────────────────────────
 * A conversation being added to must replace its earlier state rather than
 * accumulate a copy per exchange, so the key is the thing that is stable while
 * you are in a conversation and different for every other one: its URL. Same
 * rule the browser-bridge path already uses.
 *
 * A desktop assistant has no URL, so its window title stands in. That is
 * weaker — renaming a chat makes it look new — and it is the only stable
 * identifier those apps expose.
 */
/// A conversation the sweep wrote, and whether this is the first sight of it.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Found {
    pub source: &'static str,
    pub title: String,
    /// True only on the pass that first recorded it. Growth is not a discovery.
    pub first_time: bool,
}

/**
 * Whether a URL names one conversation, as opposed to the place they start.
 *
 * Every assistant here addresses a conversation with a long opaque id at the
 * end of the path — `/c/6a58d612-6a10-83eb-ba16-a25d6f94eb61` on ChatGPT,
 * `/app/434b357ad2df6173` on Gemini — and every landing page is a short word:
 * nothing at all, `/app`, `/new`, `/chat`.
 *
 * So the test is the length of the last segment rather than a list of paths per
 * site, which would need editing every time one of them reorganised its routes,
 * and would silently start dropping real conversations when one did.
 */
fn identifies_a_conversation(url: &str) -> bool {
    let after_scheme = url.split_once("://").map_or(url, |(_, rest)| rest);
    let Some((_, path)) = after_scheme.split_once('/') else {
        return false; // bare origin: chatgpt.com
    };

    path.split('?')
        .next()
        .unwrap_or(path)
        .split('/')
        .filter(|segment| !segment.is_empty())
        .next_back()
        .is_some_and(|last| last.len() >= MIN_CONVERSATION_ID)
}

/// Shortest last path segment that can be an id rather than a route name.
/// Gemini's are 16 characters; the longest route name in play is "settings".
const MIN_CONVERSATION_ID: usize = 12;

pub fn sweep_into(conn: &rusqlite::Connection) -> Vec<Found> {
    let mut found = Vec::new();

    for (source, url, title, turns) in read_open_assistants() {
        /*
         * A page that is not yet a conversation is not worth recording.
         *
         * Observed: a first ChatGPT read landed under `https://chatgpt.com`
         * with the title "ChatGPT" and three turns. That is the new-chat page,
         * caught after the person had typed but before the site had assigned
         * the conversation an address. The next sweep found the same exchange
         * again under `/c/6a58d612-…` titled "Raw Milk in Carrefour", which is
         * the row that should exist.
         *
         * The first one is not a duplicate that gets cleaned up, because the id
         * is the URL: nothing ever addresses `httpschatgptcom` again, so it sits
         * in the picker forever as a conversation called "ChatGPT". Harmless
         * while nothing pointed at it; not harmless now that finding a
         * conversation rings a bell and raises a notification.
         */
        if !url.is_empty() && !identifies_a_conversation(&url) {
            continue;
        }

        let identity = if url.is_empty() { format!("{source}:{title}") } else { url };
        let session_id: String = identity
            .chars()
            .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
            .collect();
        if session_id.is_empty() {
            continue;
        }

        // Asked before writing, because `put_session` replaces and would erase
        // the distinction between a conversation appearing and one growing.
        let first_time = !crate::index_store::has_session(conn, &session_id);

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);

        let clean = title.split(" - ").next().unwrap_or(&title).trim().to_string();
        let _ = crate::index_store::put_session(
            conn, &session_id, source, &clean, source, "", now, turns.len() as u32, 0,
        );

        /*
         * Fingerprinted by total length, so a conversation that has not grown
         * since the last pass is skipped entirely. Without it every sweep
         * rewrites every open conversation, which on a busy day is a full
         * reindex every thirty seconds.
         */
        let length: usize = turns.iter().map(|(_, b)| b.len()).sum();
        let fingerprint = format!("screen:{length}");
        if crate::index_store::is_current(conn, &session_id, &fingerprint) {
            continue;
        }
        if crate::index_store::put_messages(conn, &session_id, &turns, &fingerprint).is_some() {
            found.push(Found { source, title: clean, first_time });
        }
    }

    found
}

#[cfg(test)]
mod tests {
    use super::*;

    /*
     * ── Read off a live page, not invented ───────────────────────────────────
     *
     * Every class below was taken from a real conversation through the
     * accessibility tree. The reason they are pinned here is that the failure
     * they cause is silent: an unrecognised person-class does not error, it
     * quietly files the whole conversation as the assistant talking to itself.
     */

    /*
     * ── The new-chat page is not a conversation ──────────────────────────────
     *
     * Taken off a real install. A first ChatGPT read landed as
     * `httpschatgptcom` titled "ChatGPT" with three turns — the new-chat page,
     * caught after typing but before the site had given the conversation an
     * address. The same exchange was then recorded properly under
     * `/c/6a58d612-…` as "Raw Milk in Carrefour".
     *
     * The first row is permanent. The session id is the URL, so nothing ever
     * addresses it again and it sits in the picker as a conversation called
     * "ChatGPT" for as long as the index exists.
     */
    #[test]
    fn a_landing_page_is_not_mistaken_for_a_conversation() {
        assert!(!identifies_a_conversation("https://chatgpt.com"));
        assert!(!identifies_a_conversation("https://chatgpt.com/"));
        assert!(!identifies_a_conversation("https://claude.ai/new"));
        assert!(!identifies_a_conversation("https://gemini.google.com/app"));
        assert!(!identifies_a_conversation("https://www.perplexity.ai/"));
    }

    #[test]
    fn the_real_addresses_from_this_machine_are_kept() {
        // Both read off a live browser, not composed for the test.
        assert!(identifies_a_conversation(
            "https://chatgpt.com/c/6a58d612-6a10-83eb-ba16-a25d6f94eb61"
        ));
        assert!(identifies_a_conversation("https://gemini.google.com/app/434b357ad2df6173"));
    }

    #[test]
    fn a_query_string_does_not_hide_the_identifier() {
        // Shared links arrive with tracking on the end, and the id is still
        // in the path where it always was.
        assert!(identifies_a_conversation(
            "https://chatgpt.com/c/6a58d612-6a10-83eb-ba16-a25d6f94eb61?model=gpt-4o"
        ));
    }

    #[test]
    fn a_desktop_app_is_still_allowed_through() {
        /*
         * The ChatGPT and Claude apps expose no URL at all, so `sweep_into`
         * falls back to source and window title. The guard must only apply
         * where there is a URL to judge, or those two stop being read entirely.
         */
        assert!(!identifies_a_conversation(""));
    }

    #[test]
    fn gemini_turns_are_told_apart() {
        // Measured: without `query-text`, a real 24,000 character conversation
        // came back as one turn, entirely Assistant, with not one word of what
        // was actually asked.
        assert!(person_by_class("query-text-line ng-star-inserted"));
        assert!(person_by_class("query-text gds-body-l"));
        assert!(!person_by_class(
            "markdown markdown-main-panel md-content enable-luminous-fast-follows"
        ));
        assert!(!person_by_class("table-content md-content"));
    }

    #[test]
    fn the_other_sites_still_match() {
        assert!(person_by_class("font-user-message whitespace-pre-wrap"));
        assert!(person_by_class("group/user-query"));
        assert!(!person_by_class("font-claude-message"));
        assert!(!person_by_class(""));
    }

    #[test]
    fn a_page_narrating_itself_is_not_part_of_the_conversation() {
        /*
         * Gemini emits "Konversation med Gemini" and "Gemini sa" as real text
         * nodes for screen readers. Read straight through they interleave with
         * the words as though somebody had typed them.
         */
        assert!(hidden_from_sight("cdk-visually-hidden"));
        assert!(hidden_from_sight(
            "cdk-visually-hidden screen-reader-model-response-label ng-star-inserted"
        ));
        assert!(hidden_from_sight("sr-only"));
        assert!(!hidden_from_sight("markdown markdown-main-panel"));
        assert!(!hidden_from_sight("query-text-line"));
    }

    #[test]
    fn one_turn_per_speaker_rather_than_one_per_paragraph() {
        // Every one of these sites splits a reply over many nodes when it has a
        // list or a code block in it.
        let nodes = vec![
            Node { text: "what should I do".into(), classes: "query-text-line".into() },
            Node { text: "First,".into(), classes: "markdown-main-panel".into() },
            Node { text: "second.".into(), classes: "markdown-main-panel".into() },
            Node { text: "and then".into(), classes: "query-text-line".into() },
        ];

        let turns = into_turns(&nodes, person_by_class);
        assert_eq!(
            turns.iter().map(|(who, _)| who.as_str()).collect::<Vec<_>>(),
            ["You", "Assistant", "You"]
        );
        assert_eq!(turns[1].1, "First,\nsecond.");
    }

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
        for (source, url, title, turns) in &found {
            let chars: usize = turns.iter().map(|(_, b)| b.chars().count()).sum();
            let where_from = if url.is_empty() { title.clone() } else { url.clone() };
            println!("  {source} ({where_from}): {} turns, {chars} characters", turns.len());
            for (role, body) in turns.iter().take(2) {
                println!("      {role}: {} chars", body.chars().count());
            }
        }
        println!();
    }

    /**
     * What the accessibility tree actually calls things, on this machine.
     *
     * cargo test --bin sidq real_classes -- --ignored --nocapture
     *
     * ── Why this exists ──────────────────────────────────────────────────────
     * A site is only readable if `person_by_class` recognises the marker it puts
     * on the person's own turn, and the accessibility tree exposes class names
     * and nothing else — no author attribute, no roles worth trusting. Guessing
     * a marker from another product's DOM has now failed twice.
     *
     * This prints every distinct class string on the page with how much text
     * sits under it and whether the classifier currently claims it, which is
     * enough to see at a glance which group is the question and which is the
     * answer. Open the assistant, leave it in front, run it.
     *
     * Ignored, so it never runs in CI, where there is no browser and no
     * permission.
     */
    #[test]
    #[ignore]
    fn real_classes() {
        std::thread::sleep(std::time::Duration::from_secs(4));

        if !is_trusted() {
            println!("\n  no Accessibility permission — nothing can be read\n");
            return;
        }

        for (pid, app_name) in readable_processes() {
            let app = Element::owned(unsafe { AXUIElementCreateApplication(pid) });
            enable_web_content(pid);
            std::thread::sleep(TREE_BUILD_WAIT);

            let mut areas = Vec::new();
            let mut budget = MAX_NODES;
            find_web_areas(app.as_raw(), 0, &mut areas, &mut budget);

            for area in &areas {
                let url = url_attribute(area.as_raw(), "AXURL").unwrap_or_default();
                let Some(source) = source_for(&url) else { continue };

                println!("\n  ── {source} in {app_name} ──");
                println!("  {url}");

                let nodes = collect(area.as_raw());
                println!("  {} text nodes\n", nodes.len());

                // Grouped by class string, biggest first: the two groups holding
                // the most text are the two speakers, and everything else is
                // furniture.
                let mut groups: std::collections::HashMap<String, (usize, usize, String)> =
                    std::collections::HashMap::new();
                for n in &nodes {
                    let e = groups.entry(n.classes.clone()).or_insert((0, 0, String::new()));
                    e.0 += 1;
                    e.1 += n.text.chars().count();
                    if e.2.is_empty() {
                        e.2 = n.text.chars().take(34).collect();
                    }
                }

                let mut rows: Vec<_> = groups.into_iter().collect();
                rows.sort_by_key(|(_, (_, chars, _))| std::cmp::Reverse(*chars));

                for (classes, (count, chars, sample)) in rows.iter().take(10) {
                    let who = if person_by_class(classes) { "YOU " } else { "    " };
                    println!("  {who}{chars:>6} chars  x{count:<3}  {}", classes.chars().take(76).collect::<String>());
                    println!("            sample: {sample}");
                }

                let turns = into_turns(&nodes, person_by_class);
                println!(
                    "\n  → {} turns kept, substantial: {}",
                    turns.len(),
                    is_substantial(&turns)
                );
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
        // A freshly opened AI has a placeholder and some buttons. Sending that
        // as a captured conversation fills the index with nothing.
        let thin = into_turns(&[node("Ask anything", "placeholder")], person_by_class);
        assert!(!is_substantial(&thin));

        let real = into_turns(
            &[
                node(&"a".repeat(200), "user-message"),
                node(&"b".repeat(200), "markdown-main-panel"),
            ],
            person_by_class,
        );
        assert!(is_substantial(&real));
    }

    #[test]
    fn a_landing_page_is_not_a_conversation_however_long_it_is() {
        /*
         * Measured, not imagined. Grok's empty landing page cleared the
         * character floor on its own furniture — sidebar labels, the signed-in
         * account's name and email, and a paragraph advertising Build Mode —
         * and went into the index as something you could hand to another AI.
         *
         * None of it is inside anything the classifier reads as typed by a
         * person, which is the thing that tells it apart from a conversation.
         */
        let page = into_turns(
            &[
                node("Skip to main content", "nav"),
                node("New Chat", "nav"),
                node("nilsliljan@gmail.com", "account"),
                node(&"Use Build Mode to create websites, games and apps. ".repeat(8), "promo"),
            ],
            person_by_class,
        );

        /*
         * It used to survive as one long assistant turn, over the character
         * floor, and was rejected a step later by `is_substantial`. It is now
         * dropped here: with no person turn anywhere, there is nothing before
         * which the furniture could sit, so all of it goes.
         *
         * Rejected twice over, which is the right number for the check that
         * stands between somebody's sidebar and a file they hand to another AI.
         */
        assert!(page.is_empty(), "page furniture is not a transcript");
        assert!(!is_substantial(&page), "no user turn, so it is a page");
    }

    #[test]
    fn a_site_whose_markup_is_unknown_is_skipped_rather_than_mangled() {
        /*
         * If the classifier does not know a site, every block becomes assistant
         * prose. Writing that would produce a handover with none of the
         * questions in it, and it would look like it had worked. Nothing is
         * written instead, which is visible as a gap rather than as bad data.
         */
        let unknown = into_turns(
            &[
                node(&"what should I do about this".repeat(10), "some-unfamiliar-class"),
                node(&"here is what I think".repeat(10), "another-unfamiliar-class"),
            ],
            person_by_class,
        );

        assert!(unknown.is_empty(), "nothing recognised, so nothing kept");
        assert!(!is_substantial(&unknown));
    }

    #[test]
    fn classes_are_inherited_by_the_text_inside_a_turn() {
        // The author marker sits on the container; the text is a leaf several
        // levels down with no classes of its own. Reading only the leaf loses
        // every author attribution on the page.
        //
        // A person's turn comes first, because a reply that precedes one is
        // page furniture now and is dropped before this can be asserted.
        let nodes = vec![node("a question", "user-message"), node("typed by a reply", "")];
        let turns = into_turns(&nodes, person_by_class);
        assert_eq!(turns[1].0, "Assistant", "no classes means it is not a person's");
    }

    #[test]
    fn grok_and_deepseek_have_a_person_in_them_now() {
        /*
         * Reported: "grok didn't work". It could not have. Neither site had a
         * marker in `person_by_class`, so every block was filed as the
         * assistant, `is_substantial` found no question, and the whole
         * conversation was dropped in silence.
         *
         * Both markers come from `assistants.rs`, where the extension reader
         * already used them against live pages.
         */
        assert!(person_by_class("flex flex-col items-end"), "grok");
        assert!(person_by_class("fbb737a4"), "deepseek");

        // And the reply side of each is still not mistaken for the person.
        assert!(!person_by_class("message-bubble"), "grok's own reply");
        assert!(!person_by_class("ds-markdown ds-markdown--block"), "deepseek's reply");
    }

    #[test]
    fn a_grok_conversation_survives_end_to_end() {
        // The failure was never in one function; it was that no person turn
        // existed, so the conversation never cleared `is_substantial`.
        let turns = into_turns(
            &[
                node("Grok", "brand"),
                node(&"what is the torque spec for this bolt".repeat(6), "flex items-end"),
                node(&"Around 12 Nm on that size.".repeat(20), "message-bubble"),
            ],
            person_by_class,
        );

        assert_eq!(turns.len(), 2, "the brand line is furniture and goes");
        assert_eq!(turns[0].0, "You");
        assert!(is_substantial(&turns), "this is a conversation and must be kept");
    }

    #[test]
    fn the_sidebar_never_reaches_the_handover() {
        /*
         * ── The one this exists for ──────────────────────────────────────────
         *
         * Taken from a real handover written on this machine: 159 of its 418
         * lines were Gemini's sidebar, filed as one assistant turn before the
         * conversation began. That is the title of every other conversation on
         * the account — including medical ones — inside a file whose entire
         * purpose is being given to a different AI.
         *
         * The shape below is the real one: chrome, then the whole chat list,
         * then the conversation.
         */
        let turns = into_turns(
            &[
                node("Gemini", "brand"),
                node("Ny chatt", "nav-item"),
                node("Villa Exit Cost Analysis", "conversation-title"),
                node("Mouth Widening Surgery: Risks and Realities", "conversation-title"),
                node("Var det en civilpolis?", "conversation-title"),
                node("the chain keeps hopping off the sprocket", "query-text"),
                node("That usually means the chain is too slack.", "model-response"),
            ],
            person_by_class,
        );

        let everything = turns.iter().map(|(_, b)| b.as_str()).collect::<String>();
        assert!(!everything.contains("Villa Exit"), "another conversation's title");
        assert!(!everything.contains("Mouth Widening"), "and a medical one");
        assert!(!everything.contains("civilpolis"));
        assert!(!everything.contains("Ny chatt"), "and the navigation with it");

        // The conversation itself is untouched, both speakers intact.
        assert_eq!(turns.len(), 2);
        assert_eq!(turns[0].0, "You");
        assert!(turns[0].1.contains("chain keeps hopping"));
        assert_eq!(turns[1].0, "Assistant");
    }
}
