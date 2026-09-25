//! Search by meaning, over every conversation, on this Mac.
//!
//! Two halves. `catch_up` keeps a vector for every substantive turn in the
//! index, a few seconds at a time from the background sweep, embedding only
//! turns that are new or changed. `search` answers a query from both the
//! keyword index and those vectors and merges the two rankings, so a question
//! phrased nothing like the answer still finds it, and an exact term (an error
//! code, a file name) still wins the way it always did.
//!
//! When the model is missing, everything here degrades to the keyword search
//! that existed before, rather than to nothing.

use std::collections::HashMap;
use std::time::{Duration, Instant};

use rusqlite::{params, Connection};
use serde::Serialize;

use crate::embed::{self, Embedder};
use crate::index_store::{self, SearchHit};

/// A turn this short says nothing a search could want ("ok", "thanks, do it").
const MIN_CHARS: usize = 24;

/// Windows embedded per turn. A pasted log or a long report can be enormous;
/// its first ~250 tokens say what it is about. Measured on a real index, each
/// full window costs about 26ms in a release build, so this is also the cap on
/// what one runaway turn can cost.
const WINDOWS_PER_TURN: usize = 2;

/// Below this similarity a turn is not about the query, however it ranks.
/// MiniLM puts unrelated sentences near zero and paraphrases above 0.4.
const MIN_SIMILARITY: f32 = 0.25;

/// Candidates taken from each ranking before they are merged.
const CANDIDATES: usize = 60;

/// Reciprocal-rank fusion constant. 60 is the value from the original paper and
/// the usual default: it stops the very top of one list from drowning the other.
const RRF_K: f32 = 60.0;

/// Roughly how many characters one window of 126 tokens covers, for pointing an
/// excerpt at the part of a long turn that matched.
const CHARS_PER_WINDOW: usize = 450;

/// One matching turn, with enough around it to cite where it came from.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Passage {
    pub session_id: String,
    pub source: String,
    pub title: String,
    pub project: String,
    pub project_path: String,
    pub ended_at: i64,
    pub role: String,
    /// Position of the turn in its conversation.
    pub ord: usize,
    /// The turn's own words, cut near the part that matched.
    pub excerpt: String,
}

/**
 * Embed whatever is not embedded yet, newest conversations first, until the
 * budget runs out. Returns how many windows were embedded.
 *
 * A conversation is marked done only when every turn in it has been looked at,
 * so one cut short by the budget is simply resumed on the next pass.
 */
pub fn catch_up(conn: &Connection, model: &Embedder, budget: Duration) -> usize {
    let started = Instant::now();
    let mut embedded = 0;

    for (session_id, fingerprint) in stale_sessions(conn) {
        let bodies = bodies_of(conn, &session_id);
        let known = known_digests(conn, &session_id);
        let mut complete = true;

        let tx = match conn.unchecked_transaction() {
            Ok(tx) => tx,
            Err(_) => return embedded,
        };
        for (ord, body) in bodies.iter().enumerate() {
            if started.elapsed() >= budget {
                complete = false;
                break;
            }
            let digest = digest_of(body);
            if known.get(&ord) == Some(&digest) {
                continue;
            }
            let _ = tx.execute(
                "DELETE FROM vectors WHERE session_id = ?1 AND ord = ?2",
                params![session_id, ord as i64],
            );
            // Too short to be about anything, or machinery neither party wrote.
            if body.chars().count() < MIN_CHARS || crate::profile::is_injected(body) {
                continue;
            }
            for (win, v) in model
                .embed_windows(body, WINDOWS_PER_TURN)
                .iter()
                .enumerate()
            {
                let _ = tx.execute(
                    "INSERT OR REPLACE INTO vectors (session_id, ord, win, digest, vec)
                     VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![
                        session_id,
                        ord as i64,
                        win as i64,
                        digest,
                        embed::quantise(v)
                    ],
                );
                embedded += 1;
            }
        }
        // A conversation that got shorter (re-read from a page, say) leaves
        // vectors for turns that no longer exist.
        let _ = tx.execute(
            "DELETE FROM vectors WHERE session_id = ?1 AND ord >= ?2",
            params![session_id, bodies.len() as i64],
        );
        if complete {
            let _ = tx.execute(
                "INSERT OR REPLACE INTO vectored (session_id, fingerprint) VALUES (?1, ?2)",
                params![session_id, fingerprint],
            );
        }
        let _ = tx.commit();
        if !complete {
            break;
        }
    }
    embedded
}

