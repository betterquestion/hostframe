mod dawn;
mod presentation;
mod window;

use std::cell::{RefCell, RefMut};

use napi::{Env, Error, JsValue, Result, bindgen_prelude::Unknown};
use napi_derive::napi;
use presentation::Surface;
use window::{NativeEvent, NativeWindowOptions, Window};

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
        let window = Window::open(options)?;
        let surface = Surface::open(bridge, env, gpu, &window)?;
        Ok(Self {
            state: RefCell::new(Some(WindowState { surface, window })),
        })
    }

    #[napi]
    pub fn poll(&self) -> Result<Vec<NativeEvent>> {
        Ok(self.open_state()?.window.poll())
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
    pub fn configure(&self, env: Env, device: Unknown, format: String) -> Result<()> {
        self.open_state()?.surface.configure(env, device, &format)
    }

    #[napi]
    pub fn acquire<'env>(&self, env: Env, device: Unknown<'env>) -> Result<Option<Unknown<'env>>> {
        let mut state = self.open_state()?;
        let size = state.window.handle.get_framebuffer_size();
        if state.window.handle.is_iconified() || size.0 <= 0 || size.1 <= 0 {
            return Ok(None);
        }
        state
            .surface
            .acquire(env, device, (size.0 as u32, size.1 as u32))
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
    pub fn close(&self) -> Result<()> {
        let mut state = self.borrow_state()?;
        if let Some(mut state) = state.take() {
            state.surface.close()?;
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
