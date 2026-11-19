use glfw::{
    ClientApiHint, Glfw, GlfwReceiver, InitHint, PWindow, Platform, WindowEvent, WindowHint,
};
use napi::{Error, Result};
use napi_derive::napi;

#[napi(object)]
pub struct NativeWindowOptions {
    pub title: String,
    pub width: u32,
    pub height: u32,
    pub resizable: bool,
}

#[napi(object)]
pub struct NativeEvent {
    pub kind: String,
    pub values: Vec<f64>,
    pub text: Option<String>,
}

pub struct Window {
    pub handle: PWindow,
    pub glfw: Glfw,
    events: GlfwReceiver<(f64, WindowEvent)>,
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
        if options.width == 0
            || options.height == 0
            || options.width > i32::MAX as u32
            || options.height > i32::MAX as u32
            || options.title.contains('\0')
        {
            return Err(Error::from_reason("Invalid window dimensions or title"));
        }
        glfw::init_hint(InitHint::Platform(Platform::X11));
        let mut glfw =
            glfw::init(glfw::log_errors).map_err(|error| Error::from_reason(error.to_string()))?;
        glfw.default_window_hints();
        glfw.window_hint(WindowHint::ClientApi(ClientApiHint::NoApi));
        glfw.window_hint(WindowHint::Resizable(options.resizable));
        let (mut handle, events) = glfw
            .create_window(
                options.width,
                options.height,
                &options.title,
                glfw::WindowMode::Windowed,
            )
            .ok_or_else(|| Error::from_reason("Could not create a GLFW window"))?;
        handle.set_close_polling(true);
        handle.set_framebuffer_size_polling(true);
        handle.set_focus_polling(true);
        handle.set_key_polling(true);
        handle.set_char_polling(true);
        handle.set_mouse_button_polling(true);
        handle.set_cursor_pos_polling(true);
        handle.set_scroll_polling(true);
        Ok(Self {
            handle,
            glfw,
            events,
        })
    }

    pub fn poll(&mut self) -> Vec<NativeEvent> {
        self.glfw.poll_events();
        glfw::flush_messages(&self.events)
            .filter_map(|(_, event)| map_event(event))
            .collect()
    }
}

fn map_event(event: WindowEvent) -> Option<NativeEvent> {
    let (kind, values, text) = match event {
        WindowEvent::Close => ("close", vec![], None),
        WindowEvent::FramebufferSize(width, height) => {
            ("resize", vec![width.into(), height.into()], None)
        }
        WindowEvent::Focus(focused) => ("focus", vec![u8::from(focused).into()], None),
        WindowEvent::Key(key, scancode, action, modifiers) => (
            "key",
            vec![
                (key as i32).into(),
                scancode.into(),
                (action as i32).into(),
                modifiers.bits().into(),
            ],
            None,
        ),
        WindowEvent::Char(character) => ("text", vec![], Some(character.to_string())),
        WindowEvent::MouseButton(button, action, modifiers) => (
            "pointerButton",
            vec![
                (button as i32).into(),
                (action as i32).into(),
                modifiers.bits().into(),
            ],
            None,
        ),
        WindowEvent::CursorPos(x, y) => ("pointerMove", vec![x, y], None),
        WindowEvent::Scroll(x, y) => ("scroll", vec![x, y], None),
        _ => return None,
    };
    Some(NativeEvent {
        kind: kind.into(),
        values,
        text,
    })
}