/// Sessions whose messages changed since they were last embedded, newest first.
/// The fingerprint is the message count and highest rowid, which moves whenever
/// `put_messages` rewrites a session and costs one pass over the table to read.
fn stale_sessions(conn: &Connection) -> Vec<(String, String)> {
    conn.prepare(
        "SELECT m.session_id, COUNT(*) || ':' || MAX(m.rowid) AS fp
         FROM messages m
         LEFT JOIN sessions s ON s.session_id = m.session_id
         LEFT JOIN vectored v ON v.session_id = m.session_id
         GROUP BY m.session_id
         HAVING v.fingerprint IS NULL OR v.fingerprint != fp
         ORDER BY MAX(COALESCE(s.ended_at, 0)) DESC",
    )
    .and_then(|mut stmt| {
        let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?;
        Ok(rows.flatten().collect())
    })
    .unwrap_or_default()
}

fn bodies_of(conn: &Connection, session_id: &str) -> Vec<String> {
    conn.prepare("SELECT body FROM messages WHERE session_id = ?1 ORDER BY rowid")
        .and_then(|mut stmt| {
            let rows = stmt.query_map([session_id], |r| r.get(0))?;
            Ok(rows.flatten().collect())
        })
        .unwrap_or_default()
}

fn known_digests(conn: &Connection, session_id: &str) -> HashMap<usize, i64> {
    conn.prepare("SELECT ord, digest FROM vectors WHERE session_id = ?1 AND win = 0")
        .and_then(|mut stmt| {
            let rows = stmt.query_map([session_id], |r| {
                Ok((r.get::<_, i64>(0)? as usize, r.get::<_, i64>(1)?))
            })?;
            Ok(rows.flatten().collect())
        })
        .unwrap_or_default()
}

/// FNV-1a over the text with whitespace collapsed. Stable across builds and
/// Rust versions, which the standard library's hasher does not promise.
fn digest_of(body: &str) -> i64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for word in body.split_whitespace() {
        for b in word.bytes().chain(std::iter::once(b' ')) {
            h ^= u64::from(b);
            h = h.wrapping_mul(0x0100_0000_01b3);
        }
    }
    h as i64
}

/// A turn, as the fusion sees it.
type Key = (String, usize);

/// Two turns sharing this much of their vocabulary are copies of one turn.
const SAME_TURN: f32 = 0.8;

/// The distinct words of the first few hundred, lowercased, punctuation dropped.
fn word_set(body: &str) -> std::collections::HashSet<String> {
    body.split_whitespace()
        .take(400)
        .map(|w| {
            w.chars()
                .filter(|c| c.is_alphanumeric())
                .flat_map(char::to_lowercase)
                .collect::<String>()
        })
        .filter(|w| !w.is_empty())
        .collect()
}

/// How much of the smaller turn is inside the other, 0 to 1. Containment
/// rather than Jaccard, because a re-read copy is the turn plus a little page
/// chrome ("Copy code", "just now"), and two copies with different chrome are
/// further from each other than either is from the turn. Below eight words
/// containment says too little, so short turns must match exactly.
fn overlap(a: &std::collections::HashSet<String>, b: &std::collections::HashSet<String>) -> f32 {
    let smaller = a.len().min(b.len());
    if smaller < 8 {
        return if a == b { 1.0 } else { 0.0 };
    }
    a.intersection(b).count() as f32 / smaller as f32
}

/**
 * Search every conversation by keyword and by meaning, merged.
 *
 * Same contract as `index_store::search`, so the app and the MCP server switch
 * over without changing shape: hits no older than `since`, and how many older
 * conversations also matched, counted without their text.
 */
pub fn search(
    conn: &Connection,
    model: Option<&Embedder>,
    query: &str,
    since: i64,
    limit: usize,
) -> (Vec<SearchHit>, usize) {
    let passages = ranked(conn, model, query, None, CANDIDATES.max(limit));
    let mut withheld = std::collections::HashSet::new();
    let mut hits = Vec::new();
    for (p, snippet) in passages {
        if p.ended_at < since {
            withheld.insert(p.session_id.clone());
            continue;
        }
        if hits.len() < limit {
            hits.push(SearchHit {
                session_id: p.session_id,
                source: p.source,
                title: p.title,
                project: p.project,
                ended_at: p.ended_at,
                snippet,
            });
        }
    }
    (hits, withheld.len())
}

