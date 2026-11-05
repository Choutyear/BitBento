use std::path::{Path, PathBuf};

use tauri::{AppHandle, Emitter, State};
use tauri_plugin_dialog::DialogExt;

use crate::encoder;
use crate::errors::AppError;
use crate::hardware;
use crate::models::{
    AppInfo, EncodeJob, EncodeJobRequest, EstimateResult, HardwareEncoder, MediaInfo,
    OutputSettings,
};
use crate::paths;
use crate::power;
use crate::probe;
use crate::process;
use crate::queue::AppState;

#[tauri::command]
pub async fn get_app_info() -> Result<AppInfo, AppError> {
    let output = process::hidden(paths::sidecar("ffmpeg")?)
        .arg("-version")
        .output()
        .await?;
    let version_output = String::from_utf8_lossy(&output.stdout);
    let version = version_output
        .lines()
        .next()
        .unwrap_or("FFmpeg 未知版本")
        .to_string();
    Ok(AppInfo {
        name: "BitBento",
        version: env!("CARGO_PKG_VERSION"),
        backend_ready: output.status.success(),
        ffmpeg_version: version,
    })
}

#[tauri::command]
pub async fn select_media_files(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<MediaInfo>, AppError> {
    let picked = app
        .dialog()
        .file()
        .add_filter("视频文件", &["mp4", "mov", "mkv", "webm", "m4v", "avi"])
        .blocking_pick_files()
        .unwrap_or_default();
    let mut media = Vec::new();
    for item in picked {
        if let Ok(path) = item.into_path() {
            match probe::probe(&path).await {
                Ok(info) => {
                    state.register_preview(&info.id, path);
                    media.push(info);
                }
                Err(error) => {
                    tracing::error!(path = %path.display(), error = %error, "probe failed")
                }
            }
        }
    }
    Ok(media)
}

#[tauri::command]
pub async fn select_output_directory(app: AppHandle) -> Result<Option<String>, AppError> {
    Ok(app
        .dialog()
        .file()
        .blocking_pick_folder()
        .and_then(|p| p.into_path().ok())
        .map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
pub async fn probe_media(path: String, state: State<'_, AppState>) -> Result<MediaInfo, AppError> {
    let canonical = PathBuf::from(&path)
        .canonicalize()
        .map_err(|error| AppError::Probe(error.to_string()))?;
    let info = probe::probe(&canonical).await?;
    state.register_preview(&info.id, canonical);
    Ok(info)
}

#[tauri::command]
pub async fn create_compatible_preview(
    id: String,
    state: State<'_, AppState>,
) -> Result<String, AppError> {
    let source = state
        .preview_path(&id)
        .ok_or_else(|| AppError::Probe("预览文件未注册或已失效。".into()))?;
    let preview_id = format!("{}-compat", uuid::Uuid::new_v4());
    let cache_dir = dirs::cache_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("BitBento")
        .join("previews");
    tokio::fs::create_dir_all(&cache_dir).await?;
    let output = cache_dir.join(format!("{preview_id}.mp4"));
    let partial = cache_dir.join(format!("{preview_id}.part.mp4"));
    let result = process::hidden(paths::sidecar("ffmpeg")?)
        .args(["-y", "-hide_banner", "-loglevel", "error", "-i"])
        .arg(&source)
        .args([
            "-map",
            "0:v:0",
            "-map",
            "0:a:0?",
            "-vf",
            "scale=min(1280\\,iw):-2",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "28",
            "-c:a",
            "aac",
            "-b:a",
            "96k",
            "-movflags",
            "+faststart",
        ])
        .arg(&partial)
        .stdin(std::process::Stdio::null())
        .output()
        .await?;
    if !result.status.success() {
        let _ = tokio::fs::remove_file(&partial).await;
        let detail = String::from_utf8_lossy(&result.stderr).trim().to_string();
        tracing::error!(media_id = %id, %detail, "compatible preview generation failed");
        return Err(AppError::Probe(if detail.is_empty() {
            "无法生成兼容预览。".into()
        } else {
            detail
        }));
    }
    tokio::fs::rename(&partial, &output).await?;
    state.register_preview(&preview_id, output);
    Ok(preview_id)
}

#[tauri::command]
pub fn unregister_preview(id: String, state: State<'_, AppState>) {
    state.unregister_preview(&id);
}

#[tauri::command]
pub async fn detect_hardware_encoders(
    state: State<'_, AppState>,
) -> Result<Vec<HardwareEncoder>, AppError> {
    if let Some(cached) = state.hardware.lock().clone() {
        return Ok(cached);
    }
    let detected = hardware::detect().await?;
    *state.hardware.lock() = Some(detected.clone());
    Ok(detected)
}

#[tauri::command]
pub fn estimate_job(
    media: MediaInfo,
    settings: OutputSettings,
) -> Result<EstimateResult, AppError> {
    encoder::estimate(&media, &settings)
}

#[tauri::command]
pub fn enqueue_jobs(
    requests: Vec<EncodeJobRequest>,
    state: State<'_, AppState>,
) -> Result<Vec<EncodeJob>, AppError> {
    let mut created = Vec::new();
    for request in requests {
        let estimate = encoder::estimate(&request.media, &request.settings)?;
        created.push(EncodeJob {
            id: request.id,
            media: request.media,
            settings: request.settings,
            estimate,
            state: "queued".into(),
            progress: 0.0,
            error: None,
        });
    }
    state.jobs.lock().extend(created.clone());
    Ok(created)
}

#[tauri::command]
pub fn start_queue(app: AppHandle, state: State<'_, AppState>) -> Result<(), AppError> {
    {
        let mut running = state.queue_running.lock();
        if *running {
            return Err(AppError::InvalidSettings("输出队列正在运行。".into()));
        }
        *running = true;
    }
    let shared = state.inner().clone();
    tauri::async_runtime::spawn(async move {
        let _sleep_guard = power::SleepGuard::new();
        let cached_hardware = shared.hardware.lock().clone();
        let hardware = match cached_hardware {
            Some(value) => value,
            None => match hardware::detect().await {
                Ok(value) => {
                    *shared.hardware.lock() = Some(value.clone());
                    value
                }
                Err(error) => {
                    tracing::error!(%error, "hardware detection failed");
                    Vec::new()
                }
            },
        };
        let jobs = shared.jobs.lock().clone();
        for job in jobs.into_iter().filter(|j| j.state == "queued") {
            if shared.is_cancelled(&job.id) {
                update_job(
                    &shared,
                    &job.id,
                    "cancelled",
                    Some("任务已取消".into()),
                    0.0,
                );
                encoder::emit(
                    Some(&app),
                    &job.id,
                    "cancelled",
                    0,
                    0,
                    job.media.duration_ms,
                    0.0,
                    None,
                    None,
                    0,
                    None,
                    Some("任务已取消".into()),
                    None,
                    None,
                );
                continue;
            }
            update_job(&shared, &job.id, "encoding", None, 0.0);
            match encoder::encode_job(Some(&app), &shared, &job, &hardware).await {
                Ok(output) => {
                    update_job(&shared, &job.id, "completed", None, 100.0);
                    encoder::emit(
                        Some(&app),
                        &job.id,
                        "completed",
                        0,
                        job.media.duration_ms,
                        job.media.duration_ms,
                        100.0,
                        None,
                        None,
                        0,
                        Some(0),
                        Some("压缩完成".into()),
                        Some(output),
                        None,
                    );
                }
                Err(AppError::Cancelled) => {
                    update_job(
                        &shared,
                        &job.id,
                        "cancelled",
                        Some("任务已取消".into()),
                        0.0,
                    );
                    encoder::emit(
                        Some(&app),
                        &job.id,
                        "cancelled",
                        0,
                        0,
                        job.media.duration_ms,
                        0.0,
                        None,
                        None,
                        0,
                        None,
                        Some("任务已取消".into()),
                        None,
                        None,
                    );
                }
                Err(error) => {
                    let technical = error.to_string();
                    tracing::error!(job_id = %job.id, error = %technical, "encode failed");
                    update_job(&shared, &job.id, "failed", Some(technical.clone()), 0.0);
                    encoder::emit(
                        Some(&app),
                        &job.id,
                        "failed",
                        0,
                        0,
                        job.media.duration_ms,
                        0.0,
                        None,
                        None,
                        0,
                        None,
                        Some("压缩失败，已继续处理队列中的其他任务。".into()),
                        None,
                        Some(technical),
                    );
                }
            }
        }
        *shared.queue_running.lock() = false;
        let _ = app.emit("queue-finished", ());
    });
    Ok(())
}

fn update_job(state: &AppState, id: &str, status: &str, error: Option<String>, progress: f64) {
    if let Some(job) = state.jobs.lock().iter_mut().find(|j| j.id == id) {
        job.state = status.into();
        job.error = error;
        job.progress = progress;
    }
}

#[tauri::command]
pub async fn cancel_job(id: String, state: State<'_, AppState>) -> Result<(), AppError> {
    state.mark_cancelled(&id);
    let pid = state.running_pids.lock().get(&id).copied();
    if let Some(pid) = pid {
        let _ = process::hidden("taskkill.exe")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .output()
            .await;
    }
    Ok(())
}

#[tauri::command]
pub fn remove_job(id: String, state: State<'_, AppState>) -> Result<(), AppError> {
    if state.running_pids.lock().contains_key(&id) {
        return Err(AppError::InvalidSettings("正在压缩的任务请先取消。".into()));
    }
    state.jobs.lock().retain(|job| job.id != id);
    Ok(())
}

#[tauri::command]
pub fn clear_queue(state: State<'_, AppState>) -> Result<(), AppError> {
    if !state.running_pids.lock().is_empty() {
        return Err(AppError::InvalidSettings(
            "压缩进行中，不能清空队列。".into(),
        ));
    }
    state.jobs.lock().clear();
    Ok(())
}

#[tauri::command]
pub fn open_project_homepage() -> Result<(), AppError> {
    // Keep this URL in trusted backend code. The frontend cannot pass arbitrary
    // URLs to the operating system.
    open::that_detached("https://github.com/Choutyear/BitBento")
        .map_err(|e| AppError::Output(e.to_string()))
}

#[tauri::command]
pub fn open_output_file(path: String) -> Result<(), AppError> {
    let path = PathBuf::from(path);
    if !path.is_file() {
        return Err(AppError::Output("输出文件不存在。".into()));
    }
    open::that_detached(path).map_err(|e| AppError::Output(e.to_string()))
}

#[tauri::command]
pub fn open_output_folder(path: String) -> Result<(), AppError> {
    let path = PathBuf::from(path);
    let folder = if path.is_dir() {
        path
    } else {
        path.parent()
            .map(Path::to_path_buf)
            .ok_or_else(|| AppError::Output("输出目录不存在。".into()))?
    };
    if !folder.is_dir() {
        return Err(AppError::Output("输出目录不存在。".into()));
    }
    open::that_detached(folder).map_err(|e| AppError::Output(e.to_string()))
}
