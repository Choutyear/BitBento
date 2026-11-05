use std::path::Path;
use std::process::Stdio;

use serde_json::Value;
use uuid::Uuid;

use crate::errors::AppError;
use crate::models::MediaInfo;
use crate::paths;
use crate::process;

fn rational(value: Option<&str>) -> Option<f64> {
    let value = value?;
    let (a, b) = value.split_once('/')?;
    let numerator: f64 = a.parse().ok()?;
    let denominator: f64 = b.parse().ok()?;
    (denominator.abs() > f64::EPSILON).then_some(numerator / denominator)
}

fn parse_u64(value: Option<&Value>) -> Option<u64> {
    value.and_then(|v| v.as_str()).and_then(|v| v.parse().ok())
}

fn display_dimensions(video: &Value) -> (u32, u32) {
    let width = video["width"].as_u64().unwrap_or_default() as u32;
    let height = video["height"].as_u64().unwrap_or_default() as u32;
    let tag_rotation = video["tags"]["rotate"]
        .as_str()
        .and_then(|value| value.parse::<i32>().ok());
    let side_data_rotation = video["side_data_list"]
        .as_array()
        .and_then(|entries| entries.iter().find_map(|entry| entry["rotation"].as_i64()))
        .map(|value| value as i32);
    let rotation = side_data_rotation.or(tag_rotation).unwrap_or_default();
    if rotation.rem_euclid(180) == 90 {
        (height, width)
    } else {
        (width, height)
    }
}

