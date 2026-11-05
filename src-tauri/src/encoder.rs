use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, BufReader};
use tokio::process::Command;

use crate::errors::AppError;
use crate::hardware;
use crate::models::{
    EncodeJob, EncodeMode, EstimateResult, HardwareEncoder, MediaInfo, OutputSettings,
    ProgressEvent,
};
use crate::queue::AppState;
use crate::{paths, probe};

const TARGET_OVERHEAD_KBPS: u64 = 32;
const DEFAULT_AUDIO_KBPS: u64 = 192;

fn normalize_container(requested: &str, source: &str, mode: &EncodeMode) -> String {
    if *mode == EncodeMode::TargetSize {
        return "MP4".into();
    }
    if requested == "same" {
        source.to_string()
    } else {
        requested.to_string()
    }
}

fn normalize_codec(requested: &str, source: &str, mode: &EncodeMode) -> String {
    if *mode == EncodeMode::TargetSize {
        return "H.265".into();
    }
    if requested == "same" {
        source.to_string()
    } else {
        requested.to_string()
    }
}

fn extension(container: &str) -> Result<&'static str, AppError> {
    match container {
        "MP4" => Ok("mp4"),
        "MKV" => Ok("mkv"),
        "MOV" => Ok("mov"),
        "WebM" => Ok("webm"),
        _ => Err(AppError::InvalidSettings(format!(
            "不支持的封装格式：{container}"
        ))),
    }
}

fn compatible(container: &str, codec: &str) -> bool {
    match container {
        "MP4" => matches!(codec, "H.264" | "H.265" | "AV1"),
        "MKV" => matches!(codec, "H.264" | "H.265" | "AV1" | "VP9"),
        "MOV" => matches!(codec, "H.264" | "H.265"),
        "WebM" => matches!(codec, "AV1" | "VP9"),
        _ => false,
    }
}

pub fn estimate(media: &MediaInfo, settings: &OutputSettings) -> Result<EstimateResult, AppError> {
    if media.duration_ms == 0 {
        return Err(AppError::InvalidSettings(
            "视频时长为零，无法计算码率。".into(),
        ));
    }
    let container = normalize_container(&settings.container, &media.container, &settings.mode);
    let codec = normalize_codec(&settings.video_codec, &media.video_codec, &settings.mode);
    if !compatible(&container, &codec) {
        return Err(AppError::InvalidSettings(format!(
            "{container} 不支持 {codec} 视频编码。"
        )));
    }
    let audio_kbps = if settings.audio_mode == "remove" {
        0
    } else if settings.audio_mode == "same" {
        media
            .audio_bitrate_kbps
            .unwrap_or(DEFAULT_AUDIO_KBPS)
            .clamp(64, 320)
    } else {
        settings.audio_bitrate_kbps.unwrap_or(DEFAULT_AUDIO_KBPS)
    };
    let duration_seconds = media.duration_ms as f64 / 1000.0;
    let (video_kbps, estimated_bytes) = if settings.mode == EncodeMode::TargetSize {
        let requested = settings
            .target_bytes
            .ok_or_else(|| AppError::InvalidSettings("请输入目标文件大小。".into()))?;
        let budget = if settings.strict_target {
            (requested as f64 * 0.97) as u64
        } else {
            requested
        };
        let total_kbps = budget as f64 * 8.0 / duration_seconds / 1000.0;
        let calculated = total_kbps - audio_kbps as f64 - TARGET_OVERHEAD_KBPS as f64;
        let min_kbps = minimum_bitrate(&codec, media.width, media.height);
        if !calculated.is_finite() || calculated < min_kbps as f64 {
            let minimum_mb =
                ((min_kbps + audio_kbps + TARGET_OVERHEAD_KBPS) as f64 * duration_seconds * 1000.0
                    / 8.0
                    / 1_000_000.0)
                    .ceil();
            return Err(AppError::InvalidSettings(format!(
                "目标过小：此视频至少需要约 {minimum_mb:.0} MB，才能保留可用画质和音频。"
            )));
        }
        (calculated.floor() as u64, requested)
    } else {
        let video = settings
            .bitrate_kbps
            .ok_or_else(|| AppError::InvalidSettings("请输入平均视频码率。".into()))?;
        if video < 100 {
            return Err(AppError::InvalidSettings(
                "视频码率不能低于 0.1 Mbps。".into(),
            ));
        }
        let bytes = (((video + audio_kbps + TARGET_OVERHEAD_KBPS) as f64
            * 1000.0
            * duration_seconds)
            / 8.0) as u64;
        (video, bytes)
    };

    let output_dir = if settings.output_directory_mode == "custom" {
        PathBuf::from(
            settings
                .custom_output_directory
                .as_deref()
                .ok_or_else(|| AppError::InvalidSettings("请选择输出文件夹。".into()))?,
        )
    } else {
        Path::new(&media.path)
            .parent()
            .ok_or_else(|| AppError::Output("无法确定原文件目录。".into()))?
            .to_path_buf()
    };
    if !output_dir.is_dir() {
        return Err(AppError::Output("输出文件夹不存在或不可访问。".into()));
    }
    let suffix = paths::sanitize_suffix(&settings.suffix)?;
    let stem = Path::new(&media.filename)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("video");
    let final_path = paths::resolve_collision(
        output_dir.join(format!("{stem}{suffix}.{}", extension(&container)?)),
    );
    let source = Path::new(&media.path)
        .canonicalize()
        .map_err(|e| AppError::Output(e.to_string()))?;
    if final_path.exists() && final_path.canonicalize().ok().as_ref() == Some(&source) {
        return Err(AppError::Output("输出路径不能与原视频相同。".into()));
    }
    let resolved_audio = if audio_kbps == 0 {
        "移除音频".into()
    } else if container == "WebM" {
        format!("Opus {audio_kbps} kbps")
    } else {
        format!("AAC {audio_kbps} kbps")
    };
    Ok(EstimateResult {
        estimated_bytes,
        video_bitrate_kbps: video_kbps,
        audio_bitrate_kbps: audio_kbps,
        output_path: final_path.to_string_lossy().to_string(),
        resolved_container: container,
        resolved_video_codec: codec,
        resolved_width: settings.width.unwrap_or(media.width),
        resolved_height: settings.height.unwrap_or(media.height),
        resolved_frame_rate: settings.frame_rate.or(media.frame_rate),
        resolved_audio,
        hardware_notice: None,
    })
}

