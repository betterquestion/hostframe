mod dawn;
mod presentation;
mod window;

use std::cell::{RefCell, RefMut};

use napi::{
    Env, Error, JsValue, Result,
    bindgen_prelude::{Function, Unknown},
};
use napi_derive::napi;
use presentation::{Surface, SurfaceOptions};
use window::{NativeInput, NativeInputBatch, NativeWindowOptions, Window};

#[napi]
pub fn inspect_dawn(env: Env, path: String, gpu: Unknown, device: Unknown) -> Result<u32> {
    let bridge = dawn::Bridge::load(path)?;
    let api = bridge.api();
    let instance = unsafe { api.acquire_instance.unwrap()(env.raw().cast(), gpu.raw().cast()) };
    if instance.is_null() {
        return Err(Error::from_reason("Expected a Dawn GPU"));
    }
    unsafe { api.release_instance.unwrap()(instance) };
    let device = unsafe { api.acquire_device.unwrap()(env.raw().cast(), device.raw().cast()) };
    if device.is_null() {
        return Err(Error::from_reason("Expected a Dawn GPUDevice"));
    }
    unsafe { api.release_device.unwrap()(device) };
    Ok(api.abi_version)
}

struct WindowState {
    // The surface must be drained and released before GLFW closes the display.
    surface: Surface,
    window: Window,
}

#[napi]
pub struct NativeWindow {
    state: RefCell<Option<WindowState>>,
}

#[napi]
impl NativeWindow {
    #[napi(constructor)]
    pub fn new(env: Env, path: String, gpu: Unknown, options: NativeWindowOptions) -> Result<Self> {
        let bridge = dawn::Bridge::load(path)?;
        let vsync = options.vsync;
        let window = Window::open(options)?;
        let surface = Surface::open(bridge, env, gpu, &window, vsync)?;
        Ok(Self {
            state: RefCell::new(Some(WindowState { surface, window })),
        })
    }

    #[napi]
    pub fn take_events(&self) -> Result<NativeInputBatch> {
        Ok(self.open_state()?.window.take_events())
    }

    #[napi]
    pub fn request_close(&self) -> Result<NativeInput> {
        Ok(self.open_state()?.window.request_close())
    }

    #[napi]
    pub fn set_pointer_capture(&self, captured: bool, raw: bool) -> Result<NativeInput> {
        self.open_state()?.window.set_capture(captured, raw)
    }

    #[napi]
    pub fn set_title(&self, title: String) -> Result<()> {
        self.open_state()?
            .window
            .control(|window| window.set_title(&title))
    }

    #[napi]
    pub fn set_size(&self, width: i32, height: i32) -> Result<()> {
        self.open_state()?
            .window
            .control(|window| window.set_size(width, height))
    }

    #[napi]
    pub fn set_position(&self, x: i32, y: i32) -> Result<()> {
        self.open_state()?
            .window
            .control(|window| window.set_pos(x, y))
    }

    #[napi]
    pub fn set_fullscreen(&self, fullscreen: bool) -> Result<()> {
        self.open_state()?.window.set_fullscreen(fullscreen)
    }

    #[napi]
    pub fn set_visible(&self, visible: bool) -> Result<()> {
        self.open_state()?.window.control(|window| {
            if visible {
                window.show();
            } else {
                window.hide();
            }
        })
    }

    #[napi]
    pub fn request_adapter<'env>(
        &self,
        env: Env,
        gpu: Unknown<'env>,
        options: Option<Unknown<'env>>,
    ) -> Result<Unknown<'env>> {
        self.open_state()?
            .surface
            .request_adapter(env, gpu, options)
    }

    #[napi]
    pub fn configure(
        &self,
        env: Env,
        device: Unknown,
        options: SurfaceOptions,
        read_max_dimension: Function<(), u32>,
        destroy_device: Function<(), ()>,
    ) -> Result<&'static str> {
        self.open_state()?.surface.configure(
            env,
            device,
            options,
            &|| read_max_dimension.call(()),
            &|| destroy_device.call(()),
        )
    }

    #[napi]
    pub fn configured(&self) -> Result<bool> {
        Ok(self.open_state()?.surface.configured())
    }

    #[napi]
    pub fn unconfigure(&self, destroy_device: Function<(), ()>) -> Result<()> {
        self.open_state()?
            .surface
            .unconfigure(Some(&|| destroy_device.call(())))
    }

    #[napi]
    pub fn acquire<'env>(&self, env: Env, device: Unknown<'env>) -> Result<Option<Unknown<'env>>> {
        let mut state = self.open_state()?;
        let (width, height) = state.window.handle.get_framebuffer_size();
        let size = (!state.window.handle.is_iconified() && width > 0 && height > 0)
            .then_some((width as u32, height as u32));
        state.surface.acquire(env, device, size)
    }

    #[napi]
    pub fn present(&self) -> Result<()> {
        self.open_state()?.surface.present()
    }

    #[napi]
    pub fn discard_frame(&self) -> Result<()> {
        self.open_state()?.surface.discard_frame();
        Ok(())
    }

    #[napi]
    pub fn close(&self, destroy_device: Function<(), ()>) -> Result<()> {
        let mut state = self.borrow_state()?;
        if let Some(mut state) = state.take() {
            state.surface.close(Some(&|| destroy_device.call(())))?;
        }
        Ok(())
    }
}

impl NativeWindow {
    fn borrow_state(&self) -> Result<RefMut<'_, Option<WindowState>>> {
        window::require_main_thread()?;
        self.state
            .try_borrow_mut()
            .map_err(|_| Error::from_reason("Hostframe window is busy"))
    }

    fn open_state(&self) -> Result<RefMut<'_, WindowState>> {
        RefMut::filter_map(self.borrow_state()?, Option::as_mut)
            .map_err(|_| Error::from_reason("Hostframe window is closed"))
    }
}
