use std::process::Stdio;

use tokio::process::Command;

use crate::errors::AppError;
use crate::models::HardwareEncoder;
use crate::paths;

const CANDIDATES: &[(&str, &str, &[&str])] = &[
    (
        "nvenc",
        "NVIDIA NVENC",
        &["h264_nvenc", "hevc_nvenc", "av1_nvenc"],
    ),
    (
        "qsv",
        "Intel Quick Sync",
        &["h264_qsv", "hevc_qsv", "av1_qsv"],
    ),
    ("amf", "AMD AMF", &["h264_amf", "hevc_amf", "av1_amf"]),
];

pub async fn detect() -> Result<Vec<HardwareEncoder>, AppError> {
    let ffmpeg = paths::sidecar("ffmpeg")?;
    let output = Command::new(&ffmpeg)
        .args(["-hide_banner", "-encoders"])
        .output()
        .await?;
    let listing = String::from_utf8_lossy(&output.stdout);
    let mut result = Vec::new();
    for (mode, label, names) in CANDIDATES {
        let mut working = Vec::new();
        let mut failures = Vec::new();
        for name in *names {
            if listing.contains(name) {
                if initialize(&ffmpeg, name).await {
                    working.push((*name).to_string());
                } else {
                    failures.push((*name).to_string());
                }
            }
        }
        result.push(HardwareEncoder {
            mode: (*mode).to_string(),
            label: (*label).to_string(),
            available: !working.is_empty(),
            encoders: working,
            detail: if failures.is_empty() {
                "已通过实际初始化测试".into()
            } else {
                format!("驱动或设备无法初始化：{}", failures.join(", "))
            },
        });
    }
    let software_encoders = ["libx264", "libx265", "libaom-av1", "libvpx-vp9"]
        .into_iter()
        .filter(|encoder| listing.contains(encoder))
        .map(str::to_string)
        .collect::<Vec<_>>();
    result.push(HardwareEncoder {
        mode: "cpu".into(),
        label: "CPU 软件编码".into(),
        available: !software_encoders.is_empty(),
        encoders: software_encoders,
        detail: "已从内置 FFmpeg 编码器列表验证".into(),
    });
    Ok(result)
}

async fn initialize(ffmpeg: &std::path::Path, encoder: &str) -> bool {
    Command::new(ffmpeg)
        .args([
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            "color=size=128x128:rate=1:duration=0.1",
            "-frames:v",
            "1",
            "-an",
            "-c:v",
            encoder,
            "-f",
            "null",
            "NUL",
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .await
        .map(|s| s.success())
        .unwrap_or(false)
}

pub fn choose_encoder(
    codec: &str,
    requested: &str,
    detected: &[HardwareEncoder],
) -> Result<(String, Option<String>), AppError> {
    let software = match codec {
        "H.264" => "libx264",
        "H.265" => "libx265",
        "AV1" => "libaom-av1",
        "VP9" => "libvpx-vp9",
        _ => {
            return Err(AppError::InvalidSettings(format!(
                "不支持的视频编码：{codec}"
            )))
        }
    };
    if requested == "cpu" || codec == "VP9" {
        let available = detected
            .iter()
            .find(|item| item.mode == "cpu")
            .map(|item| item.encoders.iter().any(|encoder| encoder == software))
            .unwrap_or(false);
        return if available {
            Ok((software.into(), None))
        } else {
            Err(AppError::InvalidSettings(format!(
                "内置 FFmpeg 不包含 {software} 编码器。"
            )))
        };
    }
    let suffix = match codec {
        "H.264" => "h264",
        "H.265" => "hevc",
        "AV1" => "av1",
        _ => "",
    };
    let modes: Vec<&str> = if requested == "auto" {
        vec!["nvenc", "qsv", "amf"]
    } else {
        vec![requested]
    };
    for mode in modes {
        if let Some(found) = detected.iter().find(|h| h.mode == mode && h.available) {
            if let Some(encoder) = found.encoders.iter().find(|e| e.starts_with(suffix)) {
                return Ok((encoder.clone(), None));
            }
        }
    }
    if requested == "auto" {
        let cpu_available = detected
            .iter()
            .find(|item| item.mode == "cpu")
            .map(|item| item.encoders.iter().any(|encoder| encoder == software))
            .unwrap_or(false);
        if cpu_available {
            Ok((
                software.into(),
                Some("未检测到可初始化的硬件编码器，已使用 CPU 软件编码。".into()),
            ))
        } else {
            Err(AppError::InvalidSettings(format!(
                "内置 FFmpeg 不包含 {software} 编码器。"
            )))
        }
    } else {
        Err(AppError::InvalidSettings(
            "所选硬件编码器在当前电脑上不可用。".into(),
        ))
    }
}
