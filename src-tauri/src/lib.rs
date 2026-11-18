#![cfg_attr(not(target_os = "macos"), allow(unused))]
#[cfg(target_os = "macos")]
mod ax;
mod everywhere;
mod keys;

use everywhere::{FieldInfo, State, PANEL};
use keyring::Entry;
use std::sync::atomic::Ordering;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, RunEvent, WindowEvent};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

const SERVICE: &str = "com.hridoycraftt.matra";

// ---------- API keys (macOS Keychain) ----------

fn entry(provider: &str) -> Result<Entry, String> {
    let account = match provider {
        "anthropic" => "anthropic-api-key",
        "google" => "google-api-key",
        _ => return Err("Unknown provider.".into()),
    };
    Entry::new(SERVICE, account).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_api_key(provider: String) -> Result<Option<String>, String> {
    match entry(&provider)?.get_password() {
        Ok(key) => Ok(Some(key)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn set_api_key(provider: String, key: String) -> Result<(), String> {
    let key = key.trim();
    if key.is_empty() {
        return Err("The key is empty.".into());
    }
    entry(&provider)?.set_password(key).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_api_key(provider: String) -> Result<(), String> {
    match entry(&provider)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

// ---------- Matra everywhere ----------

#[tauri::command]
fn configure_everywhere(state: tauri::State<State>, config: everywhere::Config) {
    everywhere::configure(&state, config);
}

#[tauri::command]
fn accessibility_status(prompt: bool) -> bool {
    #[cfg(target_os = "macos")]
    {
        if prompt {
            ax::request_trust()
        } else {
            ax::is_trusted()
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = prompt;
        false
    }
}

/// Clear a stale Accessibility entry (left by an older build) and ask macOS again.
#[tauri::command]
fn reset_accessibility(app: AppHandle) -> bool {
    #[cfg(target_os = "macos")]
    {
        let id = app.config().identifier.clone();
        let _ = std::process::Command::new("tccutil").args(["reset", "Accessibility", &id]).status();
        std::thread::sleep(std::time::Duration::from_millis(300));
        let trusted = ax::request_trust();
        if !trusted {
            open_accessibility_settings();
        }
        trusted
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        false
    }
}

/// Turn Matra off in an app until Matra quits ("Yes, for this session").
#[tauri::command]
fn pause_app(app: AppHandle, name: String) {
    let state = app.state::<State>();
    state.session_ignored.lock().unwrap().push(name.to_lowercase());
    everywhere::hide_badge(&app);
    everywhere::hide_overlay(&app);
    if let Some(p) = app.get_webview_window(PANEL) {
        let _ = p.hide();
    }
}

/// Apps installed on this Mac, for Settings → Apps.
#[tauri::command]
fn installed_apps() -> Vec<String> {
    everywhere::installed_apps()
}

#[tauri::command]
fn open_accessibility_settings() {
    #[cfg(target_os = "macos")]
    let _ = std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
        .spawn();
}

#[tauri::command]
fn current_field(state: tauri::State<State>) -> Option<FieldInfo> {
    state.last.lock().unwrap().clone()
}

#[tauri::command]
async fn write_field(app: AppHandle, text: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let whole = app.state::<State>().capture_whole.load(Ordering::Relaxed);
        everywhere::write_field(&app, &text, whole).map(|s| s.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn show_panel(
    app: AppHandle,
    focus: bool,
    mode: everywhere::PanelMode,
    height: Option<f64>,
    anchor: Option<everywhere::Rect>,
) {
    everywhere::place_panel(&app, focus, mode, height, anchor);
}

/// Resize the badge: a dot, the corrections/improvements pill, or the pill of actions.
#[tauri::command]
fn badge_width(app: AppHandle, width: f64) {
    *app.state::<State>().badge_width.lock().unwrap() = width;
    if let Some(f) = app.state::<State>().last.lock().unwrap().clone() {
        everywhere::place_badge(&app, &f);
    }
}

#[tauri::command]
fn badge_drag(app: AppHandle, start: bool) -> Option<(String, f64, f64)> {
    everywhere::badge_drag(&app, start)
}

/// The checker's current suggestions, to underline inside the other app.
#[tauri::command]
fn set_underlines(app: AppHandle, underlines: Vec<everywhere::Underline>) {
    *app.state::<State>().underlines.lock().unwrap() = underlines;
}

#[tauri::command]
fn set_badge(app: AppHandle, visible: bool) {
    app.state::<State>().badge_wanted.store(visible, Ordering::Relaxed);
    let last = app.state::<State>().last.lock().unwrap().clone();
    match last {
        Some(f) => everywhere::place_badge(&app, &f),
        None => everywhere::hide_badge(&app),
    }
}

/// Close the panel and give keyboard focus back to the app the user was writing in.
#[tauri::command]
fn hide_panel(app: AppHandle) {
    if let Some(p) = app.get_webview_window(PANEL) {
        let _ = p.hide();
    }
    if let Some(f) = app.state::<State>().last.lock().unwrap().as_ref() {
        keys::activate_pid(f.pid);
    }
}

/// Move the caret in the field (after inserting a snippet there).
#[tauri::command]
fn set_caret(app: AppHandle, pos: usize) -> bool {
    #[cfg(target_os = "macos")]
    {
        let el = app.state::<State>().element.lock().unwrap().clone();
        el.map(|e| e.set_caret(pos)).unwrap_or(false)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, pos);
        false
    }
}

#[tauri::command]
fn focus_source(app: AppHandle) {
    if let Some(f) = app.state::<State>().last.lock().unwrap().as_ref() {
        keys::activate_pid(f.pid);
    }
}

#[tauri::command]
fn open_main(app: AppHandle, settings: bool, section: Option<String>) {
    show_main(&app);
    if settings {
        let _ = app.emit_to("main", "matra://open-settings", section);
    }
}

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

/// ⌃⌥M: open the panel for the focused field, or copy the selection when the app
/// doesn't expose its text through Accessibility.
fn on_shortcut(app: &AppHandle) {
    let state = app.state::<State>();
    let has_field = state.last.lock().unwrap().is_some();
    if has_field {
        state.capture_whole.store(true, Ordering::Relaxed);
        let _ = app.emit_to(PANEL, "matra://mode", "full");
        everywhere::place_panel(app, true, everywhere::PanelMode::Full, None, None);
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        #[cfg(target_os = "macos")]
        let pid = ax::focused_app().map(|(pid, _)| pid);
        #[cfg(target_os = "macos")]
        let name = ax::focused_app().map(|(_, n)| n).unwrap_or_else(|| "this app".into());
        #[cfg(not(target_os = "macos"))]
        let (pid, name): (Option<i32>, String) = (None, String::new());

        match keys::copy_selection() {
            Ok((text, whole)) => {
                let (x, y) = app
                    .cursor_position()
                    .ok()
                    .and_then(|p| {
                        app.primary_monitor().ok().flatten().map(|m| (p.x / m.scale_factor(), p.y / m.scale_factor()))
                    })
                    .unwrap_or((200.0, 200.0));
                let state = app.state::<State>();
                state.capture_whole.store(whole, Ordering::Relaxed);
                let info = FieldInfo {
                    app: name,
                    pid: pid.unwrap_or(0),
                    text,
                    x,
                    y,
                    width: 1.0,
                    height: 1.0,
                    field_id: u64::MAX,
                    sel_start: None,
                    sel_len: 0,
                    sel_rect: None,
                };
                *state.last.lock().unwrap() = Some(info.clone());
                let _ = app.emit_to(PANEL, "matra://field", &info);
                let _ = app.emit_to(PANEL, "matra://mode", "full");
                everywhere::place_panel(&app, true, everywhere::PanelMode::Full, None, None);
            }
            Err(e) => {
                let _ = app.emit_to(PANEL, "matra://error", e);
                everywhere::place_panel(&app, true, everywhere::PanelMode::Full, None, None);
            }
        }
    });
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Matra", true, None::<&str>)?;
    let check = MenuItem::with_id(app, "check", "Check Text Here   ⌃⌥M", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Matra", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&open, &check, &sep, &settings, &sep2, &quit])?;
    let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))?;
    TrayIconBuilder::with_id("matra")
        .icon(icon)
        .icon_as_template(true)
        .tooltip("Matra")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main(app),
            "check" => on_shortcut(app),
            "settings" => {
                show_main(app);
                let _ = app.emit_to("main", "matra://open-settings", ());
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyM);

    let app = tauri::Builder::default()
        .manage(State::default())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, sc, event| {
                    if sc == &shortcut && event.state() == ShortcutState::Pressed {
                        on_shortcut(app);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            get_api_key,
            set_api_key,
            delete_api_key,
            configure_everywhere,
            accessibility_status,
            open_accessibility_settings,
            installed_apps,
            pause_app,
            reset_accessibility,
            current_field,
            write_field,
            show_panel,
            set_badge,
            set_underlines,
            badge_drag,
            badge_width,
            focus_source,
            set_caret,
            hide_panel,
            open_main
        ])
        .setup(move |app| {
            let handle = app.handle().clone();
            build_tray(&handle)?;
            // The underline layer sits over other apps' text but never takes clicks.
            if let Some(overlay) = handle.get_webview_window(everywhere::OVERLAY) {
                let _ = overlay.set_ignore_cursor_events(true);
            }
            if let Err(e) = handle.global_shortcut().register(shortcut) {
                eprintln!("Could not register ⌃⌥M: {e}");
            }
            everywhere::start_hover_watch(handle.clone());
            everywhere::start_watcher(handle);
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing a window keeps Matra running in the menu bar, so it keeps helping in other apps.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
                if window.label() == PANEL {
                    if let Some(f) = window.app_handle().state::<State>().last.lock().unwrap().as_ref() {
                        keys::activate_pid(f.pid);
                    }
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building Matra");

    app.run(|app, event| {
        #[cfg(target_os = "macos")]
        if let RunEvent::Reopen { .. } = event {
            show_main(app);
        }
        #[cfg(not(target_os = "macos"))]
        let _ = (app, event);
    });
}
