use std::ffi::OsStr;

use tokio::process::Command;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Creates a child process that never allocates a visible console window.
pub fn hidden(program: impl AsRef<OsStr>) -> Command {
    let mut command = Command::new(program);
    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);
    command
}
