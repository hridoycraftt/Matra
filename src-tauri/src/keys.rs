//! Keyboard and clipboard helpers for apps whose text fields can't be written through
//! Accessibility: bring the app forward, select all, paste, then restore the clipboard.

#[cfg(target_os = "macos")]
mod mac {
    use enigo::{Direction, Enigo, Key, Keyboard, Settings};
    use std::time::Duration;

    // macOS virtual key codes (layout independent).
    const KEY_A: u16 = 0x00;
    const KEY_C: u16 = 0x08;
    const KEY_V: u16 = 0x09;

    fn chord(code: u16) -> Result<(), String> {
        let mut e = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
        e.key(Key::Meta, Direction::Press).map_err(|e| e.to_string())?;
        let r = e.raw(code, Direction::Click).map_err(|e| e.to_string());
        e.key(Key::Meta, Direction::Release).map_err(|e| e.to_string())?;
        r
    }

    pub fn activate_pid(pid: i32) {
        use objc2::msg_send;
        use objc2::runtime::{AnyClass, AnyObject};
        unsafe {
            let Some(cls) = AnyClass::get(c"NSRunningApplication") else { return };
            let app: *mut AnyObject = msg_send![cls, runningApplicationWithProcessIdentifier: pid];
            if !app.is_null() {
                // NSApplicationActivateIgnoringOtherApps = 1 << 1
                let _: bool = msg_send![app, activateWithOptions: 2usize];
            }
        }
    }

    /// Paste over the whole field (select all first) or over the current selection.
    pub fn paste_text(text: &str, whole: bool) -> Result<(), String> {
        let mut cb = arboard::Clipboard::new().map_err(|e| e.to_string())?;
        let saved = cb.get_text().ok();
        cb.set_text(text.to_string()).map_err(|e| e.to_string())?;
        if whole {
            chord(KEY_A)?;
            std::thread::sleep(Duration::from_millis(60));
        }
        chord(KEY_V)?;
        std::thread::sleep(Duration::from_millis(350));
        if let Some(s) = saved {
            let _ = cb.set_text(s);
        }
        Ok(())
    }

    /// Copy the selection in the frontmost app (or the whole field if nothing is selected).
    pub fn copy_selection() -> Result<(String, bool), String> {
        let mut cb = arboard::Clipboard::new().map_err(|e| e.to_string())?;
        let saved = cb.get_text().ok();
        let marker = format!("\u{2063}matra-{}", std::process::id());
        cb.set_text(marker.clone()).map_err(|e| e.to_string())?;
        // Let the user's own modifier keys (from the shortcut) come up first.
        std::thread::sleep(Duration::from_millis(220));
        chord(KEY_C)?;
        std::thread::sleep(Duration::from_millis(180));
        let mut whole = false;
        let mut text = cb.get_text().unwrap_or_default();
        if text == marker {
            whole = true;
            chord(KEY_A)?;
            std::thread::sleep(Duration::from_millis(60));
            chord(KEY_C)?;
            std::thread::sleep(Duration::from_millis(180));
            text = cb.get_text().unwrap_or_default();
            if text == marker {
                text.clear();
            }
        }
        match saved {
            Some(s) => {
                let _ = cb.set_text(s);
            }
            None => {
                let _ = cb.clear();
            }
        }
        Ok((text, whole))
    }
}

#[cfg(target_os = "macos")]
pub use mac::*;

#[cfg(not(target_os = "macos"))]
pub fn activate_pid(_pid: i32) {}
#[cfg(not(target_os = "macos"))]
pub fn paste_text(_text: &str, _whole: bool) -> Result<(), String> {
    Err("Only supported on macOS.".into())
}
#[cfg(not(target_os = "macos"))]
pub fn copy_selection() -> Result<(String, bool), String> {
    Err("Only supported on macOS.".into())
}