/// The turns most relevant to `query`, optionally within one project, best first.
pub fn passages(
    conn: &Connection,
    model: Option<&Embedder>,
    query: &str,
    project_path: Option<&str>,
    limit: usize,
) -> Vec<Passage> {
    ranked(conn, model, query, project_path, limit)
        .into_iter()
        .map(|(p, _)| p)
        .collect()
}

/// How close a turn must be before it is put in front of an assistant that did
/// not ask. Search shows a list a person scans; recall speaks uninvited, so it
/// has to be right or say nothing.
///
/// Set from real prompts against a real index (`real_recall`, 25 Sep 2026):
/// prompts about something actually discussed reached 0.55 to 0.70 ("what did
/// we decide about the team plan pricing" found the answer at 0.70), and
/// unrelated ones mostly stayed under 0.55 ("make the button blue": 0.39). The
/// one miss at this bar was a generic "fix the typo in the footer" meeting an
/// equally generic "also fix the…" at 0.552.
pub const RECALL_MIN: f32 = 0.55;

/// "yes", "go on", "do it": nothing to recall against, and the commonest prompts.
const RECALL_MIN_WORDS: usize = 4;

/**
 * What this person already said elsewhere that bears on what they just typed.
 *
 * Meaning only, because a keyword match is too weak a reason to interrupt. The
 * conversation being typed into is excluded (its assistant already has it), and
 * so is every other project; conversations with no project, which is every
 * browser chat, stay in.
 */
pub fn recall(
    conn: &Connection,
    model: &Embedder,
    prompt: &str,
    project: Option<&str>,
    current_session: Option<&str>,
    limit: usize,
) -> Vec<Passage> {
    if prompt.split_whitespace().count() < RECALL_MIN_WORDS {
        return Vec::new();
    }
    let mut turns: HashMap<String, Vec<(String, String)>> = HashMap::new();
    let mut kept: Vec<std::collections::HashSet<String>> = Vec::new();
    meaning_scored(conn, model, prompt, project, true)
        .into_iter()
        .filter(|(_, _, score)| *score >= RECALL_MIN)
        .filter(|((session, _), _, _)| Some(session.as_str()) != current_session)
        .filter_map(|((session, ord), win, _)| {
            let (role, body) = turns
                .entry(session.clone())
                .or_insert_with(|| turns_of(conn, &session))
                .get(ord)?
                .clone();
            if crate::profile::is_injected(&body) {
                return None;
            }
            let words = word_set(&body);
            if kept.iter().any(|k| overlap(k, &words) >= SAME_TURN) {
                return None;
            }
            kept.push(words);
            describe(conn, &session, ord, role, excerpt(&body, win))
        })
        .take(limit)
        .collect()
}

/// Both rankings, fused. Each passage comes with the snippet a list would show:
/// FTS5's highlighted one when the keywords found it, an excerpt otherwise.
fn ranked(
    conn: &Connection,
    model: Option<&Embedder>,
    query: &str,
    project_path: Option<&str>,
    limit: usize,
) -> Vec<(Passage, String)> {
    let keyword = keyword_ranking(conn, query, project_path);
    let meaning = model
        .map(|m| meaning_ranking(conn, m, query, project_path))
        .unwrap_or_default();

    let mut fused: HashMap<Key, f32> = HashMap::new();
    for (rank, (key, _)) in keyword.iter().enumerate() {
        *fused.entry(key.clone()).or_default() += 1.0 / (RRF_K + rank as f32 + 1.0);
    }
    for (rank, (key, _)) in meaning.iter().enumerate() {
        *fused.entry(key.clone()).or_default() += 1.0 / (RRF_K + rank as f32 + 1.0);
    }
    let snippets: HashMap<Key, String> = keyword.into_iter().collect();
    let windows: HashMap<Key, usize> = meaning.into_iter().collect();

    let mut order: Vec<(Key, f32)> = fused.into_iter().collect();
    order.sort_by(|a, b| b.1.total_cmp(&a.1).then_with(|| a.0.cmp(&b.0)));

    let mut bodies: HashMap<String, Vec<(String, String)>> = HashMap::new();
    let mut kept: Vec<std::collections::HashSet<String>> = Vec::new();
    order
        .into_iter()
        .filter_map(|(key, _)| {
            let turns = bodies
                .entry(key.0.clone())
                .or_insert_with(|| turns_of(conn, &key.0));
            let (role, body) = turns.get(key.1)?.clone();
            // Keywords match inside harness machinery too; it is never an answer.
            if crate::profile::is_injected(&body) {
                return None;
            }
            // A page read more than once can store the same turn several times,
            // each copy a little different (a "Copy code" button, a timestamp).
            // One copy answers the question; three push the other answers out.
            let words = word_set(&body);
            if kept.iter().any(|k| overlap(k, &words) >= SAME_TURN) {
                return None;
            }
            kept.push(words);
            let excerpt = excerpt(&body, windows.get(&key).copied().unwrap_or(0));
            let snippet = snippets
                .get(&key)
                .cloned()
                .unwrap_or_else(|| excerpt.clone());
            let passage = describe(conn, &key.0, key.1, role, excerpt)?;
            Some((passage, snippet))
        })
        .take(limit)
        .collect()
}

