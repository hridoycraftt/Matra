//! Thin, safe wrappers over the macOS Accessibility (AX) API: find the text field the
//! user is typing in (in any app), read its text and frame, and write corrected text back.

use core_foundation::base::{CFType, CFTypeRef, TCFType};
use core_foundation::boolean::CFBoolean;
use core_foundation::dictionary::CFDictionary;
use core_foundation::string::{CFString, CFStringRef};
use core_foundation_sys::base::{CFEqual, CFRelease, CFRetain};
use core_foundation_sys::dictionary::CFDictionaryRef;
use std::ffi::c_void;

type AXUIElementRef = *const c_void;
type AXError = i32;
const AX_OK: AXError = 0;
const AX_VALUE_CGPOINT: u32 = 1;
const AX_VALUE_CGSIZE: u32 = 2;
const AX_VALUE_CGRECT: u32 = 3;
const AX_VALUE_CFRANGE: u32 = 4;

#[repr(C)]
#[derive(Default, Clone, Copy)]
struct CFRange {
    location: isize,
    length: isize,
}
#[repr(C)]
#[derive(Default, Clone, Copy)]
struct CGRect {
    origin: CGPoint,
    size: CGSize,
}

#[repr(C)]
#[derive(Default, Clone, Copy)]
struct CGPoint {
    x: f64,
    y: f64,
}
#[repr(C)]
#[derive(Default, Clone, Copy)]
struct CGSize {
    width: f64,
    height: f64,
}

#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn AXIsProcessTrusted() -> bool;
    fn AXIsProcessTrustedWithOptions(options: CFDictionaryRef) -> bool;
    fn AXUIElementCreateSystemWide() -> AXUIElementRef;
    fn AXUIElementCreateApplication(pid: i32) -> AXUIElementRef;
    fn AXUIElementCopyAttributeValue(el: AXUIElementRef, attr: CFStringRef, value: *mut CFTypeRef) -> AXError;
    fn AXUIElementSetAttributeValue(el: AXUIElementRef, attr: CFStringRef, value: CFTypeRef) -> AXError;
    fn AXUIElementGetPid(el: AXUIElementRef, pid: *mut i32) -> AXError;
    fn AXValueGetValue(value: CFTypeRef, kind: u32, out: *mut c_void) -> bool;
    fn AXValueCreate(kind: u32, value: *const c_void) -> CFTypeRef;
    fn AXUIElementCopyParameterizedAttributeValue(
        el: AXUIElementRef,
        attr: CFStringRef,
        param: CFTypeRef,
        value: *mut CFTypeRef,
    ) -> AXError;
}

/// Has the user granted Matra Accessibility access?
pub fn is_trusted() -> bool {
    unsafe { AXIsProcessTrusted() }
}

/// Same, but asks macOS to show its "allow Accessibility" prompt if not yet granted.
pub fn request_trust() -> bool {
    let key = CFString::new("AXTrustedCheckOptionPrompt");
    let dict = CFDictionary::from_CFType_pairs(&[(key.as_CFType(), CFBoolean::true_value().as_CFType())]);
    unsafe { AXIsProcessTrustedWithOptions(dict.as_concrete_TypeRef()) }
}

/// An owned (retained) AX element.
pub struct Element(AXUIElementRef);

// AX elements are CF objects; the AX API may be called from any thread.
unsafe impl Send for Element {}
unsafe impl Sync for Element {}

impl Drop for Element {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe { CFRelease(self.0) }
        }
    }
}

impl Clone for Element {
    fn clone(&self) -> Self {
        unsafe { CFRetain(self.0) };
        Element(self.0)
    }
}

impl PartialEq for Element {
    fn eq(&self, other: &Self) -> bool {
        unsafe { CFEqual(self.0, other.0) != 0 }
    }
}

impl Element {
    fn from_create(raw: AXUIElementRef) -> Option<Self> {
        if raw.is_null() {
            None
        } else {
            Some(Element(raw))
        }
    }

