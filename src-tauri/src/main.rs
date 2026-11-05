#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod encoder;
mod errors;
mod hardware;
mod media_protocol;
mod models;
mod paths;
mod power;
mod probe;
mod process;
mod queue;

fn main() {
    let log_dir = dirs::data_local_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("BitBento")
        .join("logs");
    let _ = std::fs::create_dir_all(&log_dir);
    let appender = tracing_appender::rolling::daily(log_dir, "bitbento.log");
    let (writer, _guard) = tracing_appender::non_blocking(appender);
    tracing_subscriber::fmt()
        .with_writer(writer)
        .with_ansi(false)
        .init();

    let state = queue::AppState::default();
    let preview_paths = state.preview_paths.clone();
    tauri::Builder::default()
        .register_uri_scheme_protocol("bitbento-media", move |_context, request| {
            media_protocol::respond(&preview_paths, request)
        })
        .manage(state)
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_app_info,
            commands::select_media_files,
            commands::select_output_directory,
            commands::probe_media,
            commands::create_compatible_preview,
            commands::unregister_preview,
            commands::detect_hardware_encoders,
            commands::estimate_job,
            commands::enqueue_jobs,
            commands::start_queue,
            commands::cancel_job,
            commands::remove_job,
            commands::clear_queue,
            commands::open_project_homepage,
            commands::open_output_file,
            commands::open_output_folder,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run BitBento");
}
