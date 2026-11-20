use std::{
    cell::{Cell, RefCell},
    collections::{BTreeMap, BTreeSet},
    ffi::{CStr, c_int, c_void},
};

use glfw::{
    Action, ClientApiHint, CursorMode, Glfw, GlfwReceiver, InitHint, PWindow, Platform,
    WindowEvent, WindowHint,
};
use napi::{Error, Result};
use napi_derive::napi;

#[napi(object)]
pub struct NativeWindowOptions {
    pub title: String,
    pub width: i32,
    pub height: i32,
    pub resizable: bool,
    pub vsync: bool,
}

#[napi(object)]
pub struct NativeEvent {
    pub kind: String,
    pub values: Vec<f64>,
}

#[napi(object)]
pub struct NativeMetrics {
    pub width: i32,
    pub height: i32,
    pub framebuffer_width: i32,
    pub framebuffer_height: i32,
    pub content_scale_x: f64,
    pub content_scale_y: f64,
    pub drawable: bool,
}

#[napi(object)]
pub struct NativeStatus {
    pub x: i32,
    pub y: i32,
    pub visible: bool,
    pub minimized: bool,
}

#[napi(object)]
pub struct NativeInput {
    pub metrics: NativeMetrics,
    pub status: NativeStatus,
    pub keys: Vec<i32>,
    pub scancodes: Vec<i32>,
    pub buttons: Vec<i32>,
    pub focused: bool,
    pub pointer_captured: bool,
    pub raw_motion: bool,
    pub x: f64,
    pub y: f64,
}

#[napi(object)]
pub struct NativeInputBatch {
    pub state: NativeInput,
    pub events: Vec<NativeEvent>,
}

#[link(name = "Xfixes")]
unsafe extern "C" {
    fn XFixesQueryVersion(display: *mut c_void, major: *mut c_int, minor: *mut c_int) -> c_int;
}

thread_local! {
    static SESSION_ACTIVE: Cell<bool> = const { Cell::new(false) };
}

#[napi]
pub struct NativeSession {
    glfw: RefCell<Option<Glfw>>,
}

#[napi]
impl NativeSession {
    #[napi(constructor)]
    pub fn new() -> Result<Self> {
        require_main_thread()?;
        if SESSION_ACTIVE.with(Cell::get) {
            return Err(Error::from_reason(
                "Only one native application may be live",
            ));
        }
        glfw::init_hint(InitHint::Platform(Platform::X11));
        let glfw = glfw::init(glfw::log_errors)
            .map_err(|error| Error::from_reason(format!("GLFW initialization failed: {error}")))?;
        // Mesa can cache extension data across X11 connections for the same Dawn instance.
        // Explicitly negotiate XFixes on every new GLFW connection.
        let display = glfw.get_x11_display();
        let (mut major, mut minor) = (0, 0);
        if unsafe { XFixesQueryVersion(display, &mut major, &mut minor) } == 0 {
            return Err(Error::from_reason("X11 XFixes initialization failed"));
        }
        SESSION_ACTIVE.with(|active| active.set(true));
        Ok(Self {
            glfw: RefCell::new(Some(glfw)),
        })
    }

    #[napi]
    pub fn poll(&self) -> Result<()> {
        self.with_glfw(|glfw| glfw.poll_events())
    }

    #[napi]
    pub fn get_key_label(&self, key: i32, scancode: i32) -> Result<Option<String>> {
        self.with_glfw(|_| {
            let label = unsafe { glfw::ffi::glfwGetKeyName(key, scancode) };
            if label.is_null() {
                return None;
            }
            Some(
                unsafe { CStr::from_ptr(label) }
                    .to_string_lossy()
                    .into_owned(),
            )
        })
    }

    #[napi]
    pub fn get_key_scancode(&self, key: i32) -> Result<i32> {
        self.with_glfw(|_| unsafe { glfw::ffi::glfwGetKeyScancode(key) })
    }

    #[napi]
    pub fn dispose(&self) {
        if self.glfw.borrow_mut().take().is_some() {
            SESSION_ACTIVE.with(|active| active.set(false));
        }
    }
}

impl NativeSession {
    fn with_glfw<T>(&self, operation: impl FnOnce(&mut Glfw) -> T) -> Result<T> {
        require_main_thread()?;
        self.glfw
            .borrow_mut()
            .as_mut()
            .map(operation)
            .ok_or_else(|| Error::from_reason("Application is disposed"))
    }
}

impl Drop for NativeSession {
    fn drop(&mut self) {
        self.dispose();
    }
}

pub struct Window {
    pub handle: PWindow,
    pub glfw: Glfw,
    receiver: GlfwReceiver<(f64, WindowEvent)>,
    queued: Vec<NativeEvent>,
    keys: BTreeMap<i32, i32>,
    buttons: BTreeSet<i32>,
    focused: bool,
    captured: bool,
    raw_motion: bool,
    position: (f64, f64),
    baseline: bool,
    closed: bool,
    windowed_bounds: Option<(i32, i32, i32, i32)>,
}