fn minimum_bitrate(codec: &str, width: u32, height: u32) -> u64 {
    let pixels = width.max(320) as f64 * height.max(240) as f64;
    let base = pixels / (1920.0 * 1080.0) * 350.0;
    let factor = match codec {
        "H.265" | "AV1" => 0.75,
        "VP9" => 0.85,
        _ => 1.0,
    };
    (base * factor).round().max(120.0) as u64
}

pub async fn encode_job(
    app: Option<&AppHandle>,
    state: &AppState,
    job: &EncodeJob,
    detected: &[HardwareEncoder],
) -> Result<String, AppError> {
    state.clear_cancelled(&job.id);
    let mut estimate = job.estimate.clone();
    let requested_hardware =
        if job.settings.strict_target && job.settings.mode == EncodeMode::TargetSize {
            "cpu"
        } else {
            job.settings.hardware_mode.as_str()
        };
    let (encoder, mut notice) =
        hardware::choose_encoder(&estimate.resolved_video_codec, requested_hardware, detected)?;
    if job.settings.strict_target && job.settings.hardware_mode != "cpu" {
        notice = Some("严格目标大小已切换为 CPU 两遍编码，以确保输出不超过目标字节数。".into());
    }
    if let Some(message) = notice {
        emit(
            app,
            &job.id,
            "encoding",
            0,
            0,
            job.media.duration_ms,
            0.0,
            None,
            None,
            0,
            None,
            Some(message),
            None,
            None,
        );
    }

    let final_path = paths::resolve_collision(PathBuf::from(&estimate.output_path));
    let part = paths::part_path(&final_path, &job.id);
    let strict = job.settings.mode == EncodeMode::TargetSize && job.settings.strict_target;
    let result = if strict {
        run_two_pass(app, state, job, &estimate, &encoder, &part).await
    } else {
        run_single_pass(app, state, job, &estimate, &encoder, &part).await
    };
    if let Err(error) = result {
        let _ = tokio::fs::remove_file(&part).await;
        return Err(error);
    }

    emit(
        app,
        &job.id,
        "verifying",
        0,
        job.media.duration_ms,
        job.media.duration_ms,
        99.0,
        None,
        None,
        0,
        None,
        Some("正在校验输出文件…".into()),
        None,
        None,
    );
    let finalize_result: Result<(), AppError> = async {
        verify(&part, &job.media, None).await?;
        if strict {
            let size = tokio::fs::metadata(&part).await?.len();
            let target = job.settings.target_bytes.unwrap_or_default();
            if size > target {
                let corrected = ((estimate.video_bitrate_kbps as f64 * target as f64 / size as f64)
                    * 0.97)
                    .floor() as u64;
                estimate.video_bitrate_kbps = corrected.max(100);
                tokio::fs::remove_file(&part).await?;
                run_two_pass(app, state, job, &estimate, &encoder, &part).await?;
                verify(&part, &job.media, Some(target)).await?;
            }
        }
        tokio::fs::rename(&part, &final_path)
            .await
            .map_err(|e| AppError::Output(e.to_string()))?;
        Ok(())
    }
    .await;
    if let Err(error) = finalize_result {
        let _ = tokio::fs::remove_file(&part).await;
        return Err(error);
    }
    Ok(final_path.to_string_lossy().to_string())
}

