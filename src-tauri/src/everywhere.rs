//! "Matra everywhere": watch the text field the user is typing in, in any app, and drive
//! the floating badge and suggestion panel. The checking itself runs in the panel's webview.

use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, LogicalPosition, Manager, Runtime};

#[derive(Clone, Serialize, Deserialize, PartialEq, Debug)]
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
    /// Caret or selection start, in UTF-16 units (JavaScript string indices).
    #[serde(default)]
    pub sel_start: Option<usize>,
    #[serde(default)]
    pub sel_len: usize,
    /// Screen rectangle of the selection, when text is selected.
    #[serde(default)]
    pub sel_rect: Option<(f64, f64, f64, f64)>,
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
    /// Where each underline is on screen right now (global points), for hover detection.
    pub screen_marks: Mutex<Vec<(String, Rect)>>,
    pub enabled: AtomicBool,
    pub auto_open: AtomicBool,
    /// Whether a paste fallback should replace the whole field (true) or only the selection.
    pub capture_whole: AtomicBool,
    /// Set by the checker: show the badge only while there is something to show.
    pub badge_wanted: AtomicBool,
    /// The user is dragging the badge: don't move it under their pointer.
    pub badge_dragging: AtomicBool,
    /// The badge is showing its pill of actions.
    /// Badge window width in points: a dot, the corrections/improvements pill, or the actions pill.
    pub badge_width: Mutex<f64>,
    /// Where the user dragged the badge, per app: offset from the field's top-left corner.
    pub badge_offsets: Mutex<HashMap<String, (f64, f64)>>,
    pub ignored_apps: Mutex<Vec<String>>,
    /// Apps turned off "for this session" (until Matra quits).
    pub session_ignored: Mutex<Vec<String>>,
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
    // The badge grows to the left, so its right end (the dot) stays where the user put it.
    let w = badge_width(&state);
    let x = r.x - (w - BADGE_SIZE);
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

/// Is Matra switched off for this app? Entries match the app's name, or its name
/// followed by a version ("Adobe Photoshop" also covers "Adobe Photoshop 2026").
pub fn is_ignored(ignored: &[String], app: &str) -> bool {
    let app = app.to_lowercase();
    ignored.iter().any(|a| {
        app == *a
            || app
                .strip_prefix(&format!("{a} "))
                .is_some_and(|rest| rest.chars().next().is_some_and(|c| c.is_ascii_digit()))
    })
}

/// Apps installed on this Mac, by name, for Settings → Apps. Read fresh each time, so
/// newly installed apps appear and removed ones disappear.
/// An installed app as Settings → Apps shows it.
#[derive(Clone, serde::Serialize)]
pub struct AppInfo {
    pub name: String,
    pub path: String,
    /// Friendly category from the app's own LSApplicationCategoryType ("" when it declares none).
    pub category: String,
    /// Made by Apple (lives in /System/Applications or has a com.apple bundle id).
    pub apple: bool,
}

/// Map Apple's category ids to the names the App Store uses.
pub fn category_name(id: &str) -> &'static str {
    match id.trim_start_matches("public.app-category.") {
        "productivity" => "Productivity",
        "business" => "Business",
        "developer-tools" => "Developer Tools",
        "graphics-design" => "Graphics & Design",
        "photography" => "Photo & Video",
        "video" => "Photo & Video",
        "social-networking" => "Social & Communication",
        "entertainment" => "Entertainment",
        "music" => "Music & Audio",
        "education" => "Education",
        "reference" => "Reference",
        "utilities" => "Utilities",
        "finance" => "Finance",
        "news" => "News",
        "lifestyle" => "Lifestyle",
        "healthcare-fitness" | "medical" => "Health & Fitness",
        "travel" | "navigation" | "weather" => "Travel & Maps",
        "sports" => "Sports",
        "games" => "Games",
        id if id.ends_with("-games") => "Games",
        _ => "",
    }
}

/// Apps whose plist declares no category, placed by what they are.
fn guess_category(name: &str) -> &'static str {
    const SOCIAL: [&str; 12] = ["Discord", "Slack", "WhatsApp", "Telegram", "Messenger", "Signal", "Zoom", "Microsoft Teams", "Skype", "Messages", "FaceTime", "Mail"];
    const BROWSERS: [&str; 9] = ["Google Chrome", "Safari", "Firefox", "Arc", "Brave Browser", "Microsoft Edge", "Opera", "Vivaldi", "Chromium"];
    const DESIGN: [&str; 6] = ["Figma", "Sketch", "Framer", "Canva", "Affinity", "Adobe"];
    const DEV: [&str; 8] = ["Xcode", "Terminal", "iTerm", "Visual Studio Code", "Cursor", "Zed", "GitHub Desktop", "Docker"];
    const WORK: [&str; 10] = ["Notion", "Obsidian", "Notes", "Pages", "Microsoft Word", "Microsoft Excel", "Microsoft PowerPoint", "Keynote", "Numbers", "Linear"];
    let starts = |list: &[&str]| list.iter().any(|p| name.starts_with(p));
    if starts(&BROWSERS) {
        "Browsers"
    } else if starts(&SOCIAL) {
        "Social & Communication"
    } else if starts(&DESIGN) {
        "Graphics & Design"
    } else if starts(&DEV) {
        "Developer Tools"
    } else if starts(&WORK) {
        "Productivity"
    } else {
        ""
    }
}