/// FTS5 matches ranked by bm25, as (turn, highlighted snippet).
fn keyword_ranking(conn: &Connection, query: &str, project: Option<&str>) -> Vec<(Key, String)> {
    let cleaned = index_store::fts_query(query);
    if cleaned.is_empty() {
        return Vec::new();
    }
    let rows: Vec<(String, i64, String)> = conn
        .prepare(
            "SELECT m.session_id, m.rowid, snippet(messages, 2, '«', '»', '…', 18)
             FROM messages m
             JOIN sessions s ON s.session_id = m.session_id
             WHERE messages MATCH ?1 AND (?2 IS NULL OR s.project_path = ?2)
             ORDER BY bm25(messages)
             LIMIT ?3",
        )
        .and_then(|mut stmt| {
            let rows = stmt.query_map(params![cleaned, project, CANDIDATES as i64], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?))
            })?;
            Ok(rows.flatten().collect())
        })
        .unwrap_or_default();

    let mut positions: HashMap<String, HashMap<i64, usize>> = HashMap::new();
    rows.into_iter()
        .filter_map(|(session, rowid, snippet)| {
            let map = positions
                .entry(session.clone())
                .or_insert_with(|| rowid_positions(conn, &session));
            let ord = *map.get(&rowid)?;
            Some(((session, ord), snippet))
        })
        .collect()
}

/// Every stored vector scored against the query, best window per turn, as
/// (turn, which window matched). Brute force: ten thousand vectors of 384
/// bytes is a few milliseconds, well under the cost of an index to maintain.
fn meaning_ranking(
    conn: &Connection,
    model: &Embedder,
    query: &str,
    project: Option<&str>,
) -> Vec<(Key, usize)> {
    meaning_scored(conn, model, query, project, false)
        .into_iter()
        .map(|(key, win, _)| (key, win))
        .collect()
}

/// As `meaning_ranking`, with each turn's similarity kept. `unfiled` also lets
/// in conversations with no project at all, which is every browser chat: a
/// ChatGPT conversation has no folder, and is exactly what recall is for.
fn meaning_scored(
    conn: &Connection,
    model: &Embedder,
    query: &str,
    project: Option<&str>,
    unfiled: bool,
) -> Vec<(Key, usize, f32)> {
    let Some(q) = model.embed(query) else {
        return Vec::new();
    };
    let mut best: HashMap<Key, (f32, usize)> = HashMap::new();
    let _ = conn
        .prepare(
            "SELECT v.session_id, v.ord, v.win, v.vec
             FROM vectors v
             JOIN sessions s ON s.session_id = v.session_id
             WHERE ?1 IS NULL OR s.project_path = ?1 OR (?2 AND s.project_path = '')",
        )
        .and_then(|mut stmt| {
            let rows = stmt.query_map(params![project, unfiled], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, i64>(1)? as usize,
                    r.get::<_, i64>(2)? as usize,
                    r.get::<_, Vec<u8>>(3)?,
                ))
            })?;
            for (session, ord, win, vec) in rows.flatten() {
                let score = embed::cosine_quantised(&q, &vec);
                if score < MIN_SIMILARITY {
                    continue;
                }
                let slot = best.entry((session, ord)).or_insert((f32::MIN, 0));
                if score > slot.0 {
                    *slot = (score, win);
                }
            }
            Ok(())
        });
    let mut ranked: Vec<(Key, usize, f32)> = best
        .into_iter()
        .map(|(key, (score, win))| (key, win, score))
        .collect();
    ranked.sort_by(|a, b| b.2.total_cmp(&a.2).then_with(|| a.0.cmp(&b.0)));
    ranked.truncate(CANDIDATES);
    ranked
}

