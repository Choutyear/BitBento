pub struct SleepGuard {
    stop: Option<std::sync::mpsc::Sender<()>>,
    worker: Option<std::thread::JoinHandle<()>>,
}

impl SleepGuard {
    pub fn new() -> Self {
        let (tx, rx) = std::sync::mpsc::channel();
        let worker = std::thread::spawn(move || {
            #[cfg(target_os = "windows")]
            unsafe {
                use windows_sys::Win32::System::Power::{
                    SetThreadExecutionState, ES_AWAYMODE_REQUIRED, ES_CONTINUOUS,
                    ES_SYSTEM_REQUIRED,
                };
                SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_AWAYMODE_REQUIRED);
                let _ = rx.recv();
                SetThreadExecutionState(ES_CONTINUOUS);
            }
            #[cfg(not(target_os = "windows"))]
            {
                let _ = rx.recv();
            }
        });
        Self {
            stop: Some(tx),
            worker: Some(worker),
        }
    }
}

impl Drop for SleepGuard {
    fn drop(&mut self) {
        if let Some(stop) = self.stop.take() {
            let _ = stop.send(());
        }
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}