pub async fn ffprobe_json(path: &Path) -> Result<Value, AppError> {
    if !path.is_file() {
        return Err(AppError::Probe("文件不存在或无法访问。".into()));
    }
    let output = process::hidden(paths::sidecar("ffprobe")?)
        .args([
            "-v",
            "error",
            "-show_format",
            "-show_streams",
            "-of",
            "json",
        ])
        .arg(path)
        .stdin(Stdio::null())
        .output()
        .await
        .map_err(|e| AppError::Probe(e.to_string()))?;
    if !output.status.success() {
        return Err(AppError::Probe(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }
    serde_json::from_slice(&output.stdout).map_err(|e| AppError::Probe(e.to_string()))
}

pub async fn probe(path: &Path) -> Result<MediaInfo, AppError> {
    let canonical = path
        .canonicalize()
        .map_err(|e| AppError::Probe(e.to_string()))?;
    let root = ffprobe_json(&canonical).await?;
    let streams = root["streams"]
        .as_array()
        .ok_or_else(|| AppError::Probe("ffprobe 未返回媒体流。".into()))?;
    let video = streams
        .iter()
        .find(|s| s["codec_type"] == "video")
        .ok_or_else(|| AppError::Probe("文件中没有可读取的视频流。".into()))?;
    let audio = streams.iter().find(|s| s["codec_type"] == "audio");
    let format = &root["format"];
    let metadata = std::fs::metadata(&canonical)?;
    let duration_seconds = format["duration"]
        .as_str()
        .and_then(|v| v.parse::<f64>().ok())
        .or_else(|| video["duration"].as_str().and_then(|v| v.parse().ok()))
        .ok_or_else(|| AppError::Probe("无法确定视频时长。".into()))?;

    let avg = rational(video["avg_frame_rate"].as_str());
    let nominal = rational(video["r_frame_rate"].as_str());
    let variable = match (avg, nominal) {
        (Some(a), Some(n)) => (a - n).abs() > 0.01,
        _ => false,
    };
    let frame_rate_text = match avg {
        Some(value) if variable => format!("可变（平均 {:.3} FPS）", value),
        Some(value) => {
            format!("{value:.3}")
                .trim_end_matches('0')
                .trim_end_matches('.')
                .to_string()
                + " FPS"
        }
        None => "未知".into(),
    };

    let filename = canonical
        .file_name()
        .and_then(|v| v.to_str())
        .unwrap_or("video")
        .to_string();
    let extension = canonical
        .extension()
        .and_then(|v| v.to_str())
        .unwrap_or("")
        .to_lowercase();
    let format_names = format["format_name"].as_str().unwrap_or(&extension);
    let container = if format_names.contains("matroska") && extension == "webm" {
        "WebM"
    } else if format_names.contains("matroska") {
        "MKV"
    } else if extension == "mov" {
        "MOV"
    } else if extension == "mp4" || format_names.contains("mp4") {
        "MP4"
    } else {
        format_names
    }
    .to_string();
    let (display_width, display_height) = display_dimensions(video);

    Ok(MediaInfo {
        id: Uuid::new_v4().to_string(),
        path: canonical.to_string_lossy().to_string(),
        filename,
        extension,
        container,
        size_bytes: metadata.len(),
        duration_ms: (duration_seconds * 1000.0).round() as u64,
        video_codec: normalize_video_codec(video["codec_name"].as_str().unwrap_or("unknown")),
        width: display_width,
        height: display_height,
        frame_rate: avg,
        frame_rate_text,
        variable_frame_rate: variable,
        average_bitrate_kbps: parse_u64(video.get("bit_rate"))
            .or_else(|| parse_u64(format.get("bit_rate")))
            .map(|v| v / 1000),
        audio_codec: audio
            .map(|s| normalize_audio_codec(s["codec_name"].as_str().unwrap_or("unknown"))),
        audio_bitrate_kbps: audio
            .and_then(|s| parse_u64(s.get("bit_rate")))
            .map(|v| v / 1000),
        audio_channels: audio.and_then(|s| s["channels"].as_u64()).map(|v| v as u32),
    })
}

pub fn normalize_video_codec(value: &str) -> String {
    match value.to_ascii_lowercase().as_str() {
        "h264" => "H.264",
        "hevc" | "h265" => "H.265",
        "av1" => "AV1",
        "vp9" => "VP9",
        other => other,
    }
    .to_string()
}

pub fn normalize_audio_codec(value: &str) -> String {
    match value.to_ascii_lowercase().as_str() {
        "aac" => "AAC",
        "opus" => "Opus",
        "vorbis" => "Vorbis",
        other => other,
    }
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn display_dimensions_honor_rotation_metadata() {
        let landscape = json!({"width": 1920, "height": 1080});
        let tag_rotated = json!({"width": 1920, "height": 1080, "tags": {"rotate": "90"}});
        let side_data_rotated =
            json!({"width": 1920, "height": 1080, "side_data_list": [{"rotation": -90}]});
        assert_eq!(display_dimensions(&landscape), (1920, 1080));
        assert_eq!(display_dimensions(&tag_rotated), (1080, 1920));
        assert_eq!(display_dimensions(&side_data_rotated), (1080, 1920));
    }

    #[tokio::test]
    #[ignore = "requires prepared FFprobe sidecar and generated real media"]
    async fn real_media_probe_matrix_and_vfr() {
        let project = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
        let media_root = project.join("test-media");
        let samples = [
            (media_root.join("测试 视频 O'Brien.mp4"), "MP4"),
            (media_root.join("東京 テスト.mov"), "MOV"),
            (media_root.join("web sample.webm"), "WebM"),
            (
                media_root
                    .join("长路径测试_abcdefghijklmnopqrstuvwxyz_0123456789")
                    .join("第二层_日本語とスペース_abcdefghijklmnopqrstuvwxyz")
                    .join("长路径 样本.mkv"),
                "MKV",
            ),
        ];
        for (path, expected_container) in samples {
            let info = probe(&path).await.unwrap();
            assert_eq!(info.container, expected_container);
            assert!(info.duration_ms > 4_000);
            assert!(info.width > 0 && info.height > 0);
            assert!(info
                .path
                .contains(path.file_name().unwrap().to_str().unwrap()));
        }
        let vfr = probe(&media_root.join("手机 VFR 样本.mp4")).await.unwrap();
        assert!(vfr.variable_frame_rate);
        assert!(vfr.frame_rate_text.starts_with("可变（平均"));
    }
}