async fn run_single_pass(
    app: Option<&AppHandle>,
    state: &AppState,
    job: &EncodeJob,
    estimate: &EstimateResult,
    encoder: &str,
    output: &Path,
) -> Result<(), AppError> {
    let args = common_args(job, estimate, encoder, output);
    run_ffmpeg(app, state, job, 1, args).await
}

async fn run_two_pass(
    app: Option<&AppHandle>,
    state: &AppState,
    job: &EncodeJob,
    estimate: &EstimateResult,
    encoder: &str,
    output: &Path,
) -> Result<(), AppError> {
    let log_base = std::env::temp_dir().join(format!("bitbento-pass-{}", job.id));
    let log_text = log_base.to_string_lossy().to_string();
    let mut pass1 = vec![
        "-y".into(),
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-i".into(),
        job.media.path.clone(),
    ];
    append_video_filters(&mut pass1, &job.settings);
    pass1.extend([
        "-map".into(),
        "0:v:0".into(),
        "-an".into(),
        "-c:v".into(),
        encoder.into(),
        "-b:v".into(),
        format!("{}k", estimate.video_bitrate_kbps),
        "-pass".into(),
        "1".into(),
        "-passlogfile".into(),
        log_text.clone(),
        "-f".into(),
        "null".into(),
        "NUL".into(),
        "-progress".into(),
        "pipe:1".into(),
        "-nostats".into(),
    ]);
    let result: Result<(), AppError> = async {
        run_ffmpeg(app, state, job, 1, pass1).await?;
        let mut pass2 = common_args(job, estimate, encoder, output);
        let insert = pass2
            .iter()
            .position(|arg| arg == "-progress")
            .unwrap_or(pass2.len().saturating_sub(1));
        pass2.splice(
            insert..insert,
            [
                "-pass".into(),
                "2".into(),
                "-passlogfile".into(),
                log_text.clone(),
            ],
        );
        run_ffmpeg(app, state, job, 2, pass2).await
    }
    .await;
    for suffix in ["-0.log", "-0.log.mbtree"] {
        let _ = tokio::fs::remove_file(format!("{log_text}{suffix}")).await;
    }
    result
}

fn common_args(
    job: &EncodeJob,
    estimate: &EstimateResult,
    encoder: &str,
    output: &Path,
) -> Vec<String> {
    let mut args = vec![
        "-y".into(),
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-i".into(),
        job.media.path.clone(),
        "-map".into(),
        "0:v:0".into(),
        "-map".into(),
        "0:a:0?".into(),
    ];
    append_video_filters(&mut args, &job.settings);
    args.extend([
        "-c:v".into(),
        encoder.into(),
        "-b:v".into(),
        format!("{}k", estimate.video_bitrate_kbps),
    ]);
    if encoder == "libx264" || encoder == "libx265" {
        args.extend(["-preset".into(), "medium".into()]);
    }
    if job.settings.audio_mode == "remove" || estimate.audio_bitrate_kbps == 0 {
        args.push("-an".into());
    } else {
        let audio_encoder = if estimate.resolved_container == "WebM" {
            "libopus"
        } else {
            "aac"
        };
        args.extend([
            "-c:a".into(),
            audio_encoder.into(),
            "-b:a".into(),
            format!("{}k", estimate.audio_bitrate_kbps),
        ]);
    }
    if estimate.resolved_container == "MP4" || estimate.resolved_container == "MOV" {
        args.extend(["-movflags".into(), "+faststart".into()]);
    }
    args.extend([
        "-progress".into(),
        "pipe:1".into(),
        "-nostats".into(),
        output.to_string_lossy().to_string(),
    ]);
    args
}

