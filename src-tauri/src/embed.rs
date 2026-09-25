//! Meaning, as numbers, computed on this Mac.
//!
//! ── Why this exists ──────────────────────────────────────────────────────────
//!
//! Until this module, nothing in Sidq understood a word it carried. Search was
//! keyword matching sorted by date, and a handover kept or dropped turns by
//! length and position, never by whether they had anything to do with what the
//! person was about to do. That is the gap a funded competitor fills by
//! uploading transcripts to a server. This fills it without anything leaving
//! the machine.
//!
//! ── Why this model, measured rather than assumed ─────────────────────────────
//!
//! Tested on 25 September 2026 against eight questions, each written to match
//! one of eight notes by meaning rather than by shared words:
//!
//! | model                                   | right note first |
//! |-----------------------------------------|------------------|
//! | Apple NLEmbedding, sentence             | 4 of 8           |
//! | Apple NLContextualEmbedding, mean       | 3 of 8           |
//! | all-MiniLM-L6-v2, int8                  | 8 of 8           |
//!
//! Apple's embeddings ship with the OS and cost nothing to bundle, and are too
//! weak to build relevance on. MiniLM is 23MB, runs here through `tract`, which
//! is pure Rust (no C++ runtime to bundle, sign or notarise), in 4 to 7ms a
//! sentence. The same eight questions are a test below, so a model or tokeniser
//! change that makes Sidq dumber fails the build.
//!
//! ── What it promises ─────────────────────────────────────────────────────────
//!
//! The model reads text and returns 384 numbers. It has no network code and is
//! handed nothing but the text in front of it.

use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock};

use tract_onnx::prelude::*;

use crate::wordpiece;

/// Numbers per vector.
pub const DIM: usize = 384;

/// Tokens per window, markers included: the length the model was trained on.
const WINDOW: usize = 128;

/// Where the build puts the model, relative to the app's resources.
const RESOURCE: &str = "embed/minilm-l6-q8.onnx";

pub struct Embedder {
    plan: Arc<TypedRunnableModel>,
}

impl Embedder {
    /// Load and optimise the model. About a fifth of a second, once.
    pub fn load(path: &Path) -> Option<Self> {
        let plan = tract_onnx::onnx()
            .model_for_path(path)
            .ok()?
            .into_optimized()
            .ok()?
            .into_runnable()
            .ok()?;
        Some(Self { plan })
    }

    /// One unit-length vector for the text, from its first window of tokens.
    pub fn embed(&self, text: &str) -> Option<Vec<f32>> {
        self.run(&wordpiece::encode(text, WINDOW))
    }

    /// One vector per window, so the end of a long turn is not simply lost.
    /// At most `max` windows; an empty text gives none.
    pub fn embed_windows(&self, text: &str, max: usize) -> Vec<Vec<f32>> {
        let body = wordpiece::tokens(text);
        body.chunks(WINDOW - 2)
            .take(max)
            .filter_map(|window| {
                let mut ids = Vec::with_capacity(window.len() + 2);
                ids.push(wordpiece::CLS);
                ids.extend_from_slice(window);
                ids.push(wordpiece::SEP);
                self.run(&ids)
            })
            .collect()
    }

    fn run(&self, ids: &[u32]) -> Option<Vec<f32>> {
        let n = ids.len();
        let input: Vec<i64> = ids.iter().map(|&i| i64::from(i)).collect();
        let input = tract_ndarray::Array2::from_shape_vec((1, n), input).ok()?;
        let mask = tract_ndarray::Array2::from_elem((1, n), 1i64);
        let types = tract_ndarray::Array2::from_elem((1, n), 0i64);
        let out = self
            .plan
            .run(tvec!(
                input.into_tvalue(),
                mask.into_tvalue(),
                types.into_tvalue()
            ))
            .ok()?;
        let hidden = out.first()?.clone().into_tensor();
        let hidden = hidden.to_plain_array_view::<f32>().ok()?;
        if hidden.shape() != [1, n, DIM] {
            return None;
        }

        // Mean over tokens. Every token is real here (one sequence, no padding),
        // so the mask the model was given is all ones and the mean is plain.
        let mut v = vec![0f32; DIM];
        for t in 0..n {
            for (d, slot) in v.iter_mut().enumerate() {
                *slot += hidden[[0, t, d]];
            }
        }
        normalise(&mut v);
        Some(v)
    }
}

fn normalise(v: &mut [f32]) {
    let norm = v.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm > 0.0 {
        v.iter_mut().for_each(|x| *x /= norm);
    }
}

/// Similarity of two unit vectors, from -1 to 1.
pub fn cosine(a: &[f32], b: &[f32]) -> f32 {
    a.iter().zip(b).map(|(x, y)| x * y).sum()
}

/// A unit vector as one signed byte per number: 384 bytes instead of 1,536.
/// Components of a unit vector are small, so they are scaled to use the range.
pub fn quantise(v: &[f32]) -> Vec<u8> {
    v.iter()
        .map(|x| ((x * QUANT).round().clamp(-127.0, 127.0) as i8) as u8)
        .collect()
}