pub fn require_main_thread() -> Result<()> {
    // On Linux the process's initial thread has the same TID and PID.
    if unsafe { libc::gettid() != libc::getpid() } {
        return Err(Error::from_reason(
            "Hostframe windowing requires the main thread",
        ));
    }
    Ok(())
}

impl Window {
    pub fn open(options: NativeWindowOptions) -> Result<Self> {
        require_main_thread()?;
        let mut glfw =
            glfw::init(glfw::log_errors).map_err(|error| Error::from_reason(error.to_string()))?;
        glfw.default_window_hints();
        glfw.window_hint(WindowHint::ClientApi(ClientApiHint::NoApi));
        glfw.window_hint(WindowHint::Resizable(options.resizable));
        let (mut handle, receiver) = glfw
            .create_window(
                options.width as u32,
                options.height as u32,
                &options.title,
                glfw::WindowMode::Windowed,
            )
            .ok_or_else(|| Error::from_reason("Could not create a GLFW window"))?;
        handle.set_close_callback(|window| window.set_should_close(false));
        handle.set_close_polling(true);
        handle.set_focus_polling(true);
        handle.set_iconify_polling(true);
        handle.set_key_polling(true);
        handle.set_char_polling(true);
        handle.set_mouse_button_polling(true);
        handle.set_cursor_pos_polling(true);
        handle.set_scroll_polling(true);
        unsafe {
            glfw::ffi::glfwSetInputMode(
                glfw::Context::window_ptr(&*handle),
                glfw::ffi::GLFW_LOCK_KEY_MODS,
                glfw::ffi::GLFW_TRUE,
            )
        };
        let focused = handle.is_focused();
        let position = handle.get_cursor_pos();
        Ok(Self {
            handle,
            glfw,
            receiver,
            queued: Vec::new(),
            keys: BTreeMap::new(),
            buttons: BTreeSet::new(),
            focused,
            captured: false,
            raw_motion: false,
            position,
            baseline: true,
            closed: false,
            windowed_bounds: None,
        })
    }

    pub fn input(&self) -> NativeInput {
        let (width, height) = self.handle.get_size();
        let (framebuffer_width, framebuffer_height) = self.handle.get_framebuffer_size();
        let (content_scale_x, content_scale_y) = self.handle.get_content_scale();
        let (x, y) = self.handle.get_pos();
        let minimized = self.handle.is_iconified();
        NativeInput {
            metrics: NativeMetrics {
                width,
                height,
                framebuffer_width,
                framebuffer_height,
                content_scale_x: content_scale_x.into(),
                content_scale_y: content_scale_y.into(),
                drawable: !minimized
                    && width > 0
                    && height > 0
                    && framebuffer_width > 0
                    && framebuffer_height > 0,
            },
            status: NativeStatus {
                x,
                y,
                visible: self.handle.is_visible(),
                minimized,
            },
            keys: self.keys.values().copied().collect(),
            scancodes: self.keys.keys().copied().collect(),
            buttons: self.buttons.iter().copied().collect(),
            focused: self.focused,
            pointer_captured: self.captured,
            raw_motion: self.raw_motion,
            x: self.position.0,
            y: self.position.1,
        }
    }

    pub fn take_events(&mut self) -> NativeInputBatch {
        let mut close_pending = false;
        while let Some((_, event)) = self.receiver.receive() {
            match event {
                WindowEvent::Close if !self.closed && !close_pending => {
                    close_pending = true;
                    self.enqueue("closeRequest", vec![]);
                }
                WindowEvent::Iconify(minimized) => {
                    self.enqueue(if minimized { "minimize" } else { "restore" }, vec![])
                }
                WindowEvent::Focus(focused) => {
                    self.focused = focused;
                    if !focused {
                        self.reset_input();
                    }
                    self.baseline = false;
                    self.enqueue("focus", vec![flag(focused)]);
                }
                WindowEvent::CursorPos(x, y) if !self.closed => {
                    let (dx, dy) = if self.baseline {
                        (x - self.position.0, y - self.position.1)
                    } else {
                        (0., 0.)
                    };
                    self.position = (x, y);
                    self.baseline = true;
                    self.enqueue("pointerMove", vec![x, y, dx, dy, flag(self.captured)]);
                }
                WindowEvent::Key(key, scan, action, modifiers) if self.accepts_input() => {
                    let key = key as i32;
                    if action == Action::Release {
                        if self.keys.remove(&scan).is_none() {
                            continue;
                        }
                    } else {
                        self.keys.insert(scan, key);
                    }
                    self.enqueue(
                        "key",
                        vec![
                            key.into(),
                            scan.into(),
                            (action as i32).into(),
                            modifiers.bits().into(),
                            0.,
                        ],
                    );
                }
                WindowEvent::Char(character) if self.accepts_input() => {
                    self.enqueue("text", vec![(character as u32).into()])
                }
                WindowEvent::MouseButton(button, action, modifiers) if self.accepts_input() => {
                    let button = button as i32;
                    if action == Action::Release {
                        if !self.buttons.remove(&button) {
                            continue;
                        }
                    } else {
                        self.buttons.insert(button);
                    }
                    self.enqueue(
                        "pointerButton",
                        vec![
                            button.into(),
                            (action as i32).into(),
                            modifiers.bits().into(),
                            0.,
                        ],
                    );
                }
                WindowEvent::Scroll(dx, dy) if self.accepts_input() => {
                    self.enqueue("scroll", vec![dx, dy])
                }
                _ => {}
            }
        }
        NativeInputBatch {
            state: self.input(),
            events: std::mem::take(&mut self.queued),
        }
    }