fn append_video_filters(args: &mut Vec<String>, settings: &OutputSettings) {
    if let (Some(width), Some(height)) = (settings.width, settings.height) {
        args.extend(["-vf".into(), format!("scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2")]);
    }
    if let Some(fps) = settings.frame_rate {
        args.extend(["-r".into(), format!("{fps}")]);
    }
}

async fn run_ffmpeg(
    app: Option<&AppHandle>,
    state: &AppState,
    job: &EncodeJob,
    pass: u8,
    args: Vec<String>,
) -> Result<(), AppError> {
    let mut child = Command::new(paths::sidecar("ffmpeg")?)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| AppError::Encode(e.to_string()))?;
    let pid = child
        .id()
        .ok_or_else(|| AppError::Encode("无法取得 FFmpeg 进程编号。".into()))?;
    state.running_pids.lock().insert(job.id.clone(), pid);
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| AppError::Encode("无法读取 FFmpeg 进度。".into()))?;
    let mut stderr = child
        .stderr
        .take()
        .ok_or_else(|| AppError::Encode("无法读取 FFmpeg 错误信息。".into()))?;
    let stderr_task = tokio::spawn(async move {
        let mut bytes = Vec::new();
        let _ = stderr.read_to_end(&mut bytes).await;
        String::from_utf8_lossy(&bytes).to_string()
    });
    let mut lines = BufReader::new(stdout).lines();
    let started = Instant::now();
    let mut out_time_ms = 0u64;
    let mut speed = None;
    let mut fps = None;
    let mut ticker = tokio::time::interval(Duration::from_millis(200));
    loop {
        tokio::select! {
            line = lines.next_line() => {
                match line {
                    Ok(Some(line)) => {
                        if let Some((key, value)) = line.split_once('=') {
                            match key {
                                "out_time_ms" | "out_time_us" => out_time_ms = value.parse::<u64>().unwrap_or(0) / 1000,
                                "speed" => speed = Some(value.to_string()),
                                "fps" => fps = value.parse().ok(),
                                _ => {}
                            }
                        }
                    }
                    Ok(None) => break,
                    Err(error) => {
                        terminate_process_tree(pid).await;
                        let _ = child.wait().await;
                        state.running_pids.lock().remove(&job.id);
                        let _ = stderr_task.await;
                        return Err(AppError::Encode(error.to_string()));
                    }
                }
            }
            _ = ticker.tick() => {
                if state.is_cancelled(&job.id) {
                    terminate_process_tree(pid).await;
                    let _ = child.wait().await;
                    state.running_pids.lock().remove(&job.id);
                    let _ = stderr_task.await;
                    return Err(AppError::Cancelled);
                }
                let percent = (out_time_ms as f64 / job.media.duration_ms.max(1) as f64 * 100.0).clamp(0.0, 99.0);
                let elapsed = started.elapsed().as_millis() as u64;
                let remaining = if percent > 0.2 { Some(((elapsed as f64 / percent) * (100.0 - percent)) as u64) } else { None };
                emit(app, &job.id, if pass == 1 && job.settings.strict_target { "encodingPass1" } else if pass == 2 { "encodingPass2" } else { "encoding" }, pass, out_time_ms, job.media.duration_ms, percent, speed.clone(), fps, elapsed, remaining, None, None, None);
            }
        }
    }
    let status = child
        .wait()
        .await
        .map_err(|e| AppError::Encode(e.to_string()))?;
    state.running_pids.lock().remove(&job.id);
    let detail = stderr_task.await.unwrap_or_default();
    if state.is_cancelled(&job.id) {
        return Err(AppError::Cancelled);
    }
    if !status.success() {
        let compact = detail
            .lines()
            .rev()
            .take(12)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect::<Vec<_>>()
            .join("\n");
        return Err(AppError::Encode(if compact.is_empty() {
            format!("FFmpeg 退出代码：{status}")
        } else {
            compact
        }));
    }
    Ok(())
}

