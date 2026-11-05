#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    name: &'static str,
    version: &'static str,
    backend_ready: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProbeRequest {
    path: String,
}

#[tauri::command]
fn app_info() -> AppInfo {
    AppInfo {
        name: "BitBento",
        version: env!("CARGO_PKG_VERSION"),
        backend_ready: false,
    }
}

#[tauri::command]
async fn probe_video(request: ProbeRequest) -> Result<serde_json::Value, String> {
    // TODO: invoke the ffprobe sidecar with a fixed argument template, parse JSON,
    // validate the path, and return the typed media model from ARCHITECTURE.md.
    Err(format!("ffprobe integration pending for {}", request.path))
}

fn main() {
    tracing_subscriber::fmt::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![app_info, probe_video])
        .run(tauri::generate_context!())
        .expect("failed to run BitBento");
}
