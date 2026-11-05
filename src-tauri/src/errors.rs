use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("未找到内置的 FFmpeg/ffprobe，请重新安装 BitBento。")]
    SidecarMissing,
    #[error("无法读取视频：{0}")]
    Probe(String),
    #[error("参数无效：{0}")]
    InvalidSettings(String),
    #[error("无法创建输出文件：{0}")]
    Output(String),
    #[error("压缩失败：{0}")]
    Encode(String),
    #[error("任务已取消")]
    Cancelled,
    #[error("内部错误：{0}")]
    Internal(String),
}

impl From<std::io::Error> for AppError {
    fn from(value: std::io::Error) -> Self {
        Self::Internal(value.to_string())
    }
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