/// rowid → position, for one session.
fn rowid_positions(conn: &Connection, session_id: &str) -> HashMap<i64, usize> {
    conn.prepare("SELECT rowid FROM messages WHERE session_id = ?1 ORDER BY rowid")
        .and_then(|mut stmt| {
            let rows = stmt.query_map([session_id], |r| r.get::<_, i64>(0))?;
            Ok(rows.flatten().enumerate().map(|(i, id)| (id, i)).collect())
        })
        .unwrap_or_default()
}

fn turns_of(conn: &Connection, session_id: &str) -> Vec<(String, String)> {
    conn.prepare("SELECT role, body FROM messages WHERE session_id = ?1 ORDER BY rowid")
        .and_then(|mut stmt| {
            let rows = stmt.query_map([session_id], |r| Ok((r.get(0)?, r.get(1)?)))?;
            Ok(rows.flatten().collect())
        })
        .unwrap_or_default()
}

fn describe(
    conn: &Connection,
    session_id: &str,
    ord: usize,
    role: String,
    excerpt: String,
) -> Option<Passage> {
    conn.query_row(
        "SELECT source, title, project, project_path, ended_at FROM sessions WHERE session_id = ?1",
        [session_id],
        |r| {
            Ok(Passage {
                session_id: session_id.to_string(),
                source: r.get(0)?,
                title: r.get(1)?,
                project: r.get(2)?,
                project_path: r.get(3)?,
                ended_at: r.get(4)?,
                role,
                ord,
                excerpt,
            })
        },
    )
    .ok()
}

/// About 300 characters of the turn, starting near the window that matched,
/// on word boundaries, marked where it was cut.
fn excerpt(body: &str, window: usize) -> String {
    const LEN: usize = 300;
    let chars: Vec<char> = body.chars().collect();
    let mut start = (window * CHARS_PER_WINDOW).min(chars.len().saturating_sub(LEN));
    while start > 0 && !chars[start - 1].is_whitespace() {
        start -= 1;
    }
    let mut end = (start + LEN).min(chars.len());
    while end < chars.len() && !chars[end].is_whitespace() {
        end += 1;
    }
    let text: String = chars[start..end].iter().collect();
    let text = text.split_whitespace().collect::<Vec<_>>().join(" ");
    format!(
        "{}{}{}",
        if start > 0 { "…" } else { "" },
        text,
        if end < chars.len() { "…" } else { "" }
    )
}