fn read_app(path: &std::path::Path, system_dir: bool) -> Option<AppInfo> {
    let name = path.file_stem()?.to_string_lossy().to_string();
    let plist = plist::Value::from_file(path.join("Contents/Info.plist")).ok();
    let dict = plist.as_ref().and_then(|v| v.as_dictionary());
    let get = |k: &str| dict.and_then(|d| d.get(k)).and_then(|v| v.as_string()).unwrap_or("").to_string();
    let bundle = get("CFBundleIdentifier");
    let declared = category_name(&get("LSApplicationCategoryType"));
    // Browsers declare "productivity"; group them on their own like iOS does.
    let guessed = guess_category(&name);
    let category = if guessed == "Browsers" || declared.is_empty() { guessed } else { declared };
    Some(AppInfo {
        name,
        path: path.to_string_lossy().to_string(),
        category: category.to_string(),
        apple: system_dir || bundle.starts_with("com.apple."),
    })
}

/// Apps installed on this Mac, so Settings can list them A–Z (new apps appear, removed ones go).
pub fn installed_apps() -> Vec<AppInfo> {
    let mut dirs: Vec<(String, bool)> = vec![
        ("/Applications".into(), false),
        ("/Applications/Utilities".into(), true),
        ("/System/Applications".into(), true),
        ("/System/Applications/Utilities".into(), true),
    ];
    if let Ok(home) = std::env::var("HOME") {
        dirs.push((format!("{home}/Applications"), false));
    }
    let mut apps: Vec<AppInfo> = Vec::new();
    for (dir, system) in dirs {
        let Ok(entries) = std::fs::read_dir(&dir) else { continue };
        for e in entries.flatten() {
            let path = e.path();
            if path.extension().is_some_and(|x| x == "app") {
                apps.extend(read_app(&path, system));
            } else if path.is_dir() && dir == "/Applications" {
                // Suites keep apps one folder down (e.g. /Applications/Adobe Photoshop 2026/…app).
                if let Ok(inner) = std::fs::read_dir(&path) {
                    for i in inner.flatten() {
                        if i.path().extension().is_some_and(|x| x == "app") {
                            apps.extend(read_app(&i.path(), false));
                        }
                    }
                }
            }
        }
    }
    apps.retain(|a| a.name != "Matra" && !a.name.starts_with('.'));
    apps.sort_by_key(|a| a.name.to_lowercase());
    apps.dedup_by(|a, b| a.name == b.name);
    apps
}

/// The app's real icon as a small PNG data URL, cached on disk.
pub fn app_icon(path: &str, cache_dir: &std::path::Path) -> Option<String> {
    use base64::Engine;
    use std::hash::{Hash, Hasher};
    let app = std::path::Path::new(path);
    if app.extension().is_none_or(|x| x != "app") || !app.exists() {
        return None;
    }
    let mut h = std::collections::hash_map::DefaultHasher::new();
    path.hash(&mut h);
    let modified = std::fs::metadata(app).and_then(|m| m.modified()).ok();
    modified.hash(&mut h);
    let dir = cache_dir.join("app-icons");
    std::fs::create_dir_all(&dir).ok()?;
    let out = dir.join(format!("{:016x}.png", h.finish()));
    if !out.exists() {
        render_icon(app, &out, &dir);
    }
    let bytes = std::fs::read(&out).ok()?;
    Some(format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes)))
}

#[cfg(target_os = "macos")]
fn render_icon(app: &std::path::Path, out: &std::path::Path, dir: &std::path::Path) {
    use std::process::Command;
    // 1) The .icns the app names in its Info.plist.
    let plist = plist::Value::from_file(app.join("Contents/Info.plist")).ok();
    let icon = plist
        .as_ref()
        .and_then(|v| v.as_dictionary())
        .and_then(|d| d.get("CFBundleIconFile"))
        .and_then(|v| v.as_string())
        .map(|f| if f.ends_with(".icns") { f.to_string() } else { format!("{f}.icns") });
    if let Some(file) = icon {
        let icns = app.join("Contents/Resources").join(file);
        if icns.exists() {
            let ok = Command::new("sips")
                .args(["-s", "format", "png", "--resampleHeightWidthMax", "64"])
                .arg(&icns)
                .arg("--out")
                .arg(out)
                .output()
                .is_ok_and(|o| o.status.success());
            if ok && out.exists() {
                return;
            }
        }
    }
    // 2) Apps with only an asset catalog: let Quick Look draw the icon.
    let tmp = dir.join("ql");
    let _ = std::fs::create_dir_all(&tmp);
    let ok = Command::new("qlmanage")
        .args(["-t", "-s", "64", "-o"])
        .arg(&tmp)
        .arg(app)
        .output()
        .is_ok_and(|o| o.status.success());
    if ok {
        if let Some(name) = app.file_name() {
            let made = tmp.join(format!("{}.png", name.to_string_lossy()));
            let _ = std::fs::rename(made, out);
        }
    }
}

