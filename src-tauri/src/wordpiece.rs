//! Text to token ids, the way the embedding model was trained to read them.
//!
//! The model in `embed.rs` is all-MiniLM-L6-v2, which reads BERT's uncased
//! WordPiece vocabulary. A tokeniser that disagrees with the one it was trained
//! on does not fail loudly; it produces vectors that are quietly worse, and
//! search that is quietly worse is the one failure nobody reports. So this is
//! tested against ids recorded from the reference implementation
//! (`assets/embed/reference-tokens.json`), never against its own output.
//!
//! The steps are BERT's, in BERT's order: clean, space out CJK ideographs,
//! split on whitespace, lowercase and strip accents, split off punctuation, then
//! greedy longest-match WordPiece with `##` for continuations.

use std::collections::HashMap;
use std::sync::OnceLock;

use unicode_normalization::char::is_combining_mark;
use unicode_normalization::UnicodeNormalization;

const VOCAB: &str = include_str!("../assets/embed/vocab.txt");

pub const CLS: u32 = 101;
pub const SEP: u32 = 102;
pub const UNK: u32 = 100;

/// Longer words are [UNK] rather than searched, as in the reference.
const MAX_WORD_CHARS: usize = 100;

fn vocab() -> &'static HashMap<&'static str, u32> {
    static VOCAB_MAP: OnceLock<HashMap<&'static str, u32>> = OnceLock::new();
    VOCAB_MAP.get_or_init(|| {
        VOCAB
            .lines()
            .enumerate()
            .map(|(i, t)| (t, i as u32))
            .collect()
    })
}

/// `[CLS] tokens… [SEP]`, cut to at most `max_len` ids including both markers.
pub fn encode(text: &str, max_len: usize) -> Vec<u32> {
    let room = max_len.saturating_sub(2);
    let body = tokens(text);
    let mut ids = Vec::with_capacity(body.len().min(room) + 2);
    ids.push(CLS);
    ids.extend(body.into_iter().take(room));
    ids.push(SEP);
    ids
}

/// Every token id in the text, with no markers and no limit, for callers that
/// cut long text into several windows rather than dropping the end of it.
pub fn tokens(text: &str) -> Vec<u32> {
    let mut ids = Vec::new();
    for word in basic_tokens(text) {
        wordpiece(&word, &mut ids);
    }
    ids
}

/// Clean, space out ideographs, split on whitespace, lowercase, strip accents,
/// split off punctuation. What BERT calls the basic tokeniser.
fn basic_tokens(text: &str) -> Vec<String> {
    let mut cleaned = String::with_capacity(text.len());
    for c in text.chars() {
        if c.is_whitespace() {
            cleaned.push(' ');
        } else if c == '\0' || c == '\u{FFFD}' || is_control(c) {
            continue;
        } else if is_cjk(c) {
            cleaned.push(' ');
            cleaned.push(c);
            cleaned.push(' ');
        } else {
            cleaned.push(c);
        }
    }

    let mut tokens = Vec::new();
    for word in cleaned.split_whitespace() {
        let folded: String = word
            .to_lowercase()
            .nfd()
            .filter(|c| !is_combining_mark(*c))
            .collect();
        let mut current = String::new();
        for c in folded.chars() {
            if is_punctuation(c) {
                if !current.is_empty() {
                    tokens.push(std::mem::take(&mut current));
                }
                tokens.push(c.to_string());
            } else {
                current.push(c);
            }
        }
        if !current.is_empty() {
            tokens.push(current);
        }
    }
    tokens
}

/// Greedy longest match first; a word with any unmatchable stretch is one [UNK].
fn wordpiece(word: &str, out: &mut Vec<u32>) {
    let chars: Vec<char> = word.chars().collect();
    if chars.len() > MAX_WORD_CHARS {
        out.push(UNK);
        return;
    }
    let start_len = out.len();
    let mut start = 0;
    while start < chars.len() {
        let mut end = chars.len();
        let mut found = None;
        while start < end {
            let piece: String = chars[start..end].iter().collect();
            let key = if start > 0 {
                format!("##{piece}")
            } else {
                piece
            };
            if let Some(&id) = vocab().get(key.as_str()) {
                found = Some(id);
                break;
            }
            end -= 1;
        }
        match found {
            Some(id) => {
                out.push(id);
                start = end;
            }
            None => {
                out.truncate(start_len);
                out.push(UNK);
                return;
            }
        }
    }
}

