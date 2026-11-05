use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: &'static str,
    pub version: &'static str,
    pub backend_ready: bool,
    pub ffmpeg_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaInfo {
    pub id: String,
    pub path: String,
    pub filename: String,
    pub extension: String,
    pub container: String,
    pub size_bytes: u64,
    pub duration_ms: u64,
    pub video_codec: String,
    pub width: u32,
    pub height: u32,
    pub frame_rate: Option<f64>,
    pub frame_rate_text: String,
    pub variable_frame_rate: bool,
    pub average_bitrate_kbps: Option<u64>,
    pub audio_codec: Option<String>,
    pub audio_bitrate_kbps: Option<u64>,
    pub audio_channels: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum EncodeMode {
    TargetSize,
    Professional,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputSettings {
    pub mode: EncodeMode,
    pub container: String,
    pub video_codec: String,
    pub bitrate_kbps: Option<u64>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub frame_rate: Option<f64>,
    pub audio_mode: String,
    pub audio_bitrate_kbps: Option<u64>,
    pub target_bytes: Option<u64>,
    pub strict_target: bool,
    pub hardware_mode: String,
    pub suffix: String,
    pub output_directory_mode: String,
    pub custom_output_directory: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EstimateResult {
    pub estimated_bytes: u64,
    pub video_bitrate_kbps: u64,
    pub audio_bitrate_kbps: u64,
    pub output_path: String,
    pub resolved_container: String,
    pub resolved_video_codec: String,
    pub resolved_width: u32,
    pub resolved_height: u32,
    pub resolved_frame_rate: Option<f64>,
    pub resolved_audio: String,
    pub hardware_notice: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EncodeJobRequest {
    pub id: String,
    pub media: MediaInfo,
    pub settings: OutputSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EncodeJob {
    pub id: String,
    pub media: MediaInfo,
    pub settings: OutputSettings,
    pub estimate: EstimateResult,
    pub state: String,
    pub progress: f64,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressEvent {
    pub job_id: String,
    pub state: String,
    pub pass: u8,
    pub out_time_ms: u64,
    pub duration_ms: u64,
    pub percent: f64,
    pub speed: Option<String>,
    pub fps: Option<f64>,
    pub elapsed_ms: u64,
    pub remaining_ms: Option<u64>,
    pub message: Option<String>,
    pub output_path: Option<String>,
    pub technical_detail: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareEncoder {
    pub mode: String,
    pub label: String,
    pub available: bool,
    pub encoders: Vec<String>,
    pub detail: String,
}