#[cfg(not(target_os = "macos"))]
fn render_icon(_app: &std::path::Path, _out: &std::path::Path, _dir: &std::path::Path) {}

pub fn badge_width(state: &State) -> f64 {
    let w = *state.badge_width.lock().unwrap();
    if w < BADGE_SIZE { BADGE_SIZE } else { w.min(240.0) }
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
    /// The small card for one underlined word, right under it (like hovering an underline).
    Word,
}

pub const CARD_WIDTH: f64 = 340.0;
pub const WORD_WIDTH: f64 = 268.0;
pub const FULL_SIZE: (f64, f64) = (360.0, 480.0);
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
    // A word card starts at the word's left edge, like a tooltip.
    let word_below = (clamp_x(anchor.x - 8.0), anchor.y + anchor.h + GAP);
    let word_above = (clamp_x(anchor.x - 8.0), anchor.y - GAP - h);
    let order = match mode {
        PanelMode::Word => [word_below, word_above, right, left],
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
    let extra = badge_width(&state) - BADGE_SIZE;
    let (dx, dy) = (pos.x + extra - f.x, pos.y - f.y);
    state.badge_offsets.lock().unwrap().insert(f.app.to_lowercase(), (dx, dy));
    Some((f.app, dx, dy))
}

/// Show the panel next to the field, sized for the mode, always fully on screen.
pub fn place_panel<R: Runtime>(app: &AppHandle<R>, focus: bool, mode: PanelMode, height: Option<f64>, anchor: Option<Rect>) {
    let Some(panel) = app.get_webview_window(PANEL) else { return };
    let (w, h) = match mode {
        PanelMode::Card => (CARD_WIDTH, height.unwrap_or(190.0).clamp(120.0, 420.0)),
        PanelMode::Word => (WORD_WIDTH, height.unwrap_or(150.0).clamp(90.0, 320.0)),
        PanelMode::Full => FULL_SIZE,
    };
    let _ = panel.set_size(tauri::LogicalSize::new(w, h));
    let last = app.state::<State>().last.lock().unwrap().clone();
    if let Some(f) = last {
        let anchor = anchor.unwrap_or(match mode {
            PanelMode::Card | PanelMode::Word => badge_rect(&app.state::<State>(), &f),
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

    #[test]
    fn hover_hits_the_word_under_the_mouse() {
        let marks = vec![
            ("a".to_string(), Rect { x: 100.0, y: 200.0, w: 60.0, h: 18.0 }),
            ("b".to_string(), Rect { x: 200.0, y: 200.0, w: 40.0, h: 18.0 }),
        ];
        assert_eq!(hit_mark(&marks, 130.0, 210.0).map(|m| m.0), Some("a".to_string()));
        assert_eq!(hit_mark(&marks, 220.0, 219.0).map(|m| m.0), Some("b".to_string()));
        assert!(hit_mark(&marks, 180.0, 210.0).is_none());
        assert!(hit_mark(&marks, 130.0, 260.0).is_none());
    }

    #[test]
    fn ignored_apps_match_names_and_versioned_names() {
        let ignored = vec!["figma".to_string(), "adobe photoshop".to_string()];
        assert!(is_ignored(&ignored, "Figma"));
        assert!(is_ignored(&ignored, "Adobe Photoshop 2026"));
        assert!(!is_ignored(&ignored, "Figma Agent Helper2"));
        assert!(!is_ignored(&ignored, "Mail"));
    }
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
                let session = state.session_ignored.lock().unwrap();
                f.pid != own_pid && !is_ignored(&ignored, &f.app) && !is_ignored(&session, &f.app)
            });

            let Some(field) = field else {
                // Focus left the text box but the same app is still in front (the user clicked
                // elsewhere in the page): keep the quiet dot on the box, following it if it moves.
                let same_app = matches!((&focused, state.last.lock().unwrap().as_ref()), (Some((pid, _)), Some(l)) if *pid == l.pid);
                let kept = state.element.lock().unwrap().as_ref().and_then(|el| el.frame());
                if let (true, Some((x, y, w, h))) = (same_app, kept) {
                    let moved = {
                        let mut last = state.last.lock().unwrap();
                        match last.as_mut() {
                            Some(l) if (l.x, l.y, l.width, l.height) != (x, y, w, h) => {
                                l.x = x;
                                l.y = y;
                                l.width = w;
                                l.height = h;
                                Some(l.clone())
                            }
                            Some(l) => {
                                place_badge(&app, l);
                                None
                            }
                            None => None,
                        }
                    };
                    if let Some(l) = moved {
                        place_badge(&app, &l);
                    }
                    continue;
                }
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
                sel_start: None,
                sel_len: 0,
                sel_rect: None,
            };
            let mut info = info;
            if let Some((start, len)) = field.element.selection() {
                info.sel_start = Some(start);
                info.sel_len = len;
                if len > 0 {
                    info.sel_rect = field.element.bounds_for_range(start, len);
                }
            }
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
                    *state.screen_marks.lock().unwrap() = marks
                        .iter()
                        .map(|m| (m.id.clone(), Rect { x: m.x + info.x, y: m.y + info.y, w: m.w, h: m.h }))
                        .collect();
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
                state.screen_marks.lock().unwrap().clear();
                if !last_marks.is_empty() {
                    last_marks.clear();
                    let _ = app.emit_to(OVERLAY, "matra://marks", &last_marks);
                }
                hide_overlay(&app);
            }
        }
    });
}