/// Control and format characters, which BERT drops. Tab, newline and return
/// are whitespace and are handled before this is asked.
fn is_control(c: char) -> bool {
    c.is_control()
        || matches!(c,
            '\u{00AD}' | '\u{200B}'..='\u{200F}' | '\u{202A}'..='\u{202E}'
            | '\u{2060}'..='\u{2064}' | '\u{FEFF}')
}

/// The CJK ideograph blocks BERT puts spaces around. Kana and Hangul are not in it.
fn is_cjk(c: char) -> bool {
    matches!(c as u32,
        0x4E00..=0x9FFF | 0x3400..=0x4DBF | 0x20000..=0x2A6DF | 0x2A700..=0x2B73F
        | 0x2B740..=0x2B81F | 0x2B820..=0x2CEAF | 0xF900..=0xFAFF | 0x2F800..=0x2FA1F)
}

/// ASCII punctuation, which BERT counts in full (so `$` and `^` split too), plus
/// the Unicode punctuation blocks that turn up in conversations: dashes, curly
/// quotes, bullets, ellipses, CJK and full-width marks.
fn is_punctuation(c: char) -> bool {
    if c.is_ascii() {
        return c.is_ascii_punctuation();
    }
    matches!(c as u32,
        0x00A1 | 0x00A7 | 0x00AB | 0x00B6 | 0x00B7 | 0x00BB | 0x00BF
        | 0x055A..=0x055F | 0x0589 | 0x05BE | 0x05C0 | 0x05C3 | 0x05C6 | 0x05F3 | 0x05F4
        | 0x060C | 0x061B | 0x061F | 0x066A..=0x066D | 0x06D4 | 0x0964 | 0x0965
        | 0x2010..=0x2027 | 0x2030..=0x205E | 0x2E00..=0x2E4F
        | 0x3001..=0x3003 | 0x3008..=0x3011 | 0x3014..=0x301F | 0x3030 | 0x303D | 0x30FB
        | 0xFE10..=0xFE19 | 0xFE30..=0xFE52 | 0xFE54..=0xFE61
        | 0xFF01..=0xFF03 | 0xFF05..=0xFF0A | 0xFF0C..=0xFF0F | 0xFF1A | 0xFF1B
        | 0xFF1F | 0xFF20 | 0xFF3B..=0xFF3D | 0xFF3F | 0xFF5B | 0xFF5D | 0xFF5F..=0xFF65)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(serde::Deserialize)]
    struct Case {
        s: String,
        ids: Vec<u32>,
    }

    fn reference() -> Vec<Case> {
        serde_json::from_str(include_str!("../assets/embed/reference-tokens.json")).unwrap()
    }

    #[test]
    fn the_vocabulary_is_the_models_own() {
        assert_eq!(vocab().len(), 30_522);
        assert_eq!(vocab()["[UNK]"], UNK);
        assert_eq!(vocab()["[CLS]"], CLS);
        assert_eq!(vocab()["[SEP]"], SEP);
    }

    /// Code, paths, Swedish, CJK, smart quotes, emoji, tabs, URLs, the empty string.
    #[test]
    fn every_reference_case_tokenises_exactly_as_the_reference_does() {
        for case in reference() {
            assert_eq!(encode(&case.s, 512), case.ids, "for {:?}", case.s);
        }
    }

    #[test]
    fn a_long_text_is_cut_but_keeps_both_markers() {
        let ids = encode(&"word ".repeat(500), 128);
        assert_eq!(ids.len(), 128);
        assert_eq!(ids.first(), Some(&CLS));
        assert_eq!(ids.last(), Some(&SEP));
    }
}