async fn terminate_process_tree(pid: u32) {
    let _ = Command::new("taskkill.exe")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .await;
}

async fn verify(path: &Path, source: &MediaInfo, target: Option<u64>) -> Result<(), AppError> {
    let metadata = tokio::fs::metadata(path)
        .await
        .map_err(|e| AppError::Output(e.to_string()))?;
    if metadata.len() == 0 {
        return Err(AppError::Output("输出文件为空。".into()));
    }
    if let Some(limit) = target {
        if metadata.len() > limit {
            return Err(AppError::Output(format!(
                "输出文件 {} 字节，超过严格目标 {} 字节。",
                metadata.len(),
                limit
            )));
        }
    }
    let checked = probe::ffprobe_json(path).await?;
    let has_video = checked["streams"]
        .as_array()
        .map(|s| s.iter().any(|v| v["codec_type"] == "video"))
        .unwrap_or(false);
    let duration = checked["format"]["duration"]
        .as_str()
        .and_then(|v| v.parse::<f64>().ok())
        .unwrap_or(0.0)
        * 1000.0;
    if !has_video
        || duration < source.duration_ms as f64 * 0.9
        || duration > source.duration_ms as f64 * 1.1
    {
        return Err(AppError::Output("输出校验失败：视频流或时长异常。".into()));
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
pub fn emit(
    app: Option<&AppHandle>,
    job_id: &str,
    state: &str,
    pass: u8,
    out_time_ms: u64,
    duration_ms: u64,
    percent: f64,
    speed: Option<String>,
    fps: Option<f64>,
    elapsed_ms: u64,
    remaining_ms: Option<u64>,
    message: Option<String>,
    output_path: Option<String>,
    technical_detail: Option<String>,
) {
    if let Some(app) = app {
        let _ = app.emit(
            "job-progress",
            ProgressEvent {
                job_id: job_id.into(),
                state: state.into(),
                pass,
                out_time_ms,
                duration_ms,
                percent,
                speed,
                fps,
                elapsed_ms,
                remaining_ms,
                message,
                output_path,
                technical_detail,
            },
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> (MediaInfo, PathBuf) {
        let path =
            std::env::temp_dir().join(format!("bitbento-estimate-{}.mp4", uuid::Uuid::new_v4()));
        std::fs::write(&path, b"test").unwrap();
        (
            MediaInfo {
                id: "media".into(),
                path: path.to_string_lossy().to_string(),
                filename: path.file_name().unwrap().to_string_lossy().to_string(),
                extension: "mp4".into(),
                container: "MP4".into(),
                size_bytes: 100_000_000,
                duration_ms: 60_000,
                video_codec: "H.264".into(),
                width: 1920,
                height: 1080,
                frame_rate: Some(30.0),
                frame_rate_text: "30 FPS".into(),
                variable_frame_rate: false,
                average_bitrate_kbps: Some(10_000),
                audio_codec: Some("AAC".into()),
                audio_bitrate_kbps: Some(192),
                audio_channels: Some(2),
            },
            path,
        )
    }

    fn target_settings(target_bytes: u64) -> OutputSettings {
        OutputSettings {
            mode: EncodeMode::TargetSize,
            container: "MP4".into(),
            video_codec: "H.265".into(),
            bitrate_kbps: None,
            width: None,
            height: None,
            frame_rate: None,
            audio_mode: "aac".into(),
            audio_bitrate_kbps: Some(192),
            target_bytes: Some(target_bytes),
            strict_target: true,
            hardware_mode: "auto".into(),
            suffix: "_compressed".into(),
            output_directory_mode: "source".into(),
            custom_output_directory: None,
        }
    }

    #[test]
    fn strict_target_reserves_margin_and_audio() {
        let (media, path) = fixture();
        let result = estimate(&media, &target_settings(10_000_000)).unwrap();
        assert_eq!(result.estimated_bytes, 10_000_000);
        assert!(result.video_bitrate_kbps < 1_100);
        assert_eq!(result.resolved_video_codec, "H.265");
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn impossible_target_is_rejected_before_encoding() {
        let (media, path) = fixture();
        let error = estimate(&media, &target_settings(500_000))
            .unwrap_err()
            .to_string();
        assert!(error.contains("目标过小"));
        let _ = std::fs::remove_file(path);
    }

    #[tokio::test]
    #[ignore = "requires prepared FFmpeg sidecars and generated real media"]
    async fn real_media_strict_professional_and_cancel_pipeline() {
        let project = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
        let input = project.join("test-media").join("测试 视频 O'Brien.mp4");
        let webm_input = project.join("test-media").join("web sample.webm");
        assert!(input.is_file() && webm_input.is_file());

        let hardware = crate::hardware::detect().await.unwrap();
        let state = AppState::default();

        let media = crate::probe::probe(&input).await.unwrap();
        let strict_settings = OutputSettings {
            target_bytes: Some(600_000),
            suffix: "_strict_test".into(),
            ..target_settings(600_000)
        };
        let strict_estimate = estimate(&media, &strict_settings).unwrap();
        let strict_job = EncodeJob {
            id: uuid::Uuid::new_v4().to_string(),
            media: media.clone(),
            settings: strict_settings,
            estimate: strict_estimate,
            state: "queued".into(),
            progress: 0.0,
            error: None,
        };
        let strict_output = encode_job(None, &state, &strict_job, &hardware)
            .await
            .unwrap();
        assert!(std::fs::metadata(&strict_output).unwrap().len() <= 600_000);
        let verified = crate::probe::probe(Path::new(&strict_output))
            .await
            .unwrap();
        assert_eq!(verified.video_codec, "H.265");
        assert!(verified.audio_codec.is_some());

        let webm = crate::probe::probe(&webm_input).await.unwrap();
        let pro_settings = OutputSettings {
            mode: EncodeMode::Professional,
            container: "WebM".into(),
            video_codec: "VP9".into(),
            bitrate_kbps: Some(500),
            width: Some(1280),
            height: Some(720),
            frame_rate: Some(25.0),
            audio_mode: "aac".into(),
            audio_bitrate_kbps: Some(128),
            target_bytes: None,
            strict_target: false,
            hardware_mode: "cpu".into(),
            suffix: "_pro_test".into(),
            output_directory_mode: "source".into(),
            custom_output_directory: None,
        };
        let pro_estimate = estimate(&webm, &pro_settings).unwrap();
        let pro_job = EncodeJob {
            id: uuid::Uuid::new_v4().to_string(),
            media: webm,
            settings: pro_settings,
            estimate: pro_estimate,
            state: "queued".into(),
            progress: 0.0,
            error: None,
        };
        let pro_output = encode_job(None, &state, &pro_job, &hardware).await.unwrap();
        let pro_verified = crate::probe::probe(Path::new(&pro_output)).await.unwrap();
        assert_eq!(pro_verified.container, "WebM");
        assert_eq!(pro_verified.video_codec, "VP9");
        assert_eq!((pro_verified.width, pro_verified.height), (1280, 720));

        let cancel_settings = OutputSettings {
            mode: EncodeMode::Professional,
            container: "MP4".into(),
            video_codec: "H.265".into(),
            bitrate_kbps: Some(8_000),
            width: Some(3840),
            height: Some(2160),
            frame_rate: Some(60.0),
            audio_mode: "aac".into(),
            audio_bitrate_kbps: Some(192),
            target_bytes: None,
            strict_target: false,
            hardware_mode: "cpu".into(),
            suffix: "_cancel_test".into(),
            output_directory_mode: "source".into(),
            custom_output_directory: None,
        };
        let cancel_estimate = estimate(&media, &cancel_settings).unwrap();
        let cancel_job = EncodeJob {
            id: uuid::Uuid::new_v4().to_string(),
            media,
            settings: cancel_settings,
            estimate: cancel_estimate,
            state: "queued".into(),
            progress: 0.0,
            error: None,
        };
        let encode = encode_job(None, &state, &cancel_job, &hardware);
        let cancel = async {
            tokio::time::sleep(Duration::from_millis(250)).await;
            state.mark_cancelled(&cancel_job.id);
        };
        let (cancel_result, _) = tokio::join!(encode, cancel);
        assert!(matches!(cancel_result, Err(AppError::Cancelled)));
        let output_dir = input.parent().unwrap();
        let leaked_partial = std::fs::read_dir(output_dir)
            .unwrap()
            .flatten()
            .any(|entry| {
                let name = entry.file_name().to_string_lossy().to_string();
                name.contains(&cancel_job.id) && name.contains(".part.")
            });
        assert!(!leaked_partial);
    }
}