/// Mouse position in global points (the same space as Accessibility frames).
fn cursor_points<R: Runtime>(app: &AppHandle<R>) -> Option<(f64, f64)> {
    let p = app.cursor_position().ok()?;
    for m in app.available_monitors().ok()? {
        let (pos, size) = (m.position(), m.size());
        if p.x >= pos.x as f64 && p.y >= pos.y as f64 && p.x < (pos.x + size.width as i32) as f64 && p.y < (pos.y + size.height as i32) as f64 {
            let s = m.scale_factor();
            return Some((p.x / s, p.y / s));
        }
    }
    let s = app.primary_monitor().ok()??.scale_factor();
    Some((p.x / s, p.y / s))
}

/// Which underline (if any) contains the point. Underlines are thin, so the word's
/// whole line height counts, plus a little slack.
pub fn hit_mark(marks: &[(String, Rect)], x: f64, y: f64) -> Option<(String, Rect)> {
    marks
        .iter()
        .find(|(_, r)| x >= r.x - 1.0 && x <= r.x + r.w + 1.0 && y >= r.y - 2.0 && y <= r.y + r.h + 3.0)
        .cloned()
}

/// Watch the mouse: resting on an underlined word for a moment opens its small card,
/// like hovering a Grammarly underline. Cheap: only compares against known rectangles.
pub fn start_hover_watch<R: Runtime>(app: AppHandle<R>) {
    std::thread::spawn(move || {
        let mut over: Option<String> = None;
        let mut since = std::time::Instant::now();
        let mut opened: Option<String> = None;
        loop {
            std::thread::sleep(std::time::Duration::from_millis(110));
            let state = app.state::<State>();
            let marks = state.screen_marks.lock().unwrap().clone();
            if marks.is_empty() {
                if over.take().is_some() {
                    let _ = app.emit_to(OVERLAY, "matra://active", Option::<String>::None);
                }
                opened = None;
                continue;
            }
            let Some((x, y)) = cursor_points(&app) else { continue };
            let hit = hit_mark(&marks, x, y);
            let hit_id = hit.as_ref().map(|(id, _)| id.clone());
            if hit_id != over {
                over = hit_id.clone();
                since = std::time::Instant::now();
                let _ = app.emit_to(OVERLAY, "matra://active", &over);
                if over.is_none() {
                    opened = None;
                }
                continue;
            }
            // Dwell ~250 ms before opening, so passing over a word doesn't flash a card.
            if let Some((id, r)) = hit {
                if opened.as_deref() != Some(id.as_str()) && since.elapsed().as_millis() >= 250 {
                    opened = Some(id.clone());
                    let _ = app.emit_to(PANEL, "matra://hover-issue", (id, Some((r.x, r.y, r.w, r.h))));
                }
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

#[cfg(test)]
mod app_category_tests {
    use super::{category_name, guess_category};

    #[test]
    fn maps_apple_categories_to_store_names() {
        assert_eq!(category_name("public.app-category.developer-tools"), "Developer Tools");
        assert_eq!(category_name("public.app-category.social-networking"), "Social & Communication");
        assert_eq!(category_name("public.app-category.puzzle-games"), "Games");
        assert_eq!(category_name("nonsense"), "");
        assert_eq!(guess_category("Discord"), "Social & Communication");
        assert_eq!(guess_category("Google Chrome"), "Browsers");
    }
}