    pub fn system_wide() -> Option<Self> {
        Self::from_create(unsafe { AXUIElementCreateSystemWide() })
    }

    pub fn application(pid: i32) -> Option<Self> {
        Self::from_create(unsafe { AXUIElementCreateApplication(pid) })
    }

    fn copy_attr(&self, name: &str) -> Option<CFType> {
        let attr = CFString::new(name);
        let mut value: CFTypeRef = std::ptr::null();
        let err = unsafe { AXUIElementCopyAttributeValue(self.0, attr.as_concrete_TypeRef(), &mut value) };
        if err != AX_OK || value.is_null() {
            return None;
        }
        Some(unsafe { CFType::wrap_under_create_rule(value) })
    }

    pub fn string(&self, name: &str) -> Option<String> {
        self.copy_attr(name)?.downcast::<CFString>().map(|s| s.to_string())
    }

    pub fn element(&self, name: &str) -> Option<Element> {
        let attr = CFString::new(name);
        let mut value: CFTypeRef = std::ptr::null();
        let err = unsafe { AXUIElementCopyAttributeValue(self.0, attr.as_concrete_TypeRef(), &mut value) };
        if err != AX_OK {
            return None;
        }
        Self::from_create(value)
    }

    fn point(&self, name: &str) -> Option<CGPoint> {
        let v = self.copy_attr(name)?;
        let mut p = CGPoint::default();
        let ok = unsafe { AXValueGetValue(v.as_CFTypeRef(), AX_VALUE_CGPOINT, &mut p as *mut _ as *mut c_void) };
        ok.then_some(p)
    }

    fn size(&self, name: &str) -> Option<CGSize> {
        let v = self.copy_attr(name)?;
        let mut s = CGSize::default();
        let ok = unsafe { AXValueGetValue(v.as_CFTypeRef(), AX_VALUE_CGSIZE, &mut s as *mut _ as *mut c_void) };
        ok.then_some(s)
    }

    /// Screen rectangle (x, y, width, height) of a text range, in UTF-16 units like JavaScript strings.
    pub fn bounds_for_range(&self, start: usize, len: usize) -> Option<(f64, f64, f64, f64)> {
        let range = CFRange { location: start as isize, length: len as isize };
        let param = unsafe { AXValueCreate(AX_VALUE_CFRANGE, &range as *const _ as *const c_void) };
        if param.is_null() {
            return None;
        }
        let param = unsafe { CFType::wrap_under_create_rule(param) };
        let attr = CFString::new("AXBoundsForRange");
        let mut value: CFTypeRef = std::ptr::null();
        let err = unsafe {
            AXUIElementCopyParameterizedAttributeValue(self.0, attr.as_concrete_TypeRef(), param.as_CFTypeRef(), &mut value)
        };
        if err != AX_OK || value.is_null() {
            return None;
        }
        let value = unsafe { CFType::wrap_under_create_rule(value) };
        let mut r = CGRect::default();
        let ok = unsafe { AXValueGetValue(value.as_CFTypeRef(), AX_VALUE_CGRECT, &mut r as *mut _ as *mut c_void) };
        (ok && r.size.width > 0.0 && r.size.height > 0.0).then_some((r.origin.x, r.origin.y, r.size.width, r.size.height))
    }

    /// The selection as (start, length) in UTF-16 units; length 0 is a plain caret.
    pub fn selection(&self) -> Option<(usize, usize)> {
        let v = self.copy_attr("AXSelectedTextRange")?;
        let mut r = CFRange::default();
        let ok = unsafe { AXValueGetValue(v.as_CFTypeRef(), AX_VALUE_CFRANGE, &mut r as *mut _ as *mut c_void) };
        (ok && r.location >= 0 && r.length >= 0).then_some((r.location as usize, r.length as usize))
    }

