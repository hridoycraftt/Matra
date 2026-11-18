//! "Matra everywhere": watch the text field the user is typing in, in any app, and drive
//! the floating badge and suggestion panel. The checking itself runs in the panel's webview.

use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::collections::HashMap;
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

/// A suggestion's span in the field, to underline in place.
#[derive(Clone, Deserialize, Serialize, Debug, PartialEq)]
pub struct Underline {
    pub id: String,
    pub start: usize,
    pub len: usize,
    pub category: String,
}

/// An underline positioned on screen, relative to the overlay window (= the field).
#[derive(Clone, Serialize, Debug, PartialEq)]
pub struct Mark {
    pub id: String,
    pub category: String,
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

#[derive(Default)]
pub struct State {
    pub underlines: Mutex<Vec<Underline>>,
    pub enabled: AtomicBool,
    pub auto_open: AtomicBool,
    /// Whether a paste fallback should replace the whole field (true) or only the selection.
    pub capture_whole: AtomicBool,
    /// Set by the checker: show the badge only while there is something to show.
    pub badge_wanted: AtomicBool,
    /// The user is dragging the badge: don't move it under their pointer.
    pub badge_dragging: AtomicBool,
    /// The badge is showing its pill of actions.
    pub badge_expanded: AtomicBool,
    /// Where the user dragged the badge, per app: offset from the field's top-left corner.
    pub badge_offsets: Mutex<HashMap<String, (f64, f64)>>,
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
    #[serde(default)]
    pub badge_offsets: HashMap<String, (f64, f64)>,
}

pub const BADGE: &str = "badge";
pub const OVERLAY: &str = "underlines";
pub const PANEL: &str = "panel";
const BADGE_SIZE: f64 = 30.0;
/// Width of the badge when it opens into a pill of actions (it grows to the left).
const BADGE_PILL_WIDTH: f64 = 112.0;

pub fn configure(state: &State, cfg: Config) {
    state.enabled.store(cfg.enabled, Ordering::Relaxed);
    state.auto_open.store(cfg.auto_open, Ordering::Relaxed);
    *state.ignored_apps.lock().unwrap() = cfg
        .ignored_apps
        .into_iter()
        .map(|a| a.trim().to_lowercase())
        .filter(|a| !a.is_empty())
        .collect();
    *state.badge_offsets.lock().unwrap() =
        cfg.badge_offsets.into_iter().map(|(k, v)| (k.to_lowercase(), v)).collect();
}

/// Move the badge to the field's bottom-right corner. It is only shown once the
/// panel's checker asks for it (after the user has typed), never just on focus.
pub fn place_badge<R: Runtime>(app: &AppHandle<R>, f: &FieldInfo) {
    let Some(badge) = app.get_webview_window(BADGE) else { return };
    let state = app.state::<State>();
    if state.badge_dragging.load(Ordering::Relaxed) {
        return;
    }
    let r = badge_rect(&state, f);
    let expanded = state.badge_expanded.load(Ordering::Relaxed);
    let (w, x) = if expanded { (BADGE_PILL_WIDTH, r.x - (BADGE_PILL_WIDTH - BADGE_SIZE)) } else { (BADGE_SIZE, r.x) };
    let _ = badge.set_size(tauri::LogicalSize::new(w, BADGE_SIZE));
    let _ = badge.set_position(LogicalPosition::new(x.max(0.0), r.y.max(0.0)));
    let want = state.badge_wanted.load(Ordering::Relaxed);
    let shown = badge.is_visible().unwrap_or(false);
    if want && !shown {
        let _ = badge.show();
    } else if !want && shown {
        let _ = badge.hide();
    }
}

pub fn hide_overlay<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = app.get_webview_window(OVERLAY) {
        if w.is_visible().unwrap_or(false) {
            let _ = w.hide();
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

#[derive(Clone, Copy, Debug, PartialEq, Deserialize)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

#[derive(Clone, Copy, Debug, PartialEq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PanelMode {
    /// One suggestion at a time, small, next to the badge (like an inline suggestion card).
    Card,
    /// The full assistant: suggestions, score, tone, rewrite, write with AI.
    Full,
}

pub const CARD_WIDTH: f64 = 340.0;
pub const FULL_SIZE: (f64, f64) = (400.0, 560.0);
const GAP: f64 = 8.0;
const MARGIN: f64 = 8.0;

/// Where to put a window of size (w, h) next to `anchor` so it stays fully on `screen`.
/// Tries each side in order and takes the first that fits; otherwise the side with the
/// most room, clamped to the screen. Pure, so it is unit-tested.
pub fn place(anchor: Rect, w: f64, h: f64, screen: Rect, mode: PanelMode) -> (f64, f64) {
    let right_edge = screen.x + screen.w - MARGIN;
    let bottom_edge = screen.y + screen.h - MARGIN;
    let clamp_x = |x: f64| x.max(screen.x + MARGIN).min(right_edge - w);
    let clamp_y = |y: f64| y.max(screen.y + MARGIN).min(bottom_edge - h);

    let below = (clamp_x(anchor.x + anchor.w - w), anchor.y + anchor.h + GAP);
    let above = (clamp_x(anchor.x + anchor.w - w), anchor.y - GAP - h);
    let right = (anchor.x + anchor.w + GAP, clamp_y(anchor.y));
    let left = (anchor.x - GAP - w, clamp_y(anchor.y));

    let fits = |(x, y): (f64, f64)| {
        x >= screen.x + MARGIN - 0.5 && y >= screen.y + MARGIN - 0.5 && x + w <= right_edge + 0.5 && y + h <= bottom_edge + 0.5
    };
    let order = match mode {
        PanelMode::Card => [below, above, right, left],
        PanelMode::Full => [right, left, below, above],
    };
    if let Some(p) = order.into_iter().find(|p| fits(*p)) {
        return p;
    }
    // Nothing fits fully: use the side with the most room and keep it on screen.
    let room_below = bottom_edge - (anchor.y + anchor.h);
    let room_above = anchor.y - (screen.y + MARGIN);
    let y = if room_below >= room_above { anchor.y + anchor.h + GAP } else { anchor.y - GAP - h };
    (clamp_x(anchor.x + anchor.w - w), clamp_y(y))
}

/// The usable area (without menu bar and Dock) of the screen that contains the point, in points.
fn screen_at<R: Runtime>(app: &AppHandle<R>, x: f64, y: f64) -> Rect {
    let monitors = app.available_monitors().unwrap_or_default();
    for m in &monitors {
        let s = m.scale_factor();
        let wa = m.work_area();
        let r = Rect {
            x: wa.position.x as f64 / s,
            y: wa.position.y as f64 / s,
            w: wa.size.width as f64 / s,
            h: wa.size.height as f64 / s,
        };
        let full_x = m.position().x as f64 / s;
        let full_y = m.position().y as f64 / s;
        let full_w = m.size().width as f64 / s;
        let full_h = m.size().height as f64 / s;
        if x >= full_x && x < full_x + full_w && y >= full_y && y < full_y + full_h {
            return r;
        }
    }
    Rect { x: 0.0, y: 25.0, w: 1440.0, h: 850.0 }
}

/// The badge's spot on the field (also the anchor for the suggestion card): where the
/// user dragged it in this app, or by default the field's right edge — centred on
/// one-line fields, bottom corner on tall ones.
pub fn badge_rect(state: &State, f: &FieldInfo) -> Rect {
    if let Some((dx, dy)) = state.badge_offsets.lock().unwrap().get(&f.app.to_lowercase()) {
        return Rect { x: f.x + dx, y: f.y + dy, w: BADGE_SIZE, h: BADGE_SIZE };
    }
    let x = f.x + f.width - BADGE_SIZE - 6.0;
    let y = if f.height < 64.0 { f.y + (f.height - BADGE_SIZE) / 2.0 } else { f.y + f.height - BADGE_SIZE - 6.0 };
    Rect { x, y, w: BADGE_SIZE, h: BADGE_SIZE }
}

/// Start or finish a badge drag. On finish, remember the spot for this app and
/// return (app, dx, dy) so the app can save it across launches.
pub fn badge_drag<R: Runtime>(app: &AppHandle<R>, start: bool) -> Option<(String, f64, f64)> {
    let state = app.state::<State>();
    if start {
        state.badge_dragging.store(true, Ordering::Relaxed);
        return None;
    }
    state.badge_dragging.store(false, Ordering::Relaxed);
    let badge = app.get_webview_window(BADGE)?;
    let scale = badge.scale_factor().ok()?;
    let pos = badge.outer_position().ok()?.to_logical::<f64>(scale);
    let f = state.last.lock().unwrap().clone()?;
    // Offsets are stored for the collapsed dot, which sits at the pill's right end.
    let extra = if state.badge_expanded.load(Ordering::Relaxed) { BADGE_PILL_WIDTH - BADGE_SIZE } else { 0.0 };
    let (dx, dy) = (pos.x + extra - f.x, pos.y - f.y);
    state.badge_offsets.lock().unwrap().insert(f.app.to_lowercase(), (dx, dy));
    Some((f.app, dx, dy))
}

/// Show the panel next to the field, sized for the mode, always fully on screen.
pub fn place_panel<R: Runtime>(app: &AppHandle<R>, focus: bool, mode: PanelMode, height: Option<f64>, anchor: Option<Rect>) {
    let Some(panel) = app.get_webview_window(PANEL) else { return };
    let (w, h) = match mode {
        PanelMode::Card => (CARD_WIDTH, height.unwrap_or(190.0).clamp(120.0, 420.0)),
        PanelMode::Full => FULL_SIZE,
    };
    let _ = panel.set_size(tauri::LogicalSize::new(w, h));
    let last = app.state::<State>().last.lock().unwrap().clone();
    if let Some(f) = last {
        let anchor = anchor.unwrap_or(match mode {
            PanelMode::Card => badge_rect(&app.state::<State>(), &f),
            PanelMode::Full => Rect { x: f.x, y: f.y, w: f.width, h: f.height },
        });
        let screen = screen_at(app, anchor.x, anchor.y);
        let (x, y) = place(anchor, w, h, screen, mode);
        let _ = panel.set_position(LogicalPosition::new(x, y));
    }
    let _ = panel.show();
    if focus {
        let _ = panel.set_focus();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    const SCREEN: Rect = Rect { x: 0.0, y: 25.0, w: 1440.0, h: 850.0 };

    fn inside(x: f64, y: f64, w: f64, h: f64) -> bool {
        x >= SCREEN.x && y >= SCREEN.y && x + w <= SCREEN.x + SCREEN.w && y + h <= SCREEN.y + SCREEN.h
    }

    #[test]
    fn card_opens_below_when_there_is_room() {
        let a = Rect { x: 600.0, y: 200.0, w: 30.0, h: 30.0 };
        let (x, y) = place(a, 340.0, 190.0, SCREEN, PanelMode::Card);
        assert!(y > a.y);
        assert!(inside(x, y, 340.0, 190.0));
    }

    #[test]
    fn card_flips_above_near_the_bottom() {
        let a = Rect { x: 600.0, y: 820.0, w: 30.0, h: 30.0 };
        let (x, y) = place(a, 340.0, 190.0, SCREEN, PanelMode::Card);
        assert!(y + 190.0 <= a.y);
        assert!(inside(x, y, 340.0, 190.0));
    }

    #[test]
    fn card_stays_on_screen_at_the_right_edge() {
        let a = Rect { x: 1420.0, y: 400.0, w: 30.0, h: 30.0 };
        let (x, y) = place(a, 340.0, 190.0, SCREEN, PanelMode::Card);
        assert!(inside(x, y, 340.0, 190.0));
    }

    #[test]
    fn full_panel_goes_left_when_right_is_full() {
        let a = Rect { x: 900.0, y: 300.0, w: 500.0, h: 300.0 };
        let (x, _) = place(a, 400.0, 560.0, SCREEN, PanelMode::Full);
        assert!(x + 400.0 <= a.x);
    }

    #[test]
    fn full_panel_never_leaves_the_screen_for_a_field_at_the_bottom() {
        // A chat box along the bottom of a full-width window: no side fits.
        let a = Rect { x: 20.0, y: 780.0, w: 1400.0, h: 80.0 };
        let (x, y) = place(a, 400.0, 560.0, SCREEN, PanelMode::Full);
        assert!(inside(x, y, 400.0, 560.0), "{x},{y}");
        assert!(y + 560.0 <= a.y + 1.0);
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
        let mut last_marks: Vec<Mark> = Vec::new();
        let mut last_caret_issue: Option<String> = None;
        loop {
            std::thread::sleep(Duration::from_millis(450));
            let state = app.state::<State>();
            if !state.enabled.load(Ordering::Relaxed) || !ax::is_trusted() {
                hide_badge(&app);
                hide_overlay(&app);
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
                hide_overlay(&app);
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
                state.badge_wanted.store(false, Ordering::Relaxed);
                state.underlines.lock().unwrap().clear();
                last_marks.clear();
                last_caret_issue = None;
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

            // Underlines drawn in place, and the card for the underline the caret is on.
            let underlines = state.underlines.lock().unwrap().clone();
            let element = state.element.lock().unwrap().clone();
            if let (false, Some(el)) = (underlines.is_empty(), element) {
                let marks: Vec<Mark> = underlines
                    .iter()
                    .filter_map(|u| {
                        let (x, y, w, h) = el.bounds_for_range(u.start, u.len)?;
                        Some(Mark { id: u.id.clone(), category: u.category.clone(), x: x - info.x, y: y - info.y, w, h })
                    })
                    .filter(|m| m.x > -2.0 && m.y > -2.0 && m.x < info.width + 2.0 && m.y < info.height + 2.0)
                    .collect();
                if let Some(overlay) = app.get_webview_window(OVERLAY) {
                    let _ = overlay.set_position(LogicalPosition::new(info.x, info.y));
                    let _ = overlay.set_size(tauri::LogicalSize::new(info.width.max(1.0), info.height.max(1.0)));
                    if marks != last_marks {
                        let _ = app.emit_to(OVERLAY, "matra://marks", &marks);
                        last_marks = marks.clone();
                    }
                    if marks.is_empty() {
                        hide_overlay(&app);
                    } else if !overlay.is_visible().unwrap_or(false) {
                        let _ = overlay.show();
                    }
                }
                if let Some(caret) = el.caret() {
                    let hit = underlines.iter().find(|u| caret >= u.start && caret <= u.start + u.len);
                    let hit_id = hit.map(|u| u.id.clone());
                    if hit_id != last_caret_issue {
                        last_caret_issue = hit_id;
                        if let Some(u) = hit {
                            let rect = marks.iter().find(|m| m.id == u.id).map(|m| Rect {
                                x: m.x + info.x,
                                y: m.y + info.y,
                                w: m.w,
                                h: m.h,
                            });
                            let _ = app.emit_to(PANEL, "matra://caret-issue", (u.id.clone(), rect.map(|r| (r.x, r.y, r.w, r.h))));
                        }
                    }
                }
            } else {
                if !last_marks.is_empty() {
                    last_marks.clear();
                    let _ = app.emit_to(OVERLAY, "matra://marks", &last_marks);
                }
                hide_overlay(&app);
            }
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
