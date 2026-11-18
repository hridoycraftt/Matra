//! "Matra everywhere": watch the text field the user is typing in, in any app, and drive
//! the floating badge and suggestion panel. The checking itself runs in the panel's webview.

use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, LogicalPosition, Manager, Runtime};

#[derive(Clone, Serialize, PartialEq, Debug)]
pub struct FieldInfo {
    pub app: String,
    pub pid: i32,
    pub text: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    /// Changes whenever focus moves to a different text field.
    pub field_id: u64,
}

#[derive(Default)]
pub struct State {
    pub enabled: AtomicBool,
    pub auto_open: AtomicBool,
    /// Whether a paste fallback should replace the whole field (true) or only the selection.
    pub capture_whole: AtomicBool,
    pub ignored_apps: Mutex<Vec<String>>,
    pub last: Mutex<Option<FieldInfo>>,
    #[cfg(target_os = "macos")]
    pub element: Mutex<Option<crate::ax::Element>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub enabled: bool,
    pub auto_open: bool,
    pub ignored_apps: Vec<String>,
}

pub const BADGE: &str = "badge";
pub const PANEL: &str = "panel";
const BADGE_SIZE: f64 = 30.0;

pub fn configure(state: &State, cfg: Config) {
    state.enabled.store(cfg.enabled, Ordering::Relaxed);
    state.auto_open.store(cfg.auto_open, Ordering::Relaxed);
    *state.ignored_apps.lock().unwrap() = cfg
        .ignored_apps
        .into_iter()
        .map(|a| a.trim().to_lowercase())
        .filter(|a| !a.is_empty())
        .collect();
}

pub fn place_badge<R: Runtime>(app: &AppHandle<R>, f: &FieldInfo) {
    if let Some(badge) = app.get_webview_window(BADGE) {
        // Bottom-right corner of the field, just inside it, like a caret-side helper.
        let x = f.x + f.width - BADGE_SIZE - 6.0;
        let y = f.y + f.height - BADGE_SIZE - 6.0;
        let _ = badge.set_position(LogicalPosition::new(x.max(0.0), y.max(0.0)));
        if !badge.is_visible().unwrap_or(false) {
            let _ = badge.show();
        }
    }
}

pub fn hide_badge<R: Runtime>(app: &AppHandle<R>) {
    if let Some(badge) = app.get_webview_window(BADGE) {
        if badge.is_visible().unwrap_or(false) {
            let _ = badge.hide();
        }
    }
}

/// Put the panel beside the field: right of it if there is room, otherwise left, otherwise over it.
pub fn place_panel<R: Runtime>(app: &AppHandle<R>, focus: bool) {
    let Some(panel) = app.get_webview_window(PANEL) else { return };
    let last = app.state::<State>().last.lock().unwrap().clone();
    if let Some(f) = last {
        let (pw, ph) = (400.0, 560.0);
        let screen_w = panel
            .current_monitor()
            .ok()
            .flatten()
            .map(|m| m.size().width as f64 / m.scale_factor())
            .unwrap_or(1440.0);
        let x = if f.x + f.width + 12.0 + pw <= screen_w {
            f.x + f.width + 12.0
        } else if f.x - 12.0 - pw >= 0.0 {
            f.x - 12.0 - pw
        } else {
            (screen_w - pw - 12.0).max(0.0)
        };
        let y = (f.y).max(30.0);
        let _ = panel.set_position(LogicalPosition::new(x, y));
        let _ = ph;
    }
    let _ = panel.show();
    if focus {
        let _ = panel.set_focus();
    }
}

#[cfg(target_os = "macos")]
pub fn start_watcher<R: Runtime>(app: AppHandle<R>) {
    use crate::ax;
    use std::collections::HashSet;
    use std::time::Duration;

    std::thread::spawn(move || {
        let own_pid = std::process::id() as i32;
        let mut woken: HashSet<i32> = HashSet::new();
        let mut field_counter: u64 = 0;
        loop {
            std::thread::sleep(Duration::from_millis(450));
            let state = app.state::<State>();
            if !state.enabled.load(Ordering::Relaxed) || !ax::is_trusted() {
                hide_badge(&app);
                continue;
            }

            // Matra's own windows have focus (the user is using the panel): keep everything as is.
            let focused = ax::focused_app();
            if let Some((pid, name)) = &focused {
                if *pid == own_pid {
                    continue;
                }
                if woken.insert(*pid) {
                    ax::wake_accessibility(*pid, name);
                }
            }

            let field = ax::focused_field().filter(|f| {
                let ignored = state.ignored_apps.lock().unwrap();
                f.pid != own_pid && !ignored.iter().any(|a| f.app.to_lowercase() == *a)
            });

            let Some(field) = field else {
                hide_badge(&app);
                let mut last = state.last.lock().unwrap();
                if last.is_some() {
                    *last = None;
                    *state.element.lock().unwrap() = None;
                    let _ = app.emit_to(PANEL, "matra://field-cleared", ());
                }
                continue;
            };

            let same_element = state.element.lock().unwrap().as_ref() == Some(&field.element);
            if !same_element {
                field_counter += 1;
            }
            let info = FieldInfo {
                app: field.app.clone(),
                pid: field.pid,
                text: field.text.clone(),
                x: field.x,
                y: field.y,
                width: field.width,
                height: field.height,
                field_id: field_counter,
            };
            let changed = state.last.lock().unwrap().as_ref() != Some(&info);
            if changed {
                state.capture_whole.store(true, Ordering::Relaxed);
                *state.element.lock().unwrap() = Some(field.element);
                *state.last.lock().unwrap() = Some(info.clone());
                let _ = app.emit_to(PANEL, "matra://field", &info);
            }
            place_badge(&app, &info);
        }
    });
}

#[cfg(not(target_os = "macos"))]
pub fn start_watcher<R: Runtime>(_app: AppHandle<R>) {}

/// Write text back into the field. Tries Accessibility first, then select-all + paste.
#[cfg(target_os = "macos")]
pub fn write_field<R: Runtime>(app: &AppHandle<R>, text: &str, whole: bool) -> Result<&'static str, String> {
    let state = app.state::<State>();
    let element = state.element.lock().unwrap().clone();
    let pid = state.last.lock().unwrap().as_ref().map(|f| f.pid);
    if let Some(el) = &element {
        if el.set_string("AXValue", text) && el.string("AXValue").as_deref() == Some(text) {
            if let Some(last) = state.last.lock().unwrap().as_mut() {
                last.text = text.to_string();
            }
            return Ok("accessibility");
        }
    }
    let pid = pid.ok_or("No text field to write to.")?;
    crate::keys::activate_pid(pid);
    std::thread::sleep(std::time::Duration::from_millis(180));
    crate::keys::paste_text(text, whole)?;
    Ok("paste")
}

#[cfg(not(target_os = "macos"))]
pub fn write_field<R: Runtime>(_app: &AppHandle<R>, _text: &str, _whole: bool) -> Result<&'static str, String> {
    Err("Writing to other apps is only supported on macOS.".into())
}