/// "25 Sep 2026", from milliseconds since 1970, in UTC. For citing when a
/// passage was said, which is the one thing a reader checks first.
pub fn day_label(ms: i64) -> String {
    const MONTHS: [&str; 12] = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    // Howard Hinnant's civil_from_days.
    let z = ms.div_euclid(86_400_000) + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!("{day} {} {year}", MONTHS[(month - 1) as usize])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn model() -> &'static Embedder {
        embed::shared().expect("the embedding model is missing: run ./scripts/fetch-embed-model.sh")
    }

    fn db() -> Connection {
        index_store::tests::memory()
    }

    fn session(conn: &Connection, id: &str, project_path: &str, ended_at: i64) {
        conn.execute(
            "INSERT INTO sessions (session_id, source, title, project, project_path, ended_at)
             VALUES (?1, 'claude-code', ?1, 'P', ?2, ?3)",
            params![id, project_path, ended_at],
        )
        .unwrap();
    }

    fn turns(conn: &Connection, id: &str, bodies: &[&str]) {
        let messages: Vec<(String, String)> = bodies
            .iter()
            .enumerate()
            .map(|(i, b)| {
                (
                    (if i % 2 == 0 { "You" } else { "Assistant" }).to_string(),
                    b.to_string(),
                )
            })
            .collect();
        index_store::put_messages(conn, id, &messages, "fp").unwrap();
    }

    fn all_time() -> Duration {
        Duration::from_secs(600)
    }

    const PAYMENT: &str = "Stripe checkout success_url points at a route that does not exist";
    const PICKER: &str =
        "The picker read every transcript on the machine on every open, which took seconds";

    #[test]
    fn every_substantive_turn_is_embedded_once() {
        let conn = db();
        session(&conn, "a", "/p", 10);
        turns(&conn, "a", &[PAYMENT, "ok", PICKER]);

        let first = catch_up(&conn, model(), all_time());
        assert_eq!(first, 2, "the two real turns, and not \"ok\"");
        assert_eq!(
            catch_up(&conn, model(), all_time()),
            0,
            "nothing new, nothing embedded"
        );
    }

    /// Harness machinery stored as a turn (a queued-task notice, a session
    /// summary, a skill's instructions) is long, covers every topic, and was
    /// written by neither party. Embedded, it matches every question asked.
    #[test]
    fn text_nobody_in_the_conversation_wrote_is_never_embedded() {
        let conn = db();
        session(&conn, "a", "/p", 10);
        turns(
            &conn,
            "a",
            &[
                "<task-notification> <task-id>x</task-id> <status>completed</status> the agent finished",
                "This session is being continued from a previous conversation that ran out of context.",
                PAYMENT,
            ],
        );
        assert_eq!(catch_up(&conn, model(), all_time()), 1);
    }

    #[test]
    fn a_conversation_that_grows_only_has_its_new_turns_embedded() {
        let conn = db();
        session(&conn, "a", "/p", 10);
        turns(&conn, "a", &[PAYMENT, PICKER]);
        catch_up(&conn, model(), all_time());

        // put_messages rewrites every row, as the indexer does when a session grows.
        turns(
            &conn,
            "a",
            &[
                PAYMENT,
                PICKER,
                "the global shortcut steals focus from the onboarding window",
            ],
        );
        assert_eq!(catch_up(&conn, model(), all_time()), 1);
    }

    #[test]
    fn a_conversation_that_shrinks_loses_the_vectors_of_turns_that_are_gone() {
        let conn = db();
        session(&conn, "a", "/p", 10);
        turns(&conn, "a", &[PAYMENT, PICKER]);
        catch_up(&conn, model(), all_time());
        turns(&conn, "a", &[PAYMENT]);
        catch_up(&conn, model(), all_time());
        let left: i64 = conn
            .query_row(
                "SELECT COUNT(DISTINCT ord) FROM vectors WHERE session_id = 'a'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(left, 1);
    }

    #[test]
    fn a_pass_cut_short_by_its_budget_is_resumed_rather_than_marked_done() {
        let conn = db();
        session(&conn, "a", "/p", 10);
        turns(&conn, "a", &[PAYMENT, PICKER]);
        assert_eq!(catch_up(&conn, model(), Duration::ZERO), 0);
        assert_eq!(catch_up(&conn, model(), all_time()), 2);
    }

    /// No word of the question appears in the answer. Keyword search alone
    /// returns nothing for it; this is the whole point of the module.
    #[test]
    fn a_question_finds_a_turn_that_shares_none_of_its_words() {
        let conn = db();
        session(&conn, "a", "/p", 10);
        turns(
            &conn,
            "a",
            &[
                PICKER,
                PAYMENT,
                "make the landing page hero bigger on phones",
            ],
        );
        catch_up(&conn, model(), all_time());

        let question = "payment redirect goes to a 404 after buying";
        assert!(index_store::search(&conn, question, 0, 10).0.is_empty());

        let (hits, _) = search(&conn, Some(model()), question, 0, 10);
        assert!(hits[0].snippet.contains("success_url"), "{hits:?}");
    }

    /// An error code or a file name means nothing to a language model and
    /// everything to the person who typed it. Keywords must still win those.
    #[test]
    fn an_exact_term_is_still_found_by_its_letters() {
        let conn = db();
        session(&conn, "a", "/p", 10);
        turns(
            &conn,
            "a",
            &[
                PICKER,
                "the build failed with ENOENT on the sidecar binary path",
                PAYMENT,
            ],
        );
        catch_up(&conn, model(), all_time());

        let (hits, _) = search(&conn, Some(model()), "ENOENT", 0, 10);
        assert!(hits[0].snippet.contains("ENOENT"), "{hits:?}");
    }

    #[test]
    fn machinery_is_never_returned_even_when_its_words_match() {
        let conn = db();
        session(&conn, "a", "/p", 10);
        turns(
            &conn,
            "a",
            &[
                "This session is being continued from a previous conversation about the checkout",
                PAYMENT,
            ],
        );
        catch_up(&conn, model(), all_time());
        let (hits, _) = search(&conn, Some(model()), "checkout", 0, 10);
        assert!(
            hits.iter().all(|h| !h.snippet.contains("being continued")),
            "{hits:?}"
        );
        assert!(!hits.is_empty());
    }

    #[test]
    fn the_same_words_stored_twice_come_back_once() {
        let conn = db();
        session(&conn, "a", "/p", 10);
        turns(
            &conn,
            "a",
            &[PAYMENT, "hello there, nothing to see", PAYMENT, PICKER],
        );
        catch_up(&conn, model(), all_time());
        let found = passages(&conn, Some(model()), "checkout redirect is broken", None, 5);
        let copies = found
            .iter()
            .filter(|p| p.excerpt.contains("success_url"))
            .count();
        assert_eq!(copies, 1, "{found:?}");
    }

    /// As a page reader stores them: the same turn, re-read with a little of
    /// the page around it.
    #[test]
    fn near_copies_of_one_turn_come_back_once() {
        let conn = db();
        session(&conn, "a", "/p", 10);
        let copy = format!("{PAYMENT}. Copy code");
        let other = format!("just now {PAYMENT}");
        turns(&conn, "a", &[PAYMENT, PICKER, &copy, &other]);
        catch_up(&conn, model(), all_time());
        let found = passages(&conn, Some(model()), "checkout redirect is broken", None, 5);
        let copies = found
            .iter()
            .filter(|p| p.excerpt.contains("success_url"))
            .count();
        assert_eq!(copies, 1, "{found:?}");
    }

    #[test]
    fn recall_brings_back_what_was_said_in_another_conversation() {
        let conn = db();
        session(&conn, "cursor-chat", "/work/sidq", 10);
        session(&conn, "typing-now", "/work/sidq", 20);
        turns(&conn, "cursor-chat", &[PAYMENT, PICKER]);
        turns(
            &conn,
            "typing-now",
            &["the checkout page is broken after payment"],
        );
        catch_up(&conn, model(), all_time());

        let found = recall(
            &conn,
            model(),
            "the stripe checkout success_url goes to a route that does not exist",
            Some("/work/sidq"),
            Some("typing-now"),
            3,
        );
        assert_eq!(
            found.first().map(|p| p.session_id.as_str()),
            Some("cursor-chat"),
            "{found:?}"
        );
        assert!(found.iter().all(|p| p.session_id != "typing-now"));
    }

    #[test]
    fn recall_says_nothing_rather_than_something_loosely_related() {
        let conn = db();
        session(&conn, "a", "/p", 10);
        turns(&conn, "a", &[PAYMENT, PICKER]);
        catch_up(&conn, model(), all_time());
        assert!(recall(
            &conn,
            model(),
            "make the button blue please",
            Some("/p"),
            None,
            3
        )
        .is_empty());
        assert!(recall(&conn, model(), "yes do it", Some("/p"), None, 3).is_empty());
    }

    /// A browser chat has no project folder. It is still this person's, and it
    /// is the whole reason recall exists; another project's work is not.
    #[test]
    fn recall_reaches_browser_chats_but_not_other_projects() {
        let conn = db();
        session(&conn, "chatgpt", "", 10);
        session(&conn, "elsewhere", "/work/other", 10);
        turns(&conn, "chatgpt", &[PAYMENT]);
        turns(
            &conn,
            "elsewhere",
            &["Stripe checkout success_url points at a route that is missing"],
        );
        catch_up(&conn, model(), all_time());

        let found = recall(
            &conn,
            model(),
            "stripe checkout success_url points at a missing route",
            Some("/work/sidq"),
            None,
            3,
        );
        assert!(found.iter().any(|p| p.session_id == "chatgpt"), "{found:?}");
        assert!(
            found.iter().all(|p| p.session_id != "elsewhere"),
            "{found:?}"
        );
    }

    #[test]
    fn with_no_model_search_is_the_keyword_search_it_always_was() {
        let conn = db();
        session(&conn, "a", "/p", 10);
        turns(&conn, "a", &[PICKER, PAYMENT]);
        let (hits, _) = search(&conn, None, "picker transcript", 0, 10);
        assert_eq!(hits.len(), 1);
        assert!(hits[0].snippet.contains('«'));
    }

    /// The free plan's window applies to meaning exactly as it does to keywords:
    /// older matches are counted, never returned.
    #[test]
    fn matches_older_than_the_window_are_counted_not_returned() {
        let conn = db();
        session(&conn, "old", "/p", 5);
        session(&conn, "new", "/p", 50);
        turns(&conn, "old", &[PAYMENT]);
        turns(&conn, "new", &[PICKER]);
        catch_up(&conn, model(), all_time());

        let (hits, withheld) = search(
            &conn,
            Some(model()),
            "payment redirect goes to a 404 after buying",
            10,
            10,
        );
        assert!(hits.iter().all(|h| h.session_id != "old"));
        assert_eq!(withheld, 1);
    }

    #[test]
    fn passages_stay_inside_the_project_asked_about() {
        let conn = db();
        session(&conn, "mine", "/work/sidq", 10);
        session(&conn, "other", "/work/else", 10);
        turns(&conn, "mine", &[PICKER]);
        turns(&conn, "other", &[PAYMENT]);
        catch_up(&conn, model(), all_time());

        let found = passages(
            &conn,
            Some(model()),
            "checkout redirect broken",
            Some("/work/sidq"),
            5,
        );
        assert!(
            found.iter().all(|p| p.project_path == "/work/sidq"),
            "{found:?}"
        );
    }

    /**
     * Against a copy of a real index. Prints what it did and what real
     * questions find, for a person to judge; asserts only that it worked.
     *
     *   cp "~/Library/Application Support/app.sidq.desktop/index.sqlite" /tmp/idx.sqlite
     *   SIDQ_INDEX_COPY=/tmp/idx.sqlite cargo test --lib real_semantic -- --ignored --nocapture
     */
    #[test]
    #[ignore = "reads a copy of a real index"]
    fn real_semantic() {
        let path = std::env::var("SIDQ_INDEX_COPY").expect("SIDQ_INDEX_COPY");
        let conn = Connection::open(&path).unwrap();
        index_store::tests::migrate_for_tests(&conn);

        let started = Instant::now();
        if std::env::var("SIDQ_REEMBED").is_ok() {
            conn.execute_batch("DELETE FROM vectors; DELETE FROM vectored;")
                .unwrap();
        }
        let windows = catch_up(&conn, model(), Duration::from_secs(3_600));
        let took = started.elapsed();
        let stored: i64 = conn
            .query_row("SELECT COUNT(*) FROM vectors", [], |r| r.get(0))
            .unwrap();
        println!("embedded {windows} windows in {took:?} ({stored} stored)");
        assert!(stored > 0);

        let queries = std::env::var("SIDQ_QUERIES").unwrap_or_default();
        for q in queries.split('|').filter(|q| !q.trim().is_empty()) {
            let t = Instant::now();
            let found = passages(&conn, Some(model()), q, None, 3);
            let by_keyword = index_store::search(&conn, q, 0, 3).0.len();
            println!(
                "\n## {q}   ({:?}; keywords alone: {by_keyword} hits)",
                t.elapsed()
            );
            for p in found {
                println!(
                    "  - [{} {} turn {}] {}",
                    p.source,
                    day_label(p.ended_at),
                    p.ord + 1,
                    p.excerpt
                );
            }
        }
    }

    /**
     * The scores real prompts reach, for setting `RECALL_MIN`. Prints the best
     * three per prompt; asserts nothing.
     *
     *   SIDQ_INDEX_COPY=/tmp/idx.sqlite SIDQ_QUERIES="a|b" cargo test --lib real_recall -- --ignored --nocapture
     */
    #[test]
    #[ignore = "reads a copy of a real index"]
    fn real_recall() {
        let conn = Connection::open(std::env::var("SIDQ_INDEX_COPY").unwrap()).unwrap();
        index_store::tests::migrate_for_tests(&conn);
        let prompts = std::env::var("SIDQ_QUERIES").unwrap_or_default();
        for q in prompts.split('|').filter(|q| !q.trim().is_empty()) {
            println!("\n## {q}");
            for ((session, ord), _, score) in meaning_scored(&conn, model(), q, None, true)
                .into_iter()
                .take(3)
            {
                let body = turns_of(&conn, &session)
                    .get(ord)
                    .map(|t| t.1.clone())
                    .unwrap_or_default();
                let flag = if crate::profile::is_injected(&body) {
                    " [machinery]"
                } else {
                    ""
                };
                println!(
                    "  {score:.3}{flag}  {}",
                    body.chars()
                        .take(110)
                        .collect::<String>()
                        .replace('\n', " ")
                );
            }
        }
    }

    #[test]
    fn a_day_is_labelled_the_way_a_person_writes_it() {
        assert_eq!(day_label(0), "1 Jan 1970");
        assert_eq!(day_label(1_790_356_615_000), "25 Sep 2026");
        assert_eq!(day_label(951_782_400_000), "29 Feb 2000");
    }

    #[test]
    fn an_excerpt_is_cut_on_words_and_says_so() {
        let body = format!("{} needle {}", "alpha ".repeat(200), "omega ".repeat(200));
        let e = excerpt(&body, 1);
        assert!(e.starts_with('…') && e.ends_with('…'));
        assert!(!e.contains("  "));
        assert!(e.chars().count() <= 310);
    }
}
