use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::Arc;

use parking_lot::Mutex;
use tauri::http::{header, Request, Response, StatusCode};

use crate::queue::PreviewRegistry;

const MAX_CHUNK: u64 = 4 * 1024 * 1024;

pub fn respond(registry: &PreviewRegistry, request: Request<Vec<u8>>) -> Response<Vec<u8>> {
    match response_inner(registry, &request) {
        Ok(response) => response,
        Err(status) => Response::builder()
            .status(status)
            .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
            .body(Vec::new())
            .expect("valid media error response"),
    }
}

fn response_inner(
    registry: &Arc<Mutex<std::collections::HashMap<String, PathBuf>>>,
    request: &Request<Vec<u8>>,
) -> Result<Response<Vec<u8>>, StatusCode> {
    let id = request
        .uri()
        .path()
        .trim_start_matches('/')
        .split('/')
        .next()
        .filter(|value| !value.is_empty())
        .ok_or(StatusCode::BAD_REQUEST)?;
    let path = registry
        .lock()
        .get(id)
        .cloned()
        .ok_or(StatusCode::NOT_FOUND)?;
    let mut file = File::open(&path).map_err(|_| StatusCode::NOT_FOUND)?;
    let size = file.metadata().map_err(|_| StatusCode::NOT_FOUND)?.len();
    if size == 0 {
        return Err(StatusCode::NO_CONTENT);
    }
    let range = request
        .headers()
        .get(header::RANGE)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| parse_range(value, size));
    let (start, end, partial) = range.unwrap_or((
        0,
        size.saturating_sub(1).min(MAX_CHUNK - 1),
        size > MAX_CHUNK,
    ));
    let length = end.saturating_sub(start) + 1;
    file.seek(SeekFrom::Start(start))
        .map_err(|_| StatusCode::RANGE_NOT_SATISFIABLE)?;
    let mut data = vec![0; length as usize];
    file.read_exact(&mut data)
        .map_err(|_| StatusCode::RANGE_NOT_SATISFIABLE)?;
    let mut builder = Response::builder()
        .status(if partial || range.is_some() {
            StatusCode::PARTIAL_CONTENT
        } else {
            StatusCode::OK
        })
        .header(header::CONTENT_TYPE, content_type(&path))
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CONTENT_LENGTH, length.to_string())
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*");
    if partial || range.is_some() {
        builder = builder.header(header::CONTENT_RANGE, format!("bytes {start}-{end}/{size}"));
    }
    builder
        .body(data)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

fn parse_range(value: &str, size: u64) -> Option<(u64, u64, bool)> {
    let value = value.strip_prefix("bytes=")?.split(',').next()?;
    let (start, end) = value.split_once('-')?;
    let start = start.parse::<u64>().ok()?;
    if start >= size {
        return None;
    }
    let requested_end = end.parse::<u64>().ok().unwrap_or(size - 1);
    let end = requested_end
        .min(size - 1)
        .min(start.saturating_add(MAX_CHUNK - 1));
    Some((start, end, true))
}

fn content_type(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "mp4" | "m4v" => "video/mp4",
        "mov" => "video/quicktime",
        "webm" => "video/webm",
        "mkv" => "video/x-matroska",
        "avi" => "video/x-msvideo",
        _ => "application/octet-stream",
    }
}
