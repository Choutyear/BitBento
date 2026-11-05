use std::path::{Path, PathBuf};

use crate::errors::AppError;

pub fn sidecar(name: &str) -> Result<PathBuf, AppError> {
    let filename = format!("{name}-x86_64-pc-windows-msvc.exe");
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let candidate = dir.join(&filename);
            if candidate.is_file() {
                return Ok(candidate);
            }
        }
    }
    let development = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("binaries")
        .join(filename);
    development
        .is_file()
        .then_some(development)
        .ok_or(AppError::SidecarMissing)
}

pub fn sanitize_suffix(value: &str) -> Result<String, AppError> {
    if value
        .chars()
        .any(|c| matches!(c, '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|'))
    {
        return Err(AppError::InvalidSettings(
            "文件名后缀包含 Windows 不允许的字符。".into(),
        ));
    }
    Ok(value.trim_end_matches([' ', '.']).to_string())
}

pub fn resolve_collision(path: PathBuf) -> PathBuf {
    if !path.exists() {
        return path;
    }
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("output");
    let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
    for index in 1..10_000 {
        let name = if ext.is_empty() {
            format!("{stem} ({index})")
        } else {
            format!("{stem} ({index}).{ext}")
        };
        let candidate = parent.join(name);
        if !candidate.exists() {
            return candidate;
        }
    }
    path
}

pub fn part_path(final_path: &Path, job_id: &str) -> PathBuf {
    let parent = final_path.parent().unwrap_or_else(|| Path::new("."));
    let stem = final_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("output");
    let ext = final_path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("mp4");
    let safe_id: String = job_id
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
        .take(40)
        .collect();
    parent.join(format!("{stem}.bitbento-{safe_id}.part.{ext}"))
}