/// Similarity between a query and a stored vector, without unpacking the store.
pub fn cosine_quantised(query: &[f32], stored: &[u8]) -> f32 {
    query
        .iter()
        .zip(stored)
        .map(|(q, &s)| q * f32::from(s as i8))
        .sum::<f32>()
        / QUANT
}

/// Components of a 384-long unit vector rarely pass 0.3, so 0.5 maps to the edge
/// of an i8 with room to spare and the rounding error stays under half a percent.
const QUANT: f32 = 254.0;

/// Where the model file is: next to the app in a build, in the source tree in
/// development and tests. `SIDQ_EMBED_MODEL` overrides both.
pub fn model_path() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("SIDQ_EMBED_MODEL") {
        return Some(PathBuf::from(p));
    }
    let exe = std::env::current_exe().ok()?;
    // Contents/MacOS/<binary> → Contents/Resources/embed/…, for the app and the MCP sidecar alike.
    let bundled = exe.parent()?.parent()?.join("Resources").join(RESOURCE);
    if bundled.is_file() {
        return Some(bundled);
    }
    let dev = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join(RESOURCE);
    dev.is_file().then_some(dev)
}

/// The model, loaded on first use and shared. `None` when the file is absent,
/// in which case everything that uses it falls back to keywords.
pub fn shared() -> Option<&'static Embedder> {
    static SHARED: OnceLock<Option<Embedder>> = OnceLock::new();
    SHARED
        .get_or_init(|| model_path().and_then(|p| Embedder::load(&p)))
        .as_ref()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn model() -> &'static Embedder {
        shared().expect("the embedding model is missing: run ./scripts/fetch-embed-model.sh")
    }

    #[derive(serde::Deserialize)]
    struct Reference {
        s: String,
        v: Vec<f32>,
    }

    /// Against vectors recorded from the reference implementation, not our own.
    #[test]
    fn vectors_match_the_reference_implementation() {
        let cases: Vec<Reference> =
            serde_json::from_str(include_str!("../assets/embed/reference-vectors.json")).unwrap();
        for case in cases {
            let ours = model().embed(&case.s).unwrap();
            let agreement = cosine(&ours, &case.v);
            assert!(agreement > 0.99, "{agreement} for {:?}", case.s);
        }
    }

    /// Each question shares almost no words with its note, so this tests meaning
    /// rather than matching. These are the eight the model was chosen on.
    #[test]
    fn a_question_finds_the_note_it_is_about() {
        let notes = [
            "The picker read every transcript on the machine on every open, 157MB and 1.5 seconds",
            "Stripe checkout success_url points at a route that does not exist",
            "use pnpm not npm for this repo",
            "the global shortcut steals focus from the onboarding window",
            "make the landing page hero bigger on phones",
            "signing with an ad-hoc identity makes macOS forget the Accessibility permission on every rebuild",
            "the webhook maps any unknown price to the pro tier",
            "tests read /dev/urandom forever and the machine ran out of memory",
        ];
        let questions = [
            "why does the pill take so long to open",
            "payment redirect goes to a 404 after buying",
            "which package manager should I use",
            "keyboard shortcut breaks the setup screen",
            "mobile layout of the homepage",
            "app keeps asking for accessibility access again after I build",
            "what plan does a customer get after paying",
            "cargo test crashes my laptop with huge RAM use",
        ];
        let notes: Vec<Vec<f32>> = notes.iter().map(|n| model().embed(n).unwrap()).collect();
        for (want, question) in questions.iter().enumerate() {
            let q = model().embed(question).unwrap();
            let best = (0..notes.len())
                .max_by(|&a, &b| cosine(&q, &notes[a]).total_cmp(&cosine(&q, &notes[b])))
                .unwrap();
            assert_eq!(best, want, "{question:?}");
        }
    }

    #[test]
    fn a_long_text_is_read_in_windows_rather_than_cut() {
        let long = "the index is rebuilt from the transcripts every ninety seconds. ".repeat(60);
        let windows = model().embed_windows(&long, 8);
        assert!(windows.len() > 1 && windows.len() <= 8);
        assert!(model().embed_windows("", 8).is_empty());
    }

    #[test]
    fn a_stored_vector_scores_almost_exactly_as_the_original() {
        let a = model().embed("keep everything on the machine").unwrap();
        let b = model().embed("nothing should leave the laptop").unwrap();
        let exact = cosine(&a, &b);
        let stored = cosine_quantised(&a, &quantise(&b));
        assert!((exact - stored).abs() < 0.02, "{exact} vs {stored}");
        assert_eq!(quantise(&b).len(), DIM);
    }

    #[test]
    fn a_missing_model_is_none_rather_than_a_crash() {
        assert!(Embedder::load(Path::new("/nonexistent/model.onnx")).is_none());
    }
}