    /// Put the caret at a position (after Matra changed the text, e.g. a snippet).
    pub fn set_caret(&self, pos: usize) -> bool {
        let range = CFRange { location: pos as isize, length: 0 };
        let v = unsafe { AXValueCreate(AX_VALUE_CFRANGE, &range as *const _ as *const c_void) };
        if v.is_null() {
            return false;
        }
        let v = unsafe { CFType::wrap_under_create_rule(v) };
        let attr = CFString::new("AXSelectedTextRange");
        unsafe { AXUIElementSetAttributeValue(self.0, attr.as_concrete_TypeRef(), v.as_CFTypeRef()) == AX_OK }
    }

    /// Caret position (start of the selection) in UTF-16 units.
    pub fn caret(&self) -> Option<usize> {
        let v = self.copy_attr("AXSelectedTextRange")?;
        let mut r = CFRange::default();
        let ok = unsafe { AXValueGetValue(v.as_CFTypeRef(), AX_VALUE_CFRANGE, &mut r as *mut _ as *mut c_void) };
        (ok && r.location >= 0).then_some(r.location as usize)
    }

    /// The element's frame (x, y, width, height) on screen, if it still exists.
    pub fn frame(&self) -> Option<(f64, f64, f64, f64)> {
        let p = self.point("AXPosition")?;
        let s = self.size("AXSize")?;
        (s.width > 0.0 && s.height > 0.0).then_some((p.x, p.y, s.width, s.height))
    }

    pub fn pid(&self) -> Option<i32> {
        let mut pid = 0;
        (unsafe { AXUIElementGetPid(self.0, &mut pid) } == AX_OK).then_some(pid)
    }

    pub fn set_string(&self, name: &str, value: &str) -> bool {
        let attr = CFString::new(name);
        let v = CFString::new(value);
        unsafe { AXUIElementSetAttributeValue(self.0, attr.as_concrete_TypeRef(), v.as_CFTypeRef()) == AX_OK }
    }

    /// A numeric attribute such as AXNumberOfCharacters.
    fn number(&self, name: &str) -> Option<i64> {
        self.copy_attr(name)?.downcast::<core_foundation::number::CFNumber>()?.to_i64()
    }

    /// Text of a range via AXStringForRange (Electron/Chromium editors that leave AXValue empty).
    fn string_for_range(&self, start: usize, len: usize) -> Option<String> {
        let range = CFRange { location: start as isize, length: len as isize };
        let param = unsafe { AXValueCreate(AX_VALUE_CFRANGE, &range as *const _ as *const c_void) };
        if param.is_null() {
            return None;
        }
        let param = unsafe { CFType::wrap_under_create_rule(param) };
        let attr = CFString::new("AXStringForRange");
        let mut value: CFTypeRef = std::ptr::null();
        let err = unsafe {
            AXUIElementCopyParameterizedAttributeValue(self.0, attr.as_concrete_TypeRef(), param.as_CFTypeRef(), &mut value)
        };
        if err != AX_OK || value.is_null() {
            return None;
        }
        unsafe { CFType::wrap_under_create_rule(value) }.downcast::<CFString>().map(|s| s.to_string())
    }

    /// Child elements (AXChildren).
    fn children(&self) -> Vec<Element> {
        let Some(v) = self.copy_attr("AXChildren") else { return vec![] };
        let Some(arr) = v.downcast::<core_foundation::array::CFArray>() else { return vec![] };
        arr.iter()
            .filter_map(|item| {
                let raw = *item as AXUIElementRef;
                if raw.is_null() {
                    return None;
                }
                unsafe { CFRetain(raw) };
                Some(Element(raw))
            })
            .collect()
    }

    /// The field's full text. Native fields give AXValue; Electron/Chromium rich editors
    /// (Discord, Slack, Notion…) often leave it empty, so ask by range, then walk the
    /// paragraphs as a last resort.
    pub fn full_text(&self) -> Option<String> {
        let value = self.string("AXValue");
        if value.as_deref().is_some_and(|v| !v.is_empty()) {
            return value;
        }
        if let Some(n) = self.number("AXNumberOfCharacters").filter(|n| *n > 0) {
            if let Some(t) = self.string_for_range(0, n as usize).filter(|t| !t.is_empty()) {
                return Some(t);
            }
        }
        let mut lines = Vec::new();
        collect_text(self, 0, &mut lines);
        let joined = lines.join("\n");
        if !joined.trim().is_empty() {
            return Some(joined);
        }
        value
    }

