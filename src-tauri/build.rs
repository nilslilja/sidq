// Tauri's build script. Generates the context that `tauri::generate_context!()`
// expands into, which is why its absence surfaced as "OUT_DIR env var is not set".
fn main() {
    tauri_build::build()
}
