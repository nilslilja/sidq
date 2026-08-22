// Tauri's build script. Generates the context that `tauri::generate_context!()`
// expands into, which is why its absence surfaced as "OUT_DIR env var is not set".

use std::path::Path;

/// The values Rust needs at compile time. All are public by design.
///
/// All of them are public: the URLs appear in every request the app makes and
/// the anon key is designed to ship inside clients, so baking them in is safe.
/// Nothing with `sb_secret_` or `sk_live_` belongs anywhere near this list.
const FROM_DOTENV: [&str; 3] = [
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_ANON_KEY",
    // Without this, web_origin() returns None in every release build and
    // sign-in, the connect page and the plans all refuse with "no web address
    // is configured". It was absent, and sidq.tech appeared zero times in the
    // shipped binary.
    "SIDQ_WEB_ORIGIN",
];

/**
 * Lift a few values out of `.env` so `option_env!` can see them.
 *
 * Vite reads `.env` for the frontend; cargo does not read it at all. Without
 * this the tier check compiles to a branch that can never run, and a free
 * account would quietly stay free forever because the app had no address to ask.
 */
fn load_dotenv() {
    let path = Path::new("../.env");
    println!("cargo:rerun-if-changed=../.env");

    let Ok(contents) = std::fs::read_to_string(path) else {
        return;
    };

    for line in contents.lines() {
        let line = line.trim();
        if line.starts_with('#') {
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let key = key.trim();
        if !FROM_DOTENV.contains(&key) {
            continue;
        }

        // Quotes are part of dotenv syntax, not part of the value.
        let value = value.trim().trim_matches('"').trim_matches('\'');
        println!("cargo:rustc-env={key}={value}");
    }
}

fn main() {
    load_dotenv();
    tauri_build::build()
}
