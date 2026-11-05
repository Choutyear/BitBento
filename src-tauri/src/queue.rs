use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use parking_lot::Mutex;

use crate::models::{EncodeJob, HardwareEncoder};

#[derive(Clone, Default)]
pub struct AppState {
    pub jobs: Arc<Mutex<Vec<EncodeJob>>>,
    pub cancelled: Arc<Mutex<HashSet<String>>>,
    pub running_pids: Arc<Mutex<HashMap<String, u32>>>,
    pub hardware: Arc<Mutex<Option<Vec<HardwareEncoder>>>>,
    pub queue_running: Arc<Mutex<bool>>,
}

impl AppState {
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
