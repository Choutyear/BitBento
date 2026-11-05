use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Arc;

use parking_lot::Mutex;

use crate::models::{EncodeJob, HardwareEncoder};

pub type PreviewRegistry = Arc<Mutex<HashMap<String, PathBuf>>>;

#[derive(Clone, Default)]
pub struct AppState {
    pub jobs: Arc<Mutex<Vec<EncodeJob>>>,
    pub cancelled: Arc<Mutex<HashSet<String>>>,
    pub running_pids: Arc<Mutex<HashMap<String, u32>>>,
    pub hardware: Arc<Mutex<Option<Vec<HardwareEncoder>>>>,
    pub queue_running: Arc<Mutex<bool>>,
    pub preview_paths: PreviewRegistry,
}

impl AppState {
    pub fn register_preview(&self, id: &str, path: PathBuf) {
        self.preview_paths.lock().insert(id.to_string(), path);
    }

    pub fn preview_path(&self, id: &str) -> Option<PathBuf> {
        self.preview_paths.lock().get(id).cloned()
    }

    pub fn unregister_preview(&self, id: &str) {
        self.preview_paths.lock().remove(id);
    }

    pub fn is_cancelled(&self, id: &str) -> bool {
        self.cancelled.lock().contains(id)
    }

    pub fn mark_cancelled(&self, id: &str) {
        self.cancelled.lock().insert(id.to_string());
    }

    pub fn clear_cancelled(&self, id: &str) {
        self.cancelled.lock().remove(id);
    }
}