    pub fn set_bool(&self, name: &str, value: bool) -> bool {
        let attr = CFString::new(name);
        let v = if value { CFBoolean::true_value() } else { CFBoolean::false_value() };
        unsafe { AXUIElementSetAttributeValue(self.0, attr.as_concrete_TypeRef(), v.as_CFTypeRef()) == AX_OK }
    }
}

/// Gather paragraph text from a rich editor's children (one line per paragraph).
fn collect_text(el: &Element, depth: usize, out: &mut Vec<String>) {
    if depth > 6 || out.len() > 2000 {
        return;
    }
    let role = el.string("AXRole").unwrap_or_default();
    if role == "AXStaticText" {
        if let Some(t) = el.string("AXValue") {
            out.push(t);
        }
        return;
    }
    let kids = el.children();
    let block = depth > 0 && (role == "AXGroup" || role == "AXParagraph");
    if block {
        // A paragraph: join its runs on one line.
        let mut runs = Vec::new();
        for k in &kids {
            collect_text(k, depth + 1, &mut runs);
        }
        if !runs.is_empty() {
            out.push(runs.concat());
        }
        return;
    }
    for k in &kids {
        collect_text(k, depth + 1, out);
    }
}

/// The editable text field that currently has keyboard focus, in any app.
pub struct Field {
    pub element: Element,
    pub pid: i32,
    pub app: String,
    pub text: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

const TEXT_ROLES: [&str; 3] = ["AXTextArea", "AXTextField", "AXComboBox"];

pub fn focused_field() -> Option<Field> {
    let system = Element::system_wide()?;
    let element = system.element("AXFocusedUIElement")?;
    let role = element.string("AXRole").unwrap_or_default();
    let subrole = element.string("AXSubrole").unwrap_or_default();
    // Never read password fields.
    if role == "AXSecureTextField" || subrole == "AXSecureTextField" {
        return None;
    }
    // Focus can land inside a rich editor (on a paragraph); climb to the text box itself.
    let mut element = element;
    let mut role = role;
    let mut hops = 0;
    while !TEXT_ROLES.contains(&role.as_str()) {
        hops += 1;
        if hops > 4 {
            return None;
        }
        element = element.element("AXParent")?;
        role = element.string("AXRole").unwrap_or_default();
    }
    let text = element.full_text()?;
    let pid = element.pid()?;
    let pos = element.point("AXPosition")?;
    let size = element.size("AXSize")?;
    let app = Element::application(pid)
        .and_then(|a| a.string("AXTitle"))
        .unwrap_or_else(|| "this app".into());
    Some(Field { element, pid, app, text, x: pos.x, y: pos.y, width: size.width, height: size.height })
}

/// Chromium browsers and Electron apps only build their accessibility tree when an
/// assistive app asks for it. Ask once per process, the way screen readers do.
pub fn wake_accessibility(pid: i32, app_name: &str) {
    let Some(app) = Element::application(pid) else { return };
    // Electron apps (Slack, Notion, VS Code, Discord…).
    app.set_bool("AXManualAccessibility", true);
    // Chromium browsers. Only for them: other apps can animate oddly with this flag on.
    const CHROMIUM: [&str; 7] = ["Google Chrome", "Chromium", "Brave Browser", "Microsoft Edge", "Arc", "Opera", "Vivaldi"];
    if CHROMIUM.iter().any(|b| app_name.starts_with(b)) {
        app.set_bool("AXEnhancedUserInterface", true);
    }
}

/// The app that has keyboard focus: (pid, name).
pub fn focused_app() -> Option<(i32, String)> {
    let app = Element::system_wide()?.element("AXFocusedApplication")?;
    let pid = app.pid()?;
    Some((pid, app.string("AXTitle").unwrap_or_default()))
}