    pub fn control(&mut self, operation: impl FnOnce(&mut PWindow)) -> Result<()> {
        if self.closed {
            return Err(Error::from_reason("Window is closed"));
        }
        glfw::get_error();
        operation(&mut self.handle);
        let (error, description) = glfw::get_error_string();
        if error != glfw::Error::NoError {
            return Err(Error::from_reason(description));
        }
        Ok(())
    }

    pub fn set_fullscreen(&mut self, fullscreen: bool) -> Result<()> {
        if self.closed {
            return Err(Error::from_reason("Window is closed"));
        }
        if fullscreen == self.windowed_bounds.is_some() {
            return Ok(());
        }
        glfw::get_error();
        let ptr = glfw::Context::window_ptr(&*self.handle);
        if fullscreen {
            let monitor = unsafe { glfw::ffi::glfwGetPrimaryMonitor() };
            if monitor.is_null() {
                return Err(Error::from_reason("No primary monitor available"));
            }
            let mode = unsafe { glfw::ffi::glfwGetVideoMode(monitor) };
            if mode.is_null() {
                return Err(Error::from_reason("No monitor video mode available"));
            }
            let (x, y) = self.handle.get_pos();
            let (width, height) = self.handle.get_size();
            let mode = unsafe { &*mode };
            unsafe {
                glfw::ffi::glfwSetWindowMonitor(
                    ptr,
                    monitor,
                    0,
                    0,
                    mode.width,
                    mode.height,
                    mode.refreshRate,
                )
            };
            let (error, description) = glfw::get_error_string();
            if error != glfw::Error::NoError {
                return Err(Error::from_reason(description));
            }
            self.windowed_bounds = Some((x, y, width, height));
        } else if let Some((x, y, width, height)) = self.windowed_bounds {
            unsafe {
                glfw::ffi::glfwSetWindowMonitor(
                    ptr,
                    std::ptr::null_mut(),
                    x,
                    y,
                    width,
                    height,
                    glfw::ffi::GLFW_DONT_CARE,
                )
            };
            let (error, description) = glfw::get_error_string();
            if error != glfw::Error::NoError {
                return Err(Error::from_reason(description));
            }
            self.windowed_bounds = None;
        }
        Ok(())
    }

    pub fn request_close(&mut self) -> NativeInput {
        self.closed = true;
        self.handle.set_should_close(true);
        self.reset_input();
        self.input()
    }

    pub fn set_capture(&mut self, captured: bool, raw: bool) -> Result<NativeInput> {
        if captured && !self.accepts_input() {
            return Err(Error::from_reason(
                "Pointer capture requires an open, focused window",
            ));
        }
        if captured && raw && !self.glfw.supports_raw_motion() {
            return Err(Error::from_reason("Raw mouse motion is unavailable"));
        }
        if !self.capture(captured, captured && raw) {
            return Err(Error::from_reason("Could not change pointer capture mode"));
        }
        Ok(self.input())
    }

    fn accepts_input(&self) -> bool {
        self.focused && !self.closed
    }

    fn enqueue(&mut self, kind: &str, values: Vec<f64>) {
        self.queued.push(NativeEvent {
            kind: kind.into(),
            values,
        });
    }

    fn reset_input(&mut self) {
        for (scan, key) in std::mem::take(&mut self.keys) {
            self.enqueue("key", vec![key.into(), scan.into(), 0., 0., 1.]);
        }
        for button in std::mem::take(&mut self.buttons) {
            self.enqueue("pointerButton", vec![button.into(), 0., 0., 1.]);
        }
        self.capture(false, false);
        self.baseline = false;
    }

    fn capture(&mut self, captured: bool, raw: bool) -> bool {
        if captured == self.captured && raw == self.raw_motion {
            return true;
        }
        glfw::get_error();
        self.handle.set_cursor_pos_polling(false);
        if self.glfw.supports_raw_motion() {
            self.handle.set_raw_mouse_motion(raw);
        }
        self.handle.set_cursor_mode(if captured {
            CursorMode::Disabled
        } else {
            CursorMode::Normal
        });
        let ok = glfw::get_error() == glfw::Error::NoError;
        self.handle.set_cursor_pos_polling(true);
        self.captured = self.handle.get_cursor_mode() == CursorMode::Disabled;
        self.raw_motion = self.glfw.supports_raw_motion() && self.handle.uses_raw_mouse_motion();
        self.position = self.handle.get_cursor_pos();
        self.baseline = false;
        self.enqueue(
            "pointerCapture",
            vec![flag(self.captured), flag(self.raw_motion)],
        );
        ok
    }
}

fn flag(value: bool) -> f64 {
    u8::from(value).into()
}
